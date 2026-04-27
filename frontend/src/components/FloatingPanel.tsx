import { useEffect } from 'react'
import { useTripStore } from '../store'
import { Plus, Trash2, MapPin, Navigation } from 'lucide-react'

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
    setActiveDayIndex
  } = useTripStore()

  // 当天数发生变化（如删除当前天）时，调整激活索引
  useEffect(() => {
    if (days.length > 0) {
      const exists = days.some(d => d.dayIndex === activeDayIndex)
      if (!exists) {
        setActiveDayIndex(days[0].dayIndex)
      }
    }
  }, [days, activeDayIndex, setActiveDayIndex])

  const activeDay = days.find(d => d.dayIndex === activeDayIndex)

  return (
    <div className='absolute right-4 top-4 bottom-4 w-96 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/40 overflow-hidden flex flex-col z-10 transition-all duration-300'>
      {/* 头部：标题与新增按钮 */}
      <div className='p-5 border-b border-gray-100/50 bg-white/80 backdrop-blur-xl z-20 flex justify-between items-center'>
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
        </div>
        <button 
          onClick={() => addDay()}
          className='p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm border border-blue-100'
          title='添加天数'
        >
          <Plus size={20} />
        </button>
      </div>

      {/* 横向 Tab 栏 */}
      <div className='px-4 py-3 bg-gray-50/50 border-b border-gray-100/50 overflow-x-auto no-scrollbar flex gap-2'>
        {days.map(day => (
          <div 
            key={day.dayIndex}
            onClick={() => setActiveDayIndex(day.dayIndex)}
            className={`
              shrink-0 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all flex items-center gap-2
              ${activeDayIndex === day.dayIndex 
                ? 'bg-white text-blue-600 shadow-sm border border-blue-100 ring-1 ring-blue-500/10' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'}
            `}
          >
            Day {day.dayIndex}
            {activeDayIndex === day.dayIndex && days.length > 1 && (
              <button 
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`确定要删除第 ${day.dayIndex} 天吗？`)) {
                    deleteDay(day.dayIndex)
                  }
                }}
                className='p-0.5 hover:bg-red-50 hover:text-red-500 rounded-md transition-colors'
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      
      {/* 行程内容列表 */}
      <div className='p-4 flex-1 overflow-y-auto'>
        {!activeDay ? (
          <div className='h-full flex flex-col items-center justify-center text-gray-400 gap-3'>
            <div className='w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100'>
              <Plus size={32} className='opacity-20' />
            </div>
            <p className='text-sm'>点击上方“+”开始规划</p>
          </div>
        ) : (
          <div className='flex flex-col gap-3'>
            {activeDay.items.length === 0 && (
              <div className='py-12 text-center'>
                <p className='text-gray-400 text-sm'>这一天还没有安排，去地图上点击地点添加吧</p>
              </div>
            )}
            {activeDay.items.map((item) => {
              const isHighlight = highlightedId === item.id
              return (
                <div 
                  key={item.id}
                  onClick={() => setHighlightedId(item.id)}
                  className={`
                    p-4 rounded-2xl cursor-pointer transition-all duration-300 border
                    ${isHighlight 
                      ? 'bg-blue-50/80 border-blue-200 shadow-lg transform scale-[1.01] ring-1 ring-blue-500/20' 
                      : 'bg-white border-gray-100 hover:border-blue-100 hover:shadow-md hover:bg-gray-50/50'}
                  `}
                >
                  {item.type === 'place' ? (
                    <div className='flex items-start gap-4'>
                      <div className={`flex items-center justify-center w-10 h-10 rounded-2xl text-base font-bold transition-all shadow-sm shrink-0 ${isHighlight ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-500'}`}>
                        <MapPin size={18} />
                      </div>
                      <div className='flex flex-col'>
                        <span className={`font-bold text-sm ${isHighlight ? 'text-blue-900' : 'text-gray-800'}`}>{item.name}</span>
                        {item.description && (
                          <p className={`text-xs mt-1 leading-relaxed ${isHighlight ? 'text-blue-700/70' : 'text-gray-500'}`}>
                            {item.description}
                          </p>
                        )}
                        <span className='text-[10px] text-gray-400 mt-2 font-medium uppercase tracking-wider'>地点</span>
                      </div>
                    </div>
                  ) : (
                    <div className='flex items-center justify-between pl-1'>
                      <div className='flex items-center gap-4'>
                        <div className={`flex items-center justify-center w-10 h-10 rounded-2xl text-base font-bold transition-all shadow-sm shrink-0 ${isHighlight ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-500'}`}>
                          <Navigation size={18} />
                        </div>
                        <div className='flex flex-col'>
                          <span className={`font-bold text-sm ${isHighlight ? 'text-indigo-900' : 'text-gray-800'}`}>{item.name}</span>
                          <span className='text-[10px] text-gray-400 mt-0.5 font-medium uppercase tracking-wider'>路线距离：{item.distance}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
