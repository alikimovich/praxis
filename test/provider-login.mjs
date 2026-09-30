// LKM-119, Claude seat login and stuck turns, without a provider SDK, network or real
// credential: the real Swift ProviderOwner (compiled fixture) with the scripted fake
// provider in the real helper host (also hosted as `claude`), and stand-in `claude` CLIs.
// - silent: a turn with no first event ends with the visible error (code no-response),
//   the helper is stopped, and the next message starts a new helper;
// - auth: a CLI "Not logged in" / "Invalid API key" reply is an `auth` error, never
//   assistant text; an unknown error code is a grant violation; a crash is visible;
// - token: the subscription token is saved encrypted, reaches only a Claude helper as
//   CLAUDE_CODE_OAUTH_TOKEN, and never comes back in a reply, an event or a report;
// - diagnose: "Check provider login" through the helper path, with missing and invalid
//   auth, an installed CLI that is logged in, and a provider with no check;
// - card: the chat's login card (steps, Check login, Retry) and the pure classifiers.
import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  installedClaudes,
  isAuthFailure,
  isLoginCommand,
  parseAuthStatus
} from '../src/main/backends/claude-login.ts'
import { helperProvider } from '../src/main/backends/helper-session.ts'
import { setProviderOwner } from '../src/main/provider-owner.ts'
import { loginAction } from '../src/native/chat-login.ts'
import { snapshot } from '../src/native/chat-snapshot.ts'
import { newChat, reduce } from '../src/native/chat-state.ts'
import { compileProviderFixture, startProviderFixture } from './helpers/provider-fixture.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'trezi-provider-login-')))
const CRYPTO = join(root, 'test/fixtures/provider-owner/fake-crypto.mjs')
const CLAUDE_MESSAGE = 'Claude did not respond — check login (claude auth status) and retry'
const TOKEN = 'sk-ant-oat01-fake-subscription-token'
const fixtures = new Set()
let count = 0
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (condition, label, ms = 10_000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (condition()) return
    await sleep(10)
  }
  throw new Error(`Timed out: ${label}`)
}
const WT = join(scratch, 'wt'),
  LIVE = join(scratch, 'app'),
  BIN = join(scratch, 'bin')
for (const dir of [WT, LIVE, BIN]) mkdirSync(dir)
/** A stand-in `claude` CLI answering `auth status --json`. */
const cli = (name, script) => {
  const path = join(BIN, name)
  writeFileSync(path, `#!/bin/sh\n${script}\n`)
  chmodSync(path, 0o755)
  return path
}
const loggedOut = cli('logged-out', `echo '{"loggedIn":false,"authMethod":"none"}'; exit 1`)
const loggedIn = cli('logged-in', `echo '{"loggedIn":true,"authMethod":"claude.ai"}'`)
const invalid = cli('invalid', `echo 'Invalid API key · Please run /login' >&2; exit 1`)

async function fixture(env = {}) {
  const home = join(scratch, `p-${++count}`)
  mkdirSync(home)
  const started = await startProviderFixture(compileProviderFixture(), home, {
    PROVIDER_HELPER_PROVIDERS: 'fake,claude',
    PROVIDER_CRYPTO: `${process.execPath}\u001f${CRYPTO}`,
    ...env
  })
  fixtures.add(started)
  const owner = started.owner()
  setProviderOwner(owner)
  // Everything the owner said to Bun, to check that the token never crosses the pipe.
  const said = []
  started.link.on('service-reply', (message) => said.push(JSON.stringify(message)))
  started.link.on('service-event', (message) => said.push(JSON.stringify(message)))
  return { f: started, owner, said, home }
}
async function stop({ f }) {
  await f.stop()
  fixtures.delete(f)
}

async function chat(provider = 'fake') {
  const events = []
  const s = await helperProvider(provider).startSession(WT, { model: 'm1' }, () => null, {
    emitKey: 'chat-1',
    liveRoot: LIVE,
    onEvent: (e) => events.push(e)
  })
  const turn = async (text) => {
    const start = events.length
    s.send(text)
    await until(() => events.slice(start).some((e) => e.type === 'done'), `turn ${text}`)
    return events.slice(start)
  }
  const delta = (list) =>
    list
      .filter((e) => e.type === 'delta')
      .map((e) => e.text)
      .join('')
  return { s, events, turn, delta }
}

try {
  // A turn that produces nothing ends on the first-event deadline; one that is heard does not.
  {
    const run = await fixture({ PROVIDER_FIRST_EVENT: '0.5' })
    const c = await chat('claude')
    const started = Date.now()
    const silent = await c.turn('hang')
    assert.ok(Date.now() - started >= 450, 'the owner waited for its deadline')
    assert.deepEqual(
      silent.map((e) => [e.type, e.code]),
      [
        ['error', 'no-response'],
        ['done', undefined]
      ]
    )
    assert.equal(silent[0].message, CLAUDE_MESSAGE)
    await sleep(100)
    assert.equal(c.events.filter((e) => e.type === 'done').length, 1, 'the turn ended once')
    // Its helper was stopped; the next message starts a new one on the same chat.
    const stopped = async () => (await run.f.cmd({ cmd: 'journal' })).groups.length === 0
    for (let i = 0; i < 100 && !(await stopped()); i++) await sleep(50)
    assert.ok(await stopped(), 'the silent helper was stopped')
    await sleep(100)
    assert.equal(c.delta(await c.turn('say back again')), 'back again')
    // A turn that is heard (an approval card) is not cut off while the user decides.
    const asked = c.turn('ask Bash make')
    await until(() => c.events.some((e) => e.type === 'permission-request'), 'card')
    await sleep(800)
    const id = c.events.find((e) => e.type === 'permission-request').request.id
    c.s.pending.get(id).settle('allow')
    assert.equal(c.delta(await asked), 'permission allow')
    // The fake provider gets the generic message.
    const fake = await chat()
    const generic = await fake.turn('hang')
    assert.equal(generic[0].message, 'The provider did not respond — check its login and retry')
    c.s.shutdown()
    fake.s.shutdown()
    await stop(run)
    console.log('PROVIDER-LOGIN silent PASS')
  }

  // Sign-in failures are errors with a code; an unknown code breaks the grant; a crash is visible.
  {
    const run = await fixture()
    const c = await chat('claude')
    for (const text of [
      'Not logged in · Please run /login',
      'Invalid API key · Please run /login'
    ]) {
      const events = await c.turn(`auth ${text}`)
      assert.deepEqual(
        events.map((e) => [e.type, e.code]),
        [
          ['error', 'auth'],
          ['done', undefined]
        ],
        text
      )
      assert.equal(events[0].message, text)
      assert.ok(!events.some((e) => e.type === 'delta'), `${text}: not assistant text`)
    }
    assert.equal(c.delta(await c.turn('auth Hello from the model')), 'Hello from the model')
    const crash = await c.turn('crash')
    assert.deepEqual(
      crash.map((e) => e.type),
      ['error', 'done']
    )
    assert.match(crash[0].message, /stopped unexpectedly \(status 7\)\. Send your message again to continue\./)
    await sleep(200)
    assert.equal(
      c.delta(await c.turn('say after the crash')),
      'after the crash',
      'a crashed helper is replaced on the next message'
    )
    const forged = await c.turn(
      `forge ${JSON.stringify({ type: 'event', event: { type: 'error', message: 'x', code: 'bogus' } })}`
    )
    assert.deepEqual(
      forged.map((e) => e.type),
      ['error', 'done']
    )
    assert.match(forged[0].message, /broke its grant/)
    assert.ok(
      (await run.owner.status()).violations.some((v) => /error code/.test(v.reason)),
      JSON.stringify((await run.owner.status()).violations)
    )
    await sleep(200)
    assert.match(
      (await c.turn('say still there?'))[0].message,
      /not running \(violation\)/,
      'a helper that broke its grant is not restarted'
    )
    c.s.shutdown()
    await stop(run)
    console.log('PROVIDER-LOGIN auth PASS')
  }

  // The subscription token: encrypted at rest, only in a Claude helper, never echoed.
  {
    const run = await fixture({ CLAUDE_TEST_BUNDLED: loggedOut })
    const data = run.owner.data
    assert.deepEqual(await data.seatTokenStatus(), { claude: { hasToken: false } })
    await assert.rejects(data.saveSeatToken('claude', 'two words'), /setup-token/)
    await assert.rejects(
      data.saveSeatToken('codex', TOKEN),
      (error) => error.code === 'invalidRequest'
    )
    assert.equal(await data.saveSeatToken('claude', `  ${TOKEN}\n`), true)
    assert.deepEqual(await data.seatTokenStatus(), { claude: { hasToken: true } })
    const file = readFileSync(join(run.home, 'trezi/seat-tokens.json'), 'utf8')
    assert.ok(!file.includes(TOKEN), 'the file holds ciphertext only')
    const names = async (provider) => {
      const c = await chat(provider)
      const report = JSON.parse(c.delta(await c.turn('env')).slice(4))
      c.s.shutdown()
      return report.names
    }
    assert.ok(
      (await names('claude')).includes('CLAUDE_CODE_OAUTH_TOKEN'),
      'a Claude helper gets the token'
    )
    const fake = await names('fake')
    assert.ok(
      !fake.includes('CLAUDE_CODE_OAUTH_TOKEN') &&
        !fake.some((n) => n.startsWith('TREZI_') && n !== 'TREZI_PROVIDER_HELPER'),
      'no other helper does'
    )
    const report = await data.checkLogin('claude', WT)
    assert.equal(report.token, true)
    assert.match(report.detail, /Subscription token from Settings: set/)
    // A report that would carry the token is refused, not relayed.
    await stop(run)
    const leak = await fixture({
      CLAUDE_TEST_BUNDLED: loggedOut,
      CLAUDE_CONFIG_DIR: `/tmp/${TOKEN}`
    })
    assert.equal(await leak.owner.data.saveSeatToken('claude', TOKEN), true)
    await assert.rejects(leak.owner.data.checkLogin('claude', WT), /malformed login report/)
    for (const said of [run.said, leak.said])
      assert.ok(!said.some((line) => line.includes(TOKEN)), 'the token never crosses the pipe')
    assert.ok(
      !run.f.stderr.includes(TOKEN) && !leak.f.stderr.includes(TOKEN),
      'nor the service log'
    )
    assert.equal(
      await leak.owner.data.saveSeatToken('claude', ''),
      false,
      'an empty token removes it'
    )
    assert.deepEqual(await leak.owner.data.seatTokenStatus(), { claude: { hasToken: false } })
    await stop(leak)
    console.log('PROVIDER-LOGIN token PASS')
  }

  // "Check provider login" through the helper path.
  {
    const check = async (env, provider = 'claude') => {
      const run = await fixture(env)
      try {
        return await run.owner.data.checkLogin(provider, WT)
      } finally {
        await stop(run)
      }
    }
    const missing = await check({ CLAUDE_TEST_BUNDLED: loggedOut })
    assert.equal(missing.provider, 'claude')
    assert.equal(missing.loggedIn, false)
    assert.equal(missing.source, 'bundled')
    assert.equal(missing.token, false)
    assert.match(missing.detail, /Bundled Claude CLI .*: not logged in/)
    assert.match(missing.detail, /No installed claude CLI found/)
    assert.match(missing.detail, new RegExp(`cwd: ${WT}`), 'the helper runs in the chat root')
    const bad = await check({ CLAUDE_TEST_BUNDLED: invalid })
    assert.equal(bad.loggedIn, null)
    assert.match(bad.detail, /unknown \(Command failed/)
    const installed = await check({
      CLAUDE_TEST_BUNDLED: loggedOut,
      CLAUDE_TEST_INSTALLED: `${invalid}:${loggedIn}`
    })
    assert.deepEqual(
      [installed.loggedIn, installed.source, installed.executable, installed.authMethod],
      [true, 'installed', loggedIn, 'claude.ai']
    )
    assert.match(installed.detail, new RegExp(`Chats use: ${loggedIn}`))
    const none = await check({}, 'fake')
    assert.deepEqual([none.provider, none.loggedIn], ['fake', null])
    assert.match(none.detail, /no login check/)
    const run = await fixture()
    await assert.rejects(
      run.owner.data.checkLogin('codex', WT),
      (error) => error.code === 'unauthorized'
    )
    await stop(run)
    console.log('PROVIDER-LOGIN diagnose PASS')
  }

  // The chat's login card, and the classifiers the helper uses.
  {
    const c = newChat('chat-1')
    c.settings = { ...c.settings, provider: 'claude' }
    c.root = WT
    c.isRunning = true
    c.messages.push({ id: 'u', role: 'user', at: 1, text: 'hi', statuses: [], segments: [] })
    c.streamingId = 'a'
    c.messages.push({ id: 'a', role: 'assistant', at: 1, text: '', statuses: [], segments: [] })
    c.last = { id: 't1', text: 'hi', attachments: [], selection: null, turn: {} }
    reduce(c, { type: 'error', code: 'auth', message: 'Not logged in · Please run /login' })
    reduce(c, { type: 'done' })
    assert.equal(c.isRunning, false)
    assert.deepEqual(
      c.messages.map((m) => m.id),
      ['u'],
      'no warning text and no empty reply'
    )
    let card = snapshot(c, []).cards.find((x) => x.id === 'login')
    assert.equal(card.title, 'Not logged in to Claude')
    assert.match(card.detail, /Not logged in · Please run \/login/)
    assert.match(card.detail, /claude auth login/)
    assert.match(card.detail, /claude setup-token.*Settings → AI providers → Claude/)
    assert.deepEqual(
      card.actions.map((a) => [a.action, !!a.disabled]),
      [
        ['login-dismiss', false],
        ['login-check', false],
        ['login-retry', false]
      ]
    )
    const calls = [],
      runs = []
    const controller = {
      services: {
        invoke: async (channel, ...args) => {
          calls.push([channel, ...args])
          return channel === 'providers:check-login'
            ? { provider: 'claude', loggedIn: false, detail: 'Bundled Claude CLI: not logged in' }
            : { ok: true }
        }
      },
      changed: () => {},
      run: async (_chat, submission) => {
        runs.push(submission)
      }
    }
    await loginAction(controller, c, 'login-check')
    assert.deepEqual(calls.at(-1), ['providers:check-login', 'claude', WT])
    card = snapshot(c, []).cards.find((x) => x.id === 'login')
    assert.match(card.detail, /Not logged in\.\nBundled Claude CLI: not logged in/)
    await loginAction(controller, c, 'login-retry')
    assert.equal(calls.at(-1)[0], 'agent:restart-chat', 'Retry starts a fresh session first')
    assert.equal(runs.length, 1)
    assert.equal(runs[0].text, 'hi')
    assert.notEqual(runs[0].id, 't1')
    assert.equal(c.login, undefined)
    reduce(c, { type: 'error', code: 'no-response', message: CLAUDE_MESSAGE })
    assert.equal(
      snapshot(c, []).cards.find((x) => x.id === 'login').title,
      'Claude did not respond'
    )
    await loginAction(controller, c, 'login-dismiss')
    assert.equal(
      snapshot(c, []).cards.some((x) => x.id === 'login'),
      false
    )
    // Other errors keep the warning text.
    c.isRunning = true
    reduce(c, { type: 'error', message: 'boom' })
    assert.match(c.messages.at(-1).text, /⚠️ boom/)

    assert.ok(
      isLoginCommand('/login') &&
        isLoginCommand('  /logout now') &&
        !isLoginCommand('/loginx') &&
        !isLoginCommand('please /login')
    )
    assert.ok(isAuthFailure({ error: 'authentication_failed', message: { content: [] } }))
    assert.ok(
      isAuthFailure({
        message: {
          model: '<synthetic>',
          content: [{ type: 'text', text: 'OAuth token has expired' }]
        }
      })
    )
    assert.ok(
      !isAuthFailure({
        message: { model: 'claude-opus', content: [{ type: 'text', text: 'Not logged in' }] }
      }),
      'the model saying it is not an auth failure'
    )
    assert.deepEqual(parseAuthStatus('{"loggedIn":true,"authMethod":"claude.ai","email":"x"}\n'), {
      loggedIn: true,
      authMethod: 'claude.ai'
    })
    assert.equal(parseAuthStatus('Not JSON'), null)
    assert.deepEqual(
      installedClaudes({ PATH: `${BIN}:${BIN}`, HOME: scratch }, loggedOut).filter((p) =>
        p.startsWith(BIN)
      ),
      []
    )
    const bin2 = join(scratch, 'bin2')
    mkdirSync(bin2)
    writeFileSync(join(bin2, 'claude'), '#!/bin/sh\n')
    chmodSync(join(bin2, 'claude'), 0o755)
    assert.deepEqual(
      installedClaudes({ PATH: `${bin2}:${bin2}`, HOME: scratch }, loggedOut).filter((p) =>
        p.startsWith(scratch)
      ),
      [join(bin2, 'claude')]
    )
    console.log('PROVIDER-LOGIN card PASS')
  }
} finally {
  for (const f of fixtures) await f.kill()
  rmSync(scratch, { recursive: true, force: true })
}
