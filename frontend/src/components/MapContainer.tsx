import { useEffect, useRef, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { useTripStore, type Place, type Route, type CachedPlace } from "../store";
import { getDayColor } from "../utils/dayColors";

declare global {
  interface Window {
    _AMapSecurityConfig: { securityJsCode: string };
  }
}

function toLngLat(val: any): [number, number] {
  let result: [number, number] | null = null
  if (Array.isArray(val) && val.length >= 2) {
    result = [Number(val[0]), Number(val[1])]
  } else if (typeof val === 'string') {
    const parts = val.split(',')
    if (parts.length === 2) {
      result = [parseFloat(parts[0]), parseFloat(parts[1])]
    }
  }
  if (result && Number.isFinite(result[0]) && Number.isFinite(result[1])) {
    return result
  }
  return [120.155, 30.27]
}

// 配置高德地图安全密钥
window._AMapSecurityConfig = {
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE,
};

export default function MapContainer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markersRef = useRef<{ [id: string]: any }>({});
  const polylinesRef = useRef<{ [id: string]: any }>({});
  const AMapInstance = useRef<any>(null);
  const hasSetInitialCenter = useRef(false);
  const adjustCollisionRef = useRef<() => void>(() => {})
  const [isMapReady, setIsMapReady] = useState(false)
  const [showDetailedMarkers, setShowDetailedMarkers] = useState(true)
  const [mapLayer, setMapLayer] = useState<'standard' | 'amap' | 'tianditu'>('standard')

  const currentTrip = useTripStore((state) => state.currentTrip)
  const days = currentTrip?.days || []
  const highlightedId = useTripStore((state) => state.highlightedId)
  const activeDayIndex = useTripStore((state) => state.activeDayIndex)
  const { setHighlightedId, setEditingItem, showAllPlaces, allPlacesCache } =
    useTripStore()
  const agentSuggestedPlaces = useTripStore((state) => state.agentSuggestedPlaces)
  const agentPlanRoutes = useTripStore((state) => state.agentPlanRoutes);
  const agentSuggestedHoverId = useRef<string | null>(null);

  // 初始化地图
  useEffect(() => {
    if (!mapContainer.current) return;

    AMapLoader.load({
      key: import.meta.env.VITE_AMAP_KEY,
      version: "2.0",
      plugins: [
        "AMap.Marker",
        "AMap.Polyline",
        "AMap.Driving",
        "AMap.Walking",
        "AMap.Riding",
        "AMap.Geocoder",
        "AMap.PlaceSearch",
      ],
    })
      .then((AMap) => {
        AMapInstance.current = AMap;

        // 获取最新的行程数据以确定初始中心点
        const storeState = useTripStore.getState();
        const tripDays = storeState.currentTrip?.days || [];
        const allPlaces = tripDays
          .flatMap((d: any) => d.items)
          .filter((i: any) => i.type === "place");
        const initialCenter =
          allPlaces.length > 0 ? toLngLat(allPlaces[0].lngLat) : [120.155, 30.27];

        map.current = new AMap.Map(mapContainer.current, {
          viewMode: "2D",
          zoom: 11,
          center: initialCenter,
          mapStyle: "amap://styles/macaron",
        });

        if (allPlaces.length > 0) {
          hasSetInitialCenter.current = true;
        }

        // 通知组件地图已经准备好，可以渲染 Marker 了
        setIsMapReady(true);

        // 绑定地图点击事件（用于新增地点）
        map.current.on("click", async (e: any) => {
          const {
            isEditMode: currentEditMode,
            isRouting,
            activeDayIndex: currentDay,
            isGuest,
          } = useTripStore.getState();
          
          if (isGuest) return
          if (currentEditMode && !isRouting && currentDay !== null) {
            const lngLat: [number, number] = [e.lnglat.getLng(), e.lnglat.getLat()]
            
            // 默认初始数据
            let name = "";
            let address = "";
            let phone = "";
            let category = "";
            let rating = "";

            try {
              // 1. 使用 Geocoder 获取地址
              const geocoder = new AMap.Geocoder();
              const geoResult = await new Promise<any>((resolve) => {
                geocoder.getAddress(lngLat, (status: string, result: any) => {
                  if (status === 'complete' && result.regeocode) resolve(result.regeocode);
                  else resolve(null);
                });
              });

              if (geoResult) {
                address = geoResult.formattedAddress || "";
              }

              // 2. 使用 PlaceSearch 获取附近的 POI 信息（尝试精准匹配）
              const placeSearch = new AMap.PlaceSearch({ pageSize: 1 });
              const searchResult = await new Promise<any>((resolve) => {
                placeSearch.searchNearBy("", lngLat, 50, (status: string, result: any) => {
                  if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
                    resolve(result.poiList.pois[0]);
                  } else {
                    resolve(null);
                  }
                });
              });

              if (searchResult) {
                name = searchResult.name || "";
                address = searchResult.address || address; // 如果 POI 有更精准的地址则使用
                phone = searchResult.tel || "";
                category = searchResult.type || "";
                rating = searchResult.biz_ext?.rating || "";
              }
            } catch (err) {
              console.error("AMap Auto-fill failed:", err);
            }

            setEditingItem({
              type: "add",
              dayIndex: currentDay,
              lngLat,
              item: {
                name,
                address,
                phone,
                category,
                rating,
              }
            });
          }
        });

        // 监听缩放和拖拽移动，重新计算避让
        map.current.on('zoomend', () => {
          adjustCollisionRef.current()
        })
        map.current.on('moveend', () => {
          adjustCollisionRef.current()
        })
      })
      .catch((e) => {
        console.log(e);
      });

    return () => {
      if (map.current) {
        map.current.destroy();
      }
    };
  }, [setEditingItem]);

  // 卫星图图层切换
  useEffect(() => {
    if (!isMapReady || !map.current || !AMapInstance.current) return;
    const AMap = AMapInstance.current;
    const currentMap = map.current;

    if (mapLayer === 'amap') {
      const satellite = new AMap.TileLayer.Satellite();
      const roadNet = new AMap.TileLayer.RoadNet();
      currentMap.add([satellite, roadNet]);
      return () => { currentMap.remove([satellite, roadNet]); };
    }

    if (mapLayer === 'tianditu') {
      const tk = import.meta.env.VITE_TIANDITU_KEY;
      const makeUrl = (layer: string) => (x: number, y: number, z: number) => {
        const s = Math.abs(x + y) % 8;
        return `https://t${s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer === 'img_w' ? 'img' : 'cia'}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=${tk}`;
      };

      const satellite = new AMap.TileLayer({ getTileUrl: makeUrl('img_w') });
      const annotation = new AMap.TileLayer({ getTileUrl: makeUrl('cia_w') });
      currentMap.add([satellite, annotation]);

      const satEl = (satellite as any)._container as HTMLElement | undefined;
      const annEl = (annotation as any)._container as HTMLElement | undefined;

      const applyOffset = () => {
        const center = currentMap.getCenter();
        if (!center) return;
        const wgs = AMap.convertFrom(center, 'gps');
        if (!wgs || !wgs[0]) return;
        const dLng = center.getLng() - wgs[0].getLng();
        const dLat = center.getLat() - wgs[0].getLat();
        const res = 360 / (256 * Math.pow(2, currentMap.getZoom()));
        const px = dLng / res;
        const py = -dLat / res;
        const transform = `translate(${px}px, ${py}px)`;
        if (satEl) satEl.style.transform = transform;
        if (annEl) annEl.style.transform = transform;
      };

      applyOffset();
      const onAdjust = () => applyOffset();
      currentMap.on('zoomend', onAdjust);
      currentMap.on('moveend', onAdjust);

      return () => {
        currentMap.off('zoomend', onAdjust);
        currentMap.off('moveend', onAdjust);
        currentMap.remove([satellite, annotation]);
      };
    }
  }, [mapLayer, isMapReady]);

  // 监听数据与高亮状态变化，更新 Markers 与路线
  useEffect(() => {
    if (!isMapReady || !map.current || !AMapInstance.current) return;
    const AMap = AMapInstance.current;
    const currentMap = map.current;

    // 清除旧的 markers 和 polylines
    Object.values(markersRef.current).forEach((m) => m.setMap(null));
    markersRef.current = {};
    Object.values(polylinesRef.current).forEach((p) => p.setMap(null));
    polylinesRef.current = {};

    const places: Place[] = [];
    const routes: Route[] = [];
    days.forEach((day) => {
      day.items.forEach((item) => {
        if (item.type === "place") places.push(item);
        if (item.type === "route") routes.push(item);
      });
    });

    // 初始化中心点（仅一次）
    if (!hasSetInitialCenter.current && places.length > 0) {
      currentMap.setZoomAndCenter(11, toLngLat(places[0].lngLat));
      hasSetInitialCenter.current = true;
    }

    // 添加文字图标 Markers（按天使用主题色）
    places.forEach((place) => {
      const isHighlighted = highlightedId === place.id
      const { routingStartItem, routingEndItem, isRouting } =
        useTripStore.getState()

      // 找到该地点所在的天，取对应主题色
      const placeDayIndex =
        days.find((d) => d.items.some((i) => i.id === place.id))?.dayIndex ?? 1
      const color = getDayColor(placeDayIndex)

      const isCurrentDay = placeDayIndex === activeDayIndex
      const dayOpacity = isCurrentDay ? 1.0 : 0.4

      // 由开关控制，非高亮的图标显示为小点
      const isSmallMode = !showDetailedMarkers
      let markerContent = ''

      if (isSmallMode && !isHighlighted && !isRouting) {
        markerContent = `
          <div style="
            width:10px; height:10px; 
            background:${color.text}; 
            border:2px solid #fff; 
            border-radius:50%; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            transition: all 0.3s;
            opacity: ${dayOpacity};
          "></div>
        `
      } else {
        // 根据高亮/路线规划状态，动态生成 marker 样式
        let bgColor = color.bg
        let textColor = color.text
        let border = `1px solid ${color.border}`
        let extraStyle = ''

        if (isHighlighted) {
          bgColor = color.text
          textColor = '#fff'
          border = 'none'
          extraStyle =
            'box-shadow: 0 4px 12px rgba(0,0,0,0.2); transform: scale(1.12); z-index: 100;'
        }

        if (isRouting) {
          if (routingStartItem?.id === place.id) {
            bgColor = '#10b981'
            textColor = '#fff'
            border = 'none'
          } else if (routingEndItem?.id === place.id) {
            bgColor = '#f43f5e'
            textColor = '#fff'
            border = 'none'
          } else {
            bgColor = '#f1f5f9'
            textColor = '#94a3b8'
            border = '1px dashed #cbd5e1'
          }
        }

        markerContent = `
          <div style="
            display:inline-flex; align-items:center; gap:4px;
            padding:4px 10px 4px 6px;
            background:${bgColor};
            color:${textColor};
            border:${border};
            border-radius:20px;
            font-size:12px; font-weight:700;
            white-space:nowrap;
            cursor:pointer;
            transition:all 0.2s;
            opacity: ${dayOpacity};
            ${extraStyle}
          ">
            <span style="font-size:10px;">📍</span>${place.name}
          </div>
        `
      }

      const marker = new AMap.Marker({
        position: toLngLat(place.lngLat),
        content: markerContent,
        offset: new AMap.Pixel(0, 0),
        anchor: 'bottom-center',
        zIndex: isCurrentDay ? (isHighlighted ? 150 : 100) : 50,
        extData: {
          id: place.id,
          dayIndex: placeDayIndex,
        },
      })

      marker.on('click', () => {
        const { isEditMode: currentEditMode, isRouting } =
          useTripStore.getState()

        // 规划路线时地图上的点不再响应点击进行选点
        if (isRouting) return

        const targetDayIndex = marker.getExtData().dayIndex || 1
        useTripStore.getState().setActiveDayIndex(targetDayIndex)

        if (currentEditMode) {
          // 编辑模式：弹出编辑框
          setEditingItem({
            type: 'edit',
            dayIndex: targetDayIndex,
            item: place,
          })
        } else {
          // 查看模式：高亮与缩放
          setHighlightedId(place.id)
        }
      })

      marker.setMap(currentMap);
      markersRef.current[place.id] = marker;
    });

    // 所有地点标记（缓存中的其他行程地点）
    if (showAllPlaces && allPlacesCache) {
      // 当前行程的地点 ID 集合，避免重复标记
      const currentPlaceIds = new Set(places.map(p => p.id));
      allPlacesCache.forEach((cached: CachedPlace) => {
        if (currentPlaceIds.has(cached.id)) return; // 已在当前行程中显示，跳过

        const isHighlighted = highlightedId === cached.id;

        const markerContent = isHighlighted
          ? `<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px 4px 6px;background:#6366f1;color:#fff;border:none;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);transform:scale(1.12);z-index:100;">
              <span style="font-size:10px;">📍</span>${cached.name}
            </div>`
          : `<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px 4px 6px;background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;transition:all 0.2s;">
              <span style="font-size:10px;opacity:0.6;">📍</span>${cached.name}
            </div>`;

        const marker = new AMap.Marker({
          position: toLngLat(cached.lngLat),
          content: markerContent,
          offset: new AMap.Pixel(0, 0),
          anchor: "bottom-center",
          extData: { id: cached.id },
        });

        marker.on("click", () => {
          setHighlightedId(cached.id);
        });

        marker.setMap(currentMap);
        markersRef.current[cached.id] = marker;
      });
    }

    // 绘制路线（使用路线所在天的主题色）
    routes.forEach((route) => {
      const isHighlighted = highlightedId === route.id
      const routeDayIndex =
        days.find((d) => d.items.some((i) => i.id === route.id))?.dayIndex ?? 1
      const routeColor = getDayColor(routeDayIndex)

      const strokeColor = routeColor.text
      const isCurrentDay = routeDayIndex === activeDayIndex
      const dayOpacity = isCurrentDay ? 1.0 : 0.4
      let strokeOpacity = isHighlighted ? 1.0 : 0.55
      if (!isCurrentDay) {
        strokeOpacity = isHighlighted ? 0.4 : 0.15
      }
      const isFlight = route.category === '飞机' || route.name.includes('飞机') || route.name.toLowerCase().includes('flight')

      const polyline = new AMap.Polyline({
        path: route.path,
        strokeColor,
        strokeOpacity,
        strokeWeight: isHighlighted ? 6 : 4,
        strokeStyle: isFlight ? 'dashed' : 'solid',
        strokeDasharray: isFlight ? [10, 10] : undefined,
        lineJoin: 'round',
        lineCap: 'round',
        cursor: 'pointer',
        extData: { id: route.id },
        zIndex: isCurrentDay ? (isHighlighted ? 80 : 70) : 30,
      })

      polyline.on('click', () => {
        const { isEditMode: currentEditMode } = useTripStore.getState()
        useTripStore.getState().setActiveDayIndex(routeDayIndex)
        if (!currentEditMode) {
          setHighlightedId(route.id)
        }
      })

      polyline.setMap(currentMap)
      polylinesRef.current[route.id] = polyline

      // 在路线中段添加带交通图标和距离的标签（由开关控制显示）
      if (route.path && route.path.length > 0 && showDetailedMarkers) {
        const midIndex = Math.floor(route.path.length / 2)
        const midPoint = route.path[midIndex]

        let iconStr = '🚗'
        const cat = route.category || ''
        if (cat.includes('步行') || route.name.includes('步行')) {
          iconStr = '🚶'
        } else if (cat.includes('非机动车') || cat.includes('骑行') || route.name.includes('骑行')) {
          iconStr = '🚲'
        } else if (cat.includes('飞机') || route.name.includes('飞机')) {
          iconStr = '✈️'
        } else if (cat.includes('铁路') || cat.includes('火车') || route.name.includes('火车') || route.name.includes('铁路') || route.name.includes('高铁') || route.name.includes('动车')) {
          iconStr = '🚇'
        }

        const routeMarker = new AMap.Marker({
          position: midPoint,
          content: `
            <div class="whitespace-nowrap px-2 py-1 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${isHighlighted ? 'ring-2 ring-indigo-500 text-indigo-700 shadow-md scale-105' : 'text-gray-600 hover:scale-105'}"
                 style="opacity: ${dayOpacity};">
              <span class="text-[10px]">${iconStr}</span>
              <span>${route.distance}${route.duration ? ' · ' + route.duration : ''}</span>
            </div>
          `,
          offset: new AMap.Pixel(0, -10),
          anchor: 'center',
          extData: { id: route.id },
          zIndex: isCurrentDay ? (isHighlighted ? 150 : 100) : 50,
        })

        routeMarker.on('click', () => {
          const { isEditMode: currentEditMode } = useTripStore.getState()
          useTripStore.getState().setActiveDayIndex(routeDayIndex)
          if (!currentEditMode) {
            setHighlightedId(route.id)
          }
        })

        routeMarker.setMap(currentMap)
        markersRef.current[`${route.id}-label`] = routeMarker
      }
    })

    // 计算避让，防止 Marker 互相遮挡
    const adjustCollision = () => {
      if (!currentMap || !AMapInstance.current) return

      const elementsToProcess: Array<{
        id: string
        name: string
        lngLat: [number, number]
        isImportant: boolean
        type: 'place' | 'route-label'
      }> = []

      const { routingStartItem, routingEndItem, isRouting } = useTripStore.getState()

      // 1. 收集行程地点
      places.forEach((p) => {
        const isHighlighted = highlightedId === p.id
        const isRouteBoundary = isRouting && (routingStartItem?.id === p.id || routingEndItem?.id === p.id)
        elementsToProcess.push({
          id: p.id,
          name: p.name,
          lngLat: p.lngLat,
          isImportant: isHighlighted || isRouteBoundary,
          type: 'place',
        })
      })

      // 2. 收集背景缓存地点
      if (showAllPlaces && allPlacesCache) {
        const currentPlaceIds = new Set(places.map((p) => p.id))
        allPlacesCache.forEach((cached) => {
          if (currentPlaceIds.has(cached.id)) return
          const isHighlighted = highlightedId === cached.id
          elementsToProcess.push({
            id: cached.id,
            name: cached.name,
            lngLat: cached.lngLat,
            isImportant: isHighlighted,
            type: 'place',
          })
        })
      }

      // 3. 收集路线标签
      routes.forEach((r) => {
        const labelMarker = markersRef.current[`${r.id}-label`]
        if (!labelMarker) return

        const isHighlighted = highlightedId === r.id
        if (r.path && r.path.length > 0) {
          const midIndex = Math.floor(r.path.length / 2)
          elementsToProcess.push({
            id: `${r.id}-label`,
            name: r.name,
            lngLat: r.path[midIndex],
            isImportant: isHighlighted,
            type: 'route-label',
          })
        }
      })

      // 4. 按优先级排序（重要程度高的排在前面，优先展示，不被碰撞遮挡）
      elementsToProcess.sort((a, b) => {
        if (a.isImportant && !b.isImportant) return -1
        if (!a.isImportant && b.isImportant) return 1
        return 0
      })

      // 5. 逐一碰撞检测
      const displayedBoxes: Array<{
        left: number
        top: number
        right: number
        bottom: number
      }> = []

      elementsToProcess.forEach((elem) => {
        const marker = markersRef.current[elem.id]
        if (!marker) return

        const rawLngLat = toLngLat(elem.lngLat)
        const amapLngLat = new AMap.LngLat(rawLngLat[0], rawLngLat[1])
        const pixel = currentMap.lngLatToContainer(amapLngLat)
        if (!pixel || typeof pixel.x !== 'number' || typeof pixel.y !== 'number') return

        const x = pixel.x
        const y = pixel.y

        // 根据类型和状态估计包围盒大小
        let width = 10
        let height = 10
        const padding = 3 // 碰撞安全间距缓冲

        if (elem.type === 'place') {
          const isHighlighted = highlightedId === elem.id
          const isSmallMode = !showDetailedMarkers

          if (isSmallMode && !isHighlighted && !(isRouting && (routingStartItem?.id === elem.id || routingEndItem?.id === elem.id))) {
            // 精简非高亮圆点，10x10
            width = 10
            height = 10
          } else {
            // 详细标签，根据字符估算宽度，高度约 28px，anchor 为 bottom-center
            const nameLength = elem.name.length
            width = nameLength * 12 + 36
            height = 28
          }

          // 锚点为 bottom-center
          const box = {
            left: x - width / 2 - padding,
            top: y - height - padding,
            right: x + width / 2 + padding,
            bottom: y + padding,
          }

          let hasCollision = false
          if (!elem.isImportant) {
            for (const displayed of displayedBoxes) {
              if (!(box.left > displayed.right ||
                    box.right < displayed.left ||
                    box.top > displayed.bottom ||
                    box.bottom < displayed.top)) {
                hasCollision = true
                break
              }
            }
          }

          if (hasCollision) {
            marker.hide()
          } else {
            marker.show()
            displayedBoxes.push(box)
          }

        } else if (elem.type === 'route-label') {
          // 路线中段标签，宽约 90px，高约 24px，offset (0, -10)，anchor 为 center
          width = 90
          height = 24

          // 锚点为 center，且偏移 y 向下 -10px（即在屏幕上向上移 10px）
          const box = {
            left: x - width / 2 - padding,
            top: y - 10 - height / 2 - padding,
            right: x + width / 2 + padding,
            bottom: y - 10 + height / 2 + padding,
          }

          let hasCollision = false
          if (!elem.isImportant) {
            for (const displayed of displayedBoxes) {
              if (!(box.left > displayed.right ||
                    box.right < displayed.left ||
                    box.top > displayed.bottom ||
                    box.bottom < displayed.top)) {
                hasCollision = true
                break
              }
            }
          }

          if (hasCollision) {
            marker.hide()
          } else {
            marker.show()
            displayedBoxes.push(box)
          }
        }
      })
    }

    adjustCollisionRef.current = adjustCollision
    adjustCollision()
  }, [days, highlightedId, setHighlightedId, setEditingItem, isMapReady, showDetailedMarkers, showAllPlaces, allPlacesCache, activeDayIndex])

  // 移动端智能偏移聚焦计算，将 Marker 推送到屏幕上半部分可用区，防止被底部抽屉遮盖
  // 在真·双视图模式下，高亮卡片仅 108px，因此 Marker 直接在屏幕正中央聚焦展示是最美观和符合直觉的，无需进行偏移
  const getOffsetLngLat = (lngLat: [number, number]): [number, number] => {
    return lngLat
  }

  // 单独监听 highlightedId 的变化，仅在 ID 改变时执行一次聚焦
  const lastCenteredId = useRef<string | null>(null)
  useEffect(() => {
    if (!isMapReady || !map.current || !highlightedId) return
    if (lastCenteredId.current === highlightedId) return

    const currentMap = map.current
    const places: Place[] = []
    const routes: Route[] = []
    days.forEach((day) => {
      day.items.forEach((item) => {
        if (item.type === "place") places.push(item)
        if (item.type === "route") routes.push(item)
      })
    })

    const highlightedPlace = places.find((p) => p.id === highlightedId)
    if (highlightedPlace) {
      const center = getOffsetLngLat(toLngLat(highlightedPlace.lngLat))
      currentMap.setZoomAndCenter(14, center)
      lastCenteredId.current = highlightedId
    } else if (showAllPlaces && allPlacesCache) {
      // 检查是否在所有地点缓存中
      const cachedPlace = allPlacesCache.find((p) => p.id === highlightedId)
      if (cachedPlace) {
        const center = getOffsetLngLat(toLngLat(cachedPlace.lngLat))
        currentMap.setZoomAndCenter(14, center)
        lastCenteredId.current = highlightedId
      }
    } else {
      const highlightedRoute = routes.find((r) => r.id === highlightedId)
      if (highlightedRoute && polylinesRef.current[highlightedRoute.id]) {
        currentMap.setFitView([polylinesRef.current[highlightedRoute.id]])
        lastCenteredId.current = highlightedId
      }
    }
  }, [highlightedId, isMapReady, days, showAllPlaces, allPlacesCache])

  // Agent plan routes (indigo polylines for day plan preview)
  useEffect(() => {
    if (!isMapReady || !map.current || !AMapInstance.current) return;
    const AMap = AMapInstance.current;
    const currentMap = map.current;

    // Clean up previous plan route polylines
    Object.entries(polylinesRef.current).forEach(([key, p]) => {
      if (key.startsWith("plan-route-")) {
        p.setMap(null);
        delete polylinesRef.current[key];
      }
    });

    if (!agentPlanRoutes || agentPlanRoutes.length === 0) return;

    agentPlanRoutes.forEach((route, index) => {
      if (!route.path || route.path.length === 0) return;

      const polylineId = `plan-route-${index}`;
      const polyline = new AMap.Polyline({
        path: route.path,
        strokeColor: "#6366f1",
        strokeOpacity: 0.8,
        strokeWeight: 5,
        strokeStyle: "solid",
        lineJoin: "round",
        lineCap: "round",
        cursor: "pointer",
        extData: { id: polylineId },
      });

      polyline.setMap(currentMap);
      polylinesRef.current[polylineId] = polyline;

      // Add route label at midpoint
      if (route.path.length > 0) {
        const midIndex = Math.floor(route.path.length / 2);
        const midPoint = route.path[midIndex];

        const routeMarker = new AMap.Marker({
          position: midPoint,
          content: `
            <div style="white-space:nowrap;padding:2px 8px;background:rgba(99,102,241,0.9);color:#fff;border-radius:8px;font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(99,102,241,0.3);">
              <span>🚗</span>
              <span>${route.distance}${route.duration ? " · " + route.duration : ""}</span>
            </div>
          `,
          offset: new AMap.Pixel(0, -10),
          anchor: "center",
          zIndex: 300,
        });

        routeMarker.setMap(currentMap);
        polylinesRef.current[`${polylineId}-label`] = routeMarker;
      }
    });
  }, [agentPlanRoutes, isMapReady]);

  // Agent suggested place markers (orange)
  useEffect(() => {
    if (!isMapReady || !map.current || !AMapInstance.current) return;
    const AMap = AMapInstance.current;
    const currentMap = map.current;

    // Clean up previous agent markers
    Object.entries(markersRef.current).forEach(([key, m]) => {
      if (key.startsWith("agent-suggested-")) {
        m.setMap(null);
        delete markersRef.current[key];
      }
    });

    if (!agentSuggestedPlaces || agentSuggestedPlaces.length === 0) return;

    agentSuggestedPlaces.forEach((place: { name: string; lngLat: [number, number]; description?: string; category?: string; rating?: string; address?: string; ticket?: string }, index: number) => {
      const markerId = `agent-suggested-${index}`;
      const isHovered = agentSuggestedHoverId.current === markerId;

      const size = isHovered ? 36 : 28;
      const markerContent = `
        <div style="
          width:${size}px; height:${size}px;
          background: linear-gradient(135deg, #f97316, #ea580c);
          border: 3px solid #fff;
          border-radius: 50%;
          box-shadow: 0 3px 10px rgba(249,115,22,0.4);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s ease;
          cursor: pointer;
          ${isHovered ? "transform: scale(1.2) translateY(-4px); box-shadow: 0 6px 20px rgba(249,115,22,0.5);" : ""}
        ">
          <span style="color:#fff; font-size:${isHovered ? 16 : 13}px; font-weight:700;">${index + 1}</span>
        </div>
      `;

      const marker = new AMap.Marker({
        position: toLngLat(place.lngLat),
        content: markerContent,
        offset: new AMap.Pixel(0, 0),
        anchor: "bottom-center",
        zIndex: 200,
        extData: { id: markerId, placeIndex: index },
      });

      marker.on("click", () => {
        currentMap.setZoomAndCenter(14, toLngLat(place.lngLat));
        window.dispatchEvent(
          new CustomEvent("agent:focusCard", { detail: { index } })
        );
      });

      marker.setMap(currentMap);
      markersRef.current[markerId] = marker;
    });
  }, [agentSuggestedPlaces, isMapReady])

  // 监听 agent focusPlace 事件，聚焦地图到指定位置
  useEffect(() => {
    const handleFocusPlace = (e: CustomEvent) => {
      const { lngLat } = e.detail
      if (map.current && lngLat) {
        const center = getOffsetLngLat(lngLat)
        map.current.setZoomAndCenter(14, center)
      }
    }

    window.addEventListener(
      "agent:focusPlace",
      handleFocusPlace as EventListener
    )
    return () =>
      window.removeEventListener(
        "agent:focusPlace",
        handleFocusPlace as EventListener
      )
  }, [])

  // 监听 agent:fitPlanView 事件
  useEffect(() => {
    const handleFitPlanView = (e: CustomEvent) => {
      const { lngLats } = e.detail;
      if (map.current && AMapInstance.current && lngLats && lngLats.length > 0) {
        const AMap = AMapInstance.current;
        const bounds = new AMap.Bounds();
        for (const [lng, lat] of lngLats) {
          bounds.extend(new AMap.LngLat(lng, lat));
        }
        map.current.setBounds(bounds, false, [60, 60, 60, 60]);
      }
    };

    window.addEventListener("agent:fitPlanView", handleFitPlanView as EventListener);
    return () =>
      window.removeEventListener("agent:fitPlanView", handleFitPlanView as EventListener);
  }, []);

  // 监听 agent:cardHover 事件，高亮对应建议地点标记
  useEffect(() => {
    if (!isMapReady || !map.current) return;

    const handleCardHover = (e: CustomEvent) => {
      const { index, isHover } = e.detail;
      const markerId = `agent-suggested-${index}`;
      agentSuggestedHoverId.current = isHover ? markerId : null;

      const marker = markersRef.current[markerId];
      if (marker && agentSuggestedPlaces) {
        const place = agentSuggestedPlaces[index];
        if (!place) return;
        const size = isHover ? 36 : 28;
        marker.setContent(`
          <div style="
            width:${size}px; height:${size}px;
            background: linear-gradient(135deg, #f97316, #ea580c);
            border: 3px solid #fff;
            border-radius: 50%;
            box-shadow: 0 ${isHover ? 6 : 3}px ${isHover ? 20 : 10}px rgba(249,115,22,${isHover ? 0.5 : 0.4});
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s ease;
            cursor: pointer;
            ${isHover ? "transform: scale(1.2) translateY(-4px);" : ""}
          ">
            <span style="color:#fff; font-size:${isHover ? 16 : 13}px; font-weight:700;">${index + 1}</span>
          </div>
        `);
      }
    };

    window.addEventListener(
      "agent:cardHover",
      handleCardHover as EventListener
    );
    return () =>
      window.removeEventListener(
        "agent:cardHover",
        handleCardHover as EventListener
      );
  }, [isMapReady, agentSuggestedPlaces]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainer}
        className="w-full h-full"
        onClick={() => {
          const { isEditMode: currentEditMode } = useTripStore.getState();
          if (!currentEditMode) {
            setHighlightedId(null);
          }
        }}
      />
      <div className={`absolute ${highlightedId ? 'bottom-[120px]' : 'bottom-6'} md:bottom-4 left-4 z-10 flex gap-2 transition-all duration-300`}>
        <div className='flex gap-1 bg-white/90 backdrop-blur rounded-lg shadow-md border border-gray-200 p-0.5'>
          {([
            ['standard', '标准'],
            ['amap', '高德卫星'],
            ['tianditu', '天地图'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMapLayer(key)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                mapLayer === key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className='flex gap-1 bg-white/90 backdrop-blur rounded-lg shadow-md border border-gray-200 p-0.5 animate-in fade-in slide-in-from-bottom-2 duration-300'>
          <button
            onClick={() => setShowDetailedMarkers(!showDetailedMarkers)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
              showDetailedMarkers
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>📍</span>
            <span>{showDetailedMarkers ? '详细标记' : '精简标记'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
