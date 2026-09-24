import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build as bundle } from 'esbuild'
import { build as viteBuild } from 'vite'

if (process.platform !== 'darwin') throw new Error('The native runtime currently requires macOS.')
const root = fileURLToPath(new URL('../', import.meta.url))
const out = join(root, 'out/native')
const contents = join(out, 'Praxis Native.app/Contents')
mkdirSync(join(contents, 'MacOS'), { recursive: true })
const alias = (file) => ({
  name: 'praxis-native-transport',
  setup(build) {
    build.onResolve({ filter: /^electron$/ }, () => ({ path: join(root, 'src/native', file) }))
  }
})
await bundle({
  entryPoints: [join(root, 'src/native/index.ts')],
  outfile: join(out, 'index.cjs'),
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  packages: 'external',
  plugins: [alias('platform.ts')],
  sourcemap: true
})
for (const [input, output] of [
  ['src/preload/index.ts', 'preload.js'],
  ['src/preview/preload.ts', 'preview.js']
]) {
  await bundle({
    entryPoints: [join(root, input)],
    outfile: join(out, output),
    bundle: true,
    platform: 'browser',
    target: 'safari16.4',
    format: 'iife',
    plugins: [alias('renderer-transport.ts')]
  })
}
await viteBuild({
  configFile: false,
  root: join(root, 'src/renderer'),
  base: './',
  resolve: {
    alias: { '@renderer': join(root, 'src/renderer/src'), '@': join(root, 'src/renderer/src') }
  },
  plugins: [react(), tailwindcss()],
  build: { outDir: join(out, 'renderer'), emptyOutDir: true }
})
writeFileSync(
  join(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.praxis.native</string>
<key>CFBundleName</key><string>Praxis Native</string>
<key>CFBundleExecutable</key><string>PraxisHost</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.3</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`
)
writeFileSync(join(out, 'main.swift'), readFileSync(join(root, 'src/native/Host.swift')))
const result = Bun.spawnSync(
  [
    'xcrun',
    'swiftc',
    '-O',
    '-target',
    `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx13.3`,
    '-module-cache-path',
    join(out, 'module-cache'),
    join(out, 'main.swift'),
    join(root, 'src/native/Shell.swift'),
    join(root, 'src/native/ProjectCell.swift'),
    join(root, 'src/native/Composer.swift'),
    '-o',
    join(contents, 'MacOS/PraxisHost'),
    '-framework',
    'AppKit',
    '-framework',
    'WebKit',
    '-framework',
    'Security',
    '-framework',
    'CryptoKit'
  ],
  { stdout: 'inherit', stderr: 'inherit' }
)
if (result.exitCode) process.exit(result.exitCode)
if (/require\(["']electron["']\)/.test(readFileSync(join(out, 'index.cjs'), 'utf8')))
  throw new Error('Native backend still imports Electron')
console.log(
  'Built Praxis Native: shared React UI, shared application services, Bun backend, WebKit host.'
)
