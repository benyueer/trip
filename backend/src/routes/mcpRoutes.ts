import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth/middleware'
import { tripRepository } from '../repositories/TripRepository'

const router = Router()

// SSE endpoint for MCP client connection
router.get('/sse', requireAuth, (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connection', status: 'connected' })}\n\n`)

  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
  }, 30000)

  req.on('close', () => {
    clearInterval(heartbeat)
  })
})

// JSON-RPC message endpoint
router.post('/message', requireAuth, async (req: Request, res: Response) => {
  const { method, params, id } = req.body

  try {
    let result: any

    switch (method) {
      case 'query_trip_database': {
        const trips = await tripRepository.findAllForUser(req.user!.id)
        const query = params?.query?.toLowerCase() || ''
        const matched = trips.filter(t =>
          t.title.toLowerCase().includes(query) ||
          t.days.some(d =>
            d.items.some(i => i.name.toLowerCase().includes(query))
          )
        )
        result = { trips: matched.map(t => ({ id: t.id, title: t.title, days: t.days.length })) }
        break
      }

      case 'add_place_to_trip': {
        const { tripId, dayIndex, placeName, lng, lat } = params || {}
        const trip = await tripRepository.findById(tripId)
        if (!trip) throw new Error('Trip not found')

        let day = trip.days.find(d => d.dayIndex === dayIndex)
        if (!day) {
          day = { id: crypto.randomUUID(), dayIndex, tripId: trip.id, items: [] } as any
          trip.days.push(day as any)
        }

        day!.items.push({
          id: crypto.randomUUID(),
          type: 'place',
          name: placeName,
          lngLat: [lng, lat],
          description: '',
          category: '',
          address: '',
          rating: '',
          ticket: '',
          openingHours: '',
          phone: '',
          notes: '',
          distance: null,
          duration: null,
          path: null,
        } as any)

        const updated = await tripRepository.update(tripId, trip)
        result = { tripId: updated!.id, success: true }
        break
      }

      case 'create_new_trip': {
        const { title } = params || {}
        const trip = await tripRepository.create({ title, days: [] }, req.user!.id)
        result = { tripId: trip!.id, title: trip!.title }
        break
      }

      default:
        throw new Error(`Unknown method: ${method}`)
    }

    res.json({ jsonrpc: '2.0', id, result })
  } catch (error: any) {
    res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: error.message },
    })
  }
})

export default router
