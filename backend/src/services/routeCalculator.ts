import { logger } from './logger'

export interface RouteResult {
  distance: string
  duration: string
  path: [number, number][]
}

/**
 * Calculate a driving route between two points using AMap REST API.
 */
export async function calculateDrivingRoute(
  startLngLat: [number, number],
  endLngLat: [number, number],
): Promise<RouteResult | null> {
  const key = process.env.AMAP_WEB_KEY
  if (!key) {
    logger.error('route', 'AMAP_WEB_KEY not configured')
    return null
  }

  const origin = `${startLngLat[0]},${startLngLat[1]}`
  const destination = `${endLngLat[0]},${endLngLat[1]}`
  const apiUrl = `https://restapi.amap.com/v3/direction/driving?origin=${origin}&destination=${destination}&key=${key}`

  try {
    const response = await fetch(apiUrl)
    const result = await response.json()

    if (result.status !== '1') {
      logger.error('route', `AMap API Error: ${result.info}`)
      return null
    }

    const route = result.route.paths[0]
    const distanceText = route.distance
      ? (parseInt(route.distance) / 1000).toFixed(1) + ' km'
      : '未知'

    let durationText = ''
    if (route.duration) {
      const mins = Math.round(parseInt(route.duration) / 60)
      durationText = mins < 60 ? `${mins} 分钟` : `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`
    }

    const path: [number, number][] = []
    if (route.steps) {
      for (const step of route.steps) {
        if (step.polyline) {
          const points = step.polyline.split(';')
          for (const pt of points) {
            const [lng, lat] = pt.split(',').map(Number)
            path.push([lng, lat])
          }
        }
      }
    }

    return { distance: distanceText, duration: durationText, path }
  } catch (error) {
    logger.error('route', 'Route calculation failed', { error: String(error) })
    return null
  }
}

/**
 * Calculate routes between consecutive places in a list.
 */
export async function calculateRoutesBetweenPlaces(
  places: Array<{ name: string; lngLat: [number, number] }>,
): Promise<RouteResult[]> {
  const routes: RouteResult[] = []
  for (let i = 0; i < places.length - 1; i++) {
    const start = places[i]
    const end = places[i + 1]
    const route = await calculateDrivingRoute(start.lngLat, end.lngLat)
    if (route) {
      routes.push(route)
      logger.info('route', `Route: ${start.name} → ${end.name}: ${route.distance}, ${route.duration}`)
    } else {
      routes.push({ distance: '未知', duration: '未知', path: [] })
    }
  }
  return routes
}
