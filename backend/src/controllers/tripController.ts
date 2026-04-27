import { Request, Response } from 'express'
import { tripRepository } from '../repositories/TripRepository'

export const getAllTrips = async (req: Request, res: Response) => {
  try {
    const trips = await tripRepository.findAll()
    res.json(trips)
  } catch (error) {
    console.error('Error fetching trips:', error)
    res.status(500).json({ error: 'Failed to fetch trips' })
  }
}

export const getTripById = async (req: Request, res: Response) => {
  try {
    const trip = await tripRepository.findById(req.params.id)
    if (trip) {
      res.json(trip)
    } else {
      res.status(404).json({ error: 'Trip not found' })
    }
  } catch (error) {
    console.error('Error fetching trip:', error)
    res.status(500).json({ error: 'Failed to fetch trip' })
  }
}

export const createTrip = async (req: Request, res: Response) => {
  try {
    const newTrip = await tripRepository.create(req.body)
    res.status(201).json(newTrip)
  } catch (error) {
    console.error('Error creating trip:', error)
    res.status(500).json({ error: 'Failed to create trip' })
  }
}

export const updateTrip = async (req: Request, res: Response) => {
  try {
    const updatedTrip = await tripRepository.update(req.params.id, req.body)
    res.json(updatedTrip)
  } catch (error) {
    console.error('Error updating trip:', error)
    res.status(500).json({ error: 'Failed to update trip' })
  }
}

export const deleteTrip = async (req: Request, res: Response) => {
  try {
    await tripRepository.delete(req.params.id)
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting trip:', error)
    res.status(500).json({ error: 'Failed to delete trip' })
  }
}
