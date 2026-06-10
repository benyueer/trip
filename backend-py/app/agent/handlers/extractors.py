"""Metadata extractors keyed by intent.

Each extractor takes a list of tool outputs and returns a metadata dict.
The unified handler calls the appropriate extractor based on intent.
"""
from __future__ import annotations

import json
from typing import Any


def _parse_tool_output(result: Any) -> dict | None:
    """Try to parse a tool output into a dict."""
    try:
        if isinstance(result, str):
            return json.loads(result)
        if isinstance(result, dict):
            return result
        if hasattr(result, "content"):
            content = result.content
            return json.loads(content) if isinstance(content, str) else content
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def extract_places_metadata(tool_results: list[Any]) -> dict:
    """Extract place data from tool results (for place_search intent).

    Scans all tool outputs for structured place data (with lngLat).
    Prefers structured data; falls back to webSearch results.
    """
    structured: list[dict] = []
    fallback: list[dict] = []

    for result in tool_results:
        data = _parse_tool_output(result)
        if not data or not isinstance(data, dict):
            continue

        for key in ("suggested_places", "places", "results", "pois"):
            val = data.get(key)
            if not isinstance(val, list) or not val:
                continue
            for item in val:
                if not isinstance(item, dict):
                    continue
                name = item.get("name") or item.get("title") or item.get("pname")
                if not name:
                    continue
                lnglat = item.get("lngLat") or item.get("location") or []
                if isinstance(lnglat, str) and "," in lnglat:
                    try:
                        parts = lnglat.split(",")
                        lnglat = [float(parts[0]), float(parts[1])]
                    except (ValueError, IndexError):
                        lnglat = []
                if isinstance(lnglat, list) and len(lnglat) >= 2 and lnglat[0] and lnglat[1]:
                    structured.append({
                        "name": name,
                        "lngLat": lnglat[:2],
                        "description": item.get("description") or item.get("snippet", ""),
                        "category": item.get("category") or item.get("type", ""),
                        "address": item.get("address") or item.get("addr", ""),
                        "rating": item.get("rating", ""),
                        "ticket": item.get("ticket", ""),
                        "openingHours": item.get("openingHours") or item.get("business_hours", ""),
                    })
                else:
                    fallback.append({
                        "name": name,
                        "lngLat": [],
                        "description": item.get("description") or item.get("snippet", ""),
                        "address": item.get("address") or item.get("url", ""),
                    })

    all_places = structured if structured else fallback
    metadata: dict = {}
    if all_places:
        seen: set[str] = set()
        unique: list[dict] = []
        for p in all_places:
            key = str(p.get("name", ""))
            if key and key not in seen:
                seen.add(key)
                unique.append(p)
        metadata["suggestedPlaces"] = unique
    return metadata


def extract_trip_metadata(tool_results: list[Any]) -> dict:
    """Extract trip plan metadata from tool results (for trip_planner intent)."""
    metadata: dict = {}
    for result in tool_results:
        data = _parse_tool_output(result)
        if not data or not isinstance(data, dict):
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


def extract_memory_metadata(tool_results: list[Any]) -> dict:
    """Extract memory metadata (for memory intent). No structured extraction needed."""
    return {}


# Intent -> extractor mapping
EXTRACTORS = {
    "place_search": extract_places_metadata,
    "trip_planner": extract_trip_metadata,
    "memory": extract_memory_metadata,
    "import_itinerary": extract_trip_metadata,
}


# Intent -> recursion limit
RECURSION_LIMITS = {
    "place_search": 30,
    "trip_planner": 50,
    "memory": 10,
    "import_itinerary": 50,
}

DEFAULT_RECURSION_LIMIT = 30
