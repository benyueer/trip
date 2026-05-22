#!/usr/bin/env python3
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session_factory
from app.models import Day, Item, Trip


async def import_places() -> None:
    places_path = Path(__file__).parent.parent.parent / "places1.json"
    if not places_path.exists():
        print(f"Places file not found: {places_path}")
        sys.exit(1)

    with open(places_path, "r", encoding="utf-8") as f:
        places = json.load(f)

    grouped: dict[str, list[dict]] = {}
    for place in places:
        city = place.get("city", "Unknown")
        if city not in grouped:
            grouped[city] = []
        grouped[city].append(place)

    async with async_session_factory() as session:
        for city, city_places in grouped.items():
            print(f"Importing {len(city_places)} places for {city}...")

            trip = Trip(title=city)
            session.add(trip)
            await session.flush()

            day = Day(dayIndex=0, tripId=trip.id)
            session.add(day)
            await session.flush()

            for p in city_places:
                item = Item(
                    type="place",
                    name=p.get("name", ""),
                    lngLat=json.dumps(p.get("lngLat", [])),
                    distance=p.get("distance"),
                    duration=p.get("duration"),
                    path=json.dumps(p.get("path")) if p.get("path") else None,
                    description=p.get("description"),
                    ticket=p.get("ticket"),
                    address=p.get("address", ""),
                    phone=p.get("phone", ""),
                    openingHours=p.get("openingHours", ""),
                    rating=p.get("rating", ""),
                    category=p.get("category", ""),
                    notes=p.get("notes", ""),
                    dayId=day.id,
                )
                session.add(item)

            print("  Done.")

        await session.commit()

    print("Import completed.")


if __name__ == "__main__":
    asyncio.run(import_places())
