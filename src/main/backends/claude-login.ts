import { execFile } from 'node:child_process'
import { accessSync, constants, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ProviderLoginReport } from '../../shared/api'

/**
 * Claude seat login (LKM-119), inside the Claude provider helper.
 *
 * The helper runs the SDK's bundled Claude CLI. It reads the same credentials as an
 * installed `claude` (Keychain item "Claude Code-credentials" for account $USER, or
 * `~/.claude/.credentials.json`, or `CLAUDE_CODE_OAUTH_TOKEN`), but only what its
 * environment lets it find. So before the first query the helper asks the bundled CLI
 * `claude auth status --json`; when it is not logged in and an installed CLI is, the
 * session runs that one instead (`pathToClaudeCodeExecutable`). The probes use the
 * helper's own environment and cwd, exactly what the query will see.
 */

export interface ClaudeAuth {
  loggedIn: boolean | null
  authMethod?: string
  error?: string
}

export interface ClaudeCli {
  /** The executable to pass as `pathToClaudeCodeExecutable`; undefined: the SDK's own. */
  executable?: string
  source: 'bundled' | 'installed'
  bundled: { path: string | null; auth: ClaudeAuth }
  installed: { path: string; auth: ClaudeAuth }[]
}

const PROBE_TIMEOUT = 4000

/** The SDK's native CLI, resolved the way the SDK resolves it. */
export function bundledClaude(): string | null {
  try {
    return require.resolve(
      `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`
    )
  } catch {
    return null
  }
}

const executable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const real = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** Installed `claude` executables: PATH first, then the installers' usual places. */
export function installedClaudes(
  env: NodeJS.ProcessEnv = process.env,
  bundled = bundledClaude()
): string[] {
  const home = env.HOME || homedir()
  const candidates = [
    ...(env.PATH ?? '')
      .split(':')
      .filter(Boolean)
      .map((dir) => join(dir, 'claude')),
    join(home, '.local/bin/claude'),
    join(home, '.claude/local/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ]
  const seen = new Set(bundled ? [real(bundled)] : [])
  const out: string[] = []
  for (const path of candidates) {
    if (!executable(path)) continue
    const target = real(path)
    // An npm-installed `claude` shim can resolve into this checkout's SDK package too.
    if (seen.has(target) || target.includes('/claude-agent-sdk')) continue
    seen.add(target)
    out.push(path)
  }
  return out
}

/** `claude auth status --json` (exit 1 when logged out, still with JSON). */
export function parseAuthStatus(stdout: string): ClaudeAuth | null {
  try {
    const value = JSON.parse(stdout.trim())
    if (!value || typeof value !== 'object' || typeof value.loggedIn !== 'boolean') return null
    return {
      loggedIn: value.loggedIn,
      ...(typeof value.authMethod === 'string' ? { authMethod: value.authMethod } : {})
    }
  } catch {
    return null
  }
}

export function claudeAuthStatus(path: string, timeout = PROBE_TIMEOUT): Promise<ClaudeAuth> {
  return new Promise((resolve) => {
    execFile(
      path,
      ['auth', 'status', '--json'],
      { timeout, maxBuffer: 64 * 1024, env: process.env },
      (error, stdout) => {
        const parsed = parseAuthStatus(String(stdout ?? ''))
        if (parsed) return resolve(parsed)
        const reason = error
          ? error.killed
            ? 'timed out'
            : error.message.split('\n')[0]
          : 'unreadable output'
        resolve({ loggedIn: null, error: reason.slice(0, 300) })
      }
    )
  })
}

/** Which executables to probe; the defaults are the SDK's and `installedClaudes()` (tests name stand-ins). */
export interface ClaudeCandidates {
  bundled?: string | null
  installed?: string[]
  /** `/usr/bin/security` by default. */
  security?: string
}

/** Exit code of `security <command>` (output discarded); null when it could not run or timed out. */
export function securityExit(
  command: 'list-keychains' | 'default-keychain',
  path = '/usr/bin/security',
  timeout = PROBE_TIMEOUT
): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(path, [command], { timeout, maxBuffer: 64 * 1024, env: process.env }, (error) => {
      if (!error) return resolve(0)
      resolve(!error.killed && typeof error.code === 'number' ? error.code : null)
    })
  })
}

/**
 * Whether this helper reaches the user's keychains (LKM-125). A helper outside the
 * user's security session sees none, so the Claude CLI cannot read the login it keeps
 * there. Exit codes only: the keychain paths are never read into the report.
 */
export async function keychainAccess(
  path?: string
): Promise<{ listKeychains: number | null; defaultKeychain: number | null }> {
  const [listKeychains, defaultKeychain] = await Promise.all([
    securityExit('list-keychains', path),
    securityExit('default-keychain', path)
  ])
  return { listKeychains, defaultKeychain }
}

let cached: Promise<ClaudeCli> | null = null

/** Which CLI this helper's sessions run; probed once per helper unless `fresh`. */
export function resolveClaudeCli(
  fresh = false,
  candidates: ClaudeCandidates = {}
): Promise<ClaudeCli> {
  if (!fresh && cached) return cached
  const probe = (async (): Promise<ClaudeCli> => {
    const path = candidates.bundled !== undefined ? candidates.bundled : bundledClaude()
    const auth: ClaudeAuth = path
      ? await claudeAuthStatus(path)
      : { loggedIn: null, error: 'not found' }
    const bundled = { path, auth }
    if (auth.loggedIn === true) return { source: 'bundled', bundled, installed: [] }
    const paths = candidates.installed ?? installedClaudes(process.env, path)
    const installed = await Promise.all(
      paths.map(async (p) => ({ path: p, auth: await claudeAuthStatus(p) }))
    )
    const usable = installed.find((cli) => cli.auth.loggedIn === true)
    return usable
      ? { executable: usable.path, source: 'installed', bundled, installed }
      : { source: 'bundled', bundled, installed }
  })()
  if (!fresh) cached = probe
  return probe
}

const describe = (auth: ClaudeAuth): string =>
  auth.loggedIn === true
    ? `logged in${auth.authMethod ? ` (${auth.authMethod})` : ''}`
    : auth.loggedIn === false
      ? 'not logged in'
      : `unknown (${auth.error ?? 'no answer'})`

/** "Check provider login": what this helper sees. Names and paths only, never a secret. */
export async function checkClaudeLogin(
  candidates: ClaudeCandidates = {}
): Promise<Omit<ProviderLoginReport, 'provider'>> {
  const [cli, keychain] = await Promise.all([
    resolveClaudeCli(true, candidates),
    keychainAccess(candidates.security)
  ])
  const exit = (code: number | null) => (code === null ? 'did not run' : `exit ${code}`)
  const used =
    cli.source === 'installed' ? cli.installed.find((c) => c.path === cli.executable) : undefined
  const auth = used?.auth ?? cli.bundled.auth
  const path = used?.path ?? cli.bundled.path
  const env = process.env
  const lines = [
    `Bundled Claude CLI${cli.bundled.path ? ` (${cli.bundled.path})` : ''}: ${describe(cli.bundled.auth)}`,
    ...cli.installed.map((c) => `Installed ${c.path}: ${describe(c.auth)}`),
    ...(cli.installed.length || cli.bundled.auth.loggedIn
      ? []
      : ['No installed claude CLI found.']),
    `Chats use: ${cli.source === 'installed' ? cli.executable : 'the bundled CLI'}`,
    `Keychain in this helper: security list-keychains ${exit(keychain.listKeychains)}; security default-keychain ${exit(keychain.defaultKeychain)}${
      keychain.listKeychains === 0 && keychain.defaultKeychain === 0
        ? ''
        : ' (no user keychain: a login kept in the Keychain cannot be read here)'
    }`,
    `Subscription token from Settings: ${env.CLAUDE_CODE_OAUTH_TOKEN ? 'set' : 'not set'}`,
    `ANTHROPIC_API_KEY: ${env.ANTHROPIC_API_KEY ? 'set' : 'not set'}; CLAUDE_CONFIG_DIR: ${env.CLAUDE_CONFIG_DIR || 'default (~/.claude)'}`,
    `USER: ${env.USER || 'missing'}; HOME: ${env.HOME || 'missing'}; cwd: ${process.cwd()}`,
    `PATH: ${env.PATH || 'missing'}`
  ]
  return {
    loggedIn: auth.loggedIn,
    source: cli.source,
    ...(path ? { executable: path } : {}),
    ...(auth.authMethod ? { authMethod: auth.authMethod } : {}),
    token: !!env.CLAUDE_CODE_OAUTH_TOKEN,
    keychain,
    detail: lines.join('\n').slice(0, 4000)
  }
}

/** A turn the CLI answered with its own "not signed in" message, not the model. */
export function isAuthFailure(message: {
  error?: unknown
  message?: { model?: unknown; content?: unknown }
}): boolean {
  if (message.error === 'authentication_failed' || message.error === 'oauth_org_not_allowed')
    return true
  if (message.message?.model !== '<synthetic>' || !Array.isArray(message.message.content))
    return false
  const text = message.message.content
    .map((block: { type?: string; text?: string }) =>
      block?.type === 'text' ? (block.text ?? '') : ''
    )
    .join(' ')
  return /not logged in|invalid api key|please run \/login|oauth token (has )?expired|authentication_error/i.test(
    text
  )
}

/** `/login` and `/logout` need Claude's interactive terminal UI, which the SDK does not have. */
export function isLoginCommand(text: string): boolean {
  return /^\/(login|logout)(\s|$)/i.test(text.trim())
}

export const LOGIN_COMMAND_MESSAGE =
  'Claude’s /login needs a terminal, so it cannot run inside a Trezi chat.'
