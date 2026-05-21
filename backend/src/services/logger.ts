const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function ts() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function log(level: string, color: string, tag: string, msg: string, data?: Record<string, any>) {
  const prefix = `${COLORS.gray}${ts()}${COLORS.reset} ${color}${level}${COLORS.reset} ${COLORS.cyan}[${tag}]${COLORS.reset}`
  const extra = data ? ` ${COLORS.dim}${JSON.stringify(data)}${COLORS.reset}` : ''
  console.log(`${prefix} ${msg}${extra}`)
}

export const logger = {
  info: (tag: string, msg: string, data?: Record<string, any>) =>
    log('INFO ', COLORS.green, tag, msg, data),

  warn: (tag: string, msg: string, data?: Record<string, any>) =>
    log('WARN ', COLORS.yellow, tag, msg, data),

  error: (tag: string, msg: string, data?: Record<string, any>) =>
    log('ERROR', COLORS.red, tag, msg, data),

  // Agent-specific logging
  agent: {
    chat: (userId: string, sessionId: string, message: string) =>
      log('CHAT ', COLORS.blue, 'agent', `user[${userId.slice(0, 8)}] session[${sessionId.slice(0, 8)}]`, { message: message.slice(0, 200) }),

    intent: (category: string, confidence: number, input: string) =>
      log('INTENT', COLORS.yellow, 'agent', `${category} (${confidence})`, { input: input.slice(0, 100) }),

    toolCall: (toolName: string, args?: any) =>
      log('TOOL ', COLORS.magenta, 'agent', `→ ${toolName}`, args ? { args: JSON.stringify(args).slice(0, 200) } : undefined),

    toolResult: (toolName: string, output: any) =>
      log('TOOL ', COLORS.magenta, 'agent', `← ${toolName}`, { output: JSON.stringify(output).slice(0, 200) }),

    streamStart: (sessionId: string) =>
      log('STREAM', COLORS.cyan, 'agent', `streaming started [${sessionId.slice(0, 8)}]`),

    streamEnd: (sessionId: string, textLength: number) =>
      log('STREAM', COLORS.cyan, 'agent', `streaming ended [${sessionId.slice(0, 8)}]`, { chars: textLength }),

    blocked: (category: string, input: string) =>
      log('BLOCK', COLORS.red, 'agent', `blocked ${category}`, { input: input.slice(0, 100) }),

    memory: (action: string, content: string) =>
      log('MEMORY', COLORS.green, 'agent', `${action}`, { content: content.slice(0, 100) }),

    tripCreated: (tripId: string, title: string) =>
      log('TRIP ', COLORS.green, 'agent', `created`, { tripId: tripId.slice(0, 8), title }),

    tripModified: (tripId: string, action: string) =>
      log('TRIP ', COLORS.yellow, 'agent', `modified: ${action}`, { tripId: tripId.slice(0, 8) }),
  },
}
