from __future__ import annotations

from litestar import delete, get, post
from litestar import Request
from litestar.exceptions import HTTPException
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT, HTTP_403_FORBIDDEN, HTTP_404_NOT_FOUND, HTTP_409_CONFLICT
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Trip, TripShare
from app.routes.auth import require_auth


@get("/api/trips/{trip_id:str}/shares", guards=[require_auth])
async def list_shares(
    trip_id: str,
    db_session: AsyncSession,
) -> list[dict]:
    result = await db_session.execute(
        select(TripShare)
        .where(TripShare.tripId == trip_id)
        .options(selectinload(TripShare.user))
    )
    shares = result.scalars().all()
    return [
        {
            "id": s.id,
            "tripId": s.tripId,
            "userId": s.userId,
            "permission": s.permission,
            "createdAt": s.createdAt.isoformat() if s.createdAt else None,
            "user": {
                "id": s.user.id,
                "email": s.user.email,
                "name": s.user.name,
                "avatar": s.user.avatar,
            } if s.user else None,
        }
        for s in shares
    ]


@post("/api/trips/{trip_id:str}/shares", status_code=HTTP_201_CREATED, guards=[require_auth])
async def create_share(
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
        raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Only the trip owner can manage shares")

    existing = await db_session.execute(
        select(TripShare).where(
            (TripShare.tripId == trip_id) & (TripShare.userId == data["userId"])
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="User already has access")

    share = TripShare(
        tripId=trip_id,
        userId=data["userId"],
        permission=data.get("permission", "view"),
    )
    db_session.add(share)
    await db_session.flush()
    await db_session.refresh(share)

    return {
        "id": share.id,
        "tripId": share.tripId,
        "userId": share.userId,
        "permission": share.permission,
        "createdAt": share.createdAt.isoformat() if share.createdAt else None,
    }


@delete("/api/trips/{trip_id:str}/shares/{share_user_id:str}", status_code=HTTP_204_NO_CONTENT, guards=[require_auth])
async def delete_share(
    trip_id: str,
    share_user_id: str,
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
        raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Only the trip owner can manage shares")

    share_result = await db_session.execute(
        select(TripShare).where(
            (TripShare.tripId == trip_id) & (TripShare.userId == share_user_id)
        )
    )
    share = share_result.scalar_one_or_none()
    if share:
        await db_session.delete(share)
