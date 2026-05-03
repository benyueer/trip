import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth/middleware'
import { shareRepository } from '../repositories/ShareRepository'
import { tripRepository } from '../repositories/TripRepository'

const router = Router({ mergeParams: true })

// List shares for a trip
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const shares = await shareRepository.findByTripId(id)
    res.json(shares)
  } catch (error) {
    console.error('Error fetching shares:', error)
    res.status(500).json({ error: 'Failed to fetch shares' })
  }
})

// Add a share (invite user)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { userId, permission } = req.body

    // Verify the requester is the trip owner
    const trip = await tripRepository.findById(id)
    if (!trip || trip.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Only the trip owner can manage shares' })
      return
    }

    // Check if share already exists
    const existing = await shareRepository.isSharedWithUser(id, userId)
    if (existing) {
      res.status(409).json({ error: 'User already has access' })
      return
    }

    const share = await shareRepository.create(id, userId, permission || 'view')
    res.status(201).json(share)
  } catch (error) {
    console.error('Error creating share:', error)
    res.status(500).json({ error: 'Failed to create share' })
  }
})

// Remove a share
router.delete('/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params

    // Verify the requester is the trip owner
    const trip = await tripRepository.findById(id)
    if (!trip || trip.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Only the trip owner can manage shares' })
      return
    }

    await shareRepository.delete(id, userId)
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting share:', error)
    res.status(500).json({ error: 'Failed to delete share' })
  }
})

export default router
