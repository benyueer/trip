export type IntentCategory = 'trip_related' | 'off_topic' | 'harmful'

export interface IntentResult {
  category: IntentCategory
  confidence: number
  reason?: string
}

// Patterns that indicate harmful intent
const HARMFUL_PATTERNS = [
  // System/OS commands
  /\b(rm\s+-rf|sudo\s|chmod\s|chown\s|mkfs|dd\s+if=)\b/i,
  /\b(del(et)?e|remove|drop)\s+(all|every|entire)\s+(files?|folders?|dirs?|databases?|tables?|dbs?)\b/i,
  // File system exploration
  /\b(ls\s|cat\s|find\s|grep\s|curl\s|wget\s|ssh\s|scp\s|rsync\s)\b/i,
  /\b(list|show|read|print|display)\s+(all\s+)?(files?|dirs?|folders?|directors?|etc|passwd|shadow)\b/i,
  // Code injection / prompt injection
  /\b(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instruction|prompt|rule)/i,
  /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|system\s*prompt)\b/i,
  /\b(execute|run|eval|exec)\s+(code|command|script|shell)\b/i,
  // Data exfiltration
  /\b(send|upload|post|exfiltrate)\s+(all\s+)?(data|secret|key|token|password|credential)\b/i,
  // SQL injection attempts
  /(\b(union\s+select|drop\s+table|truncate|alter\s+table)\b|--\s*$|;\s*drop\b)/i,
]

// Patterns that indicate off-topic (not trip-related)
const OFF_TOPIC_PATTERNS = [
  // Programming questions
  /\b(how\s+to\s+(code|program|build|write|develop|implement)|write\s+(a\s+\w+\s+)?(function|script|program|code))\b/i,
  /\b(javascript|python|react|vue|angular|node|typescript|html|css|sql)\b.*\b(explain|tutorial|help|how)\b/i,
  // Math/science
  /\b(solve|calculate|equation|formula|math|physics|chemistry|biology)\b/i,
  // General knowledge unrelated to travel
  /\b(what\s+is\s+the\s+meaning\s+of\s+life|who\s+won\s+the\s+(election|war|game))\b/i,
  // News/politics
  /\b(politics|election|president|government|policy|legislation)\b/i,
  // Medical/legal advice
  /\b(diagnos|symptom|disease|medicine|lawyer|lawsuit|legal\s+advice)\b/i,
]

// Patterns that are clearly trip-related (override off-topic)
const TRIP_RELATED_PATTERNS = [
  // Trip/itinerary keywords
  /\b(trip|travel|journey|itinerary|route|tour|vacation|holiday|outing)\b/i,
  /\b(旅[行游]|行程|路线|攻略|出游|度假|自驾)\b/,
  // Place/destination keywords
  /\b(where|visit|go\s+to|explore|destination|place|spot|scenic|attraction)\b/i,
  /\b(景点|景区|地方|去哪里|草原|沙漠|山[区脉]?|海[边滩]?|湖|河|岛)\b/,
  // Transport keywords
  /\b(drive|walk|ride|fly|train|bus|car|bike|transport|commute)\b/i,
  /\b(自驾|步行|骑行|火车|飞机|大巴|高铁|交通)\b/,
  // Accommodation/food
  /\b(hotel|hostel|airbnb|restaurant|food|eat|stay|accommodation)\b/i,
  /\b(酒店|民宿|餐厅|美食|住宿|吃饭)\b/,
  // Planning keywords
  /\b(plan|schedule|day\s*\d|how\s+many\s+day|suggest|recommend|itinerary)\b/i,
  /\b(规划|计划|安排|推荐|几天|第[一二三四五]天)\b/,
  // Common trip-related question patterns
  /有哪些.*[去玩看]|怎么[去到]|什么.*值得|必[去玩看]|好玩/,
]

/**
 * Classifies user intent into trip_related, off_topic, or harmful.
 * Uses pattern matching — no LLM call, runs in <1ms.
 */
export function classifyIntent(input: string): IntentResult {
  const trimmed = input.trim()

  // Empty input
  if (!trimmed) {
    return { category: 'off_topic', confidence: 1.0, reason: 'Empty input' }
  }

  // Check harmful first (highest priority)
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        category: 'harmful',
        confidence: 0.95,
        reason: `Matched harmful pattern: ${pattern.source.slice(0, 60)}...`,
      }
    }
  }

  // Check trip-related (overrides off-topic)
  for (const pattern of TRIP_RELATED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'trip_related', confidence: 0.9 }
    }
  }

  // Check off-topic
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        category: 'off_topic',
        confidence: 0.8,
        reason: `Matched off-topic pattern: ${pattern.source.slice(0, 60)}...`,
      }
    }
  }

  // Default: treat as trip-related (lenient — let the LLM decide if it can help)
  return { category: 'trip_related', confidence: 0.5 }
}
