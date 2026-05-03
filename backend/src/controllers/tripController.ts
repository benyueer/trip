import { Request, Response } from 'express'
import { tripRepository } from '../repositories/TripRepository'

export const getAllTrips = async (req: Request, res: Response) => {
  try {
    const trips = await tripRepository.findAllForUser(req.user!.id)
    res.json(trips)
  } catch (error) {
    console.error('Error fetching trips:', error)
    res.status(500).json({ error: 'Failed to fetch trips' })
  }
}

export const getTripById = async (req: Request, res: Response) => {
  try {
    const trip = await tripRepository.findById(req.params.id)
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' })
      return
    }

    // Check access
    const hasAccess = await tripRepository.canUserAccess(req.params.id, req.user!.id)
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    res.json(trip)
  } catch (error) {
    console.error('Error fetching trip:', error)
    res.status(500).json({ error: 'Failed to fetch trip' })
  }
}

export const createTrip = async (req: Request, res: Response) => {
  try {
    const newTrip = await tripRepository.create(req.body, req.user!.id)
    res.status(201).json(newTrip)
  } catch (error) {
    console.error('Error creating trip:', error)
    res.status(500).json({ error: 'Failed to create trip' })
  }
}

export const updateTrip = async (req: Request, res: Response) => {
  try {
    const isOwner = await tripRepository.isOwner(req.params.id, req.user!.id)
    if (!isOwner) {
      res.status(403).json({ error: 'Only the owner can update this trip' })
      return
    }

    const updatedTrip = await tripRepository.update(req.params.id, req.body)
    res.json(updatedTrip)
  } catch (error) {
    console.error('Error updating trip:', error)
    res.status(500).json({ error: 'Failed to update trip' })
  }
}

export const deleteTrip = async (req: Request, res: Response) => {
  try {
    const isOwner = await tripRepository.isOwner(req.params.id, req.user!.id)
    if (!isOwner) {
      res.status(403).json({ error: 'Only the owner can delete this trip' })
      return
    }

    await tripRepository.delete(req.params.id)
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting trip:', error)
    res.status(500).json({ error: 'Failed to delete trip' })
  }
}

export const getAllPlaces = async (req: Request, res: Response) => {
  try {
    const places = await tripRepository.findAllPlacesForUser(req.user!.id)
    const result = places.map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      lngLat: p.lngLat as [number, number],
      description: p.description,
      ticket: p.ticket,
      address: p.address,
      phone: p.phone,
      openingHours: p.openingHours,
      rating: p.rating,
      category: p.category,
      notes: p.notes,
      tripId: p.day.trip.id,
      tripTitle: p.day.trip.title,
    }))
    res.json(result)
  } catch (error) {
    console.error('Error fetching all places:', error)
    res.status(500).json({ error: 'Failed to fetch places' })
  }
}

export const calculateAndAddRoute = async (req: Request, res: Response) => {
  try {
    const { id, dayIndex } = req.params
    const { startLngLat, endLngLat, mode, name, routeId } = req.body

    if (!startLngLat || !endLngLat || !mode) {
      res.status(400).json({ error: 'Missing required routing parameters' })
      return
    }

    const key = process.env.AMAP_WEB_KEY
    if (!key) {
      res.status(500).json({ error: 'AMAP_WEB_KEY is not configured on server' })
      return
    }

    const origin = `${startLngLat[0]},${startLngLat[1]}`
    const destination = `${endLngLat[0]},${endLngLat[1]}`

    let apiUrl = ''
    if (mode === 'Driving') {
      apiUrl = `https://restapi.amap.com/v3/direction/driving?origin=${origin}&destination=${destination}&key=${key}`
    } else if (mode === 'Walking') {
      apiUrl = `https://restapi.amap.com/v3/direction/walking?origin=${origin}&destination=${destination}&key=${key}`
    } else if (mode === 'Riding') {
      apiUrl = `https://restapi.amap.com/v4/direction/bicycling?origin=${origin}&destination=${destination}&key=${key}`
    } else {
      res.status(400).json({ error: 'Unsupported routing mode' })
      return
    }

    const response = await fetch(apiUrl)
    const result = await response.json()

    let distanceText = '未知'
    let durationText = ''
    const path: [number, number][] = []

    if (mode === 'Riding') {
      if (result.errcode !== 0) {
        throw new Error(`AMap API Error: ${result.errmsg}`)
      }
      const route = result.data.paths[0]
      distanceText = route.distance ? (parseInt(route.distance) / 1000).toFixed(1) + ' km' : '未知'
      if (route.duration) {
        const mins = Math.round(parseInt(route.duration) / 60)
        durationText = mins < 60 ? `${mins} 分钟` : `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`
      }
      if (route.steps) {
        route.steps.forEach((step: any) => {
          if (step.polyline) {
            const points = step.polyline.split(';')
            points.forEach((pt: string) => {
              const [lng, lat] = pt.split(',').map(Number)
              path.push([lng, lat])
            })
          }
        })
      }
    } else {
      if (result.status !== '1') {
        throw new Error(`AMap API Error: ${result.info}`)
      }
      const route = result.route.paths[0]
      distanceText = route.distance ? (parseInt(route.distance) / 1000).toFixed(1) + ' km' : '未知'
      if (route.duration) {
        const mins = Math.round(parseInt(route.duration) / 60)
        durationText = mins < 60 ? `${mins} 分钟` : `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`
      }
      if (route.steps) {
        route.steps.forEach((step: any) => {
          if (step.polyline) {
            const points = step.polyline.split(';')
            points.forEach((pt: string) => {
              const [lng, lat] = pt.split(',').map(Number)
              path.push([lng, lat])
            })
          }
        })
      }
    }

    const newRoute = {
      id: routeId,
      type: 'route',
      name: name,
      distance: distanceText,
      duration: durationText,
      path: path,
    }

    const trip = await tripRepository.findById(id)
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' })
      return
    }

    let day = trip.days.find(d => d.dayIndex === Number(dayIndex))
    if (!day) {
      day = { id: crypto.randomUUID(), dayIndex: Number(dayIndex), tripId: trip.id, items: [] } as any
      trip.days.push(day as any)
    }

    day.items.push(newRoute as any)

    const updatedTrip = await tripRepository.update(id, trip)
    res.json(updatedTrip)
  } catch (error) {
    console.error('Error calculating route:', error)
    res.status(500).json({ error: 'Failed to calculate route' })
  }
}
