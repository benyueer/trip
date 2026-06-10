from __future__ import annotations

import json
from typing import Any

from litestar import get, post
from litestar.connection import ASGIConnection
from litestar.datastructures import Cookie
from litestar.exceptions import HTTPException, NotAuthorizedException
from litestar.response import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.jwt_auth import jwt_auth
from app.models import User, Trip, Day, Item
from app.crypto import hash_password, verify_password


def require_auth(connection: ASGIConnection, _: Any) -> None:
    user = connection.user
    if not user:
        raise NotAuthorizedException("Authentication required")


class RegisterPayload(BaseModel):
    username: str
    password: str
    name: str | None = None


class LoginPayload(BaseModel):
    username: str
    password: str


@get("/auth/me")
async def auth_me(request: Any) -> Any:
    return request.user


@post("/auth/logout")
async def auth_logout() -> Response:
    return Response(
        content={"success": True},
        cookies=[Cookie(key="token", value="", max_age=0, path="/")],
    )


@post("/auth/register")
async def auth_register(data: RegisterPayload, db_session: AsyncSession) -> Any:
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="用户名长度不能少于 3 个字符")

    result = await db_session.execute(
        select(User).where(User.email == username)
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="该用户名已被注册")

    # 昵称未填写时，默认与用户名一致
    display_name = data.name.strip() if data.name and data.name.strip() else username

    user = User(
        email=username,  # 用户名存储在原 email 列中（保持 unique 约束）
        name=display_name,
        provider="local",
        providerId=f"local-{username}",
        password_hash=hash_password(data.password)
    )
    db_session.add(user)
    await db_session.flush()

    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar": user.avatar,
        "provider": user.provider,
        "providerId": user.providerId,
    }
    return jwt_auth.login(identifier=user.id, token_extras={"user": user_data}, response_body=user_data)


@post("/auth/login")
async def auth_login(data: LoginPayload, db_session: AsyncSession) -> Any:
    username = data.username.strip()
    result = await db_session.execute(
        select(User).where(User.email == username)
    )
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="用户名或密码错误")

    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar": user.avatar,
        "provider": user.provider,
        "providerId": user.providerId,
    }
    return jwt_auth.login(identifier=user.id, token_extras={"user": user_data}, response_body=user_data)


@get("/auth/guest-login")
async def auth_guest_login(db_session: AsyncSession) -> Any:
    email = "guest@localhost"
    result = await db_session.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            name="游客",
            provider="guest",
            providerId="guest-user",
        )
        db_session.add(user)
        await db_session.flush()
        
        # 为游客用户初始化一套精彩的北京三日游演示数据
        await create_demo_trip_for_guest(db_session, user.id)

    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar": user.avatar,
        "provider": user.provider,
        "providerId": user.providerId,
    }
    return jwt_auth.login(identifier=user.id, token_extras={"user": user_data}, response_body=user_data)


async def create_demo_trip_for_guest(db_session: AsyncSession, guest_user_id: str) -> None:
    demo_trip = Trip(
        title="北京经典三日游 (演示)",
        description="这是一份为您准备的北京三日游经典行程，包含天安门广场、故宫、长城、颐和园、南锣鼓巷等经典地标。游客模式下此行程只读。",
        ownerId=guest_user_id
    )
    db_session.add(demo_trip)
    await db_session.flush()

    # Day 1: 皇家历史底蕴
    day1 = Day(dayIndex=1, description="探索皇家历史底蕴", tripId=demo_trip.id)
    db_session.add(day1)
    await db_session.flush()

    item1_1 = Item(
        type="place",
        name="天安门广场",
        lngLat=json.dumps([116.397, 39.908]),
        description="北京的心脏，世界上最大的城市广场之一。",
        address="北京市东城区东长安街",
        category="著名景点",
        rating="4.8",
        dayId=day1.id
    )
    item1_2 = Item(
        type="place",
        name="故宫博物院",
        lngLat=json.dumps([116.397, 39.917]),
        description="明清两代的皇家宫殿，被誉为世界五大宫之首，馆藏极为丰富。",
        address="北京市东城区景山前街4号",
        ticket="60",
        openingHours="08:30-17:00",
        category="博物馆/遗迹",
        rating="4.9",
        dayId=day1.id
    )
    db_session.add(item1_1)
    db_session.add(item1_2)

    # Day 2: 万里长城与颐和园
    day2 = Day(dayIndex=2, description="领略长城雄伟与皇家园林", tripId=demo_trip.id)
    db_session.add(day2)
    await db_session.flush()

    item2_1 = Item(
        type="place",
        name="八达岭长城",
        lngLat=json.dumps([116.024, 40.355]),
        description="万里长城的杰出代表，地势险要，建筑华丽，视野极其开阔。",
        address="北京市延庆区军都山关沟古道北口",
        ticket="40",
        openingHours="06:30-16:30",
        category="自然风光/遗迹",
        rating="4.8",
        dayId=day2.id
    )
    item2_2 = Item(
        type="place",
        name="颐和园",
        lngLat=json.dumps([116.273, 39.999]),
        description="中国保存最完整的皇家行宫御苑，被誉为“皇家园林博物馆”。",
        address="北京市海淀区新建宫门路19号",
        ticket="30",
        openingHours="06:00-19:00",
        category="皇家园林/古迹",
        rating="4.7",
        dayId=day2.id
    )
    db_session.add(item2_1)
    db_session.add(item2_2)

    # Day 3: 特色胡同与现代艺术
    day3 = Day(dayIndex=3, description="文艺与创意的碰撞之旅", tripId=demo_trip.id)
    db_session.add(day3)
    await db_session.flush()

    item3_1 = Item(
        type="place",
        name="南锣鼓巷",
        lngLat=json.dumps([116.403, 39.939]),
        description="北京最古老的街区之一，分布着众多名胜古迹与老北京特色商铺。",
        address="北京市东城区南锣鼓巷胡同",
        category="特色街区",
        rating="4.2",
        dayId=day3.id
    )
    item3_2 = Item(
        type="place",
        name="798艺术区",
        lngLat=json.dumps([116.493, 39.986]),
        description="由旧包豪斯风格厂房改造的现代艺术特区，画廊与创意店铺云集。",
        address="北京市朝阳区酒仙桥路4号",
        category="创意园区",
        rating="4.5",
        dayId=day3.id
    )
    db_session.add(item3_1)
    db_session.add(item3_2)

    await db_session.flush()
