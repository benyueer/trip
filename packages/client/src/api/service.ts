import { createQuery } from '../utils'
import service from './index'

export const getPlacesReq = (params: any) => service.get(`/api/place${createQuery(params)}`)

export const addPlaceReq = (params: any) => service.post('/api/place', params)

export const deletePlaceReq = (id: string) => service.delete(`/api/place/${id}`)

export const getPlansReq = (params: any) => service.get(`/api/plan${createQuery(params)}`)

export const getPlanReq = (id: string) => service.get(`/api/plan/${id}`)

export const deletePlanReq = (id: string) => service.delete(`/api/plan/${id}`)

export const addDayReq = (params: any) => service.post('/api/plan/day', params)

export const updateDayReq = (params: any) => service.put('/api/plan/day', params)

export const deleteDayReq = (planId: string, dayId: string) => service.delete(`/api/plan/day/${planId}/${dayId}`)

export const addMilestoneReq = (params: any) => service.post('/api/plan/milestone', params)

export const updateMilestoneReq = (params: any) => service.put('/api/plan/milestone', params)

export const deleteMilestoneReq = (dayId: string, milestoneId: string) => service.delete(`/api/plan/milestone/${dayId}/${milestoneId}`)

export const addPlanReq = (params: any) => service.post('/api/plan', params)

export const updatePlanReq = (params: any) => service.put('/api/plan', params)