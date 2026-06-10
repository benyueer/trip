#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import asyncio
import json
import sys
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.database import async_session_factory
from app.models import Day, Item, Trip
from app.config import settings
from app.services.amap_route import calculate_route
from sqlalchemy import select, delete as sa_delete

async def get_lnglat(query_address: str, key: str) -> list[float]:
    """通过高德地图 API 获取地址的经纬度"""
    url = "https://restapi.amap.com/v3/geocode/geo"
    params = {
        "key": key,
        "address": query_address
    }
    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(url, params=params, timeout=10)
                data = r.json()
                if data.get("status") == "1" and data.get("geocodes"):
                    loc = data["geocodes"][0]["location"]
                    parts = loc.split(",")
                    return [float(parts[0]), float(parts[1])]
                elif "LIMIT" in data.get("info", ""):
                    print(f"  高德地理编码限制: {data.get('info')}，等待重试...")
                else:
                    print(f"  查询失败，返回信息: {data.get('info')}，等待重试...")
        except Exception as e:
            print(f"  警告: 查询 {query_address} 报错 (尝试 {attempt+1}/3): {str(e)}")
        await asyncio.sleep(2)
    raise ValueError(f"无法获取地点经纬度: {query_address}")

async def run():
    trip_id = "1ddb03fb-e0b8-4eab-9b62-2c4c4797caad"
    key = settings.amap_web_key
    if not key:
        print("错误: 未配置 AMAP_WEB_KEY")
        sys.exit(1)
        
    print(f"1. 正在获取地点的经纬度...")
    # 精确的高德查询地址，避免查错同名地点（比如新都桥跑去宁波）
    places_to_query = {
        "成都": "四川省成都市",
        "雅安": "四川省雅安市",
        "泸定": "四川省甘孜藏族自治州泸定县",
        "康定": "四川省甘孜藏族自治州康定市",
        "新都桥": "四川省甘孜藏族自治州康定市新都桥镇"
    }
    
    places_names = ["成都", "雅安", "泸定", "康定", "新都桥"]
    places_coords = {}
    
    for name in places_names:
        query_addr = places_to_query[name]
        coords = await get_lnglat(query_addr, key)
        places_coords[name] = coords
        print(f"  {name} ({query_addr}): {coords}")
        await asyncio.sleep(1.5)  # 每次地理编码请求间隔 1.5 秒，避免 QPS 触发限制

    print("2. 正在计算相邻地点之间的路线...")
    routes = []
    for i in range(len(places_names) - 1):
        start_name = places_names[i]
        end_name = places_names[i+1]
        start_pt = places_coords[start_name]
        end_pt = places_coords[end_name]
        print(f"  计算路线: {start_name} -> {end_name}...")
        
        route_data = None
        for attempt in range(3):
            route_data = await calculate_route((start_pt[0], start_pt[1]), (end_pt[0], end_pt[1]), "Driving")
            # 只有当成功计算出路径且不为未知时，我们才认为成功
            if route_data and route_data.get("distance") != "未知":
                break
            print(f"  警告: {start_name} -> {end_name} 路线计算失败或被限制，准备重试 (尝试 {attempt+1}/3)...")
            await asyncio.sleep(2.5)  # 稍微等多一点时间
            
        if not route_data or route_data.get("distance") == "未知":
            print(f"  错误: {start_name} -> {end_name} 路线计算最终失败，使用空白路线占位")
            route_data = {"distance": "未知", "duration": "未知", "path": []}
            
        routes.append(route_data)
        await asyncio.sleep(1.5)  # 每次路线计算请求间隔 1.5 秒，防 QPS 限制

    print("3. 正在更新数据库...")
    async with async_session_factory() as session:
        # 确认 trip 是否存在
        trip_stmt = select(Trip).where(Trip.id == trip_id)
        trip = (await session.execute(trip_stmt)).scalar_one_or_none()
        if not trip:
            print(f"错误: 找不到 ID 为 {trip_id} 的行程(Trip)")
            sys.exit(1)
            
        print(f"  找到行程: '{trip.title}'")

        # 检查是否已存在 dayIndex == 2 的 Day
        day_stmt = select(Day).where((Day.tripId == trip_id) & (Day.dayIndex == 2))
        existing_day = (await session.execute(day_stmt)).scalar_one_or_none()

        if existing_day:
            print("  检测到已存在第 2 天的行程，正在删除原有数据...")
            # 删除相关的 items
            await session.execute(sa_delete(Item).where(Item.dayId == existing_day.id))
            day = existing_day
        else:
            print("  创建新的第 2 天行程...")
            day = Day(dayIndex=2, tripId=trip_id, description="成都—雅安—泸定—康定—新都桥")
            session.add(day)
            await session.flush()

        # 按照“地点 -> 路线 -> 地点”的交织顺序添加 items
        for i, name in enumerate(places_names):
            # 添加地点
            item_place = Item(
                type="place",
                name=name,
                lngLat=json.dumps(places_coords[name]),
                dayId=day.id
            )
            session.add(item_place)
            await session.flush()

            # 如果不是最后一个，添加对应的路线
            if i < len(routes):
                r_data = routes[i]
                item_route = Item(
                    type="route",
                    name="驾车",
                    distance=r_data["distance"],
                    duration=r_data["duration"],
                    path=json.dumps(r_data["path"]),
                    dayId=day.id
                )
                session.add(item_route)
                await session.flush()

        await session.commit()
        print("  成功更新数据库!")

if __name__ == "__main__":
    asyncio.run(run())
