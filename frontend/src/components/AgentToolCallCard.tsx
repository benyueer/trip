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

export function AgentToolCallCard({ step }: { step: ToolStep }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[step.tool] || step.tool

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
