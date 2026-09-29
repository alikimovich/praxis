// LKM-102 provider data: the Swift provider owner (compiled fixture, `ProviderData.swift`)
// against its rollback twins, and a v10 connection end to end. No provider SDK, no
// network, no Keychain: a scripted stand-in for `TreziHost --crypto`, a fake `codex`
// binary and a fake Codex SDK.
// - connections: the same saves and removes write byte-identical `providers.json` on both
//   writers (key kept on a path edit, dropped on an origin change, a corrupt file kept as
//   `.corrupt`); refusals carry the same messages and never the key;
// - catalog: the same lists write a byte-identical `model-catalog.json`;
// - probe: `codex debug models` through the owner parses like `discoverCodexModels`;
// - in-process: a connection chat resolves its key and runs in Bun, never in a helper,
//   with the helper opt-in off and on, and on the legacy owner.
import { mock } from 'bun:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileProviderFixture, startProviderFixture } from './helpers/provider-fixture.mjs'

// A fake Codex SDK: records how it was aimed and answers one turn.
const aimed = []
class FakeCodex {
  constructor(options) { aimed.push(options) }
  startThread() {
    return {
      id: null,
      runStreamed: async () => ({ events: (async function* () {
        yield { type: 'thread.started', thread_id: 'fake-thread' }
        yield { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'hello from the connection' } }
        yield { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }
      })() })
    }
  }
}
mock.module('@openai/codex-sdk', () => ({ Codex: FakeCodex }))
mock.module('../src/main/backends/codex-mcp.ts', () => ({ treziMcpConfig: () => ({ mcp_servers: {} }), verifyTreziMcp: async () => {} }))
mock.module('../src/main/trezi-agent-tools.ts', () => ({
  registerTreziAgentTools: async () => ({ socketPath: '/nowhere', token: 'fake', dispose() {} }),
  shutdownTreziAgentTools: async () => {}
}))

const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'trezi-provider-data-')))
const CRYPTO = join(root, 'test/fixtures/provider-owner/fake-crypto.mjs')
const fixtures = new Set()
let count = 0
const profile = name => { const path = join(scratch, `p-${name}-${++count}`); mkdirSync(join(path, 'trezi'), { recursive: true }); return path }
const only = process.env.PROVIDER_DATA_ONLY?.split(',')
async function section(name, run) { if (only && !only.includes(name)) return; await run(); console.log(`PROVIDER-DATA ${name} PASS`) }
const outcome = promise => promise.then(value => ({ ok: value }), error => ({ error: error.message }))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (condition, label, ms = 10_000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) { if (condition()) return; await sleep(10) }
  throw new Error(`Timed out: ${label}`)
}
/** An executable script (`#!<this bun>`) at `path`. */
const script = (path, source) => { writeFileSync(path, `#!${process.execPath}\n${source}`); chmodSync(path, 0o755); return path }
// The legacy cipher's blob for the same stand-in: base64 of what the helper prints.
const legacyCipher = {
  available: true,
  encrypt: plain => { if (plain.includes('locked')) throw new Error('macOS Keychain encryption unavailable; unlock the keychain and retry.'); return Buffer.from(`enc:${plain}`).toString('base64') },
  decrypt: blob => { const bytes = Buffer.from(blob, 'base64'); return bytes.subarray(0, 4).toString() === 'enc:' ? bytes.subarray(4).toString() : null }
}

const { createProviderStore } = await import('../src/main/providers-store.ts')
const { createModelCatalog, parseCodexModels } = await import('../src/main/model-catalog.ts')
const { setProviderDataOwner, setProviderDataDir } = await import('../src/main/provider-data.ts')
const { setProviderOwner, providerOwner } = await import('../src/main/provider-owner.ts')
const { legacyProviders } = await import('../src/main/provider-model.ts')
const { pickProvider } = await import('../src/main/backends/index.ts')
const { startProviderSession } = await import('../src/main/provider-sessions.ts')
const { resolveConnection } = await import('../src/main/providers.ts')

async function fixture(home, env = {}) {
  const started = await startProviderFixture(binary, home, { PROVIDER_CRYPTO: `${process.execPath}\u001f${CRYPTO}`, ...env })
  fixtures.add(started)
  return started
}
let binary
try {
  binary = compileProviderFixture()

  await section('connections', async () => {
    const legacyHome = profile('legacy'), swiftHome = profile('swift')
    const legacy = createProviderStore(join(legacyHome, 'trezi'), legacyCipher)
    const f = await fixture(swiftHome)
    const swift = f.owner().data
    const file = home => join(home, 'trezi/providers.json')
    const same = async (label, legacyRun, swiftRun) => {
      const a = await outcome(Promise.resolve().then(legacyRun)), b = await outcome(swiftRun())
      assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), `${label}: same answer`)
      assert.equal(existsSync(file(swiftHome)), existsSync(file(legacyHome)), `${label}: same file presence`)
      if (existsSync(file(legacyHome))) assert.equal(readFileSync(file(swiftHome), 'utf8'), readFileSync(file(legacyHome), 'utf8'), `${label}: byte-identical providers.json`)
      return b
    }
    const saves = [
      ['create', { id: 'gw', label: ' AI Gateway ', baseUrl: ' https://ai-gateway.vercel.sh/v1// ', apiKey: ' sk-one ', models: ['kimi', ' kimi', 'deepseek', 3, ''] }],
      ['keyless', { id: 'groq', label: 'Groq', preset: 'custom', baseUrl: 'https://api.groq.com/openai/v1', models: [] }],
      ['path edit keeps the key', { id: 'gw', label: 'Gateway (work)', baseUrl: 'https://ai-gateway.vercel.sh/v1beta', models: ['a'] }],
      ['blank key keeps the key', { id: 'gw', label: 'Gateway (work)', baseUrl: 'https://ai-gateway.vercel.sh/v1beta', apiKey: '   ', models: ['a'] }],
      ['a key for a keyless one', { id: 'groq', label: 'Groq', preset: 'custom', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk-two' }],
      ['origin change drops the key', { id: 'groq', label: 'Groq', preset: 'custom', baseUrl: 'https://attacker.example/v1' }],
      ['port change drops the key', { id: 'gw', label: 'Gateway (work)', baseUrl: 'https://ai-gateway.vercel.sh:444/v1' }],
      ['unicode label', { id: 'local', label: 'Local ✨  ', preset: 'custom', baseUrl: 'http://127.0.0.1:1234/v1/', apiKey: 'lk' }]
    ]
    for (const [label, input] of saves) await same(label, () => legacy.save(input), () => swift.save(input))
    for (const id of ['gw', 'groq', 'local', 'missing', '../x']) {
      assert.equal(await swift.secretFor(id), legacy.secretFor(id), `secret ${id}`)
    }
    assert.equal(await swift.secretFor('local'), 'lk')
    assert.equal(await swift.secretFor('gw'), null, 'the key did not follow the port change')
    // Refusals: same message, never the key.
    for (const [label, input] of [
      ['no label', { label: '  ', baseUrl: 'https://x.example' }],
      ['no url', { label: 'X', baseUrl: ' / ' }],
      ['unsafe id', { id: '../etc', label: 'X', baseUrl: 'https://x.example' }],
      ['locked keychain', { id: 'gw', label: 'X', baseUrl: 'https://x.example', apiKey: 'sk-locked-secret' }]
    ]) {
      const answer = await same(label, () => legacy.save(input), () => swift.save(input))
      assert.ok(answer.error, `${label} refused`)
      assert.ok(!answer.error.includes('sk-locked-secret'), `${label}: the key is not in the error`)
    }
    await same('remove unknown', () => legacy.remove('missing'), () => swift.remove('missing'))
    await same('remove', () => legacy.remove('groq'), () => swift.remove('groq'))
    // The file Swift wrote reads the same through Bun's reader (what providers.ts lists).
    assert.deepEqual(createProviderStore(join(swiftHome, 'trezi'), legacyCipher).list(), legacy.list())
    // A file neither can parse is kept beside the new one, never overwritten.
    for (const home of [legacyHome, swiftHome]) writeFileSync(file(home), '{"connections": nope')
    await same('corrupt', () => legacy.save({ id: 'n', label: 'N', baseUrl: 'https://n.example' }), () => swift.save({ id: 'n', label: 'N', baseUrl: 'https://n.example' }))
    assert.equal(readFileSync(`${file(swiftHome)}.corrupt`, 'utf8'), '{"connections": nope')
    assert.equal(readFileSync(`${file(legacyHome)}.corrupt`, 'utf8'), '{"connections": nope')
    // Without a credential store a key is refused, never written in plain text.
    const bare = profile('bare')
    const g = await startProviderFixture(binary, bare, { PROVIDER_CRYPTO: '' })
    fixtures.add(g)
    const refused = await outcome(g.owner().data.save({ label: 'X', baseUrl: 'https://x.example', apiKey: 'sk-plain' }))
    assert.equal(refused.error, (await outcome(Promise.resolve().then(() => createProviderStore(join(bare, 'legacy'), { ...legacyCipher, available: false })
      .save({ label: 'X', baseUrl: 'https://x.example', apiKey: 'sk-plain' })))).error)
    assert.ok(!existsSync(file(bare)))
    // A write before the service aliased an older session store would split it: refused.
    const older = join(scratch, 'older'); mkdirSync(join(older, 'praxis'), { recursive: true })
    const h = await startProviderFixture(binary, older, {})
    fixtures.add(h)
    const early = await outcome(h.owner().data.save({ label: 'X', baseUrl: 'https://x.example' }))
    assert.equal(early.error, "Trezi's session store is not ready yet.")
    assert.ok(!existsSync(join(older, 'trezi')))
    for (const started of [f, g, h]) { await started.stop(); fixtures.delete(started) }
  })

  await section('catalog', async () => {
    const legacyHome = profile('catalog-legacy'), swiftHome = profile('catalog-swift')
    const seed = JSON.stringify({ version: 1, entries: { claude: { at: 5, models: [{ id: 'x' }] }, codex: { at: 7, models: [{ id: 'old', label: 'Old' }] }, other: {} } })
    for (const home of [legacyHome, swiftHome]) writeFileSync(join(home, 'trezi/model-catalog.json'), seed)
    const legacy = createModelCatalog({ baseDir: join(legacyHome, 'trezi'), now: () => 1234 })
    const f = await fixture(swiftHome, { PROVIDER_NOW: '1234' })
    const swift = f.owner().data
    const read = home => readFileSync(join(home, 'trezi/model-catalog.json'), 'utf8')
    const steps = [['claude', [{ id: 'default', label: 'Default (recommended)' }, { id: 'claude-fable-5', label: 'Fable 5 "quoted" ✨' }]],
      ['codex', [{ id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' }]], ['codex', []], ['claude', [{ id: 'opus', label: 'Opus' }]]]
    for (const [backend, models] of steps) {
      legacy.set(backend, models)
      assert.equal(await swift.saveCatalog(backend, models), models.length > 0, `${backend} saved`)
      assert.equal(read(swiftHome), read(legacyHome), `byte-identical after ${backend} (${models.length})`)
    }
    // Bun's reader, handed the Swift writer (`persist`), keeps serving from memory.
    const taken = []
    const routed = createModelCatalog({ baseDir: join(swiftHome, 'trezi'), now: () => 1234, persist: (backend, models) => { taken.push([backend, models]); return true } })
    const before = read(swiftHome)
    routed.set('codex', [{ id: 'm', label: 'M' }])
    assert.deepEqual(routed.get('codex'), [{ id: 'm', label: 'M' }])
    assert.deepEqual(taken, [['codex', [{ id: 'm', label: 'M' }]]])
    assert.equal(read(swiftHome), before, 'the Bun twin did not write')
    assert.equal((await f.frame('catalogSave', { backend: 'gemini', models: [] })).payload.code, 'invalidRequest')
    assert.equal((await f.frame('catalogSave', { backend: 'codex', models: [{ id: 1, label: 'x' }] })).payload.code, 'invalidRequest')
    await f.stop(); fixtures.delete(f)
  })

  await section('probe', async () => {
    const payload = { models: [{ slug: 'gpt-b', display_name: 'B', visibility: 'list', priority: 2 },
      { slug: 'hidden', visibility: 'hide', priority: 0 }, { slug: 'gpt-a', visibility: 'list', priority: 1 }] }
    const good = script(join(scratch, 'codex-good'), `if (process.argv.slice(2).join(' ') !== 'debug models') process.exit(2)\nprocess.stdout.write(${JSON.stringify(JSON.stringify(payload))})\n`)
    const bad = script(join(scratch, 'codex-bad'), 'process.stdout.write("not json")\n')
    const f = await fixture(profile('probe'), { TREZI_CODEX_BIN: good })
    assert.deepEqual(await f.owner().data.codexModels(), parseCodexModels(payload))
    assert.deepEqual((await f.owner().data.codexModels()).map(m => m.id), ['gpt-a', 'gpt-b'])
    const g = await fixture(profile('probe-bad'), { TREZI_CODEX_BIN: bad })
    assert.deepEqual(await g.owner().data.codexModels(), [])
    const h = await fixture(profile('probe-missing'), { TREZI_CODEX_BIN: join(scratch, 'no-such-codex') })
    assert.deepEqual(await h.owner().data.codexModels(), [])
    for (const started of [f, g, h]) { await started.stop(); fixtures.delete(started) }
  })

  await section('in-process', async () => {
    // A connection chat on the Swift owner, with the helper opt-in off and on, and on the
    // legacy owner: the key is resolved in Bun and the adapter runs in-process.
    const WT = join(scratch, 'wt'), LIVE = join(scratch, 'live')
    mkdirSync(WT, { recursive: true }); mkdirSync(LIVE, { recursive: true })
    const saved = { ...process.env }
    process.env.CODEX_HOME = join(scratch, 'codex-home')
    process.env.TREZI_NATIVE_HOST = script(join(scratch, 'trezi-host'), readFileSync(CRYPTO, 'utf8'))
    try {
      for (const mode of ['swift', 'swift+helpers', 'legacy']) {
        const home = profile(`chat-${mode}`)
        setProviderDataDir(() => join(home, 'trezi'))
        let f = null
        if (mode === 'legacy') {
          delete process.env.TREZI_SERVICE_SUPERVISED
          delete process.env.TREZI_PROVIDER_HELPERS
          setProviderOwner(legacyProviders({ profile: home }))
          setProviderDataOwner(null)
        } else {
          process.env.TREZI_SERVICE_SUPERVISED = '1'
          if (mode === 'swift+helpers') process.env.TREZI_PROVIDER_HELPERS = '1'; else delete process.env.TREZI_PROVIDER_HELPERS
          f = await fixture(home)
          const owner = f.owner()
          setProviderOwner(owner)
          setProviderDataOwner(owner.data)
        }
        // Saved through the store the settings dialog uses (providers:save).
        const { connectionStore } = await import('../src/main/provider-data.ts')
        const conn = await connectionStore.save({ id: 'fake-conn', label: 'Fake', preset: 'custom', baseUrl: 'https://fake.example/v1', apiKey: 'sk-fake-connection', models: ['fake-model'] })
        assert.equal(conn.hasKey, true)
        assert.ok(!readFileSync(join(home, 'trezi/providers.json'), 'utf8').includes('sk-fake-connection'), `${mode}: no plaintext key on disk`)
        assert.deepEqual(await resolveConnection('fake-conn'), { baseUrl: 'https://fake.example/v1', apiKey: 'sk-fake-connection', wireApi: 'responses' })
        const options = { provider: 'claude', connectionId: 'fake-conn', model: 'fake-model' }
        const provider = pickProvider(options)
        assert.notEqual(provider.host, 'helper', `${mode}: a connection is never helper-hosted`)
        assert.equal(provider.id, 'codex', `${mode}: a connection runs on the Codex harness`)
        if (mode === 'swift+helpers') assert.equal(pickProvider({ provider: 'codex' }).host, 'helper', 'the opt-in is on')
        const events = []
        aimed.length = 0
        const session = await startProviderSession(provider, WT, options, () => null, { emitKey: `chat-${mode}`, liveRoot: LIVE, onEvent: e => events.push(e) })
        session.send('hi')
        await until(() => events.some(e => e.type === 'done'), `${mode} turn`)
        assert.equal(events.filter(e => e.type === 'delta').map(e => e.text).join(''), 'hello from the connection')
        assert.ok(!events.some(e => e.type === 'error'), `${mode}: ${JSON.stringify(events)}`)
        assert.equal(aimed.length, 1)
        assert.equal(aimed[0].apiKey, 'sk-fake-connection', `${mode}: the key reached the in-process SDK`)
        assert.equal(Object.values(aimed[0].config.model_providers)[0].base_url, 'https://fake.example/v1')
        assert.ok(!JSON.stringify(events).includes('sk-fake-connection'), `${mode}: the key is never emitted`)
        const sessions = (await providerOwner().snapshot()).sessions
        assert.equal(sessions.length, 1)
        assert.equal(sessions[0].host, 'bun', `${mode}: the owner sees an in-process session`)
        session.shutdown()
        await sleep(50)
        if (f) { await f.stop(); fixtures.delete(f) }
      }
    } finally {
      setProviderOwner(null)
      setProviderDataOwner(null)
      for (const key of ['CODEX_HOME', 'TREZI_NATIVE_HOST', 'TREZI_SERVICE_SUPERVISED', 'TREZI_PROVIDER_HELPERS']) {
        if (key in saved) process.env[key] = saved[key]; else delete process.env[key]
      }
    }
  })

  console.log('Provider data: connections, catalog and probe parity with the rollback twins, and in-process connection chats passed; no provider calls')
} finally {
  for (const started of fixtures) await started.kill().catch(() => {})
  rmSync(scratch, { recursive: true, force: true })
}
