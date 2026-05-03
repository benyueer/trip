import { useEffect, useState } from 'react'
import { getDayColor } from '../utils/dayColors'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import { useTripStore, type TripItem, type Place, type CachedPlace } from '../store'
import { Plus, Trash2, MapPin, Navigation, GripVertical, Star } from 'lucide-react'

// ---- 单个可拖拽卡片 ----
function SortableItemCard({
  item,
  isHighlight,
  isEditMode,
  activeDayIndex,
  dayColor,
  onHighlight,
  onDelete,
}: {
  item: TripItem
  isHighlight: boolean
  isEditMode: boolean
  activeDayIndex: number
  dayColor: { bg: string; text: string; border: string }
  onHighlight: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isEditMode,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onHighlight}
      className={`
        group relative rounded-2xl cursor-pointer transition-all duration-300 border flex items-stretch
        ${isHighlight
          ? 'bg-blue-50/80 border-blue-200 shadow-lg ring-1 ring-blue-500/20'
          : 'bg-white border-gray-100 hover:border-blue-100 hover:shadow-md hover:bg-gray-50/50'}
      `}
    >
      {/* 拖拽手柄（编辑模式才显示） */}
      {isEditMode && (
        <div
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          className='flex items-center px-2 text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 touch-none'
        >
          <GripVertical size={16} />
        </div>
      )}

      <div className='p-4 flex-1 min-w-0'>
        {item.type === 'place' ? (
          <div className='flex items-start gap-3'>
            <div
              className='flex items-center justify-center w-10 h-10 rounded-2xl text-base font-bold transition-all shadow-sm shrink-0'
              style={{ background: isHighlight ? dayColor.text : dayColor.bg, color: isHighlight ? '#fff' : dayColor.text }}
            >
              <MapPin size={18} />
            </div>
            <div className='flex flex-col min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <span className={`font-bold text-sm truncate ${isHighlight ? 'text-blue-900' : 'text-gray-800'}`}>{item.name}</span>
                {item.type === 'place' && (item as any).rating && (
                  <span className='flex items-center gap-0.5 text-[10px] font-bold text-amber-500 shrink-0'>
                    <Star size={10} fill="currentColor" /> {(item as any).rating}
                  </span>
                )}
              </div>
              
              <div className='flex flex-wrap gap-1 mt-1'>
                {item.type === 'place' && (item as any).category && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${isHighlight ? 'bg-blue-200/50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {(item as any).category}
                  </span>
                )}
                {(item as any).ticket && (
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isHighlight ? 'bg-blue-200/50 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    ¥{(item as any).ticket}
                  </span>
                )}
              </div>

              {item.description && (
                <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${isHighlight ? 'text-blue-700/70' : 'text-gray-500'}`}>{item.description}</p>
              )}

              {item.type === 'place' && (item as any).address && (
                <div className={`flex items-center gap-1 text-[10px] mt-1.5 ${isHighlight ? 'text-blue-600/60' : 'text-gray-400'}`}>
                  <MapPin size={10} className="shrink-0" />
                  <span className="truncate">{(item as any).address}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className='flex items-center gap-3'>
            <div
              className='flex items-center justify-center w-10 h-10 rounded-2xl text-base font-bold transition-all shadow-sm shrink-0'
              style={{ background: isHighlight ? dayColor.text : dayColor.bg, color: isHighlight ? '#fff' : dayColor.text }}
            >
              <Navigation size={18} />
            </div>
            <div className='flex flex-col min-w-0'>
              <span className={`font-bold text-sm ${isHighlight ? 'text-indigo-900' : 'text-gray-800'} truncate`}>{item.name}</span>
              <span className='text-[10px] text-gray-400 mt-0.5 font-medium uppercase tracking-wider'>
                路线：{(item as any).distance}{(item as any).duration ? ` · ${(item as any).duration}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 删除按钮（编辑模式 hover 显示） */}
      {isEditMode && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className='absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all'
          title='删除'
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}

// ---- 拖拽覆层中的幽灵卡片 ----
function GhostCard({ item }: { item: TripItem }) {
  return (
    <div className='rounded-2xl border bg-white shadow-2xl border-blue-200 ring-2 ring-blue-400/30 flex items-stretch opacity-95 w-80'>
      <div className='flex items-center px-2 text-blue-400 shrink-0'>
        <GripVertical size={16} />
      </div>
      <div className='p-4 flex-1'>
        {item.type === 'place' ? (
          <div className='flex items-center gap-3'>
            <div className='flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 text-white shadow-sm shrink-0'>
              <MapPin size={16} />
            </div>
            <span className='font-bold text-sm text-gray-800 truncate'>{item.name}</span>
          </div>
        ) : (
          <div className='flex items-center gap-3'>
            <div className='flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 text-white shadow-sm shrink-0'>
              <Navigation size={16} />
            </div>
            <span className='font-bold text-sm text-gray-800 truncate'>{item.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- 可接收拖拽的 Day Tab ----
function DroppableDayTab({
  dayIndex,
  isActive,
  canDelete,
  onActivate,
  onDelete,
  isDragging,
}: {
  dayIndex: number
  isActive: boolean
  canDelete: boolean
  onActivate: () => void
  onDelete: () => void
  isDragging: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-tab-${dayIndex}` })
  const color = getDayColor(dayIndex)

  return (
    <div
      ref={setNodeRef}
      onClick={onActivate}
      className='shrink-0 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all flex items-center gap-2'
      style={isDragging && !isActive
        ? isOver
          ? { background: color.text, color: '#fff', transform: 'scale(1.05)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', outline: `2px solid ${color.border}` }
          : { background: color.bg, color: color.text, outline: `1.5px dashed ${color.border}` }
        : isActive
          ? { background: '#fff', color: color.text, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: `1px solid ${color.border}`, outline: `1px solid ${color.text}22` }
          : {}}
    >
      Day {dayIndex}
      {isActive && canDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className='p-0.5 hover:bg-red-50 hover:text-red-500 rounded-md transition-colors'
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ---- 主面板 ----
export default function FloatingPanel() {
  const currentTrip = useTripStore(state => state.currentTrip)
  const days = currentTrip?.days || []
  const highlightedId = useTripStore(state => state.highlightedId)
  const {
    isEditMode,
    setIsEditMode,
    addDay,
    deleteDay,
    setHighlightedId,
    activeDayIndex,
    setActiveDayIndex,
    isRouting,
    routingStartItem,
    routingEndItem,
    startRouting,
    cancelRouting,
    calculateAndAddRoute,
    deleteItem,
    reorderItems,
    moveItem,
    showAllPlaces,
    allPlacesCache,
    allPlacesLoading,
    fetchAllPlaces,
    setShowAllPlaces,
  } = useTripStore()

  const [activeItem, setActiveItem] = useState<TripItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // 当天数变化时调整激活索引
  useEffect(() => {
    if (days.length > 0) {
      const exists = days.some(d => d.dayIndex === activeDayIndex)
      if (!exists) setActiveDayIndex(days[0].dayIndex)
    }
  }, [days, activeDayIndex, setActiveDayIndex])

  const allPlaces = days.flatMap(d => d.items).filter(i => i.type === 'place') as Place[]
  const activeDay = days.find(d => d.dayIndex === activeDayIndex)
  const isDragging = activeItem !== null

  // Fetch all places when toggled on
  useEffect(() => {
    if (showAllPlaces) {
      fetchAllPlaces()
    }
  }, [showAllPlaces, fetchAllPlaces])

  // Current trip's place IDs for dedup/priority
  const currentTripPlaceIds = new Set(allPlaces.map(p => p.id))

  // Sorted: current trip's places first, then others
  const sortedAllPlaces: CachedPlace[] = allPlacesCache
    ? [...allPlacesCache].sort((a, b) => {
        const aIn = currentTripPlaceIds.has(a.id) ? 0 : 1
        const bIn = currentTripPlaceIds.has(b.id) ? 0 : 1
        if (aIn !== bIn) return aIn - bIn
        return 0
      })
    : []

  function handleDragStart(event: DragStartEvent) {
    const draggedId = event.active.id as string
    const item = activeDay?.items.find(i => i.id === draggedId)
    if (item) setActiveItem(item)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveItem(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // 拖到 Day Tab 上 → 跨天移动
    if (overId.startsWith('day-tab-')) {
      const targetDayIndex = parseInt(overId.replace('day-tab-', ''))
      if (targetDayIndex !== activeDayIndex) {
        moveItem(activeDayIndex, targetDayIndex, activeId)
      }
      return
    }

    // 拖到其他条目上 → 同天排序
    if (activeId !== overId && activeDay) {
      const oldIndex = activeDay.items.findIndex(i => i.id === activeId)
      const newIndex = activeDay.items.findIndex(i => i.id === overId)
      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = arrayMove(activeDay.items, oldIndex, newIndex)
        reorderItems(activeDayIndex, newItems)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className='absolute right-4 top-4 bottom-4 w-96 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/40 overflow-hidden flex flex-col z-10 transition-all duration-300'>
        {/* 头部 */}
        <div className='p-5 border-b border-gray-100/50 bg-white/80 backdrop-blur-xl z-20 flex justify-between items-start'>
          <div>
            <h1 className='text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent'>行程详情</h1>
            <div className='flex items-center gap-2 mt-1'>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isEditMode ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                {isEditMode ? '编辑模式' : '查看模式'}
              </span>
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`w-8 h-4 rounded-full relative transition-colors ${isEditMode ? 'bg-orange-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isEditMode ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </div>
            {isEditMode && (
              <div className='flex items-center gap-2 mt-2'>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showAllPlaces ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                  所有地点
                </span>
                <button
                  onClick={() => setShowAllPlaces(!showAllPlaces)}
                  className={`w-8 h-4 rounded-full relative transition-colors ${showAllPlaces ? 'bg-indigo-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showAllPlaces ? 'left-4.5' : 'left-0.5'}`} />
                </button>
                {allPlacesLoading && (
                  <span className='text-[9px] text-gray-400 animate-pulse'>加载中...</span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => addDay()}
            className='p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm border border-blue-100'
            title='添加天数'
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Day Tab 栏（也是拖拽放置区） */}
        <div className='px-4 py-3 bg-gray-50/50 border-b border-gray-100/50 overflow-x-auto no-scrollbar flex gap-2'>
          {days.map(day => (
            <DroppableDayTab
              key={day.dayIndex}
              dayIndex={day.dayIndex}
              isActive={activeDayIndex === day.dayIndex}
              canDelete={days.length > 1}
              isDragging={isDragging}
              onActivate={() => setActiveDayIndex(day.dayIndex)}
              onDelete={() => { if (confirm(`确定要删除第 ${day.dayIndex} 天吗？`)) deleteDay(day.dayIndex) }}
            />
          ))}
        </div>

        {/* 行程内容列表 */}
        <div className='p-4 flex-1 overflow-y-auto'>
          {/* 路线规划面板 */}
          {isRouting && (
            <div className='mb-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl'>
              <h3 className='font-bold text-indigo-800 mb-2'>规划路线</h3>
              <div className='flex flex-col gap-2 text-sm'>
                <div className='flex items-start flex-col gap-1'>
                  <div className='flex items-center gap-2'>
                    <div className='w-2 h-2 rounded-full bg-emerald-500'></div>
                    <span className='text-gray-800 font-medium'>起点</span>
                  </div>
                  <select
                    className="w-full mt-1 p-1.5 rounded-lg border border-indigo-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={routingStartItem?.id || ''}
                    onChange={e => {
                      const place = allPlaces.find(p => p.id === e.target.value)
                      if (place) useTripStore.getState().setRoutingStart(place)
                    }}
                  >
                    <option value="" disabled>请选择起点</option>
                    {allPlaces.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className='flex items-start flex-col gap-1 mt-2'>
                  <div className='flex items-center gap-2'>
                    <div className='w-2 h-2 rounded-full bg-rose-500'></div>
                    <span className='text-gray-800 font-medium'>终点</span>
                  </div>
                  <select
                    className="w-full mt-1 p-1.5 rounded-lg border border-indigo-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={routingEndItem?.id || ''}
                    onChange={e => {
                      const place = allPlaces.find(p => p.id === e.target.value)
                      if (place) useTripStore.getState().setRoutingEnd(place)
                    }}
                  >
                    <option value="" disabled>请选择终点</option>
                    {allPlaces.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {routingStartItem && routingEndItem && (
                  <div className='mt-2 pt-2 border-t border-indigo-200/50 flex gap-2'>
                    <button onClick={() => calculateAndAddRoute(activeDayIndex, routingStartItem, routingEndItem, 'Driving')} className='flex-1 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition'>驾车</button>
                    <button onClick={() => calculateAndAddRoute(activeDayIndex, routingStartItem, routingEndItem, 'Walking')} className='flex-1 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition'>步行</button>
                    <button onClick={() => calculateAndAddRoute(activeDayIndex, routingStartItem, routingEndItem, 'Riding')} className='flex-1 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition'>骑行</button>
                  </div>
                )}
              </div>
              <button onClick={() => cancelRouting()} className='mt-3 w-full py-1.5 text-indigo-600 bg-indigo-100 rounded hover:bg-indigo-200 transition text-sm'>取消</button>
            </div>
          )}

          {/* 添加路线按钮 */}
          {!isRouting && isEditMode && activeDay && (
            <button
              onClick={() => startRouting()}
              className='w-full mb-4 py-2 border-2 border-dashed border-indigo-200 text-indigo-500 rounded-xl hover:bg-indigo-50 transition font-medium flex justify-center items-center gap-2'
            >
              <Navigation size={16} />
              添加路线
            </button>
          )}

          {!activeDay ? (
            <div className='h-full flex flex-col items-center justify-center text-gray-400 gap-3'>
              <div className='w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100'>
                <Plus size={32} className='opacity-20' />
              </div>
              <p className='text-sm'>点击上方"+"开始规划</p>
            </div>
          ) : (
            <div className='flex flex-col gap-3'>
              {activeDay.items.length === 0 && !isRouting && (
                <div className='py-12 text-center'>
                  <p className='text-gray-400 text-sm'>
                    {isEditMode ? '在地图上点击添加地点，或拖拽其他天的项目到此' : '这一天还没有安排'}
                  </p>
                </div>
              )}
              <SortableContext
                items={activeDay.items.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {activeDay.items.map(item => (
                  <SortableItemCard
                    key={item.id}
                    item={item}
                    isHighlight={highlightedId === item.id}
                    isEditMode={isEditMode}
                    activeDayIndex={activeDayIndex}
                    dayColor={getDayColor(activeDayIndex)}
                    onHighlight={() => setHighlightedId(item.id)}
                    onDelete={() => {
                      if (confirm(`确定要删除 ${item.name} 吗？`)) deleteItem(activeDayIndex, item.id)
                    }}
                  />
                ))}
              </SortableContext>

              {/* 所有地点视图 */}
              {showAllPlaces && sortedAllPlaces.length > 0 && (
                <div className='mt-5 pt-4 border-t border-gray-200'>
                  <h3 className='text-xs font-bold text-gray-500 uppercase tracking-wider mb-3'>所有地点（{sortedAllPlaces.length}）</h3>
                  <div className='flex flex-col gap-2'>
                    {sortedAllPlaces.map(place => {
                      const inCurrentTrip = currentTripPlaceIds.has(place.id)
                      return (
                        <div
                          key={place.id}
                          onClick={() => setHighlightedId(place.id)}
                          className={`
                            group relative rounded-2xl cursor-pointer transition-all duration-300 border flex items-stretch
                            ${highlightedId === place.id
                              ? 'bg-blue-50/80 border-blue-200 shadow-lg ring-1 ring-blue-500/20'
                              : inCurrentTrip
                                ? 'bg-white border-gray-100 hover:border-blue-100 hover:shadow-md'
                                : 'bg-gray-100/60 border-gray-200/60 hover:border-gray-300'}
                          `}
                        >
                          <div className='p-3 flex-1 min-w-0'>
                            <div className='flex items-start gap-2.5'>
                              <div className={`flex items-center justify-center w-8 h-8 rounded-xl text-sm font-bold transition-all shadow-sm shrink-0 ${
                                inCurrentTrip ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
                              }`}>
                                <MapPin size={14} />
                              </div>
                              <div className='flex flex-col min-w-0 flex-1'>
                                <div className='flex items-center justify-between gap-2'>
                                  <span className={`text-xs font-bold truncate ${highlightedId === place.id ? 'text-blue-900' : inCurrentTrip ? 'text-gray-800' : 'text-gray-500'}`}>
                                    {place.name}
                                  </span>
                                  {!inCurrentTrip && (
                                    <span className='text-[8px] text-gray-400 truncate max-w-[100px] shrink-0' title={place.tripTitle}>
                                      {place.tripTitle}
                                    </span>
                                  )}
                                </div>
                                <div className='flex items-center gap-1.5 mt-0.5'>
                                  {place.category && (
                                    <span className='text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-gray-200/60 text-gray-500'>
                                      {place.category}
                                    </span>
                                  )}
                                  {place.address && (
                                    <span className='text-[8px] text-gray-400 truncate'>{place.address}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 拖拽时跟随鼠标的幽灵卡片 */}
      <DragOverlay dropAnimation={null}>
        {activeItem ? <GhostCard item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
