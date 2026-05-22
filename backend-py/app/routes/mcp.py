from __future__ import annotations

import json
import uuid
from typing import Any

from litestar import get, post
from litestar import Request
from litestar.response import Stream
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.logger import logger
from app.models import Day, Item, Trip
from app.routes.auth import require_auth
from app.routes.trips import _serialize_trip


@get("/api/mcp/sse", guards=[require_auth])
async def mcp_sse() -> Stream:
    async def event_stream():
        yield f"data: {json.dumps({'type': 'connection', 'status': 'connected'})}\n\n"
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"

    return Stream(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    })


@post("/api/mcp/message", guards=[require_auth])
async def mcp_message(
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> dict:
    method = data.get("method")
    params = data.get("params", {})
    rpc_id = data.get("id")

    if not method:
        return {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "error": {"code": -32600, "message": "Missing required field: method"},
        }

    try:
        result: Any = None

        if method == "query_trip_database":
            user_id = request.user["id"]
            query = (params.get("query") or "").lower()
            if not query:
                return {
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "error": {"code": -32602, "message": "Missing required param: query"},
                }

            trip_result = await db_session.execute(
                select(Trip)
                .where(Trip.ownerId == user_id)
                .options(
                    selectinload(Trip.owner),
                    selectinload(Trip.days).selectinload(Day.items),
                )
            )
            trips = trip_result.scalars().all()
            matched = []
            for t in trips:
                day_names = []
                for d in (t.days or []):
                    for i in (d.items or []):
                        day_names.append(i.name.lower())
                all_names = " ".join([t.title.lower()] + day_names)
                if query in all_names:
                    matched.append({"id": t.id, "title": t.title, "days": len(t.days or [])})
            result = {"trips": matched}

        elif method == "add_place_to_trip":
            trip_id = params.get("tripId")
            day_index = params.get("dayIndex")
            place_name = params.get("placeName")
            lng = params.get("lng")
            lat = params.get("lat")

            if not trip_id or day_index is None or not place_name:
                return {
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "error": {"code": -32602, "message": "Missing required params: tripId, dayIndex, placeName"},
                }

            trip_result = await db_session.execute(
                select(Trip)
                .where(Trip.id == trip_id)
                .options(selectinload(Trip.days).selectinload(Day.items))
            )
            trip = trip_result.scalar_one_or_none()
            if not trip:
                raise ValueError("Trip not found")

            day = next((d for d in (trip.days or []) if d.dayIndex == day_index), None)
            if not day:
                day = Day(id=str(uuid.uuid4()), dayIndex=day_index, tripId=trip.id)
                db_session.add(day)
                trip.days.append(day)
                await db_session.flush()

            item = Item(
                id=str(uuid.uuid4()),
                type="place",
                name=place_name,
                lngLat=json.dumps([lng, lat]) if lng is not None and lat is not None else "[]",
                dayId=day.id,
            )
            db_session.add(item)
            await db_session.flush()

            result = {"tripId": trip_id, "success": True}

        elif method == "create_new_trip":
            user_id = request.user["id"]
            title = params.get("title", "Untitled")
            trip = Trip(title=title, ownerId=user_id)
            db_session.add(trip)
            await db_session.flush()
            await db_session.refresh(trip)
            result = {"tripId": trip.id, "title": trip.title}

        else:
            raise ValueError(f"Unknown method: {method}")

        return {"jsonrpc": "2.0", "id": rpc_id, "result": result}

    except Exception as e:
        logger.error("mcp", f"MCP method '{method}' failed", {"error": str(e)})
        return {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "error": {"code": -32000, "message": str(e)},
        }
