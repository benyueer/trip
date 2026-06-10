import { motion } from 'framer-motion'
import { Loader2, Check, ChevronDown, ChevronUp, Wrench } from 'lucide-react'
import { useState } from 'react'

interface ToolStep {
  tool: string
  toolCallId: string
  status: 'running' | 'done'
  input?: Record<string, any>
  output?: string
}

const TOOL_LABELS: Record<string, string> = {
  webSearch: '搜索景点',
  queryLocalPlaces: '查询地点',
  createTripPlan: '创建行程',
  modifyTripPlan: '修改行程',
  planDayRoute: '规划路线',
  saveUserMemory: '保存偏好',
  maps_geo: '地理编码',
  maps_text_search: '搜索地点',
  maps_around_search: '周边搜索',
  maps_direction_driving: '驾车导航',
  maps_direction_walking: '步行导航',
  maps_direction_transit_integrated: '公交导航',
  maps_bicycling: '骑行导航',
  maps_distance: '计算距离',
  maps_weather: '查询天气',
  maps_regeocode: '逆地理编码',
  maps_search_detail: '地点详情',
  maps_ip_location: 'IP定位',
}

const TOOL_ACTIONS: Record<string, { running: string; done: string }> = {
  webSearch: { running: '正在联网检索最新旅游资讯...', done: '搜索完成，已获取最新信息' },
  queryLocalPlaces: { running: '正在从本地数据库中查询匹配地点...', done: '查询完成，已获取本地地点数据' },
  createTripPlan: { running: '正在生成新行程规划...', done: '行程创建成功' },
  modifyTripPlan: { running: '正在修改当前行程...', done: '行程修改保存成功' },
  planDayRoute: { running: '正在使用高德地图规划最优路线...', done: '路线规划成功' },
  saveUserMemory: { running: '正在保存您的旅行偏好...', done: '已记下您的旅行偏好' },
  maps_geo: { running: '正在通过高德将地址转换为经纬度...', done: '地理编码完成' },
  maps_text_search: { running: '正在高德地图搜索具体位置与坐标...', done: '位置检索成功' },
  maps_around_search: { running: '正在搜索周边配套设施...', done: '周边搜索完成' },
  maps_direction_driving: { running: '正在通过高德计算最佳驾车路线...', done: '驾车导航计算完成' },
  maps_direction_walking: { running: '正在通过高德计算步行路线...', done: '步行路线计算完成' },
  maps_direction_transit_integrated: { running: '正在计算公交路线...', done: '公交方案计算完成' },
  maps_bicycling: { running: '正在计算骑行路线...', done: '骑行路线计算完成' },
  maps_distance: { running: '正在计算地点间的直线距离...', done: '距离计算完成' },
  maps_weather: { running: '正在查询目的地的天气信息...', done: '天气查询完成' },
  maps_regeocode: { running: '正在反查地理坐标位置...', done: '坐标反查完成' },
  maps_search_detail: { running: '正在拉取地点的详细营业时间及评分...', done: '详情拉取完成' },
}

export function AgentToolCallCard({ step }: { step: ToolStep }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[step.tool] || step.tool
  const action = TOOL_ACTIONS[step.tool]

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 border border-gray-200/80 rounded-lg overflow-hidden text-xs"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50/50 transition-colors"
      >
        {step.status === 'running' ? (
          <Loader2 className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />
        ) : (
          <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
        )}
        <Wrench className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <span className={`flex-1 text-left font-medium ${step.status === 'running' ? 'text-blue-600' : 'text-gray-600'}`}>
          {label}
          {step.status === 'running' && action && (
            <span className="block text-[10px] text-gray-400 font-normal mt-0.5 animate-pulse">
              {action.running}
            </span>
          )}
        </span>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-gray-400" />
          : <ChevronDown className="w-3 h-3 text-gray-400" />
        }
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-gray-100">
          {step.input && (
            <div className="mt-1.5">
              <span className="text-gray-400 font-medium">参数</span>
              <pre className="mt-0.5 text-gray-600 whitespace-pre-wrap break-all bg-gray-50 rounded p-1.5">
                {JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}
          {step.output && (
            <div className="mt-1.5">
              <span className="text-gray-400 font-medium">结果</span>
              <pre className="mt-0.5 text-gray-600 whitespace-pre-wrap break-all bg-gray-50 rounded p-1.5 max-h-32 overflow-y-auto">
                {step.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
