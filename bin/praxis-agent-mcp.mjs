#!/usr/bin/env node
import { contentControlsShape } from './content-control-tool-schema.mjs'
import { z } from 'zod'
import { defineControlsShape } from './control-tool-schema.mjs'
import { request } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const socketPath = process.env.PRAXIS_AGENT_TOOL_SOCKET
const token = process.env.PRAXIS_AGENT_TOOL_TOKEN

if (!socketPath || !token) {
  process.stderr.write('Praxis agent tool bridge is not configured.\n')
  process.exit(1)
}

const invoke = async (action, args) => {
  const payload = JSON.stringify({ action, args })
  const body = await new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path: '/invoke',
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        },
        timeout: 30_000
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (response.statusCode !== 200 || !parsed?.ok) {
            reject(
              new Error(parsed?.error || `Praxis tool bridge returned HTTP ${response.statusCode}.`)
            )
            return
          }
          resolve(parsed)
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('Praxis tool bridge timed out.')))
    req.on('error', reject)
    req.end(payload)
  })
  return body.result
}

const result = (value) => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
  isError: !!value?.error
})

const server = new McpServer({ name: 'praxis', version: '1.0.0' })

server.registerTool(
  'workspace_state',
  {
    title: 'Praxis workspace state',
    description:
      'Inspect Praxis authoritative landing/worktree state for this chat. Call this whenever a merge, conflict, worktree, landing, or stale-preview issue is suspected; do not infer state from `git status` in the private worktree.'
  },
  async () => result(await invoke('workspace_state'))
)

server.registerTool(
  'prepare_conflict_resolution',
  {
    title: 'Prepare Praxis conflict resolution',
    description:
      'Ask Praxis to safely combine the current live checkout with this chat’s parked changes inside this chat worktree. Call when workspace_state says `parked`. If files are returned, resolve every marker in them; the normal turn completion will ask Praxis to land the resolved result.'
  },
  async () => result(await invoke('prepare_conflict_resolution'))
)

server.registerTool('content_controls', { description: 'Discover or surface content editors and collections in the Praxis preview area. Call catalog first, then define after binding page content to JSON; optional Jev selects sections.', inputSchema: contentControlsShape }, async (args) => result(await invoke('content_controls', args)))

server.registerTool(
  'define_controls',
  {
    description:
      'Register sliders, toggles, colors and easing controls after extracting animation or component values into named constants or typed props. Also requests opening the Custom inspector.',
    inputSchema: defineControlsShape
  },
  async (args) => result(await invoke('define_controls', args))
)
server.registerTool(
  'open_controls',
  {
    description:
      'Select a preview object by source stamp (file:line) or repo-relative file and open its inspector. Prefer an exact source for repeated objects.',
    inputSchema: {
      source: z.string().optional(),
      file: z.string().optional(),
      tab: z.enum(['props', 'styles', 'custom']).optional()
    }
  },
  async (args) => result(await invoke('open_controls', args))
)

server.registerTool(
  'open_code',
  {
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    description: 'Open the mini code editor in the exact project file and highlight inclusive source lines. Read the file first; use when asked to show code or an implementation.',
    inputSchema: { file: z.string(), startLine: z.number().int().min(1), endLine: z.number().int().min(1).optional() }
  },
  async (args) => result(await invoke('open_code', args))
)

server.registerTool(
  'open_preview',
  {
    annotations: { destructiveHint: false, openWorldHint: false },
    description: 'Open a project page in the user preview. Pass a root-relative path with optional query/hash. Navigation waits for this turn to land.',
    inputSchema: { path: z.string() }
  },
  async (args) => result(await invoke('open_preview', args))
)

// Observation results already contain MCP content blocks. Preserve images as images.
for (const [name, description] of [
  ['preview_location', "Read the page/route currently shown in the user's live preview pane."],
  ['preview_screenshot', "Capture exactly what the user sees in their preview pane right now. Observes the current view; does not confirm private worktree edits have landed."]
]) {
  server.registerTool(name, {
    description,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async () => invoke(name))
}

server.registerTool('project_ui_catalog', {
  description: 'Discover exported React components, literal props and styles for UI composition. Requires Use project components enabled.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => result(await invoke('project_ui_catalog')))
server.registerTool('compose_project_ui', {
  description: 'Return project-component TSX. For the current chat model provide file and spec. With Jev selected provide file, prompt and atomic candidates; Jev chooses the composition. Apply returned source with ordinary edit tools. Never silently fall back if Jev fails.',
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: { file: z.string(), prompt: z.string().optional(), candidates: z.array(z.object({ id: z.string(), description: z.string(), element: z.object({ type: z.string(), props: z.record(z.string(), z.unknown()) }), root: z.boolean().optional(), resource: z.string().optional() })).optional(), spec: z.object({ root: z.string(), elements: z.record(z.string(), z.object({ type: z.string(), props: z.record(z.string(), z.unknown()), children: z.array(z.string()) }).strict()) }).strict().optional() }
}, async (args) => result(await invoke('compose_project_ui', args)))

await server.connect(new StdioServerTransport())
