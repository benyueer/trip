from __future__ import annotations

import json
from typing import Any

from litestar import delete, get, post, put
from litestar import Request
from litestar.exceptions import HTTPException
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT, HTTP_400_BAD_REQUEST, HTTP_403_FORBIDDEN, HTTP_404_NOT_FOUND
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.logger import logger
from app.models import Day, Item, Trip, TripShare
from app.routes.auth import require_auth
from app.services.amap_route import calculate_route


def _parse_lnglat(val: Any) -> list[float]:
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _parse_json(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def _serialize_trip(trip: Trip) -> dict:
    return {
        "id": trip.id,
        "title": trip.title,
        "description": trip.description or "",
        "ownerId": trip.ownerId,
        "createdAt": trip.createdAt.isoformat() if trip.createdAt else None,
        "updatedAt": trip.updatedAt.isoformat() if trip.updatedAt else None,
        "owner": {
            "id": trip.owner.id,
            "name": trip.owner.name,
            "email": trip.owner.email,
            "avatar": trip.owner.avatar,
        } if trip.owner else None,
        "days": [
            {
                "id": day.id,
                "dayIndex": day.dayIndex,
                "description": day.description or "",
                "tripId": day.tripId,
                "items": [
                    {
                        "id": item.id,
                        "type": item.type,
                        "name": item.name,
                        "lngLat": _parse_lnglat(item.lngLat),
                        "distance": item.distance,
                        "duration": item.duration,
                        "path": _parse_json(item.path),
                        "description": item.description or "",
                        "ticket": item.ticket or "",
                        "address": item.address or "",
                        "phone": item.phone or "",
                        "openingHours": item.openingHours or "",
                        "rating": item.rating or "",
                        "category": item.category or "",
                        "notes": item.notes or "",
                        "dayId": item.dayId,
                    }
                    for item in (day.items or [])
                ],
            }
            for day in (trip.days or [])
        ],
    }


@get("/api/trips", guards=[require_auth])
async def get_all_trips(
    request: Request,
    db_session: AsyncSession,
) -> list[dict]:
    user_id = request.user["id"]
    is_guest = request.user.get("provider") == "guest"

    if is_guest:
        # 游客模式下查阅系统中的所有行程
        result = await db_session.execute(
            select(Trip)
            .options(
                selectinload(Trip.owner),
                selectinload(Trip.days).selectinload(Day.items),
            )
            .order_by(Trip.updatedAt.desc())
        )
    else:
        subquery = select(TripShare.tripId).where(TripShare.userId == user_id).scalar_subquery()
        result = await db_session.execute(
            select(Trip)
            .outerjoin(TripShare, TripShare.tripId == Trip.id)
            .where(
                (Trip.ownerId == user_id) | (Trip.id.in_(subquery))
            )
            .options(
                selectinload(Trip.owner),
                selectinload(Trip.days).selectinload(Day.items),
            )
            .order_by(Trip.updatedAt.desc())
            .distinct()
        )
    trips = result.scalars().all()
    return [_serialize_trip(t) for t in trips]


@get("/api/trips/places", guards=[require_auth])
async def get_all_places(
    request: Request,
    db_session: AsyncSession,
) -> list[dict]:
    user_id = request.user["id"]
    is_guest = request.user.get("provider") == "guest"

    if is_guest:
        # 游客模式下直接返回系统内所有的地点
        result = await db_session.execute(
            select(Item)
            .join(Day, Day.id == Item.dayId)
            .join(Trip, Trip.id == Day.tripId)
            .where(Item.type == "place")
            .options(selectinload(Item.day).selectinload(Day.trip))
        )
    else:
        shared_trip_ids_subq = select(TripShare.tripId).where(TripShare.userId == user_id).scalar_subquery()
        result = await db_session.execute(
            select(Item)
            .join(Day, Day.id == Item.dayId)
            .join(Trip, Trip.id == Day.tripId)
            .where(
                (Item.type == "place") &
                ((Trip.ownerId == user_id) | (Trip.id.in_(shared_trip_ids_subq)))
            )
            .options(selectinload(Item.day).selectinload(Day.trip))
        )
    items = result.scalars().all()

    return [
        {
            "id": item.id,
            "type": item.type,
            "name": item.name,
            "lngLat": _parse_lnglat(item.lngLat),
            "description": item.description or "",
            "ticket": item.ticket or "",
            "address": item.address or "",
            "phone": item.phone or "",
            "openingHours": item.openingHours or "",
            "rating": item.rating or "",
            "category": item.category or "",
            "notes": item.notes or "",
            "tripId": item.day.trip.id,
            "tripTitle": item.day.trip.title,
        }
        for item in items
    ]


@get("/api/trips/{trip_id:str}", guards=[require_auth])
async def get_trip_by_id(
    trip_id: str,
    request: Request,
    db_session: AsyncSession,
) -> dict:
    user_id = request.user["id"]

    result = await db_session.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.owner),
            selectinload(Trip.days).selectinload(Day.items),
        )
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Trip not found")

    is_owner = trip.ownerId == user_id
    is_guest = request.user.get("provider") == "guest"
    if not is_owner and not is_guest:
        share_result = await db_session.execute(
            select(TripShare).where(
                (TripShare.tripId == trip_id) & (TripShare.userId == user_id)
            )
        )
        if not share_result.scalar_one_or_none():
            raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Access denied")

    return _serialize_trip(trip)


@post("/api/trips", status_code=HTTP_201_CREATED, guards=[require_auth])
async def create_trip(
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> dict:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]

    trip = Trip(
        title=data.get("title", "Untitled"),
        description=data.get("description", ""),
        ownerId=user_id,
    )
    db_session.add(trip)
    await db_session.flush()

    for day_data in data.get("days", []):
        day = Day(
            dayIndex=day_data.get("dayIndex", 0),
            description=day_data.get("description", ""),
            tripId=trip.id,
        )
        db_session.add(day)
        await db_session.flush()

        for item_data in day_data.get("items", []):
            raw_lnglat = item_data.get("lngLat", "[]")
            lnglat_str = json.dumps(raw_lnglat) if isinstance(raw_lnglat, list) else raw_lnglat
            item = Item(
                id=item_data.get("id"),
                type=item_data.get("type", "place"),
                name=item_data.get("name", ""),
                lngLat=lnglat_str,
                distance=item_data.get("distance"),
                duration=item_data.get("duration"),
                path=json.dumps(item_data.get("path")) if item_data.get("path") else None,
                description=item_data.get("description"),
                ticket=item_data.get("ticket"),
                address=item_data.get("address"),
                phone=item_data.get("phone"),
                openingHours=item_data.get("openingHours"),
                rating=item_data.get("rating"),
                category=item_data.get("category"),
                notes=item_data.get("notes"),
                dayId=day.id,
            )
            db_session.add(item)

    await db_session.flush()

    result = await db_session.execute(
        select(Trip)
        .where(Trip.id == trip.id)
        .options(
            selectinload(Trip.owner),
            selectinload(Trip.days).selectinload(Day.items),
        )
    )
    trip = result.scalar_one()
    return _serialize_trip(trip)


@put("/api/trips/{trip_id:str}", guards=[require_auth])
async def update_trip(
    trip_id: str,
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> dict:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]

    result = await db_session.execute(select(Trip).where(Trip.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Trip not found")
    if trip.ownerId != user_id:
        raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Only the owner can update this trip")

    if "title" in data:
        trip.title = data["title"]
    if "description" in data:
        trip.description = data.get("description", "")
    trip.updatedAt = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).replace(tzinfo=None)

    if "days" in data:
        # Delete items first to avoid FK violation
        existing_days = (await db_session.execute(
            select(Day.id).where(Day.tripId == trip_id)
        )).scalars().all()
        if existing_days:
            await db_session.execute(sa_delete(Item).where(Item.dayId.in_(existing_days)))
        await db_session.execute(sa_delete(Day).where(Day.tripId == trip_id))

        for day_data in data["days"]:
            day = Day(
                dayIndex=day_data.get("dayIndex", 0),
                description=day_data.get("description", ""),
                tripId=trip_id,
            )
            db_session.add(day)
            await db_session.flush()

            for item_data in day_data.get("items", []):
                item = Item(
                    id=item_data.get("id"),
                    type=item_data.get("type", "place"),
                    name=item_data.get("name", ""),
                    lngLat=json.dumps(_parse_lnglat(item_data.get("lngLat", []))),
                    distance=item_data.get("distance"),
                    duration=item_data.get("duration"),
                    path=json.dumps(item_data.get("path")) if item_data.get("path") else None,
                    description=item_data.get("description"),
                    ticket=item_data.get("ticket"),
                    address=item_data.get("address"),
                    phone=item_data.get("phone"),
                    openingHours=item_data.get("openingHours"),
                    rating=item_data.get("rating"),
                    category=item_data.get("category"),
                    notes=item_data.get("notes"),
                    dayId=day.id,
                )
                db_session.add(item)

    await db_session.flush()

    result = await db_session.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.owner),
            selectinload(Trip.days).selectinload(Day.items),
        )
    )
    trip = result.scalar_one()
    return _serialize_trip(trip)


@delete("/api/trips/{trip_id:str}", status_code=HTTP_204_NO_CONTENT, guards=[require_auth])
async def delete_trip(
    trip_id: str,
    request: Request,
    db_session: AsyncSession,
) -> None:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    user_id = request.user["id"]

    result = await db_session.execute(select(Trip).where(Trip.id == trip_id))
    trip = result.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Trip not found")
    if trip.ownerId != user_id:
        raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Only the owner can delete this trip")

    await db_session.delete(trip)


@post("/api/trips/{trip_id:str}/days/{day_index:int}/routes", guards=[require_auth])
async def calculate_and_add_route(
    trip_id: str,
    day_index: int,
    data: dict,
    request: Request,
    db_session: AsyncSession,
) -> dict:
    if request.user.get("provider") == "guest":
        raise HTTPException(status_code=403, detail="游客模式只读，无法进行此操作")
    start_lng_lat = data.get("startLngLat")
    end_lng_lat = data.get("endLngLat")
    mode = data.get("mode")
    name = data.get("name", "")
    route_id = data.get("routeId")

    if not start_lng_lat or not end_lng_lat or not mode:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Missing required routing parameters")

    if not isinstance(start_lng_lat, (list, tuple)) or len(start_lng_lat) < 2:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="startLngLat must be [lng, lat]")
    if not isinstance(end_lng_lat, (list, tuple)) or len(end_lng_lat) < 2:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="endLngLat must be [lng, lat]")
    if mode not in ("Driving", "Walking", "Riding"):
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="mode must be Driving, Walking, or Riding")

    # 优先从数据库中匹配已有的路线数据
    matched_route = None
    try:
        result_routes = await db_session.execute(
            select(Item).where((Item.type == "route") & (Item.path.isnot(None)))
        )
        existing_routes = result_routes.scalars().all()
        for r in existing_routes:
            try:
                r_path = json.loads(r.path) if isinstance(r.path, str) else r.path
                if not isinstance(r_path, list) or len(r_path) < 2:
                    continue
                start_pt = r_path[0]
                end_pt = r_path[-1]

                # 比较起点与终点坐标是否极其接近（经纬度误差小于 0.0001 度，约 10 米以内）
                if (abs(start_pt[0] - float(start_lng_lat[0])) < 0.0001 and
                    abs(start_pt[1] - float(start_lng_lat[1])) < 0.0001 and
                    abs(end_pt[0] - float(end_lng_lat[0])) < 0.0001 and
                    abs(end_pt[1] - float(end_lng_lat[1])) < 0.0001):
                    # 判断出行方式是否一致（由路线名是否包含中文出行方式校验得出）
                    mode_zh = "驾车" if mode == "Driving" else "步行" if mode == "Walking" else "骑行"
                    if mode_zh in (r.name or ""):
                        matched_route = {
                            "distance": r.distance,
                            "duration": r.duration,
                            "path": r_path,
                        }
                        break
            except Exception:
                continue
    except Exception as e:
        logger.error("route", f"Failed to check database route: {str(e)}")

    if matched_route:
        route_result = matched_route
        logger.info("route", f"Database route matched: {name} (distance: {route_result['distance']})")
    else:
        if not settings.amap_web_key:
            raise HTTPException(status_code=500, detail="AMAP_WEB_KEY is not configured on server")

        route_result = await calculate_route(
            (float(start_lng_lat[0]), float(start_lng_lat[1])),
            (float(end_lng_lat[0]), float(end_lng_lat[1])),
            mode,
        )

        if not route_result:
            raise HTTPException(status_code=500, detail="Route calculation failed")

    if not route_result:
        raise HTTPException(status_code=500, detail="Route calculation failed")

    result = await db_session.execute(
        select(Day).where((Day.tripId == trip_id) & (Day.dayIndex == day_index))
    )
    day = result.scalar_one_or_none()
    if not day:
        day = Day(dayIndex=day_index, tripId=trip_id)
        db_session.add(day)
        await db_session.flush()

    item = Item(
        id=route_id or None,
        type="route",
        name=name,
        distance=route_result["distance"],
        duration=route_result["duration"],
        path=json.dumps(route_result["path"]),
        dayId=day.id,
    )
    db_session.add(item)
    await db_session.flush()

    trip_result = await db_session.execute(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.owner),
            selectinload(Trip.days).selectinload(Day.items),
        )
    )
    trip = trip_result.scalar_one()
    return _serialize_trip(trip)
