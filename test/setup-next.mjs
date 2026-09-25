import { execFileSync } from 'node:child_process'
import {
  initChatIsolation,
  isolatedCwd,
  beforeTurn,
  afterTurn,
  releaseChat
} from '../src/main/chat-isolation.ts'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { detectNext, NEXT_LOADER_CONTENT, NEXT_ADAPTER_CONTENT } from '../src/main/setup-next.ts'
import { REACT_HELPER_CONTENT } from '../src/main/setup-react.ts'
import { syncSetupArtifacts } from '../src/main/setup-artifacts.ts'
import { provisionNextDependencies } from '../src/main/worktree-dependencies.ts'
import { setupPrompt } from '../src/shared/setup-prompt.ts'
import { typescriptProps } from '../src/main/props-typescript.ts'
const require = createRequire(import.meta.url)
const root = await mkdtemp(join(tmpdir(), 'praxis-next-unit-'))
try {
  await mkdir(join(root, 'node_modules/next'), { recursive: true })
  await mkdir(join(root, 'src/app'), { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ dependencies: { next: '^16' }, scripts: { dev: 'next dev' } })
  )
  await writeFile(
    join(root, 'node_modules/next/package.json'),
    JSON.stringify({ version: '16.1.6' })
  )
  assert.deepEqual(await detectNext(root), {
    version: '16.1.6',
    declaredVersion: '^16',
    command: 'next dev',
    router: 'app',
    bundler: 'turbopack'
  })
  for (const [command, bundler] of [
    ['next dev --webpack', 'webpack'],
    ['next dev --turbo', 'turbopack'],
    ['custom-next-server', 'unknown'],
    ['next start', 'unknown']
  ]) {
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ dependencies: { next: '^16' }, scripts: { dev: command } })
    )
    assert.equal((await detectNext(root)).bundler, bundler)
  }
  await mkdir(join(root, '.praxis'))
  for (const [name, value] of [
    ['praxis-next.cjs', NEXT_ADAPTER_CONTENT],
    ['praxis-next-loader.cjs', NEXT_LOADER_CONTENT],
    ['praxis-source.cjs', REACT_HELPER_CONTENT]
  ]) {
    await writeFile(join(root, '.praxis', name), value)
  }
  const wrap = require(join(root, '.praxis/praxis-next.cjs'))
  const config = {
    images: { unoptimized: true },
    webpack(c) {
      c.fromUser = true
      return c
    }
  }
  assert.equal(wrap(config)('phase-production-build', {}), config)
  const dev = await wrap(async () => config)('phase-development-server', {})
  assert.deepEqual(dev.images, config.images)
  assert.equal(dev.webpack({ module: { rules: [] } }, { dev: true }).fromUser, true)
  assert.equal(dev.webpack({ module: { rules: [] } }, { dev: false }).module.rules.length, 0)
  assert.ok(dev.turbopack.rules['*.tsx'])
  assert.throws(
    () => wrap({ turbopack: { rules: { '*.tsx': {} } } })('phase-development-server'),
    /manual loader composition/
  )
  const babel = require('@babel/core')
  const plugin = require(join(root, '.praxis/praxis-source.cjs'))
  const input =
    '"use client";\nexport function Card({label}: {label: string}) { return <button>{label}</button> }'
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  const result = babel.transformSync(input, {
    filename: join(root, 'src/Card.tsx'),
    root,
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['jsx', 'typescript'] },
    plugins: [plugin],
    sourceMaps: true
  })
  assert.match(result.code, /data-praxis-source="src\/Card.tsx:2:/)
  assert.match(result.code, /^"use client"/)
  assert.ok(result.map.mappings)
  const loaderModule = { exports: {} }
  new Function('module', 'require', NEXT_LOADER_CONTENT)(loaderModule, (name) =>
    name === '@babel/core' ? babel : name === './praxis-source.cjs' ? plugin : require(name)
  )
  let transformed
  loaderModule.exports.call(
    {
      resourcePath: join(root, 'src/Card.tsx'),
      getOptions: () => ({ root }),
      callback(error, code, map) {
        if (error) throw error
        transformed = { code, map }
      }
    },
    input
  )
  assert.match(transformed.code, /data-praxis-component-source/)
  assert.match(transformed.code, /use client/)
  assert.ok(transformed.map.mappings)
  process.env.NODE_ENV = 'production'
  assert.doesNotMatch(
    babel.transformSync(input, {
      envName: 'production',
      filename: 'Card.tsx',
      configFile: false,
      babelrc: false,
      parserOpts: { plugins: ['jsx', 'typescript'] },
      plugins: [plugin.bind(null)]
    }).code,
    /data-praxis/
  )
  const originalMap = { version: 3, sources: ['original.tsx'], mappings: '' }
  loaderModule.exports.call(
    {
      callback(error, code, map) {
        assert.equal(error, null)
        assert.equal(code, input)
        assert.equal(map, originalMap)
      }
    },
    input,
    originalMap
  )
  if (previous === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previous
  const checkout = join(root, 'checkout')
  await mkdir(checkout)
  await syncSetupArtifacts(root, checkout)
  assert.equal(
    await readFile(join(checkout, '.praxis/praxis-next.cjs'), 'utf8'),
    NEXT_ADAPTER_CONTENT
  )
  assert.equal(
    JSON.parse(await readFile(join(checkout, '.praxis/setup-helpers.json'))).helpers.length,
    3
  )
  await writeFile(join(root, '.praxis/praxis-source.cjs'), 'updated')
  await syncSetupArtifacts(root, checkout)
  assert.equal(await readFile(join(checkout, '.praxis/praxis-source.cjs'), 'utf8'), 'updated')
  await rm(join(root, '.praxis/praxis-source.cjs'))
  await syncSetupArtifacts(root, checkout)
  await assert.rejects(readFile(join(checkout, '.praxis/praxis-source.cjs')))

  await writeFile(join(checkout, 'package.json'), JSON.stringify({ dependencies: { next: '^16' } }))
  let installs = 0
  const install = async (destination) => {
    assert.equal(destination, checkout)
    installs++
    await mkdir(join(destination, 'node_modules'), { recursive: true })
  }
  await provisionNextDependencies(root, checkout, install)
  await provisionNextDependencies(root, checkout, install)
  assert.equal(installs, 1)
  await writeFile(join(checkout, 'bun.lock'), 'changed-lock')
  await provisionNextDependencies(root, checkout, install)
  assert.equal(installs, 2)
  const prompt = setupPrompt({
    framework: 'next',
    next: await detectNext(root),
    files: ['.praxis/praxis-next.cjs']
  })
  assert.doesNotMatch(prompt, /vite.config|interface Props/)
  const file = join(root, 'schema.tsx')
  await writeFile(
    file,
    'interface Base { title: string }; type Alias = Base & { count?: number; size: "sm" | "lg" };\nfunction Card(p: Alias) { return null };\nconst x = <Card title="a" />'
  )
  const fields = typescriptProps(root, file, 3, 10)
  assert.equal(fields.find((p) => p.name === 'title')?.kind, 'string')
  assert.equal(fields.find((p) => p.name === 'count')?.kind, 'number')
  assert.deepEqual(fields.find((p) => p.name === 'size')?.options, ['sm', 'lg'])
  await mkdir(join(root, 'node_modules/@types'), { recursive: true })
  await symlink(
    dirname(require.resolve('@types/react/package.json')),
    join(root, 'node_modules/@types/react')
  )
  await writeFile(
    join(root, 'Base.tsx'),
    'export function Base(props: {count: number; state: "on" | "off"}) { return null }'
  )
  await writeFile(
    file,
    'import type {ComponentProps} from "react"; import {Base} from "./Base";\ntype Alias = ComponentProps<typeof Base> & { title?: string }; function Wrapper(props: Alias) {return null};\nconst x = <Wrapper count={1} state="on" />'
  )
  const imported = typescriptProps(root, file, 3, 10)
  assert.equal(imported.find((p) => p.name === 'count')?.kind, 'number')
  assert.equal(imported.find((p) => p.name === 'title')?.required, false)
  assert.equal(imported.find((p) => p.name === 'title')?.fromSchema, true)
  assert.deepEqual(imported.find((p) => p.name === 'state')?.options, ['on', 'off'])
  const repo = join(root, 'repo')
  await mkdir(repo)
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@local')
  await writeFile(join(repo, 'app.txt'), 'source')
  git('add', '.')
  git('commit', '-qm', 'base')
  const events = []
  initChatIsolation({
    worktreesDir: () => join(root, 'worktrees'),
    store: () => ({ get() {}, save() {}, remove() {} }),
    getWindow: () => ({
      webContents: { isDestroyed: () => false, send: (_channel, event) => events.push(event) }
    })
  })
  const cwd = await isolatedCwd(repo, 'setup-helper-test')
  await mkdir(join(repo, '.praxis'))
  await writeFile(join(repo, '.praxis/praxis-source.cjs'), REACT_HELPER_CONTENT)
  await beforeTurn('setup-helper-test', 'setup')
  assert.equal(await readFile(join(cwd, '.praxis/praxis-source.cjs'), 'utf8'), REACT_HELPER_CONTENT)
  afterTurn('setup-helper-test', 'setup already connected')
  await beforeTurn('setup-helper-test', 'serialize after completion')
  assert.ok(
    events.some(
      (e) => e.type === 'isolation' && e.state === 'merged' && (e.files ?? []).length === 0
    )
  )
  assert.equal(git('rev-list', '--count', 'HEAD'), '1')
  await releaseChat('setup-helper-test')
  console.log(
    'PASS Next detection, config composition, dev gating, helper sync, prompts, inherited prop schema'
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
