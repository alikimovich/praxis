// Real MCP handshake + Codex inventory, with no model request or account access.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Codex } from '@openai/codex-sdk'
import { praxisMcpConfig, verifyPraxisMcp } from '../src/main/backends/codex-mcp.ts'
import {
  registerPraxisAgentTools,
  shutdownPraxisAgentTools
} from '../src/main/praxis-agent-tools.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = await mkdtemp(join(tmpdir(), 'praxis-codex-mcp-'))
const calls = []
const registration = await registerPraxisAgentTools(async (action) => {
  calls.push(action)
  return { state: 'live' }
})
let child
try {
  const config = praxisMcpConfig(root, registration)
  // The provider runs in a project/worktree, separate from Praxis's install.
  process.chdir(home)
  await verifyPraxisMcp(config)
  assert.deepEqual(calls, ['workspace_state'], 'startup verifies the authenticated bridge')
  const badToken = praxisMcpConfig(root, { ...registration, token: 'invalid-token' })
  await assert.rejects(verifyPraxisMcp(badToken), /Praxis tools could not connect/)
  const missingHelper = praxisMcpConfig(home, registration)
  await assert.rejects(verifyPraxisMcp(missingHelper), /Praxis tools could not connect/)

  // Use the exact production config and SDK-selected CLI, not a substitute server.
  const overrides = []
  function flatten(value, path = '') {
    for (const [key, entry] of Object.entries(value)) {
      const name = path ? `${path}.${key}` : key
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) flatten(entry, name)
      else overrides.push('-c', `${name}=${JSON.stringify(entry)}`)
    }
  }
  flatten(config)
  child = spawn(new Codex().exec.executablePath, ['app-server', ...overrides], {
    cwd: home,
    env: { ...process.env, CODEX_HOME: home },
    stdio: ['pipe', 'pipe', 'ignore']
  })
  let sequence = 0
  const pending = new Map()
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    const message = JSON.parse(line)
    pending.get(message.id)?.(message)
  })
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timeout: ${method}`))
      }, 30000)
      pending.set(id, (message) => {
        clearTimeout(timer)
        pending.delete(id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  await request('initialize', {
    clientInfo: { name: 'praxis-test', version: '1' },
    capabilities: { experimentalApi: true }
  })
  child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`)
  const { thread } = await request('thread/start', {
    cwd: home,
    ephemeral: true,
    approvalPolicy: 'never'
  })
  const status = await request('mcpServerStatus/list', { threadId: thread.id })
  const server = status.data.find((entry) => entry.name === 'praxis')
  assert.ok(server, 'Codex connects to the Praxis MCP server')
  assert.ok(!server.toolsError, 'Codex can list the tools')
  for (const tool of ['chat_island', 'preview_screenshot', 'preview_location', 'workspace_state']) {
    assert.ok(server.tools[tool], `Codex exposes ${tool}`)
  }
  assert.equal(config.mcp_servers.praxis.required, true, 'future turns cannot silently omit Praxis')
  console.log('CODEX-MCP OK — real helper, socket authentication and Codex tool inventory')
} finally {
  process.chdir(root)
  child?.kill()
  registration.dispose()
  await shutdownPraxisAgentTools()
  await rm(home, { recursive: true, force: true })
}
