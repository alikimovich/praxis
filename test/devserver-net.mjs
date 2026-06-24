/**
 * Unit test for the dev-server networking helpers (no Electron / no real
 * sockets — findRunningServer takes an injectable probe). Run via bun so the
 * .ts import transpiles: bun run test:devnet
 */
import assert from 'node:assert'
import {
  defaultPorts,
  findRunningServer,
  hostVariants,
  normalizeUrl
} from '../src/main/devserver-net.ts'

// hostVariants: localhost-ish URLs expand to concrete hosts, IPv4 first.
assert.deepEqual(hostVariants('http://localhost:5174/'), [
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://[::1]:5174'
])
assert.deepEqual(hostVariants('http://[::1]:5174'), [
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://[::1]:5174'
])
assert.deepEqual(hostVariants('http://127.0.0.1:5173/app'), [
  'http://127.0.0.1:5173/app',
  'http://localhost:5173/app',
  'http://[::1]:5173/app'
])
// Non-local hosts are left alone.
assert.deepEqual(hostVariants('http://example.com:3000'), ['http://example.com:3000'])

// defaultPorts: only known frameworks have a guess; unknown → none.
assert.deepEqual(defaultPorts('sveltekit'), [5173])
assert.deepEqual(defaultPorts('vite'), [5173])
assert.deepEqual(defaultPorts('next'), [3000])
assert.deepEqual(defaultPorts('cra'), [3000])
assert.deepEqual(defaultPorts('unknown'), [])
assert.deepEqual(defaultPorts(undefined), [])

assert.equal(normalizeUrl('http://0.0.0.0:5173/'), 'http://localhost:5173')

// Attach: prefer a healthy IPv4 server.
assert.equal(
  await findRunningServer('sveltekit', async (u) => (u === 'http://127.0.0.1:5173' ? 200 : null)),
  'http://127.0.0.1:5173'
)
// Fall back to IPv6 when only it answers (the bug that broke lkmv.ch).
assert.equal(
  await findRunningServer('sveltekit', async (u) => (u === 'http://[::1]:5173' ? 200 : null)),
  'http://[::1]:5173'
)
// Never attach to a broken (500) server — spawn instead.
assert.equal(await findRunningServer('sveltekit', async () => 500), null)
// Unknown framework: never probe or attach.
let probed = false
assert.equal(
  await findRunningServer('unknown', async () => {
    probed = true
    return 200
  }),
  null
)
assert.equal(probed, false, 'unknown framework must not probe')

console.log('DEVSERVER-NET OK — host variants, default ports, IPv4/IPv6 attach policy')
