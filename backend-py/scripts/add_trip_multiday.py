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
    """通过高德地图 API 获取地址的经纬度，带 QPS 重试"""
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
                    print(f"  高德地理编码限制 (QPS): {data.get('info')}，等待 2 秒重试...")
                else:
                    print(f"  查询失败: {data.get('info')}，等待重试...")
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

    # 精确的高德查询地址，避免查错同名地点
    places_to_query = {
        "成都": "四川省成都市",
        "雅安": "四川省雅安市",
        "泸定": "四川省甘孜藏族自治州泸定县",
        "康定": "四川省甘孜藏族自治州康定市",
        "新都桥": "四川省甘孜藏族自治州康定市新都桥镇",
        "雅江": "四川省甘孜藏族自治州雅江县",
        "理塘": "四川省甘孜藏族自治州理塘县",
        "稻城": "四川省甘孜藏族自治州稻城县",
        "日瓦": "四川省甘孜藏族自治州稻城县香格里拉镇",
        "亚丁村": "四川省甘孜藏族自治州稻城县亚丁村",
        "墨石公园": "四川省甘孜藏族自治州道孚县墨石公园景区",
        "杭州": "浙江省杭州市"
    }

    # 各天数地点规划
    itineraries = {
        2: ["成都", "雅安", "泸定", "康定", "新都桥"],
        3: ["新都桥", "雅江", "理塘", "稻城", "日瓦"],
        4: ["日瓦", "亚丁村", "日瓦"],
        5: ["日瓦", "稻城", "理塘", "新都桥"],
        6: ["新都桥", "墨石公园", "泸定", "成都"],
        7: ["成都", "杭州"]
    }

    # 1. 批量获取所有唯一地点的经纬度并缓存
    print("1. 正在获取所有唯一地点的经纬度...")
    unique_names = list(places_to_query.keys())
    places_coords = {}
    for name in unique_names:
        query_addr = places_to_query[name]
        coords = await get_lnglat(query_addr, key)
        places_coords[name] = coords
        print(f"  [经纬度已获取] {name} -> {coords}")
        await asyncio.sleep(1.5)  # 控频

    # 2. 对每一天的路线进行计算和规划
    print("\n2. 正在计算相邻地点之间的驾车路线...")
    all_day_routes = {}  # 结构: {day_index: [route1_data, route2_data, ...]}
    
    for day_index, places in itineraries.items():
        print(f"\n  --- 规划第 {day_index} 天路线 ---")
        routes = []
        for i in range(len(places) - 1):
            start_name = places[i]
            end_name = places[i+1]
            start_pt = places_coords[start_name]
            end_pt = places_coords[end_name]
            print(f"    计算路线: {start_name} -> {end_name}...")
            
            route_data = None
            for attempt in range(3):
                try:
                    route_data = await calculate_route((start_pt[0], start_pt[1]), (end_pt[0], end_pt[1]), "Driving")
                    if route_data and route_data.get("distance") != "未知":
                        break
                except Exception as e:
                    print(f"    高德接口报错: {str(e)}")
                print(f"    警告: {start_name} -> {end_name} 路线计算失败或被限制，准备重试 (尝试 {attempt+1}/3)...")
                await asyncio.sleep(2.5)
                
            if not route_data or route_data.get("distance") == "未知":
                print(f"    [失败] {start_name} -> {end_name} 路线获取失败，将使用未知占位")
                route_data = {"distance": "未知", "duration": "未知", "path": []}
            else:
                print(f"    [成功] {start_name} -> {end_name} ({route_data['distance']}, {route_data['duration']})")
                
            routes.append(route_data)
            await asyncio.sleep(1.5)  # 控频
            
        all_day_routes[day_index] = routes

    # 3. 写入数据库
    print("\n3. 正在更新数据库...")
    async with async_session_factory() as session:
        # 确认 trip 是否存在
        trip_stmt = select(Trip).where(Trip.id == trip_id)
        trip = (await session.execute(trip_stmt)).scalar_one_or_none()
        if not trip:
            print(f"错误: 找不到 ID 为 {trip_id} 的行程(Trip)")
            sys.exit(1)
            
        print(f"  已找到行程: '{trip.title}'")

        for day_index in sorted(itineraries.keys()):
            places = itineraries[day_index]
            routes = all_day_routes[day_index]
            
            # 检查是否已存在该天的 Day
            day_stmt = select(Day).where((Day.tripId == trip_id) & (Day.dayIndex == day_index))
            existing_day = (await session.execute(day_stmt)).scalar_one_or_none()

            if existing_day:
                print(f"  [更新] 第 {day_index} 天已存在，清空旧项目...")
                await session.execute(sa_delete(Item).where(Item.dayId == existing_day.id))
                day = existing_day
            else:
                print(f"  [新建] 创建第 {day_index} 天的行程...")
                day = Day(dayIndex=day_index, tripId=trip_id, description="—".join(places))
                session.add(day)
                await session.flush()

            # 按照“地点 -> 路线 -> 地点”的交织顺序添加 items
            for i, name in enumerate(places):
                # 添加地点 Item
                item_place = Item(
                    type="place",
                    name=name,
                    lngLat=json.dumps(places_coords[name]),
                    dayId=day.id
                )
                session.add(item_place)
                await session.flush()

                # 如果不是最后一个，添加对应的路线 Item
                if i < len(routes):
                    r_data = routes[i]
                    item_route = Item(
                        type="route",
                        name="驾车" if name != "成都" or places[i+1] != "杭州" else "跨省交通",
                        distance=r_data["distance"],
                        duration=r_data["duration"],
                        path=json.dumps(r_data["path"]),
                        dayId=day.id
                    )
                    session.add(item_route)
                    await session.flush()

        await session.commit()
        print("\n成功将第 2、3、4、5、6、7 天的行程全部导入数据库!")

if __name__ == "__main__":
    asyncio.run(run())
