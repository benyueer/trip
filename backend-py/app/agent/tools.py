from __future__ import annotations

import json
import uuid
from typing import Any

from langchain_core.tools import BaseTool, tool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.logger import logger
from app.models import Day, Item, Trip, UserMemory
from app.services.amap_route import calculate_routes_between_places


def _normalize_lnglat(val: Any) -> list[float]:
    """Normalize lngLat to [lng, lat] array. Handles string 'lng,lat', JSON string '[lng,lat]', and array."""
    if isinstance(val, list):
        return [float(x) for x in val]
    if isinstance(val, str):
        # Try JSON parse first (e.g. "[120.15, 30.25]")
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [float(x) for x in parsed]
        except (json.JSONDecodeError, TypeError):
            pass
        # Try comma-separated (e.g. "120.15,30.25")
        if "," in val:
            parts = val.split(",")
            if len(parts) == 2:
                try:
                    return [float(parts[0]), float(parts[1])]
                except ValueError:
                    pass
    return []


@tool("webSearch")
async def web_search(query: str) -> dict:
    """Search the web for the latest travel information. Use this to discover travel destinations, attractions, weather, and local tips."""
    from app.config import settings

    logger.agent.tool_call("webSearch", {"query": query})

    if not settings.tavily_api_key:
        logger.error("tools", "TAVILY_API_KEY not configured")
        return {"answer": "Web search not configured", "results": []}

    try:
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": 5,
                    "include_answer": True,
                    "search_depth": "basic",
                },
                timeout=10,
            )
            data = response.json()

        results = [
            {
                "title": r.get("title", ""),
                "snippet": (r.get("content", "") or "")[:200],
                "url": r.get("url", ""),
            }
            for r in data.get("results", [])
        ]
        logger.info("tools", f'webSearch("{query}") → {len(results)} results',
                     {"titles": [r["title"] for r in results]})
        return {
            "answer": data.get("answer", f"Found {len(results)} results"),
            "results": results,
        }
    except Exception as e:
        logger.error("tools", f'webSearch("{query}") failed', {"error": str(e)})
        return {"answer": "Search temporarily unavailable", "results": []}


def create_local_tools(db_session: AsyncSession, user_id: str) -> list[BaseTool]:
    """Build the subset of tools that depend on a DB session and user context.

    Each tool captures *db_session* and *user_id* via closure so the LLM
    never sees them in its parameter schema.
    """

    @tool("queryLocalPlaces")
    async def query_local_places(query: str, limit: int = 10) -> dict:
        """Search for travel destinations, attractions, and places in the local database. Returns real geographic data (coordinates, addresses)."""
        logger.agent.tool_call("queryLocalPlaces", {"query": query, "limit": limit})

        result = await db_session.execute(
            select(Item)
            .where(Item.type == "place")
            .options(selectinload(Item.day).selectinload(Day.trip))
        )
        all_places = result.scalars().all()

        filtered = []
        for p in all_places:
            if (query.lower() in p.name.lower()
                    or (p.description and query.lower() in p.description.lower())
                    or (p.category and query.lower() in p.category.lower())
                    or (p.address and query.lower() in p.address.lower())):
                filtered.append(p)

        places = filtered[:limit]
        result_list: list[dict] = []
        for p in places:
            lnglat = p.lngLat
            if isinstance(lnglat, str):
                try:
                    lnglat = json.loads(lnglat)
                except (json.JSONDecodeError, TypeError):
                    lnglat = []
            result_list.append({
                "name": p.name,
                "lngLat": lnglat if isinstance(lnglat, list) else [],
                "description": p.description or "",
                "category": p.category or "",
                "rating": p.rating or "",
                "address": p.address or "",
                "ticket": p.ticket or "",
                "openingHours": p.openingHours or "",
            })

        logger.info("tools", f'queryLocalPlaces("{query}") → {len(result_list)} results',
                     {"names": [p["name"] for p in result_list]})
        return {"places": result_list, "count": len(result_list), "suggested_places": result_list}

    @tool("saveUserMemory")
    async def save_user_memory_(content: str, category: str = "preference") -> dict:
        """Save a user travel preference or fact (e.g. '不喜欢爬山', '喜欢美食'). The category can be 'preference', 'habit', or 'experience'."""
        logger.agent.tool_call("saveUserMemory", {"content": content, "category": category})

        result = await db_session.execute(
            select(UserMemory).where(UserMemory.userId == user_id)
        )
        existing_memories = result.scalars().all()

        similar = next(
            (m for m in existing_memories if content in m.content or m.content in content),
            None,
        )

        if similar:
            similar.content = content
            await db_session.flush()
            logger.agent.memory("updated", content)
            return {"saved": True, "action": "updated", "memoryId": similar.id}
        else:
            memory = UserMemory(userId=user_id, content=content, category=category)
            db_session.add(memory)
            await db_session.flush()
            await db_session.refresh(memory)
            logger.agent.memory("created", content)
            return {"saved": True, "action": "created", "memoryId": memory.id}

    @tool("createTripPlan")
    async def create_trip_plan_(title: str, days: list[dict], description: str = "") -> dict:
        """Create a new trip itinerary with multiple days and places. Each day must have a dayIndex, description, and items array. Each item must have name and lngLat ([lng, lat] array), and can optionally have: description, category, address, rating, ticket, openingHours, phone, notes."""
        logger.agent.tool_call("createTripPlan", {"title": title, "days_count": len(days)})

        trip = Trip(title=title, description=description, ownerId=user_id)
        db_session.add(trip)
        await db_session.flush()

        for day_d in days:
            day = Day(
                dayIndex=day_d.get("dayIndex", 1),
                description=day_d.get("description", ""),
                tripId=trip.id,
            )
            db_session.add(day)
            await db_session.flush()

            for item_d in day_d.get("items", []):
                item = Item(
                    id=str(uuid.uuid4()),
                    type="place",
                    name=item_d.get("name", ""),
                    lngLat=json.dumps(_normalize_lnglat(item_d.get("lngLat", []))),
                    description=item_d.get("description", ""),
                    category=item_d.get("category", ""),
                    address=item_d.get("address", ""),
                    rating=item_d.get("rating", ""),
                    ticket=item_d.get("ticket", ""),
                    openingHours=item_d.get("openingHours", ""),
                    phone=item_d.get("phone", ""),
                    notes=item_d.get("notes", ""),
                    dayId=day.id,
                )
                db_session.add(item)

        await db_session.flush()
        await db_session.refresh(trip)

        logger.agent.trip_created(trip.id, trip.title)
        return {"tripId": trip.id, "title": trip.title, "days": len(days)}

    @tool("modifyTripPlan")
    async def modify_trip_plan_(
        trip_id: str,
        action: str,
        day_index: int,
        place_name: str,
        new_place: dict | None = None,
    ) -> dict:
        """Modify an existing trip. Actions: 'add' a place, 'remove' a place, or 'replace' a place with new_place data."""
        logger.agent.tool_call("modifyTripPlan", {
            "tripId": trip_id[:8],
            "action": action,
            "dayIndex": day_index,
            "placeName": place_name,
        })

        result = await db_session.execute(
            select(Trip)
            .where(Trip.id == trip_id)
            .options(selectinload(Trip.days).selectinload(Day.items))
        )
        trip = result.scalar_one_or_none()
        if not trip:
            return {"error": "Trip not found"}

        day = next((d for d in trip.days if d.dayIndex == day_index), None)
        if not day:
            return {"error": f"Day {day_index} not found"}

        if action == "remove":
            day.items = [i for i in day.items if i.name != place_name]
        elif action == "add" and new_place:
            item = Item(
                id=str(uuid.uuid4()),
                type="place",
                name=new_place.get("name", ""),
                lngLat=json.dumps(_normalize_lnglat(new_place.get("lngLat", []))),
                description=new_place.get("description", ""),
                category=new_place.get("category", ""),
                address=new_place.get("address", ""),
                rating=new_place.get("rating", ""),
                ticket=new_place.get("ticket", ""),
                openingHours=new_place.get("openingHours", ""),
                phone=new_place.get("phone", ""),
                notes=new_place.get("notes", ""),
                dayId=day.id,
            )
            db_session.add(item)
        elif action == "replace" and new_place:
            idx = next((i for i, item in enumerate(day.items) if item.name == place_name), None)
            if idx is not None:
                day.items[idx].name = new_place.get("name", day.items[idx].name)
                if new_place.get("lngLat"):
                    day.items[idx].lngLat = json.dumps(_normalize_lnglat(new_place["lngLat"]))
                if new_place.get("description"):
                    day.items[idx].description = new_place["description"]
                if new_place.get("category"):
                    day.items[idx].category = new_place["category"]
                if new_place.get("address"):
                    day.items[idx].address = new_place["address"]
                if new_place.get("rating"):
                    day.items[idx].rating = new_place["rating"]
                if new_place.get("ticket"):
                    day.items[idx].ticket = new_place["ticket"]
                if new_place.get("openingHours"):
                    day.items[idx].openingHours = new_place["openingHours"]
                if new_place.get("phone"):
                    day.items[idx].phone = new_place["phone"]
                if new_place.get("notes"):
                    day.items[idx].notes = new_place["notes"]

        await db_session.flush()
        logger.agent.trip_modified(trip_id, f'{action} "{place_name}" in day{day_index}')

        remaining = len([i for i in day.items if i.type == "place"])
        return {"tripId": trip_id, "action": action, "dayIndex": day_index, "placeName": place_name, "remainingPlaces": remaining}

    @tool("planDayRoute")
    async def plan_day_route_(
        day_index: int,
        title: str,
        places: list[dict],
        description: str = "",
    ) -> dict:
        """Plan a single day itinerary with ordered places and routing. Each place must have name and lngLat ([lng, lat] array), and can optionally have: description, category, address, rating, ticket, openingHours, phone, notes."""
        logger.agent.tool_call("planDayRoute", {
            "dayIndex": day_index,
            "title": title,
            "placesCount": len(places),
        })

        mapped_places = [
            {
                "name": p["name"],
                "lngLat": _normalize_lnglat(p["lngLat"]),
                "description": p.get("description", ""),
                "category": p.get("category", ""),
                "address": p.get("address", ""),
                "rating": p.get("rating", ""),
                "ticket": p.get("ticket", ""),
                "openingHours": p.get("openingHours", ""),
                "phone": p.get("phone", ""),
                "notes": p.get("notes", ""),
                "order": p.get("order", i + 1),
            }
            for i, p in enumerate(places)
        ]

        routes = await calculate_routes_between_places(mapped_places)

        plan = {
            "dayIndex": day_index,
            "title": title,
            "description": description or "",
            "places": mapped_places,
            "routes": routes,
        }
        logger.info("tools", f'planDayRoute(day{day_index}, "{title}") → {len(mapped_places)} places, {len(routes)} routes')
        return {"status": "plan_ready", "plan": plan, "message": f"已为您规划第{day_index}天的行程，请查看方案并选择接受或拒绝。"}

    return [
        web_search,
        query_local_places,
        save_user_memory_,
        create_trip_plan_,
        modify_trip_plan_,
        plan_day_route_,
    ]
