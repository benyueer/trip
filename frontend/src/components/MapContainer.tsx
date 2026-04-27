import { useEffect, useRef } from 'react'
import AMapLoader from '@amap/amap-jsapi-loader'
import { useTripStore, type Place, type Route } from '../store'

// 配置高德地图安全密钥
window._AMapSecurityConfig = {
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE,
}

export default function MapContainer() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const markersRef = useRef<{ [id: string]: any }>({})
  const polylinesRef = useRef<{ [id: string]: any }>({})
  const AMapInstance = useRef<any>(null)
  
  const currentTrip = useTripStore(state => state.currentTrip)
  const days = currentTrip?.days || []
  const highlightedId = useTripStore(state => state.highlightedId)
  const { 
    setHighlightedId, 
    isEditMode, 
    setEditingItem, 
    activeDayIndex 
  } = useTripStore()
  
  // 初始化地图
  useEffect(() => {
    if (!mapContainer.current) return
    
    AMapLoader.load({
      key: import.meta.env.VITE_AMAP_KEY,
      version: '2.0',
      plugins: ['AMap.Marker', 'AMap.Polyline'],
    }).then((AMap) => {
      AMapInstance.current = AMap
      map.current = new AMap.Map(mapContainer.current, {
        viewMode: '2D',
        zoom: 11,
        center: [120.155, 30.27],
        mapStyle: 'amap://styles/macaron',
      })

      // 绑定地图点击事件（用于新增地点）
      map.current.on('click', (e: any) => {
        // 只有在编辑模式下才触发
        const { isEditMode: currentEditMode, activeDayIndex: currentDay } = useTripStore.getState()
        if (currentEditMode) {
          setEditingItem({
            type: 'add',
            dayIndex: currentDay,
            lngLat: [e.lnglat.getLng(), e.lnglat.getLat()]
          })
        }
      })
    }).catch(e => {
      console.log(e)
    })

    return () => {
      if (map.current) {
        map.current.destroy()
      }
    }
  }, [setEditingItem])

  // 监听数据与高亮状态变化，更新 Markers 与路线
  useEffect(() => {
    if (!map.current || !AMapInstance.current) return
    const AMap = AMapInstance.current
    const currentMap = map.current
    
    // 清除旧的 markers 和 polylines
    Object.values(markersRef.current).forEach(m => m.setMap(null))
    markersRef.current = {}
    Object.values(polylinesRef.current).forEach(p => p.setMap(null))
    polylinesRef.current = {}
    
    const places: Place[] = []
    const routes: Route[] = []
    days.forEach(day => {
      day.items.forEach(item => {
        if (item.type === 'place') places.push(item)
        if (item.type === 'route') routes.push(item)
      })
    })
    
    // 添加文字图标 Markers
    places.forEach(place => {
      const isHighlighted = highlightedId === place.id
      
      const marker = new AMap.Marker({
        position: place.lngLat,
        content: `<div class="custom-text-marker ${isHighlighted ? 'active' : ''}">${place.name}</div>`,
        offset: new AMap.Pixel(0, 0),
        anchor: 'bottom-center',
        extData: { id: place.id, dayIndex: days.find(d => d.items.some(i => i.id === place.id))?.dayIndex }
      })

      marker.on('click', () => {
        const { isEditMode: currentEditMode } = useTripStore.getState()
        if (currentEditMode) {
          // 编辑模式：弹出编辑框
          setEditingItem({
            type: 'edit',
            dayIndex: marker.getExtData().dayIndex || 1,
            item: place
          })
        } else {
          // 查看模式：高亮与缩放
          setHighlightedId(place.id)
          currentMap.setZoomAndCenter(13, place.lngLat)
        }
      })
        
      marker.setMap(currentMap)
      markersRef.current[place.id] = marker
    })
    
    // 绘制路线
    routes.forEach(route => {
      const isHighlighted = highlightedId === route.id
      
      const polyline = new AMap.Polyline({
        path: route.path,
        strokeColor: isHighlighted ? '#3b82f6' : '#9ca3af',
        strokeOpacity: isHighlighted ? 0.9 : 0.6,
        strokeWeight: isHighlighted ? 6 : 4,
        strokeStyle: 'solid',
        lineJoin: 'round',
        lineCap: 'round',
        cursor: 'pointer',
        extData: { id: route.id }
      })

      polyline.on('click', () => {
        const { isEditMode: currentEditMode } = useTripStore.getState()
        if (!currentEditMode) {
          setHighlightedId(route.id)
        }
      })

      polyline.setMap(currentMap)
      polylinesRef.current[route.id] = polyline
    })

  }, [days, highlightedId, setHighlightedId, setEditingItem])

  return (
    <div 
      ref={mapContainer} 
      className='w-full h-full' 
      onClick={() => {
        const { isEditMode: currentEditMode } = useTripStore.getState()
        if (!currentEditMode) {
          setHighlightedId(null)
        }
      }} 
    />
  )
}
