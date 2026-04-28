import { Router } from 'express'
import * as tripController from '../controllers/tripController'

const router = Router()

router.get('/', tripController.getAllTrips)
router.get('/:id', tripController.getTripById)
router.post('/', tripController.createTrip)
router.put('/:id', tripController.updateTrip)
router.delete('/:id', tripController.deleteTrip)
router.post('/:id/days/:dayIndex/routes', tripController.calculateAndAddRoute)

export default router
