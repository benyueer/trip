# Agent Streaming UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show agent's intermediate reasoning (tool calls, thinking) in the chat UI as a live streaming experience, display plan cards with accept/reject after trip/day creation, and auto-refresh the day list after agent actions.

**Architecture:** Change the backend streaming protocol from raw text to newline-delimited JSON events (`event:tool_start`, `event:tool_end`, `event:token`, `event:meta`). The frontend parses these structured events to render rich UI elements (tool call cards, thinking indicators) alongside the streamed text. Post-stream side effects trigger trip data refresh.

**Tech Stack:** Python (Litestar, LangGraph), TypeScript (React, Zustand, fetch ReadableStream)

---

## File Structure

### Backend (modify)
- `backend-py/app/agent/engine.py` — yield `on_tool_start` and `on_tool_end` events as structured JSON lines
- `backend-py/app/agent/routes.py` — pass through structured events from engine

### Frontend (modify)
- `frontend/src/store/index.ts` — parse structured events, update `agentMessages` with tool steps, auto-refresh trip after agent actions
- `frontend/src/components/AgentPanel.tsx` — render tool call cards and thinking indicators in chat

### Frontend (create)
- `frontend/src/components/AgentToolCallCard.tsx` — component to display a tool call with name, args, status, and result

---

### Task 1: Backend — Yield structured tool events from engine

**Files:**
- Modify: `backend-py/app/agent/engine.py:279-310`

The current engine only yields raw text tokens. We need to also yield structured JSON events for `on_tool_start` and `on_tool_end` so the frontend can display tool call progress.

- [ ] **Step 1: Update the streaming event loop to yield tool events**

In `backend-py/app/agent/engine.py`, replace the event loop (lines 283-310) with one that also handles `on_tool_start` and yields structured events:

```python
        async for event in agent.astream_events(
            {"messages": langchain_messages},
            version="v2",
            config={"recursion_limit": 50},
        ):
            kind = event["event"]

            if kind == "on_chat_model_start":
                try:
                    raw = event.get("data", {}).get("input")
                    if isinstance(raw, dict) and "messages" in raw:
                        last_llm_input = raw["messages"]
                    elif isinstance(raw, list):
                        last_llm_input = raw
                except Exception:
                    pass

            elif kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                content = chunk.content
                if content:
                    token_buffer.append(content)
                    yield json.dumps({"type": "token", "content": content}, ensure_ascii=False) + "\n"

            elif kind == "on_tool_start":
                tool_name = event.get("name", "unknown")
                tool_input = event.get("data", {}).get("input", {})
                tool_call_id = event.get("data", {}).get("id", "")
                logger.agent.tool_call(tool_name, tool_input)
                yield json.dumps({
                    "type": "tool_start",
                    "tool": tool_name,
                    "input": tool_input,
                    "toolCallId": tool_call_id,
                }, ensure_ascii=False) + "\n"

            elif kind == "on_tool_end":
                output = event.get("data", {}).get("output", "")
                tool_name = event.get("name", "unknown")
                tool_call_id = event.get("data", {}).get("id", "")
                if output is not None:
                    tool_results_buffer.append(output)
                    yield json.dumps({
                        "type": "tool_end",
                        "tool": tool_name,
                        "toolCallId": tool_call_id,
                        "output": output if isinstance(output, str) else json.dumps(output, ensure_ascii=False),
                    }, ensure_ascii=False) + "\n"
```

- [ ] **Step 2: Update the final metadata yield to use structured format**

Replace the final metadata yield at the end of `stream_chat_with_agent` (around line 334):

```python
        if metadata:
            yield json.dumps({"type": "meta", "data": metadata}, ensure_ascii=False) + "\n"
```

- [ ] **Step 3: Commit**

```bash
git add backend-py/app/agent/engine.py
git commit -m "feat(agent): yield structured tool events from streaming engine"
```

---

### Task 2: Frontend — Parse structured events in sendAgentMessage

**Files:**
- Modify: `frontend/src/store/index.ts:650-712`

The current frontend treats the stream as raw text. We need to parse newline-delimited JSON events and build up structured message state.

- [ ] **Step 1: Add tool step types to the AgentMessage interface**

In `frontend/src/store/index.ts`, find the `AgentMessage` interface (around line 87) and add a `toolSteps` field:

```ts
interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    suggestedPlaces?: Array<{ name: string; lngLat: [number, number]; description?: string; category?: string; rating?: string; address?: string; ticket?: string }>
    tripId?: string
    tripTitle?: string
    modifiedTripId?: string
    blocked?: boolean
    reason?: string
    dayPlan?: {
      dayIndex: number
      title: string
      description?: string
      places: Array<{ name: string; lngLat: [number, number]; description?: string; category?: string; address?: string; rating?: string; ticket?: string; openingHours?: string; order: number }>
      routeInfo?: { totalDistance: string; totalDuration: string }
    }
  }
  toolSteps?: Array<{
    tool: string
    toolCallId: string
    status: 'running' | 'done'
    input?: Record<string, any>
    output?: string
  }>
  createdAt: string
}
```

- [ ] **Step 2: Replace the stream parsing logic**

In `sendAgentMessage`, replace the text stream reading block (lines 650-712) with structured event parsing:

```ts
      // Structured event stream — parse newline-delimited JSON
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let textContent = ''
      let metadata: Record<string, any> = {}
      const toolSteps: NonNullable<AgentMessage['toolSteps']> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let event: any
          try { event = JSON.parse(trimmed) } catch { continue }

          if (event.type === 'token') {
            textContent += event.content
          } else if (event.type === 'tool_start') {
            toolSteps.push({
              tool: event.tool,
              toolCallId: event.toolCallId,
              status: 'running',
              input: event.input,
            })
          } else if (event.type === 'tool_end') {
            const step = toolSteps.find(s => s.toolCallId === event.toolCallId)
            if (step) {
              step.status = 'done'
              step.output = event.output
            }
          } else if (event.type === 'meta') {
            metadata = event.data || {}
          }
        }

        // Update message with current state
        set(state => ({
          agentMessages: state.agentMessages.map(m =>
            m.id === assistantId
              ? { ...m, content: textContent, toolSteps: [...toolSteps] }
              : m
          ),
        }))
      }

      // Final update
      set(state => ({
        agentMessages: state.agentMessages.map(m =>
          m.id === assistantId
            ? { ...m, content: textContent, metadata, toolSteps: [...toolSteps] }
            : m
        ),
        agentLoading: false,
        agentSuggestedPlaces: metadata.suggestedPlaces || state.agentSuggestedPlaces,
      }))

      if (metadata.tripId) {
        window.dispatchEvent(new CustomEvent('agent:navigateTrip', {
          detail: { tripId: metadata.tripId }
        }))
      }
      if (metadata.modifiedTripId) {
        get().fetchTripById(metadata.modifiedTripId)
      }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(agent): parse structured streaming events with tool steps"
```

---

### Task 3: Frontend — Create AgentToolCallCard component

**Files:**
- Create: `frontend/src/components/AgentToolCallCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AgentToolCallCard.tsx
git commit -m "feat(agent): add AgentToolCallCard component for tool call display"
```

---

### Task 4: Frontend — Render tool steps in AgentPanel

**Files:**
- Modify: `frontend/src/components/AgentPanel.tsx:1-7,216-285`

- [ ] **Step 1: Import AgentToolCallCard**

Add import at line 6:

```tsx
import { AgentToolCallCard } from './AgentToolCallCard'
```

- [ ] **Step 2: Render tool steps before the assistant text bubble**

In the message rendering loop (line 216), add tool step cards before the text bubble. Find the `{msg.role === 'assistant' ? (` block (line 234) and add tool steps above it:

Replace the assistant message rendering section (lines 228-248) with:

```tsx
                    <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                      {/* Tool steps */}
                      {msg.role === 'assistant' && msg.toolSteps && msg.toolSteps.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {msg.toolSteps.map((step) => (
                            <AgentToolCallCard key={step.toolCallId} step={step} />
                          ))}
                        </div>
                      )}

                      <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                            {agentLoading && msg.id === agentMessages[agentMessages.length - 1]?.id && (
                              <span className="inline-flex gap-0.5 ml-1 align-middle">
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </span>
                            )}
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AgentPanel.tsx
git commit -m "feat(agent): render tool call cards in chat messages"
```

---

### Task 5: Frontend — Auto-refresh trip after agent creates/modifies

**Files:**
- Modify: `frontend/src/store/index.ts:694-701`

The current code navigates to a new trip on `metadata.tripId` but doesn't refresh the trip list or the current trip's day list. The `metadata.modifiedTripId` path calls `fetchTripById` but doesn't invalidate the places cache.

- [ ] **Step 1: Add fetchTrips call and cache invalidation after agent actions**

Replace the post-stream side effects block (around line 694):

```ts
      if (metadata.tripId) {
        window.dispatchEvent(new CustomEvent('agent:navigateTrip', {
          detail: { tripId: metadata.tripId }
        }))
        // Refresh trip list so PlanningListPage shows the new trip
        get().fetchTrips()
      }
      if (metadata.modifiedTripId) {
        get().fetchTripById(metadata.modifiedTripId)
        // Invalidate allPlacesCache so FloatingPanel shows fresh data
        set({ allPlacesCache: null, allPlacesCacheTime: 0 })
      }
      if (metadata.dayPlan) {
        // Refresh current trip to pick up any day changes
        const { currentTrip } = get()
        if (currentTrip) {
          get().fetchTripById(currentTrip.id)
        }
      }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(agent): auto-refresh trip and trip list after agent actions"
```

---

### Task 6: Backend — Remove the separate reasoning_content API call

**Files:**
- Modify: `backend-py/app/agent/engine.py:154-197,290-298,318-325`

The `_get_reasoning_content` function makes a separate non-streaming API call to extract `reasoning_content`, which frequently fails with 401 errors and is non-critical. Remove it to simplify the flow.

- [ ] **Step 1: Remove _get_reasoning_content call and related code**

In `stream_chat_with_agent`, remove:
1. The `on_chat_model_start` handler that captures `last_llm_input` (lines 290-298)
2. The `_get_reasoning_content` call (around line 318)
3. The `reasoning_content` logic in the metadata assembly

The metadata assembly should become:

```python
        meta = metadata.copy()
        db_session.add(AgentMessage(
            sessionId=session_id,
            role="assistant",
            content=final_text,
            meta=json.dumps(meta, ensure_ascii=False) if meta else None,
        ))
```

Also remove the `last_llm_input` variable declaration (line 281).

- [ ] **Step 2: Commit**

```bash
git add backend-py/app/agent/engine.py
git commit -m "refactor(agent): remove unreliable reasoning_content extraction"
```

---

## Verification

After all tasks are implemented:

1. Start the backend: `cd backend-py && python -m app.main`
2. Start the frontend: `pnpm dev:frontend`
3. Open a trip detail page, click the bot button to open the agent panel
4. Send a message like "帮我规划千岛湖一日游"
5. Verify:
   - Tool call cards appear in the chat as tools execute (e.g., "搜索景点", "地理编码")
   - Tool cards show spinner while running, checkmark when done
   - Tool cards are expandable to show input/output
   - LLM text tokens stream in below tool cards
   - After trip creation, the trip list refreshes and navigation happens
   - After trip modification, the day list in FloatingPanel updates automatically
   - The day plan card shows with accept/reject buttons
