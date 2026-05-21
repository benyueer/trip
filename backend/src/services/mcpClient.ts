import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { logger } from './logger'

interface MCPTool {
  name: string
  description: string
  inputSchema: any
}

interface MCPServer {
  client: Client
  tools: MCPTool[]
  connected: boolean
}

const servers: Record<string, MCPServer> = {}

export async function connectMCPServers() {
  const amapUrl = process.env.MCP_AMAP_URL
  if (amapUrl) {
    await connectServer('amap-maps', amapUrl)
  }
}

async function connectServer(name: string, url: string) {
  try {
    const client = new Client({ name: `trip-agent-${name}`, version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(url))
    await client.connect(transport)

    const toolsResult = await client.listTools()
    const tools: MCPTool[] = (toolsResult.tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema,
    }))

    servers[name] = { client, tools, connected: true }
    logger.info('mcp', `Connected to ${name}`, {
      url,
      tools: tools.map(t => t.name),
    })
  } catch (error) {
    logger.error('mcp', `Failed to connect to ${name}`, { url, error: String(error) })
  }
}

export function getMCPTools(): MCPTool[] {
  const allTools: MCPTool[] = []
  for (const server of Object.values(servers)) {
    if (server.connected) {
      allTools.push(...server.tools)
    }
  }
  return allTools
}

export async function callMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
  for (const [serverName, server] of Object.entries(servers)) {
    if (!server.connected) continue
    const tool = server.tools.find(t => t.name === toolName)
    if (!tool) continue

    logger.agent.toolCall(`mcp:${toolName}`, args)
    try {
      const result = await server.client.callTool({ name: toolName, arguments: args })
      logger.agent.toolResult(`mcp:${toolName}`, result.content)
      return result.content
    } catch (error) {
      logger.error('mcp', `Tool call failed: ${toolName}`, { error: String(error) })
      return { error: String(error) }
    }
  }
  return { error: `Tool ${toolName} not found in any MCP server` }
}

export function getMCPServerStatus() {
  return Object.entries(servers).map(([name, s]) => ({
    name,
    connected: s.connected,
    tools: s.tools.map(t => t.name),
  }))
}
