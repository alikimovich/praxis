// LKM-140: measure shadow flicker on real Next.js (Webpack dev) and Vite/CSS fixtures in system WebKit.
import './with-service-owners.mjs'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { findFreePort, waitForReachable } from '../../src/main/devserver-net.ts'
import { PREVIEW_HOST, withPort } from '../../src/main/project-detect.ts'
import { spawnHostBridge } from './host-bridge.mjs'
import { NEXT_ADAPTER_CONTENT, NEXT_LOADER_CONTENT } from '../../src/main/setup-next.ts'
import { REACT_HELPER_CONTENT } from '../../src/main/setup-react.ts'
import { MDX_HELPER_CONTENT } from '../../src/main/setup-mdx.ts'
import { measureFramework } from './island-flicker-framework-core.mjs'

if (
  process.platform !== 'darwin' ||
  !existsSync('out/native/Trezi.app/Contents/MacOS/TreziHost')
) {
  console.log('ISLAND-FLICKER-FRAMEWORKS SKIP — build the macOS native host first.')
  process.exit(0)
}

async function install(cwd) {
  const installed = spawnSync('bun', ['install'], { cwd, stdio: 'pipe', timeout: 120000 })
  if (installed.status !== 0) {
    console.log(
      'ISLAND-FLICKER-FRAMEWORKS SKIP — could not install fixture dependencies:',
      (installed.stderr || installed.stdout)?.toString().slice(0, 240)
    )
    process.exit(0)
  }
}

async function withServer({ cwd, command, framework, urlPath, run }) {
  const port = await findFreePort(7777)
  const server = spawn('/bin/sh', ['-c', withPort(command, framework, port)], {
    cwd,
    detached: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      BROWSER: 'none',
      PORT: String(port),
      HOST: PREVIEW_HOST,
      HOSTNAME: PREVIEW_HOST
    }
  })
  const url = `http://${PREVIEW_HOST}:${port}${urlPath}`
  try {
    const deadline = Date.now() + 120000
    assert.ok(
      await waitForReachable([url], () => Date.now() > deadline || server.exitCode !== null),
      `dev server reachable at ${url}`
    )
    return await run(url)
  } finally {
    try {
      if (server?.pid) process.kill(-server.pid, 'SIGTERM')
    } catch {}
  }
}

async function withHost(run) {
  const host = spawnHostBridge(
    resolve('out/native/Trezi.app/Contents/MacOS/TreziHost'),
    resolve('out/native'),
    'ephemeral'
  )
  try {
    await once(host, 'ready', { signal: AbortSignal.timeout(15000) })
    host.send('visible', { view: 'preview', visible: true })
    const page = code => host.request('evaluate', { view: 'preview', code })
    async function wait(check, label = 'page') {
      for (let i = 0; i < 200; i++) {
        try {
          if (await check()) return
        } catch {}
        await Bun.sleep(100)
      }
      throw Error('timed out: ' + label)
    }
    return await run({ host, page, wait })
  } finally {
    host.send('quit')
  }
}

async function prepareNext(root) {
  await cp(resolve('test/fixtures/next-app'), root, {
    recursive: true,
    filter: p => !p.includes('node_modules') && !p.endsWith('bun.lock')
  })
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  pkg.dependencies.next = '16.3.5'
  pkg.dependencies['@next/mdx'] = '16.3.5'
  pkg.dependencies.react = '19.3.0'
  pkg.dependencies['react-dom'] = '19.3.0'
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
  await mkdir(join(root, '.trezi'), { recursive: true })
  for (const [file, text] of Object.entries({
    'trezi-next.cjs': NEXT_ADAPTER_CONTENT,
    'trezi-next-loader.cjs': NEXT_LOADER_CONTENT,
    'trezi-source.cjs': REACT_HELPER_CONTENT,
    'trezi-mdx.mjs': MDX_HELPER_CONTENT
  }))
    await writeFile(join(root, '.trezi', file), text)
  await install(root)
}

async function prepareVite(root) {
  await cp(resolve('test/fixtures/island-flicker-vite'), root, {
    recursive: true,
    filter: p => !p.includes('node_modules') && !p.endsWith('bun.lock')
  })
  await install(root)
}

const nextRoot = await mkdtemp(join(tmpdir(), 'trezi-flicker-next-'))
const viteRoot = await mkdtemp(join(tmpdir(), 'trezi-flicker-vite-'))
try {
  await prepareNext(nextRoot)
  await prepareVite(viteRoot)

  await withHost(async ({ host, page, wait }) => {
    await withServer({
      cwd: nextRoot,
      command: 'bun run dev --webpack',
      framework: 'next',
      urlPath: '/shadow-flicker',
      run: async url => {
        const open = async () => {
          host.send('load', { view: 'preview', url })
          await wait(() => page('!!document.querySelector("#shadow-phone")'))
        }
        await open()
        await measureFramework({
          label: 'next',
          page,
          waitForCard: open,
          root: nextRoot,
          sourceFile: 'app/shadow-flicker/ShadowPhone.tsx',
          component: 'ShadowPhone',
          withOverrides: false
        })
        await open()
        await measureFramework({
          label: 'next',
          page,
          waitForCard: open,
          root: nextRoot,
          sourceFile: 'app/shadow-flicker/ShadowPhone.tsx',
          component: 'ShadowPhone',
          withOverrides: true
        })
      }
    })

    await withServer({
      cwd: viteRoot,
      command: 'bun run dev',
      framework: 'vite',
      urlPath: '/',
      run: async url => {
        const open = async () => {
          host.send('load', { view: 'preview', url })
          await wait(() => page('!!document.querySelector("#shadow-phone")'))
        }
        await open()
        await measureFramework({
          label: 'vite',
          page,
          waitForCard: open,
          root: viteRoot,
          sourceFile: 'src/phone.js',
          component: 'Shadow',
          withOverrides: false
        })
        await open()
        await measureFramework({
          label: 'vite',
          page,
          waitForCard: open,
          root: viteRoot,
          sourceFile: 'src/phone.js',
          component: 'Shadow',
          withOverrides: true
        })
      }
    })
  })

  console.log('ISLAND-FLICKER-FRAMEWORKS PASS')
} finally {
  await rm(nextRoot, { recursive: true, force: true })
  await rm(viteRoot, { recursive: true, force: true })
}
