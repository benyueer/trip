import { useEffect, useState, useRef } from 'react'
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
import { Plus, Trash2, MapPin, Navigation, GripVertical, Star, Car, Bike, Footprints, Pencil, X, Plane, Train } from 'lucide-react'

// ---- 单个可拖拽卡片 ----
// 根据路线类型或名称匹配交通工具图标
const getRouteIcon = (category?: string, name?: string) => {
  const cat = category || ''
  if (cat.includes('驾车') || cat.includes('Car') || cat.includes('Driving')) {
    return <Car size={12} />
  }
  if (cat.includes('骑行') || cat.includes('非机动车') || cat.includes('Bike') || cat.includes('Riding') || cat.includes('cycling')) {
    return <Bike size={12} />
  }
  if (cat.includes('步行') || cat.includes('Walk') || cat.includes('Footprints') || cat.includes('walking')) {
    return <Footprints size={12} />
  }
  if (cat.includes('飞机') || cat.includes('Flight') || cat.includes('Plane')) {
    return <Plane size={12} />
  }
  if (cat.includes('铁路') || cat.includes('火车') || cat.includes('Train') || cat.includes('Railway')) {
    return <Train size={12} />
  }

  // 兜底策略：如果 category 为空，则从路线名称中查找
  if (name) {
    const lower = name.toLowerCase()
    if (lower.includes('驾车') || lower.includes('driving') || lower.includes('car')) {
      return <Car size={12} />
    }
    if (lower.includes('骑行') || lower.includes('riding') || lower.includes('bike') || lower.includes('cycling') || lower.includes('非机动车')) {
      return <Bike size={12} />
    }
    if (lower.includes('步行') || lower.includes('walking') || lower.includes('walk')) {
      return <Footprints size={12} />
    }
    if (lower.includes('飞机') || lower.includes('flight') || lower.includes('plane') || lower.includes('航空')) {
      return <Plane size={12} />
    }
    if (lower.includes('铁路') || lower.includes('火车') || lower.includes('train') || lower.includes('高铁') || lower.includes('动车')) {
      return <Train size={12} />
    }
  }

  return <Navigation size={12} className='transform rotate-45' />
}

// ---- 单个可拖拽卡片 ----
function SortableItemCard({
  item,
  isHighlight,
  isEditMode,
  activeDayIndex: _activeDayIndex,
  dayColor,
  onHighlight,
  onDelete,
  onEdit,
}: {
  item: TripItem
  isHighlight: boolean
  isEditMode: boolean
  activeDayIndex: number | null
  dayColor: { bg: string; text: string; border: string }
  onHighlight: () => void
  onDelete: () => void
  onEdit: () => void
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

  const isPlace = item.type === 'place'

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onHighlight}
      className={
        isPlace
          ? `group relative rounded-2xl cursor-pointer transition-all duration-300 border flex items-stretch
             ${isHighlight
               ? 'bg-blue-50/80 border-blue-200 shadow-lg ring-1 ring-blue-500/20'
               : 'bg-white border-gray-100 hover:border-blue-100 hover:shadow-md hover:bg-gray-50/50'}`
          : `group relative rounded-xl cursor-pointer transition-all duration-300 flex items-stretch -my-1
             ${isHighlight
               ? 'bg-blue-50/30 border border-dashed border-blue-200/60 shadow-sm'
               : 'bg-transparent border border-transparent hover:bg-gray-50/30'}`
      }
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

      <div className={isPlace ? 'p-4 flex-1 min-w-0' : 'px-4 py-1.5 flex-1 min-w-0'}>
        {isPlace ? (
          <div className='flex items-start gap-3'>
            <div
              className='flex items-center justify-center w-10 h-10 rounded-2xl text-base font-bold transition-all shadow-sm shrink-0'
              style={{ background: isHighlight ? dayColor.text : dayColor.bg, color: isHighlight ? '#fff' : dayColor.text }}
            >
              <MapPin size={18} />
            </div>
            <div className={`flex flex-col min-w-0 flex-1 ${isEditMode ? 'pr-20' : ''}`}>
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
          <div className='flex items-stretch gap-3 min-h-[40px] relative'>
            {/* 左侧垂直线与小节点 */}
            <div className='flex flex-col items-center w-10 shrink-0 relative justify-center'>
              {/* 垂直连线 */}
              <div className='absolute -top-3 -bottom-3 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-gray-200 group-hover:border-blue-300 transition-colors' />
              
              {/* 中间的小节点 */}
              <div
                className={`z-10 flex items-center justify-center w-6 h-6 rounded-full text-white transition-all shadow-sm shrink-0
                  ${isHighlight ? '' : 'bg-gray-400 group-hover:bg-blue-500'}`}
                style={isHighlight ? { background: dayColor.text } : {}}
              >
                {getRouteIcon((item as any).category, item.name)}
              </div>
            </div>

            {/* 右侧路线信息 */}
            <div className={`flex flex-col min-w-0 flex-1 justify-center ${isEditMode ? 'pr-20' : ''}`}>
              <span className={`font-bold text-xs ${isHighlight ? 'text-blue-900' : 'text-gray-500'} truncate`}>
                {item.name}
              </span>
              <span className='text-[10px] text-gray-400 mt-0.5 font-medium'>
                {(item as any).category ? `${(item as any).category}：` : '路线：'}{(item as any).distance}{(item as any).duration ? ` · ${(item as any).duration}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 编辑按钮（编辑模式 hover 显示，移动端常态显示） */}
      {isEditMode && (
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className='absolute right-12 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all z-20'
          title='编辑'
        >
          <Pencil size={16} />
        </button>
      )}

      {/* 删除按钮（编辑模式 hover 显示，移动端常态显示） */}
      {isEditMode && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className='absolute right-3 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all z-20'
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
  isGuest,
  isEditMode,
}: {
  dayIndex: number
  isActive: boolean
  canDelete: boolean
  onActivate: () => void
  onDelete: () => void
  isDragging: boolean
  isGuest: boolean
  isEditMode: boolean
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
      {isActive && canDelete && !isGuest && isEditMode && (
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
export default function FloatingPanel({
  mobileView,
  setMobileView,
}: {
  mobileView?: 'map' | 'list'
  setMobileView?: (view: 'map' | 'list') => void
}) {
  const currentTrip = useTripStore(state => state.currentTrip)
  const isGuest = useTripStore(state => state.isGuest)
  const days = currentTrip?.days || []
  const highlightedId = useTripStore(state => state.highlightedId)
  const {
    isEditMode,
    setIsEditMode,
    addDay,
    deleteDay,
    addPlace,
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
    updateCurrentTrip,
    setEditingItem,
    setRoutingStart,
  } = useTripStore()

  const [activeItem, setActiveItem] = useState<TripItem | null>(null)
  const [editingDayDesc, setEditingDayDesc] = useState(false)
  const [dayDescValue, setDayDescValue] = useState('')
  const dayDescInputRef = useRef<HTMLTextAreaElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isAddingPlace, setIsAddingPlace] = useState(false)
  const [placeSearchQuery, setPlaceSearchQuery] = useState('')

  // 移动端自适应检测
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 当高亮条目变化时，桌面端自动展开面板，移动端不强制弹出大抽屉
  useEffect(() => {
    if (highlightedId) {
      if (!isMobile) {
        setIsExpanded(true)
      }
    }
  }, [highlightedId, isMobile])

  const startEditDayDesc = () => {
    setDayDescValue(activeDay?.description || '')
    setEditingDayDesc(true)
    setTimeout(() => dayDescInputRef.current?.focus(), 0)
  }

  const saveDayDesc = async () => {
    if (!currentTrip || !activeDay) return
    if (dayDescValue !== (activeDay.description || '')) {
      const newDays = currentTrip.days.map(d =>
        d.dayIndex === activeDayIndex ? { ...d, description: dayDescValue } : d
      )
      await updateCurrentTrip({ days: newDays })
    }
    setEditingDayDesc(false)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // 当天数变化时调整激活索引
  useEffect(() => {
    if (days.length > 0 && activeDayIndex !== null) {
      const exists = days.some(d => d.dayIndex === activeDayIndex)
      if (!exists) setActiveDayIndex(days[0].dayIndex)
    }
  }, [days, activeDayIndex, setActiveDayIndex])

  // 切换天数时退出编辑状态
  useEffect(() => {
    setEditingDayDesc(false)
  }, [activeDayIndex])

  // 游客模式强制退出编辑模式
  useEffect(() => {
    if (isGuest) {
      setIsEditMode(false)
    }
  }, [isGuest, setIsEditMode])

  const allPlaces = days.flatMap(d => d.items).filter(i => i.type === 'place') as Place[]
  
  // 查找高亮地点的详细信息，支持缓存中的地点
  const highlightedPlace = highlightedId
    ? (days.flatMap(d => d.items).find(i => i.id === highlightedId && i.type === 'place') as Place | undefined) ||
      allPlacesCache?.find(p => p.id === highlightedId)
    : undefined

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
        const aIn = currentTripPlaceIds.has(a.id)
        const bIn = currentTripPlaceIds.has(b.id)
        if (aIn && !bIn) return -1
        if (!aIn && bIn) return 1
        return 0
      })
    : []

  const filteredCachedPlaces = allPlacesCache
    ? allPlacesCache.filter(place =>
        place.name.toLowerCase().includes(placeSearchQuery.toLowerCase()) ||
        place.address?.toLowerCase().includes(placeSearchQuery.toLowerCase())
      ).slice(0, 10)
    : []

  function handleDragStart(event: DragStartEvent) {
    const draggedId = event.active.id as string
    const item = activeDay?.items.find(i => i.id === draggedId)
    if (item) setActiveItem(item)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveItem(null)
    if (!over || activeDayIndex === null) return

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

  const mobileHeightClass = () => {
    if (!isMobile) return 'md:h-auto'
    if (mobileView === 'list') return 'h-[calc(100dvh-64px)] w-full rounded-none border-t-0'
    // mobileView === 'map'
    return highlightedPlace ? 'h-[108px] w-full rounded-t-3xl border-t border-gray-200/80 shadow-lg' : 'h-0 border-t-0 overflow-hidden'
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={`fixed md:absolute bottom-0 left-0 right-0 md:left-auto md:right-4 md:top-4 md:bottom-4 w-full md:w-96 bg-white/95 md:bg-white/90 backdrop-blur-md rounded-t-3xl rounded-b-none md:rounded-2xl shadow-2xl border border-t border-gray-200/60 md:border-white/40 overflow-hidden flex flex-col z-30 transition-all duration-300 ${isMobile ? mobileHeightClass() : (isExpanded ? 'h-[75vh] md:h-auto' : 'h-[150px] md:h-auto')}`}>
        {/* 移动端地图视图且高亮时，直接渲染高亮快捷卡片，完全不显示 Header/Day tabs/列表 */}
        {isMobile && mobileView === 'map' ? (
          highlightedPlace ? (
            <div className='p-4 flex-1 flex flex-col justify-between overflow-hidden bg-white/50 backdrop-blur-md select-none animate-in fade-in slide-in-from-bottom-2 duration-300'>
              <div className='flex items-start gap-3 relative'>
                <div
                  className='flex items-center justify-center w-10 h-10 rounded-2xl text-base font-bold transition-all shadow-sm shrink-0 bg-blue-100 text-blue-600'
                >
                  <MapPin size={18} />
                </div>
                <div className='flex flex-col min-w-0 flex-1 pr-6'>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-sm text-gray-900 truncate'>{highlightedPlace.name}</span>
                    {highlightedPlace.rating && (
                      <span className='flex items-center gap-0.5 text-[10px] font-bold text-amber-500 shrink-0'>
                        <Star size={10} fill="currentColor" /> {highlightedPlace.rating}
                      </span>
                    )}
                  </div>
                  
                  <div className='flex items-center gap-1.5 mt-0.5'>
                    {highlightedPlace.category && (
                      <span className='text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-gray-100 text-gray-500'>
                        {highlightedPlace.category}
                      </span>
                    )}
                    {highlightedPlace.ticket && (
                      <span className='text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700'>
                        ¥{highlightedPlace.ticket}
                      </span>
                    )}
                    {highlightedPlace.address && (
                      <span className='text-[9px] text-gray-400 truncate flex-1'>{highlightedPlace.address}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setHighlightedId(null)}
                  className='absolute right-0 top-0 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors cursor-pointer'
                >
                  <X size={16} />
                </button>
              </div>

              <div className='flex items-center gap-2 mt-2 pt-2 border-t border-gray-100/60 shrink-0'>
                {allPlacesCache?.some(p => p.id === highlightedPlace.id) && !days.some(d => d.items.some(i => i.id === highlightedPlace.id)) ? (
                  <button
                    onClick={() => {
                      useTripStore.getState().addSuggestedPlaceToTrip(highlightedPlace as any, activeDayIndex ?? undefined)
                      setMobileView?.('list') // 添加后跳转列表视图
                    }}
                    className='flex-1 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-blue-700 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer'
                  >
                    <Plus size={12} /> 加入行程 {activeDayIndex !== null ? `(Day ${activeDayIndex})` : ''}
                  </button>
                ) : (
                  <>
                    {!isGuest && isEditMode && (
                      <button
                        onClick={() => {
                          setEditingItem({
                            type: 'edit',
                            dayIndex: days.find(d => d.items.some(i => i.id === highlightedPlace.id))?.dayIndex || (activeDayIndex ?? 1),
                            item: highlightedPlace,
                          })
                        }}
                        className='flex-1 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer'
                      >
                        <Pencil size={12} /> 编辑详情
                      </button>
                    )}
                    <button
                      onClick={() => {
                        startRouting()
                        setRoutingStart(highlightedPlace as Place)
                        setMobileView?.('list') // 去列表视图做后续规划
                      }}
                      className='flex-1 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer'
                    >
                      <Navigation size={12} className='transform rotate-45' /> 以此规划路线
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null
        ) : (
          <>

        {/* 头部 */}
        <div className='p-3 sm:p-5 border-b border-gray-100/50 bg-white/80 backdrop-blur-xl z-20 flex justify-between items-start shrink-0'>
          <div className='flex-1 min-w-0'>
            <h1 className='text-xl sm:text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent'>行程详情</h1>
            {!isGuest && (
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
            )}
            {!isGuest && isEditMode && (
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
            {currentTrip?.description && (
              <p className='text-xs text-gray-400 mt-2 line-clamp-2'>{currentTrip.description}</p>
            )}
          </div>
          {!isGuest && (
            <button
              onClick={() => addDay()}
              className='p-1.5 sm:p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm border border-blue-100 cursor-pointer'
              title='添加天数'
            >
              <Plus size={18} />
            </button>
          )}
        </div>

        {/* Day Tab 栏（也是拖拽放置区） */}
        <div className='px-4 py-2 sm:py-3 bg-gray-50/50 border-b border-gray-100/50 overflow-x-auto no-scrollbar shrink-0'>
          <div className='flex gap-2'>
            {days.map(day => (
              <DroppableDayTab
                key={day.dayIndex}
                dayIndex={day.dayIndex}
                isActive={activeDayIndex === day.dayIndex}
                canDelete={days.length > 1}
                isDragging={isDragging}
                isGuest={isGuest}
                isEditMode={isEditMode}
                onActivate={() => setActiveDayIndex(activeDayIndex === day.dayIndex ? null : day.dayIndex)}
                onDelete={() => { if (confirm(`确定要删除第 ${day.dayIndex} 天吗？`)) deleteDay(day.dayIndex) }}
              />
            ))}
          </div>
          {editingDayDesc && !isGuest ? (
            <div className='mt-1.5 px-1'>
              <textarea
                ref={dayDescInputRef}
                value={dayDescValue}
                onChange={e => setDayDescValue(e.target.value)}
                onBlur={saveDayDesc}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDayDesc() }
                  if (e.key === 'Escape') setEditingDayDesc(false)
                }}
                className='w-full text-xs text-gray-700 bg-white border border-gray-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-200 resize-none placeholder:text-gray-300 transition-all shadow-sm'
                rows={2}
                placeholder='添加当天描述...'
              />
              <p className='text-[10px] text-gray-300 mt-1 select-none'>Enter 保存 · Esc 取消</p>
            </div>
          ) : (
            <p
              onClick={!isGuest ? startEditDayDesc : undefined}
              className={`text-xs text-gray-400 mt-1.5 px-1 ${!isGuest ? 'cursor-text hover:text-gray-600' : ''} transition-colors`}
              title={!isGuest ? '点击编辑描述' : undefined}
            >
              {activeDay?.description || (isEditMode && !isGuest ? '点击添加当天描述...' : '')}
            </p>
          )}
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
                  <div className='mt-2 pt-2 border-t border-indigo-200/50 grid grid-cols-4 gap-2'>
                    <button onClick={() => calculateAndAddRoute(activeDayIndex ?? 1, routingStartItem, routingEndItem, 'Driving')} className='py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition text-xs font-bold text-center cursor-pointer'>驾车</button>
                    <button onClick={() => calculateAndAddRoute(activeDayIndex ?? 1, routingStartItem, routingEndItem, 'Walking')} className='py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition text-xs font-bold text-center cursor-pointer'>步行</button>
                    <button onClick={() => calculateAndAddRoute(activeDayIndex ?? 1, routingStartItem, routingEndItem, 'Riding')} className='py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition text-xs font-bold text-center cursor-pointer'>骑行</button>
                    <button onClick={() => calculateAndAddRoute(activeDayIndex ?? 1, routingStartItem, routingEndItem, 'Flight')} className='py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition text-xs font-bold text-center cursor-pointer'>飞机</button>
                  </div>
                )}
              </div>
              <button onClick={() => cancelRouting()} className='mt-3 w-full py-1.5 text-indigo-600 bg-indigo-100 rounded hover:bg-indigo-200 transition text-sm'>取消</button>
            </div>
          )}

          {/* 添加路线与添加地点按钮 */}
          {!isRouting && isEditMode && activeDay && (
            <div className='flex gap-3 mb-4'>
              <button
                onClick={() => startRouting()}
                className='flex-1 py-2 border-2 border-dashed border-indigo-200 text-indigo-500 rounded-xl hover:bg-indigo-50 transition font-medium flex justify-center items-center gap-2 cursor-pointer'
              >
                <Navigation size={16} className='transform rotate-45' />
                添加路线
              </button>
              <button
                onClick={() => {
                  setIsAddingPlace(true)
                  if (!allPlacesCache) {
                    fetchAllPlaces()
                  }
                }}
                className='flex-1 py-2 border-2 border-dashed border-blue-200 text-blue-500 rounded-xl hover:bg-blue-50 transition font-medium flex justify-center items-center gap-2 cursor-pointer'
              >
                <Plus size={16} />
                添加地点
              </button>
            </div>
          )}

          {/* 添加地点下拉搜索区域 */}
          {isAddingPlace && isEditMode && activeDay && (
            <div className='mb-4 p-4 bg-blue-50/50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-1 duration-200'>
              <div className='flex justify-between items-center mb-2'>
                <h3 className='font-bold text-blue-900 text-sm flex items-center gap-1.5'>
                  <MapPin size={14} className='text-blue-500' />
                  添加已有地点
                </h3>
                <button
                  onClick={() => {
                    setIsAddingPlace(false)
                    setPlaceSearchQuery('')
                  }}
                  className='p-1 hover:bg-blue-100 rounded-lg text-blue-500 transition-colors cursor-pointer'
                  title='取消'
                >
                  <X size={14} />
                </button>
              </div>

              <div className='relative'>
                <input
                  autoFocus
                  type='text'
                  value={placeSearchQuery}
                  onChange={e => setPlaceSearchQuery(e.target.value)}
                  placeholder='输入地名或关键字搜索...'
                  className='w-full px-3.5 py-2 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 text-xs placeholder:text-gray-400 shadow-sm transition-all'
                />
              </div>

              {allPlacesLoading ? (
                <div className='py-4 text-center text-xs text-gray-400 animate-pulse'>
                  加载地点数据中...
                </div>
              ) : (
                <div className='mt-2 max-h-48 overflow-y-auto no-scrollbar flex flex-col gap-1.5'>
                  {filteredCachedPlaces.length === 0 ? (
                    <div className='py-4 text-center text-xs text-gray-400'>
                      {placeSearchQuery ? '无匹配的地点' : '暂无可用地点'}
                    </div>
                  ) : (
                    filteredCachedPlaces.map(place => (
                      <div
                        key={place.id}
                        onClick={() => {
                          const clonedPlace: Place = {
                            id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                            type: 'place',
                            name: place.name,
                            lngLat: place.lngLat,
                            description: place.description,
                            ticket: place.ticket,
                            address: place.address,
                            phone: place.phone,
                            openingHours: place.openingHours,
                            rating: place.rating,
                            category: place.category,
                            notes: place.notes
                          }
                          addPlace(activeDayIndex!, clonedPlace)
                          setIsAddingPlace(false)
                          setPlaceSearchQuery('')
                        }}
                        className='p-2 bg-white hover:bg-blue-50 border border-gray-100 rounded-lg cursor-pointer transition-all flex justify-between items-center gap-2 group'
                      >
                        <div className='min-w-0 flex-1'>
                          <div className='flex items-center gap-1.5'>
                            <span className='text-xs font-bold text-gray-800 truncate group-hover:text-blue-900'>
                              {place.name}
                            </span>
                            {place.category && (
                              <span className='text-[8px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-medium shrink-0'>
                                {place.category}
                              </span>
                            )}
                          </div>
                          <div className='flex items-center gap-1 mt-0.5 text-[9px] text-gray-400'>
                            <span className='truncate max-w-[120px]'>来自: {place.tripTitle}</span>
                            {place.address && (
                              <>
                                <span>•</span>
                                <span className='truncate'>{place.address}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button className='px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-bold group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0 cursor-pointer'>
                          选择
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {!activeDay ? (
            <div className='h-full flex flex-col items-center justify-center text-gray-400 gap-3 py-12'>
              <div className='w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 animate-pulse'>
                <MapPin size={32} className='text-blue-500/60' />
              </div>
              <p className='text-sm font-medium text-gray-500'>请选择具体天数查看行程</p>
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
                    dayColor={getDayColor(activeDayIndex!)}
                    onHighlight={() => {
                      setHighlightedId(item.id)
                      if (isMobile) {
                        setMobileView?.('map')
                      }
                    }}
                    onDelete={() => {
                      if (confirm(`确定要删除 ${item.name} 吗？`)) deleteItem(activeDayIndex!, item.id)
                    }}
                    onEdit={() => {
                      setEditingItem({
                        type: 'edit',
                        dayIndex: activeDayIndex!,
                        item: item,
                      })
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
                          onClick={() => {
                            setHighlightedId(place.id)
                            if (isMobile) {
                              setMobileView?.('map')
                            }
                          }}
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
        </>
        )}
      </div>

      {/* 拖拽时跟随鼠标的幽灵卡片 */}
      <DragOverlay dropAnimation={null}>
        {activeItem ? <GhostCard item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
