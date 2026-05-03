import { Router } from 'express'
import * as tripController from '../controllers/tripController'
import { requireAuth } from '../auth/middleware'

const router = Router()

router.use(requireAuth)

router.get('/', tripController.getAllTrips)
router.get('/places', tripController.getAllPlaces)
router.get('/:id', tripController.getTripById)
router.post('/', tripController.createTrip)
router.put('/:id', tripController.updateTrip)
router.delete('/:id', tripController.deleteTrip)
router.post('/:id/days/:dayIndex/routes', tripController.calculateAndAddRoute)

export default router
