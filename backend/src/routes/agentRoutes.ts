import { Router } from 'express'
import * as agentController from '../controllers/agentController'
import { requireAuth } from '../auth/middleware'

const router = Router()

router.use(requireAuth)

// Sessions
router.get('/sessions', agentController.getSessions)
router.post('/sessions', agentController.createSession)
router.delete('/sessions/:id', agentController.deleteSession)

// Messages
router.get('/sessions/:id/messages', agentController.getMessages)
router.post('/sessions/:id/chat', agentController.chat)

// Memories
router.get('/memories', agentController.getMemories)
router.delete('/memories/:memoryId', agentController.deleteMemory)

export default router
