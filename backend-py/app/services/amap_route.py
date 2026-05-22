from __future__ import annotations

from typing import Any, Optional

import httpx

from app.config import settings
from app.logger import logger


async def calculate_route(
    start_lng_lat: tuple[float, float],
    end_lng_lat: tuple[float, float],
    mode: str = "Driving",
) -> Optional[dict]:
    if not settings.amap_web_key:
        logger.error("route", "AMAP_WEB_KEY not configured")
        return None

    origin = f"{start_lng_lat[0]},{start_lng_lat[1]}"
    destination = f"{end_lng_lat[0]},{end_lng_lat[1]}"

    if mode == "Driving":
        url = f"https://restapi.amap.com/v3/direction/driving?origin={origin}&destination={destination}&key={settings.amap_web_key}"
    elif mode == "Walking":
        url = f"https://restapi.amap.com/v3/direction/walking?origin={origin}&destination={destination}&key={settings.amap_web_key}"
    elif mode == "Riding":
        url = f"https://restapi.amap.com/v4/direction/bicycling?origin={origin}&destination={destination}&key={settings.amap_web_key}"
    else:
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10)
            result = response.json()
    except Exception as e:
        logger.error("route", f"AMap API request failed", {"error": str(e)})
        return None

    if mode == "Riding":
        if result.get("errcode") != 0:
            logger.error("route", "AMap Riding API Error", {"errmsg": result.get("errmsg")})
            return None
        route_data = result.get("data", {}).get("paths", [{}])[0]
    else:
        if result.get("status") != "1":
            logger.error("route", "AMap API Error", {"info": result.get("info")})
            return None
        route_data = result.get("route", {}).get("paths", [{}])[0]

    distance_val = route_data.get("distance")
    try:
        distance_km = round(int(distance_val) / 1000, 1) if distance_val else None
    except (ValueError, TypeError):
        distance_km = None

    try:
        mins = round(int(route_data.get("duration", 0)) / 60)
    except (ValueError, TypeError):
        mins = None
    duration_text = ""
    if mins is not None and mins > 0:
        duration_text = f"{mins} 分钟" if mins < 60 else f"{mins // 60} 小时 {mins % 60} 分钟"

    path: list[list[float]] = []
    if route_data.get("steps"):
        for step in route_data["steps"]:
            if step.get("polyline"):
                try:
                    for pt in step["polyline"].split(";"):
                        parts = pt.split(",")
                        if len(parts) == 2:
                            path.append([float(parts[0]), float(parts[1])])
                except (ValueError, TypeError) as e:
                    logger.warn("route", f"Failed to parse polyline segment", {"error": str(e)})

    return {
        "distance": f"{distance_km} km" if distance_km else "未知",
        "duration": duration_text,
        "path": path,
    }


async def calculate_routes_between_places(
    places: list[dict],
) -> list[dict]:
    routes: list[dict] = []
    for i in range(len(places) - 1):
        start = places[i]
        end = places[i + 1]
        start_coords = start.get("lngLat", [])
        end_coords = end.get("lngLat", [])

        if len(start_coords) < 2 or len(end_coords) < 2:
            logger.warn("route", f"Missing coordinates for route: {start.get('name')} \u2192 {end.get('name')}")
            routes.append({"distance": "未知", "duration": "未知", "path": []})
            continue

        try:
            route = await calculate_route(
                (start_coords[0], start_coords[1]),
                (end_coords[0], end_coords[1]),
            )
        except Exception as e:
            logger.error("route", f"Route calculation failed: {start.get('name')} \u2192 {end.get('name')}", {"error": str(e)})
            route = None

        if route:
            routes.append(route)
            logger.info("route", f"Route: {start.get('name')} \u2192 {end.get('name')}: {route['distance']}, {route['duration']}")
        else:
            routes.append({"distance": "未知", "duration": "未知", "path": []})
    return routes
