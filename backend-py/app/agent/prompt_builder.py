# backend-py/app/agent/prompt_builder.py
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Day, Trip, UserMemory


BASE_PROMPT = """你是一个专业的旅行规划助手。你的职责是：
1. 帮助用户探索和查询旅行目的地
2. 根据用户偏好规划行程路线
3. 动态修改已有行程
4. 记住用户的旅行偏好

回复规则：
- 使用中文回复
- 每次回复必须包含文字说明，即使你调用了工具也要用文字向用户说明你做了什么、结果如何
- 回复要简洁、有用，适合旅行场景
- 如果用户的问题与旅行无关，礼貌地告知你只能帮助旅行规划相关的问题

地点字段规范（非常重要，必须严格遵守）：
每个地点对象必须且只能包含以下字段：
- name (string, 必填): 地点名称
- lngLat ([number, number], 必填): 经纬度坐标，格式为 [经度, 纬度]，如 [120.15, 30.25]
- description (string, 可选): 地点简介
- category (string, 可选): 分类，如"景点"、"餐厅"、"酒店"
- address (string, 可选): 详细地址
- rating (string, 可选): 评分，如 "4.5"
- ticket (string, 可选): 门票信息，如 "免费" 或 "150元"
- openingHours (string, 可选): 开放时间，如 "08:00-17:00"
- phone (string, 可选): 联系电话
- notes (string, 可选): 备注信息

不要添加上述字段以外的任何字段。lngLat 必须是数组格式，不能是字符串。"""


PLACE_SEARCH_PROMPT = """
## 地点搜索模式

用户正在搜索地点信息。请按以下流程执行：

1. 使用 webSearch 工具搜索用户提到的地点或景点信息
2. 从搜索结果中提取地点名称
3. 使用高德地图工具（如 maps_geo 或 maps_text_search）获取每个地点的真实经纬度和地址
4. 将结果整理为标准地点格式返回

重要约束：
- 每个返回的地点必须有真实的经纬度坐标（来自高德地图数据）
- 返回的地点数量建议 3-8 个，太多会让用户难以选择
- 结果中必须包含地点名称、坐标、地址、分类
- 如果搜索不到结果，如实告知用户，不要编造地点"""


TRIP_PLANNER_PROMPT = """
## 行程规划模式

用户正在规划行程。请按以下流程执行：

1. 使用 webSearch 搜索相关景点信息
2. 使用高德地图工具获取每个景点的真实坐标和地址
3. 将景点整理为标准地点格式
4. 最后必须调用 planDayRoute 工具，传入所有景点的名称和真实经纬度
5. 等待用户确认方案后，如用户接受则调用 modifyTripPlan 将景点添加到行程

重要约束：
- planDayRoute 是必须调用的最终步骤，不要只搜索就结束
- 每个景点必须有真实的经纬度（来自高德地图）
- 推荐景点数量 4-8 个为宜
- 回复时说明规划思路，并提示用户可以接受或拒绝方案
- 如果用户指定了当前行程（currentTripId），规划完成后直接添加到该行程"""


MEMORY_PROMPT = """
## 记忆模式

用户正在表达旅行偏好或习惯。请使用 saveUserMemory 工具保存用户的偏好信息。

常见偏好类型：
- 偏好 (preference): "我喜欢美食"、"不喜欢爬山"
- 习惯 (habit): "习惯早起出发"、"喜欢慢节奏旅行"
- 经验 (experience): "上次去千岛湖玩得很好"

保存后向用户确认已记住该偏好。"""


class PromptBuilder:
    """Builds dynamic system prompts based on intent and context."""

    INTENT_PROMPTS = {
        "place_search": PLACE_SEARCH_PROMPT,
        "trip_planner": TRIP_PLANNER_PROMPT,
        "memory": MEMORY_PROMPT,
    }

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def build(
        self,
        user_id: str,
        intent: Optional[str] = None,
        current_trip_id: Optional[str] = None,
    ) -> str:
        prompt = BASE_PROMPT

        # Add intent-specific guidance
        if intent and intent in self.INTENT_PROMPTS:
            prompt += self.INTENT_PROMPTS[intent]

        # Add user memories
        prompt += await self._load_memories(user_id)

        # Add trip context if editing
        if current_trip_id:
            prompt += await self._load_trip_context(current_trip_id)

        return prompt

    async def _load_memories(self, user_id: str) -> str:
        result = await self.db.execute(
            select(UserMemory).where(UserMemory.userId == user_id)
        )
        memories = result.scalars().all()
        if not memories:
            return ""
        lines = "\n".join(f"- {m.content}" for m in memories)
        return f"\n\n用户旅行偏好（长期记忆）:\n{lines}"

    async def _load_trip_context(self, trip_id: str) -> str:
        result = await self.db.execute(
            select(Trip)
            .where(Trip.id == trip_id)
            .options(selectinload(Trip.days).selectinload(Day.items))
        )
        trip = result.scalar_one_or_none()
        if not trip:
            return ""

        ctx = f'\n\n当前正在编辑的行程: "{trip.title}" (ID: {trip_id})'
        if trip.description:
            ctx += f"\n行程主题: {trip.description}"
        ctx += f"\n行程包含 {len(trip.days)} 天:"
        for day in trip.days:
            place_names = [i.name for i in day.items if i.type == "place"]
            day_desc = f" ({day.description})" if day.description else ""
            ctx += f"\n  第{day.dayIndex}天{day_desc}: {' → '.join(place_names)}"
        return ctx
