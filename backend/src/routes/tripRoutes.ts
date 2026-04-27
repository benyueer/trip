import { Router } from 'express'
import * as tripController from '../controllers/tripController'

const router = Router()

router.get('/', tripController.getAllTrips)
router.get('/:id', tripController.getTripById)
router.post('/', tripController.createTrip)
router.put('/:id', tripController.updateTrip)
router.delete('/:id', tripController.deleteTrip)

export default router
