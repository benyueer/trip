import { useEffect, useRef, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { useTripStore, type Place, type Route, type CachedPlace } from "../store";
import { getDayColor } from "../utils/dayColors";

declare global {
  interface Window {
    _AMapSecurityConfig: { securityJsCode: string };
  }
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
  const [isMapReady, setIsMapReady] = useState(false);
  const [zoom, setZoom] = useState(11);

  const currentTrip = useTripStore((state) => state.currentTrip);
  const days = currentTrip?.days || [];
  const highlightedId = useTripStore((state) => state.highlightedId);
  const { setHighlightedId, setEditingItem, showAllPlaces, allPlacesCache } =
    useTripStore();
  const agentSuggestedPlaces = useTripStore((state) => state.agentSuggestedPlaces);
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
          allPlaces.length > 0 ? allPlaces[0].lngLat : [120.155, 30.27];

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
          } = useTripStore.getState();
          
          if (currentEditMode && !isRouting) {
            const lngLat: [number, number] = [e.lnglat.getLng(), e.lnglat.getLat()];
            
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

        // 监听缩放变化
        map.current.on("zoomend", () => {
          setZoom(map.current.getZoom());
        });
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
      currentMap.setZoomAndCenter(11, places[0].lngLat);
      hasSetInitialCenter.current = true;
    }

    // 添加文字图标 Markers（按天使用主题色）
    places.forEach((place) => {
      const isHighlighted = highlightedId === place.id;
      const { routingStartItem, routingEndItem, isRouting } =
        useTripStore.getState();

      // 找到该地点所在的天，取对应主题色
      const placeDayIndex =
        days.find((d) => d.items.some((i) => i.id === place.id))?.dayIndex ?? 1;
      const color = getDayColor(placeDayIndex);

      // 缩放级别较小时（zoom < 10），非高亮的图标显示为小点
      const isSmallMode = zoom < 10;
      let markerContent = "";

      if (isSmallMode && !isHighlighted && !isRouting) {
        markerContent = `
          <div style="
            width:10px; height:10px; 
            background:${color.text}; 
            border:2px solid #fff; 
            border-radius:50%; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            transition: all 0.3s;
          "></div>
        `;
      } else {
        // 根据高亮/路线规划状态，动态生成 marker 样式
        let bgColor = color.bg;
        let textColor = color.text;
        let border = `1px solid ${color.border}`;
        let extraStyle = "";

        if (isHighlighted) {
          bgColor = color.text;
          textColor = "#fff";
          border = "none";
          extraStyle =
            "box-shadow: 0 4px 12px rgba(0,0,0,0.2); transform: scale(1.12); z-index: 100;";
        }

        if (isRouting) {
          if (routingStartItem?.id === place.id) {
            bgColor = "#10b981";
            textColor = "#fff";
            border = "none";
          } else if (routingEndItem?.id === place.id) {
            bgColor = "#f43f5e";
            textColor = "#fff";
            border = "none";
          } else {
            bgColor = "#f1f5f9";
            textColor = "#94a3b8";
            border = "1px dashed #cbd5e1";
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
            ${extraStyle}
          ">
            <span style="font-size:10px;">📍</span>${place.name}
          </div>
        `;
      }

      const marker = new AMap.Marker({
        position: place.lngLat,
        content: markerContent,
        offset: new AMap.Pixel(0, 0),
        anchor: "bottom-center",
        extData: {
          id: place.id,
          dayIndex: placeDayIndex,
        },
      });

      marker.on("click", () => {
        const { isEditMode: currentEditMode, isRouting } =
          useTripStore.getState();

        // 规划路线时地图上的点不再响应点击进行选点
        if (isRouting) return;

        if (currentEditMode) {
          // 编辑模式：弹出编辑框
          setEditingItem({
            type: "edit",
            dayIndex: marker.getExtData().dayIndex || 1,
            item: place,
          });
        } else {
          // 查看模式：高亮与缩放
          setHighlightedId(place.id);
        }
      });

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
          position: cached.lngLat,
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
      const isHighlighted = highlightedId === route.id;
      const routeDayIndex =
        days.find((d) => d.items.some((i) => i.id === route.id))?.dayIndex ?? 1;
      const routeColor = getDayColor(routeDayIndex);

      const strokeColor = routeColor.text;
      const strokeOpacity = isHighlighted ? 1.0 : 0.55;

      const polyline = new AMap.Polyline({
        path: route.path,
        strokeColor,
        strokeOpacity,
        strokeWeight: isHighlighted ? 6 : 4,
        strokeStyle: "solid",
        lineJoin: "round",
        lineCap: "round",
        cursor: "pointer",
        extData: { id: route.id },
      });

      polyline.on("click", () => {
        const { isEditMode: currentEditMode } = useTripStore.getState();
        if (!currentEditMode) {
          setHighlightedId(route.id);
        }
      });

      polyline.setMap(currentMap);
      polylinesRef.current[route.id] = polyline;

      // 在路线中段添加带交通图标和距离的标签（缩放级别较小时隐藏）
      if (route.path && route.path.length > 0 && zoom >= 8) {
        const midIndex = Math.floor(route.path.length / 2);
        const midPoint = route.path[midIndex];

        let iconStr = "🚗";
        if (route.name.includes("步行")) iconStr = "🚶";
        else if (route.name.includes("骑行")) iconStr = "🚲";

        const routeMarker = new AMap.Marker({
          position: midPoint,
          content: `
            <div class="whitespace-nowrap px-2 py-1 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${isHighlighted ? "ring-2 ring-indigo-500 text-indigo-700 shadow-md scale-105" : "text-gray-600 hover:scale-105"}">
              <span class="text-[10px]">${iconStr}</span>
              <span>${route.distance}${route.duration ? " · " + route.duration : ""}</span>
            </div>
          `,
          offset: new AMap.Pixel(0, -10),
          anchor: "center",
          extData: { id: route.id },
          zIndex: 100,
        });

        routeMarker.on("click", () => {
          const { isEditMode: currentEditMode } = useTripStore.getState();
          if (!currentEditMode) {
            setHighlightedId(route.id);
          }
        });

        routeMarker.setMap(currentMap);
        markersRef.current[`${route.id}-label`] = routeMarker;
      }
    });

  }, [days, highlightedId, setHighlightedId, setEditingItem, isMapReady, zoom, showAllPlaces, allPlacesCache]);

  // 单独监听 highlightedId 的变化，仅在 ID 改变时执行一次聚焦
  const lastCenteredId = useRef<string | null>(null);
  useEffect(() => {
    if (!isMapReady || !map.current || !highlightedId) return;
    if (lastCenteredId.current === highlightedId) return;

    const currentMap = map.current;
    const places: Place[] = [];
    const routes: Route[] = [];
    days.forEach((day) => {
      day.items.forEach((item) => {
        if (item.type === "place") places.push(item);
        if (item.type === "route") routes.push(item);
      });
    });

    const highlightedPlace = places.find((p) => p.id === highlightedId);
    if (highlightedPlace) {
      currentMap.setZoomAndCenter(14, highlightedPlace.lngLat);
      lastCenteredId.current = highlightedId;
    } else if (showAllPlaces && allPlacesCache) {
      // 检查是否在所有地点缓存中
      const cachedPlace = allPlacesCache.find((p) => p.id === highlightedId);
      if (cachedPlace) {
        currentMap.setZoomAndCenter(14, cachedPlace.lngLat);
        lastCenteredId.current = highlightedId;
      }
    } else {
      const highlightedRoute = routes.find((r) => r.id === highlightedId);
      if (highlightedRoute && polylinesRef.current[highlightedRoute.id]) {
        currentMap.setFitView([polylinesRef.current[highlightedRoute.id]]);
        lastCenteredId.current = highlightedId;
      }
    }
  }, [highlightedId, isMapReady, days, showAllPlaces, allPlacesCache]);

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
        position: place.lngLat,
        content: markerContent,
        offset: new AMap.Pixel(0, 0),
        anchor: "bottom-center",
        zIndex: 200,
        extData: { id: markerId, placeIndex: index },
      });

      marker.on("click", () => {
        currentMap.setZoomAndCenter(14, place.lngLat);
        window.dispatchEvent(
          new CustomEvent("agent:focusCard", { detail: { index } })
        );
      });

      marker.setMap(currentMap);
      markersRef.current[markerId] = marker;
    });
  }, [agentSuggestedPlaces, isMapReady, zoom]);

  // 监听 agent focusPlace 事件，聚焦地图到指定位置
  useEffect(() => {
    const handleFocusPlace = (e: CustomEvent) => {
      const { lngLat } = e.detail;
      if (map.current && lngLat) {
        map.current.setCenter(lngLat);
        map.current.setZoom(14);
      }
    };

    window.addEventListener(
      "agent:focusPlace",
      handleFocusPlace as EventListener
    );
    return () =>
      window.removeEventListener(
        "agent:focusPlace",
        handleFocusPlace as EventListener
      );
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
  );
}
