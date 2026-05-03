import { db } from '../db'
import { trips, days, items } from '../db/schema'
import * as fs from 'fs'
import * as path from 'path'

interface Place {
  type: string
  city: string
  name: string
  lngLat: number[]
  distance: string | null
  duration: string | null
  path: string | null
  description: string | null
  ticket: string | null
  address: string
  phone: string
  openingHours: string
  rating: string
  category: string
  notes: string
}

async function importPlaces() {
  const placesPath = path.resolve(__dirname, '../../../places1.json')
  const raw = fs.readFileSync(placesPath, 'utf-8')
  const places: Place[] = JSON.parse(raw)

  // Group by city
  const grouped = places.reduce<Record<string, Place[]>>((acc, place) => {
    if (!acc[place.city]) acc[place.city] = []
    acc[place.city].push(place)
    return acc
  }, {})

  for (const [city, cityPlaces] of Object.entries(grouped)) {
    console.log(`Importing ${cityPlaces.length} places for ${city}...`)

    await db.transaction(async (tx) => {
      const [trip] = await tx.insert(trips).values({
        title: city
      }).returning()

      const [day] = await tx.insert(days).values({
        dayIndex: 0,
        tripId: trip.id
      }).returning()

      await tx.insert(items).values(
        cityPlaces.map((p) => ({
          type: 'place',
          name: p.name,
          lngLat: p.lngLat,
          distance: p.distance,
          duration: p.duration,
          path: p.path,
          description: p.description,
          ticket: p.ticket,
          address: p.address,
          phone: p.phone,
          openingHours: p.openingHours,
          rating: p.rating,
          category: p.category,
          notes: p.notes,
          dayId: day.id
        }))
      )
    })

    console.log(`  Done.`)
  }

  console.log('Import completed.')
  process.exit(0)
}

importPlaces().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
