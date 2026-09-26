import { readdirSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeCatAssets } from './native-cat-assets.mjs'
import { build as bundle } from 'esbuild'

if (process.platform !== 'darwin') throw new Error('The native runtime currently requires macOS.')
const root = fileURLToPath(new URL('../', import.meta.url))
const out = join(root, 'out/native')
const contents = join(out, 'Praxis Native.app/Contents')
mkdirSync(join(contents, 'MacOS'), { recursive: true })
mkdirSync(join(contents, 'Resources'), { recursive: true })
copyFileSync(join(root, 'build/icon.icns'), join(contents, 'Resources/Praxis.icns'))
writeFileSync(join(contents, 'Resources/cat.json'), JSON.stringify(nativeCatAssets(root)))
const device = readFileSync(join(root, 'src/shared/iphone-frame.ts'), 'utf8').match(/FRAME_DATA_URI = '([^']+)'/)[1]
writeFileSync(join(out, 'device.png'), Buffer.from(device.split(',')[1], 'base64'))
const recipeModule = {
  name: 'praxis-native-transport',
  setup(build) {
    build.onResolve({ filter: /^@alikimovich\/content-controls\/recipe$/ }, () => ({ path: join(root, 'node_modules/@alikimovich/content-controls/dist/recipe.js') }))
  }
}
const backend = await bundle({
  metafile: true,
  entryPoints: [join(root, 'src/native/index.ts')],
  outfile: join(out, 'index.cjs'),
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  packages: 'external',
  plugins: [recipeModule],
  sourcemap: true
})
const inputs = Object.keys(backend.metafile.inputs)
const externalImports = Object.values(backend.metafile.outputs).flatMap(output => output.imports).filter(item => item.external).map(item => item.path)
if (inputs.some(path => /src\/renderer\//.test(path)) || externalImports.some(path => /^(electron|electron-vite|react|react-dom|@codemirror)(\/|$)/.test(path))) throw new Error('Native build unexpectedly depends on a retired application runtime')
writeFileSync(join(out, 'build-inputs.json'), JSON.stringify({ inputs, externalImports }, null, 2))
for (const [input, output] of [
  ['src/preview/preload.ts', 'preview.js']
]) {
  await bundle({
    entryPoints: [join(root, input)],
    outfile: join(out, output),
    bundle: true,
    platform: 'browser',
    target: 'safari16.4',
    format: 'iife'
  })
}
// Remove stale application UI artifacts from earlier hybrid builds.
rmSync(join(out, 'renderer'), { recursive: true, force: true })
rmSync(join(out, 'preload.js'), { force: true })
writeFileSync(
  join(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.praxis.native</string>
<key>CFBundleName</key><string>Praxis Native</string>
<key>CFBundleIconFile</key><string>Praxis.icns</string>
<key>CFBundleExecutable</key><string>PraxisHost</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.3</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSCameraUsageDescription</key><string>Allow your local project preview to test camera features when you approve.</string>
<key>NSMicrophoneUsageDescription</key><string>Allow your local project preview to test microphone features when you approve.</string>
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
    join(root, 'src/native/PreviewSurface.swift'),
    join(root, 'src/native/ToolbarLayout.swift'),
    join(root, 'src/native/Inspector.swift'),
    join(root, 'src/native/Composer.swift'),
    join(root, 'src/native/ComposerQueue.swift'),
    join(root, 'src/native/ComposerBeam.swift'),
    join(root, 'src/native/Chat.swift'),
    join(root, 'src/native/ChatIsland.swift'),
    join(root, 'src/native/ChatActivity.swift'),
    join(root, 'src/native/StreamingText.swift'),
    ...readdirSync(join(root, 'src/native/vendor/thinking-orbs')).filter(name => name.endsWith('.swift')).sort().map(name => join(root, 'src/native/vendor/thinking-orbs', name)),
    join(root, 'src/native/Cat.swift'),
    join(root, 'src/native/Welcome.swift'),
    join(root, 'src/native/Sheets.swift'),
    join(root, 'src/native/Activity.swift'),
    join(root, 'src/native/SourceEditor.swift'),
    join(root, 'src/native/SourceFileTree.swift'),
    join(root, 'src/native/Layers.swift'),
    join(root, 'src/native/EditingInspector.swift'),
    join(root, 'src/native/ContentWindow.swift'),
    join(root, 'src/native/PreviewPlatform.swift'),
    join(root, 'src/native/WorkspaceLayout.swift'),
    join(root, 'src/native/PreviewStatus.swift'),
    join(root, 'src/native/ChatDivider.swift'),
    join(root, 'src/native/ChatMarkdown.swift'),
    join(root, 'src/native/ChatQuestion.swift'),
    '-o',
    join(contents, 'MacOS/PraxisHost'),
    '-framework',
    'AppKit',
    '-framework',
    'WebKit',
    '-framework',
    'Security',
    '-framework',
    'CryptoKit',
    '-framework',
    'AVKit'
  ],
  { stdout: 'inherit', stderr: 'inherit' }
)
if (result.exitCode) process.exit(result.exitCode)
if (/require\(["']electron["']\)/.test(readFileSync(join(out, 'index.cjs'), 'utf8')))
  throw new Error('Native backend still imports Electron')
console.log(
  'Built Praxis Native: Swift/AppKit UI, Bun services, isolated WebKit project preview.'
)
