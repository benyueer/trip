import { useEffect, useRef, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { useTripStore, type Place, type Route } from "../store";
import { getDayColor } from "../utils/dayColors";

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

  const currentTrip = useTripStore((state) => state.currentTrip);
  const days = currentTrip?.days || [];
  const highlightedId = useTripStore((state) => state.highlightedId);
  const { setHighlightedId, isEditMode, setEditingItem, activeDayIndex } =
    useTripStore();

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
      ],
    })
      .then((AMap) => {
        AMapInstance.current = AMap;

        // 获取最新的行程数据以确定初始中心点
        const storeState = useTripStore.getState();
        const tripDays = storeState.currentTrip?.days || [];
        const allPlaces = tripDays.flatMap((d: any) => d.items).filter((i: any) => i.type === "place");
        const initialCenter = allPlaces.length > 0 ? allPlaces[0].lngLat : [120.155, 30.27];

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
        map.current.on("click", (e: any) => {
          // 只有在编辑模式下且非路线规划模式才触发
          const {
            isEditMode: currentEditMode,
            isRouting,
            activeDayIndex: currentDay,
          } = useTripStore.getState();
          if (currentEditMode && !isRouting) {
            setEditingItem({
              type: "add",
              dayIndex: currentDay,
              lngLat: [e.lnglat.getLng(), e.lnglat.getLat()],
            });
          }
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
      const placeDayIndex = days.find((d) => d.items.some((i) => i.id === place.id))?.dayIndex ?? 1;
      const color = getDayColor(placeDayIndex);

      // 根据高亮/路线规划状态，动态生成 marker 样式
      let bgColor = color.bg;
      let textColor = color.text;
      let border = `1px solid ${color.border}`;
      let extraStyle = '';

      if (isHighlighted) {
        bgColor = color.text;
        textColor = '#fff';
        border = 'none';
        extraStyle = 'box-shadow: 0 4px 12px rgba(0,0,0,0.2); transform: scale(1.12);';
      }

      if (isRouting) {
        if (routingStartItem?.id === place.id) {
          bgColor = '#10b981'; textColor = '#fff'; border = 'none';
        } else if (routingEndItem?.id === place.id) {
          bgColor = '#f43f5e'; textColor = '#fff'; border = 'none';
        } else {
          bgColor = '#f1f5f9'; textColor = '#94a3b8'; border = '1px dashed #cbd5e1';
        }
      }

      const markerContent = `
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

      marker.on('click', () => {
        const { 
          isEditMode: currentEditMode, 
          isRouting
        } = useTripStore.getState()

        // 规划路线时地图上的点不再响应点击进行选点
        if (isRouting) return;

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
        }
      });

      marker.setMap(currentMap);
      markersRef.current[place.id] = marker;
    });

    // 绘制路线（使用路线所在天的主题色）
    routes.forEach((route) => {
      const isHighlighted = highlightedId === route.id;
      const routeDayIndex = days.find((d) => d.items.some((i) => i.id === route.id))?.dayIndex ?? 1;
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

      // 在路线中段添加带交通图标和距离的标签
      if (route.path && route.path.length > 0) {
        const midIndex = Math.floor(route.path.length / 2);
        const midPoint = route.path[midIndex];

        let iconStr = '🚗';
        if (route.name.includes('步行')) iconStr = '🚶';
        else if (route.name.includes('骑行')) iconStr = '🚲';

        const routeMarker = new AMap.Marker({
          position: midPoint,
          content: `
            <div class="whitespace-nowrap px-2 py-1 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${isHighlighted ? 'ring-2 ring-indigo-500 text-indigo-700 shadow-md scale-105' : 'text-gray-600 hover:scale-105'}">
              <span class="text-[10px]">${iconStr}</span>
              <span>${route.distance}${route.duration ? ' · ' + route.duration : ''}</span>
            </div>
          `,
          offset: new AMap.Pixel(0, -10),
          anchor: "center",
          extData: { id: route.id },
          zIndex: 100
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

    // 自动移动视角到高亮的地点或路线
    if (highlightedId) {
      const highlightedPlace = places.find(p => p.id === highlightedId);
      if (highlightedPlace) {
        currentMap.setZoomAndCenter(14, highlightedPlace.lngLat);
      } else {
        const highlightedRoute = routes.find(r => r.id === highlightedId);
        if (highlightedRoute && polylinesRef.current[highlightedRoute.id]) {
          currentMap.setFitView([polylinesRef.current[highlightedRoute.id]]);
        }
      }
    }

  }, [days, highlightedId, setHighlightedId, setEditingItem, isMapReady]);

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
