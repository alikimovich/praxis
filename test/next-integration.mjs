// Opt-in real Next fixture: install test/fixtures/next-app in a disposable folder,
// then PRAXIS_NEXT_FIXTURE=/absolute/folder node test/next-integration.mjs.
// All development servers are started/stopped by Praxis's normal IPC lifecycle.
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = process.env.PRAXIS_NEXT_FIXTURE
  ? await realpath(process.env.PRAXIS_NEXT_FIXTURE)
  : null
if (!fixture) {
  console.log('SKIP real Next fixture (set PRAXIS_NEXT_FIXTURE)')
  process.exit(0)
}
const run = promisify(execFile)
const userData = await mkdtemp(join(tmpdir(), 'praxis-next-ui-'))
let app
try {
  await cp(join(root, 'test/fixtures/next-app/app'), join(fixture, 'app'), { recursive: true })
  await cp(join(root, 'test/fixtures/next-app/packages'), join(fixture, 'packages'), {
    recursive: true
  })
  for (const file of ['next.config.mjs', 'mdx-components.tsx'])
    await cp(join(root, 'test/fixtures/next-app', file), join(fixture, file))
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out/main/index.js')],
    cwd: root,
    env: { ...process.env, PRAXIS_USER_DATA: userData, PRAXIS_SKIP_INTRO: '1' }
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 20000 })
  win.on('console', (message) => {
    if (message.text().startsWith('SERVER:')) console.log(message.text())
  })
  await win.evaluate(() => window.api.devServer.onLog((line) => console.log('SERVER:' + line)))
  for (const name of [
    'praxis-next.cjs',
    'praxis-next-loader.cjs',
    'praxis-source.cjs',
    'praxis-mdx.mjs'
  ])
    await rm(join(fixture, '.praxis', name), { force: true })
  const result = await win.evaluate((root) => window.api.setup.scaffold(root), fixture)
  assert.equal(result.framework, 'next')
  assert.match(result.next.version, /^(15|16)\./)
  const major = Number(result.next.version.split('.')[0])
  await app.evaluate(({ app, webContents }) => {
    globalThis.__nextHydrationErrors = []
    const attach = wc => wc.on('console-message', (_event, details) => {
      if (/hydration|hydrated.*match|did not match|uncaught/i.test(details.message || '')) globalThis.__nextHydrationErrors.push(details.message)
    })
    webContents.getAllWebContents().forEach(attach)
    app.on('web-contents-created', (_event, wc) => attach(wc))
  })
  const code = async (expression) =>
    app.evaluate(({ webContents }, expression) => {
      const preview = webContents
        .getAllWebContents()
        .find((w) => /^http:\/\/(?:127\.0\.0\.1|localhost):/.test(w.getURL()))
      if (!preview) throw new Error('Missing native preview')
      return preview.executeJavaScript(expression)
    }, expression)
  const load = async (url) => {
    await win.evaluate((url) => window.api.preview.load(url), url)
    for (let i = 0; i < 240; i++) {
      const loaded = await app.evaluate(
        ({ webContents }, url) =>
          webContents
            .getAllWebContents()
            .some((w) => w.getURL() === new URL(url).href && !w.isLoadingMainFrame()),
        url
      )
      if (loaded) return
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error('Preview navigation timed out: ' + url)
  }
  for (const bundler of ['turbopack', 'webpack']) {
    const server = await win.evaluate(
      async ({ root, bundler, major }) => {
        return window.api.devServer.start({
          root,
          framework: 'next',
          command: `bun run dev ${bundler === 'turbopack' ? '--turbopack' : major >= 16 ? '--webpack' : ''}`
        })
      },
      { root: fixture, bundler, major }
    )
    console.log('TEST', bundler, server)
    await load(server.url)
    await app.evaluate(({ webContents }) => {
      const preview = webContents
        .getAllWebContents()
        .find((w) => /^http:\/\/(?:127\.0\.0\.1|localhost):/.test(w.getURL()))
      preview.on('console-message', (_event, details) => {
        if (details.level === 'error') console.error('NEXT PREVIEW:', details.message)
      })
    })
    assert.equal(await code('document.querySelector("h1")?.textContent'), 'Server title')
    assert.match(
      await code(
        'Array.from(document.querySelectorAll("p")).find(el => el.textContent === "Workspace package")?.getAttribute("data-praxis-source")'
      ),
      /^packages\/ui\/Label.tsx:/
    )
    const stamps = await code(
      'Array.from(document.querySelectorAll("button")).map(el => ({ text: el.textContent, host: el.getAttribute("data-praxis-source"), instance: el.getAttribute("data-praxis-component-source") })).filter(el => el.text.includes("First") || el.text.includes("Second"))'
    )
    assert.equal(stamps.length, 2)
    assert.match(stamps[0].host, /^app\/Card.tsx:/)
    assert.match(stamps[0].instance, /^app\/page.tsx:4:/)
    assert.notEqual(stamps[0].instance, stamps[1].instance)
    const inspection = await win.evaluate(
      ({ root, source }) => window.api.props.inspect(root, source),
      { root: fixture, source: stamps[0].instance }
    )
    assert.equal(inspection.component, 'Card')
    assert.ok(inspection.fields.some((f) => f.name === 'label'))
    await new Promise((r) => setTimeout(r, 1500))
    const edited = await win.evaluate(
      ({ root, source }) =>
        window.api.props.apply(root, { source, name: 'label', kind: 'string', value: 'Edited' }),
      { root: fixture, source: stamps[0].instance }
    )
    assert.equal(edited.applied, true)
    for (
      let i = 0;
      i < 120 && !(await code('document.body.textContent')).includes('Edited: 0');
      i++
    )
      await new Promise((r) => setTimeout(r, 250))
    assert.ok(
      (await code('document.body.textContent')).includes('Edited: 0'),
      (await code('document.body.textContent')).slice(0, 4000)
    )
    await load(server.url)
    assert.ok((await code('document.body.textContent')).includes('Edited: 0'))
    await code('document.querySelector("button").click()')
    await new Promise((r) => setTimeout(r, 250))
    assert.ok((await code('document.body.textContent')).includes('Edited: 1'))
    await code('document.querySelector("a[href=\\"/second\\"]").click()')
    for (
      let i = 0;
      i < 60 && (await code('document.querySelector("h1")?.textContent')) !== 'Second page';
      i++
    )
      await new Promise((r) => setTimeout(r, 250))
    assert.equal(await code('document.querySelector("h1")?.textContent'), 'Second page')
    await load(server.url + '/docs')
    assert.equal(await code('document.querySelector("h1")?.textContent'), 'MDX content')
    assert.equal(
      await code('document.querySelector("h1")?.getAttribute("data-praxis-source")'),
      'app/docs/page.mdx:1:0'
    )
    await load(server.url)
    await mkdir(join(root, 'test/artifacts'), { recursive: true })
    await win.evaluate(() => window.api.preview.setBounds({ x: 0, y: 0, width: 900, height: 600 }))
    await new Promise((r) => setTimeout(r, 300))
    const screenshot = await win.evaluate(() => window.api.preview.capture())
    if (screenshot)
      await writeFile(
        join(root, `test/artifacts/next-${bundler}.png`),
        Buffer.from(screenshot.split(',')[1], 'base64')
      )
    await win.evaluate((root) => window.api.devServer.stop(root), fixture)
    await cp(join(root, 'test/fixtures/next-app/app/page.tsx'), join(fixture, 'app/page.tsx'))
  }
  const { stdout } = await run('bun', ['run', 'build', ...(major >= 16 ? ['--webpack'] : [])], {
    cwd: fixture,
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  })
  const html = await readFile(join(fixture, '.next/server/app/index.html'), 'utf8')
  assert.doesNotMatch(html, /data-praxis-/)
  console.log(stdout)
  assert.deepEqual(await app.evaluate(() => globalThis.__nextHydrationErrors), [])
  console.log(
    'PASS real Next: both bundlers, RSC/client instances, inspector edits, refresh, navigation, MDX, production output'
  )
} finally {
  await app?.close()
  await rm(userData, { recursive: true, force: true })
}
