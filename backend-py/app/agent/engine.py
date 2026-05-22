from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.tool_node import ToolNode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agent.tools import create_local_tools
from app.clients.mcp_client import get_mcp_tools
from app.config import settings
from app.db.database import async_session_factory
from app.logger import logger
from app.models import AgentMessage, AgentSession, Day, Trip, UserMemory

SYSTEM_PROMPT = """你是一个专业的旅行规划助手。你的职责是：
1. 帮助用户探索和查询旅行目的地
2. 根据用户偏好规划行程路线
3. 动态修改已有行程
4. 记住用户的旅行偏好

回复规则：
- 使用中文回复
- 每次回复必须包含文字说明，即使你调用了工具也要用文字向用户说明你做了什么、结果如何
- 当推荐地点时，使用 queryLocalPlaces 工具查询本地数据，如数据不足则用 webSearch 补充
- 当用户表达偏好（如"我不喜欢爬山"）时，使用 saveUserMemory 工具保存
- 当用户要求规划行程时，使用 createTripPlan 工具创建
- 当用户要求修改行程时，使用 modifyTripPlan 工具修改
- 回复要简洁、有用，适合旅行场景
- 如果用户的问题与旅行无关，礼貌地告知你只能帮助旅行规划相关的问题

地点信息获取流程（非常重要）：
- webSearch 只用于搜索概念和发现地点名称（如"千岛湖有哪些好玩的"）
- 拿到地点名称后，必须从高德地图获取真实的经纬度、地址等地理信息
- 推荐给用户的地点必须来自可信数据（有真实坐标）

单天规划流程（必须严格按步骤执行）：
1. 当用户要求规划某一天的行程时（如"规划day2的千岛湖旅行"），先用 webSearch 搜索景点
2. 获取每个景点的详细信息和真实坐标
3. 最后必须调用 planDayRoute 工具，把搜索到的景点打包成方案，传入真实经纬度
4. 不要只搜索就结束，planDayRoute 是必须调用的最终步骤
5. 回复时说明规划思路，并提示用户可以接受或拒绝方案"""


def _build_llm() -> ChatOpenAI:
    if not settings.llm_api_key:
        raise ValueError("LLM_API_KEY is not configured")
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0.7,
        streaming=True,
        # Don't disable thinking — the model needs it for proper ReAct planning
    )


async def _build_system_prompt(
    db_session: AsyncSession,
    user_id: str,
    current_trip_id: Optional[str] = None,
) -> str:
    """Assemble the system prompt with user memories and optional trip context."""
    prompt = SYSTEM_PROMPT

    mem_result = await db_session.execute(
        select(UserMemory).where(UserMemory.userId == user_id)
    )
    memories = mem_result.scalars().all()
    if memories:
        memory_text = "\n\n用户旅行偏好（长期记忆）:\n" + "\n".join(f"- {m.content}" for m in memories)
        prompt += memory_text

    if current_trip_id:
        trip_result = await db_session.execute(
            select(Trip)
            .where(Trip.id == current_trip_id)
            .options(selectinload(Trip.days).selectinload(Day.items))
        )
        trip = trip_result.scalar_one_or_none()
        if trip:
            trip_context = f'\n\n当前正在编辑的行程: "{trip.title}" (ID: {current_trip_id})'
            if trip.description:
                trip_context += f"\n行程主题: {trip.description}"
            trip_context += f"\n行程包含 {len(trip.days)} 天:"
            for day in trip.days:
                place_names = [i.name for i in day.items if i.type == "place"]
                day_desc = f" ({day.description})" if day.description else ""
                trip_context += f"\n  第{day.dayIndex}天{day_desc}: {' → '.join(place_names)}"
            prompt += trip_context

    return prompt


def _history_to_langchain(history: list[AgentMessage]) -> list:
    """Convert DB AgentMessage rows to LangChain message objects."""
    msgs: list = []
    for msg in history:
        if msg.role == "user":
            msgs.append(HumanMessage(content=msg.content or " "))
        elif msg.role == "assistant":
            meta = {}
            if msg.meta:
                try:
                    meta = json.loads(msg.meta) if isinstance(msg.meta, str) else msg.meta
                except (json.JSONDecodeError, TypeError):
                    meta = {}
            reasoning = meta.get("reasoning", "")
            additional_kwargs = {}
            if reasoning:
                additional_kwargs["reasoning_content"] = reasoning
            msgs.append(AIMessage(
                content=msg.content or " ",
                additional_kwargs=additional_kwargs,
            ))
    return msgs



def _extract_metadata(tool_results: list[Any]) -> dict:
    """Extract frontend-facing metadata from tool call response values."""
    metadata: dict = {}
    for result in tool_results:
        try:
            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            elif hasattr(result, "content"):
                content = result.content
                if isinstance(content, str):
                    data = json.loads(content)
                elif isinstance(content, dict):
                    data = content
                else:
                    continue
            else:
                continue
        except (json.JSONDecodeError, TypeError):
            continue

        if not isinstance(data, dict):
            continue

        if data.get("tripId") and "title" in data:
            metadata.setdefault("tripId", data["tripId"])
            metadata.setdefault("tripTitle", data["title"])

        if data.get("remainingPlaces") is not None:
            metadata["modifiedTripId"] = data.get("tripId")

        if data.get("plan"):
            metadata["dayPlan"] = data["plan"]

        if data.get("suggested_places"):
            metadata["suggestedPlaces"] = data["suggested_places"]

    return metadata


async def stream_chat_with_agent(
    user_id: str,
    session_id: str,
    user_message: str,
    current_trip_id: Optional[str] = None,
) -> AsyncIterator[str]:
    async with async_session_factory() as db_session:
        sess_result = await db_session.execute(
            select(AgentSession).where(AgentSession.id == session_id)
        )
        sess = sess_result.scalar_one_or_none()
        if not sess:
            sess = AgentSession(id=session_id, userId=user_id, title="新对话")
            db_session.add(sess)
            await db_session.flush()

        db_session.add(AgentMessage(sessionId=session_id, role="user", content=user_message))
        await db_session.flush()

        result = await db_session.execute(
            select(AgentMessage)
            .where(AgentMessage.sessionId == session_id)
            .order_by(AgentMessage.createdAt.asc())
        )
        all_messages = result.scalars().all()
        history = all_messages[-20:]

        system_prompt = await _build_system_prompt(db_session, user_id, current_trip_id)

        llm = _build_llm()
        local_tools = create_local_tools(db_session, user_id)
        mcp_tools = get_mcp_tools()
        tools = local_tools + mcp_tools
        tool_node = ToolNode(tools, handle_tool_errors=True)

        agent = create_react_agent(
            model=llm,
            tools=tool_node,
            prompt=system_prompt,
            name="trip_planner",
        )

        langchain_messages = _history_to_langchain(history)

        token_buffer: list[str] = []
        tool_results_buffer: list[Any] = []

        async for event in agent.astream_events(
            {"messages": langchain_messages},
            version="v2",
            config={"recursion_limit": 50},
        ):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                content = chunk.content
                if content:
                    token_buffer.append(content)
                    yield json.dumps({"type": "token", "content": content}, ensure_ascii=False) + "\n"

            elif kind == "on_tool_start":
                tool_name = event.get("name", "unknown")
                tool_input = event.get("data", {}).get("input", {})
                tool_call_id = event.get("data", {}).get("id", "")
                logger.agent.tool_call(tool_name, tool_input)
                yield json.dumps({
                    "type": "tool_start",
                    "tool": tool_name,
                    "input": tool_input,
                    "toolCallId": tool_call_id,
                }, ensure_ascii=False) + "\n"

            elif kind == "on_tool_end":
                output = event.get("data", {}).get("output", "")
                tool_name = event.get("name", "unknown")
                tool_call_id = event.get("data", {}).get("id", "")
                if output is not None:
                    tool_results_buffer.append(output)
                    if isinstance(output, str):
                        output_str = output
                    elif hasattr(output, "content"):
                        output_str = str(output.content)
                    elif isinstance(output, dict):
                        output_str = json.dumps(output, ensure_ascii=False)
                    else:
                        output_str = str(output)
                    yield json.dumps({
                        "type": "tool_end",
                        "tool": tool_name,
                        "toolCallId": tool_call_id,
                        "output": output_str,
                    }, ensure_ascii=False) + "\n"

        final_text = "".join(token_buffer) or "已处理您的请求。"
        metadata = _extract_metadata(tool_results_buffer)

        db_session.add(AgentMessage(
            sessionId=session_id,
            role="assistant",
            content=final_text,
            meta=json.dumps(metadata, ensure_ascii=False) if metadata else None,
        ))
        sess.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
        await db_session.commit()

        if metadata:
            yield json.dumps({"type": "meta", "data": metadata}, ensure_ascii=False) + "\n"
