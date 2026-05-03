import { Router, Request, Response } from 'express'
import { requireAuth } from '../auth/middleware'
import { userRepository } from '../repositories/UserRepository'

const router = Router()

// Search users by email
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const { q } = req.query
    if (!q || typeof q !== 'string' || q.length < 2) {
      res.json([])
      return
    }

    const users = await userRepository.searchByEmail(q, req.user!.id)
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatar: u.avatar,
    })))
  } catch (error) {
    console.error('Error searching users:', error)
    res.status(500).json({ error: 'Failed to search users' })
  }
})

export default router
