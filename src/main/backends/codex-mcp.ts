import { join } from 'node:path'
import type { PraxisAgentToolRegistration } from '../praxis-agent-tools'

const requiredTools = [
  'chat_island',
  'preview_location',
  'preview_screenshot',
  'workspace_state',
  'prepare_conflict_resolution',
  'content_controls',
  'project_ui_catalog',
  'compose_project_ui',
  'open_preview',
  'open_code'
]

export function praxisMcpConfig(appRoot: string, registration: PraxisAgentToolRegistration) {
  return {
    mcp_servers: {
      praxis: {
        command: process.execPath,
        args: [join(appRoot, 'bin/praxis-agent-mcp.mjs')],
        cwd: appRoot,
        enabled: true,
        // A missing bridge must fail the turn, including subsequent CLI resumes.
        required: true,
        startup_timeout_sec: 15,
        tools: Object.fromEntries(
          requiredTools
            .filter((name) => name !== 'workspace_state' && name !== 'prepare_conflict_resolution')
            .map((name) => [name, { approval_mode: 'approve' }])
        ),
        env: {
          PRAXIS_AGENT_TOOL_SOCKET: registration.socketPath,
          PRAXIS_AGENT_TOOL_TOKEN: registration.token
        }
      }
    }
  }
}

/** Check the actual helper and authenticated socket without making a model call. */
export async function verifyPraxisMcp(config: ReturnType<typeof praxisMcpConfig>): Promise<void> {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js')
  ])
  const server = config.mcp_servers.praxis
  const client = new Client({ name: 'praxis-startup', version: '1' })
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    env: server.env,
    stderr: 'ignore'
  })
  const options = { timeout: server.startup_timeout_sec * 1000 }
  try {
    await client.connect(transport, options)
    const { tools } = await client.listTools({}, options)
    const names = new Set(tools.map((tool) => tool.name))
    const missing = requiredTools.filter((name) => !names.has(name))
    if (missing.length) throw new Error(`Missing tools: ${missing.join(', ')}`)
    const result = await client.callTool(
      { name: 'workspace_state', arguments: {} },
      undefined,
      options
    )
    if (result.isError) throw new Error('The session tool bridge rejected its connection.')
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error))
      .split(server.env.PRAXIS_AGENT_TOOL_TOKEN)
      .join('[redacted]')
    throw new Error(`Praxis tools could not connect: ${detail}. Restart Praxis and retry the chat.`)
  } finally {
    await client.close().catch(() => {})
  }
}
