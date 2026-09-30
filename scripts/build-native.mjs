import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeCatAssets } from './native-cat-assets.mjs'
import { bundleBun } from './bundle-bun.mjs'
import { build as bundle } from 'esbuild'
import { MIN_MACOS, requireSupportedPlatform } from './requirements.mjs'

requireSupportedPlatform({ sdk: true })
const target = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx${MIN_MACOS}`
const root = fileURLToPath(new URL('../', import.meta.url))
const out = join(root, 'out/native')
const contents = join(out, 'Trezi.app/Contents')
// The retained JS ships inside the app beside its bundled Bun (LKM-111). Its packages
// stay external and resolve up the tree to the checkout's node_modules, and the
// sources' `__dirname/../..` (the checkout root) is kept by pointing `__dirname` at
// out/native, where these bundles were built before.
const backendDir = join(contents, 'Resources/backend')
const outDirname = {
  define: { __dirname: '__treziOutDir' },
  banner: { js: 'var __treziOutDir = require("node:path").resolve(__dirname, "../../../..");' }
}
mkdirSync(join(contents, 'MacOS'), { recursive: true })
mkdirSync(join(contents, 'Resources'), { recursive: true })
copyFileSync(join(root, 'build/icon.icns'), join(contents, 'Resources/Trezi.icns'))
writeFileSync(join(contents, 'Resources/cat.json'), JSON.stringify(nativeCatAssets(root)))
const device = readFileSync(join(root, 'src/shared/iphone-frame.ts'), 'utf8').match(/FRAME_DATA_URI = '([^']+)'/)[1]
writeFileSync(join(out, 'device.png'), Buffer.from(device.split(',')[1], 'base64'))
const backend = await bundle({
  metafile: true,
  entryPoints: [join(root, 'src/native/index.ts')],
  outfile: join(backendDir, 'index.cjs'),
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  packages: 'external',
  sourcemap: true,
  ...outDirname
})
await bundle({
  entryPoints: [join(root, 'src/main/backends/provider-helper-entry.ts')],
  outfile: join(backendDir, 'provider-helper.cjs'),
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  packages: 'external',
  sourcemap: true,
  ...outDirname
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
// The backend lived beside the app before LKM-111 moved it inside.
for (const name of ['index.cjs', 'index.cjs.map', 'provider-helper.cjs', 'provider-helper.cjs.map']) rmSync(join(out, name), { force: true })
// The bundle was "Trezi Native.app" before LKM-108; don't leave a second app behind.
rmSync(join(out, 'Trezi Native.app'), { recursive: true, force: true })
writeFileSync(
  join(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.praxis.native</string>
<key>CFBundleName</key><string>Trezi</string>
<key>CFBundleDisplayName</key><string>Trezi</string>
<key>CFBundleIconFile</key><string>Trezi.icns</string>
<key>CFBundleExecutable</key><string>TreziHost</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>${MIN_MACOS}</string>
<key>NSHighResolutionCapable</key><true/>
<key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeName</key><string>Folder</string><key>CFBundleTypeRole</key><string>Viewer</string><key>LSHandlerRank</key><string>None</string><key>LSItemContentTypes</key><array><string>public.folder</string></array></dict></array>
<key>NSCameraUsageDescription</key><string>Allow your local project preview to test camera features when you approve.</string>
<key>NSMicrophoneUsageDescription</key><string>Allow your local project preview to test microphone features when you approve.</string>
</dict></plist>`
)
const serviceContents = join(contents, 'XPCServices/dev.praxis.service.xpc/Contents')
mkdirSync(join(serviceContents, 'MacOS'), { recursive: true })
writeFileSync(join(serviceContents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.praxis.service</string>
<key>CFBundleName</key><string>Trezi Service</string>
<key>CFBundleExecutable</key><string>TreziService</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleVersion</key><string>1</string>
<key>XPCService</key><dict><key>ServiceType</key><string>Application</string><key>RunLoopType</key><string>dispatch_main</string></dict>
</dict></plist>`)
const serviceResult = Bun.spawnSync([
  'xcrun', 'swiftc', '-O', '-target', target,
  '-module-cache-path', join(out, 'module-cache'),
  ...['ServiceContract', 'ServiceXPC', 'LedgerStore', 'OperationLedger', 'PreferencesFile', 'PreferencesOwner', 'WorkspaceFile', 'WorkspaceOwner', 'MemoryFile', 'MemoryOwner', 'DomainChannel', 'BackendSupervisor', 'ProcessGuardian', 'ManagedProcess', 'RuntimeNet', 'RuntimeDetect', 'StaticSite', 'StaticServer', 'RuntimeServer', 'RuntimeOwner', 'RepositoryGit', 'RepositoryJournal', 'RepositoryEffects', 'RepositoryLanding', 'RepositoryOwner', 'SourcePaths', 'SourceJournal', 'SourceHistory', 'SourceStore', 'SourceDrafts', 'SourceOwner', 'ConversationState', 'ConversationStore', 'ConversationOwner', 'ProviderPolicy', 'ProviderStore', 'ProviderHelper', 'ProviderFrames', 'ProviderData', 'ProviderOwner', 'EditingIslands', 'EditingStores', 'EditingProject', 'EditingOwner', 'WorkflowJournal', 'WorkflowContext', 'WorkflowOwner', 'WorkflowPublish', 'WorkflowRemote', 'WorkflowSetup', 'WorkflowTools', 'PlatformTools', 'PlatformOpen', 'PlatformMedia', 'SimulatorTools', 'SimulatorBridge', 'SimulatorOwner', 'PlatformOwner', 'ProfilePaths', 'ServiceRuntime', 'ServiceMain'].map(name => join(root, `src/service/${name}.swift`)),
  '-o', join(serviceContents, 'MacOS/TreziService'), '-framework', 'Foundation', '-framework', 'Security', '-framework', 'CoreServices'
], { stdout: 'inherit', stderr: 'inherit' })
if (serviceResult.exitCode) process.exit(serviceResult.exitCode)
copyFileSync(join(serviceContents, 'MacOS/TreziService'), join(out, 'TreziService'))
writeFileSync(join(out, 'main.swift'), readFileSync(join(root, 'src/native/Host.swift')))
const result = Bun.spawnSync(
  [
    'xcrun',
    'swiftc',
    '-O',
    '-target',
    target,
    '-module-cache-path',
    join(out, 'module-cache'),
    join(out, 'main.swift'),
    join(root, 'src/service/ServiceContract.swift'),
    join(root, 'src/service/ServiceXPC.swift'),
    join(root, 'src/native/ServiceClient.swift'),
    join(root, 'src/native/HostService.swift'),
    join(root, 'src/native/HostLaunch.swift'),
    join(root, 'src/native/Shell.swift'),
    join(root, 'src/native/ProjectCell.swift'),
    join(root, 'src/native/SidebarVerification.swift'),
    join(root, 'src/native/SidebarSizing.swift'),
    join(root, 'src/native/SidebarFocus.swift'),
    join(root, 'src/native/SidebarIcon.swift'),
    join(root, 'src/native/PreviewSurface.swift'),
    join(root, 'src/native/ToolbarLayout.swift'),
    join(root, 'src/native/Inspector.swift'),
    join(root, 'src/native/Composer.swift'),
    join(root, 'src/native/ComposerVerification.swift'),
    join(root, 'src/native/ComposerAttachments.swift'),
    join(root, 'src/native/ComposerQueue.swift'),
    join(root, 'src/native/ComposerBeam.swift'),
    join(root, 'src/native/Chat.swift'),
    join(root, 'src/native/ChatScrollStyle.swift'),
    join(root, 'src/native/ChatLatestButton.swift'),
    join(root, 'src/native/ChatEnvironment.swift'),
    join(root, 'src/native/ChatReveal.swift'),
    join(root, 'src/native/ChatAcceptance.swift'),
    join(root, 'src/native/ScrollerDrag.swift'),
    join(root, 'src/native/VisibleChatCapture.swift'),
    join(root, 'src/native/ChatIsland.swift'),
    join(root, 'src/native/ShadowIsland.swift'),
    join(root, 'src/native/ChatActivity.swift'),
    join(root, 'src/native/StreamingText.swift'),
    join(root, 'src/native/Cat.swift'),
    join(root, 'src/native/Welcome.swift'),
    join(root, 'src/native/Sheets.swift'),
    join(root, 'src/native/SheetVerification.swift'),
    join(root, 'src/native/Activity.swift'),
    join(root, 'src/native/SourceEditor.swift'),
    join(root, 'src/native/SourceFileTree.swift'),
    join(root, 'src/native/Layers.swift'),
    join(root, 'src/native/EditingInspector.swift'),
    join(root, 'src/native/PreviewPlatform.swift'),
    join(root, 'src/native/WorkspaceLayout.swift'),
    join(root, 'src/native/PreviewStatus.swift'),
    join(root, 'src/native/ChatDivider.swift'),
    join(root, 'src/native/ChatMarkdown.swift'),
    join(root, 'src/native/ChatQuestion.swift'),
    '-o',
    join(contents, 'MacOS/TreziHost'),
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
bundleBun(contents)
for (const path of [join(out, 'TreziService'), join(contents, 'XPCServices/dev.praxis.service.xpc'), join(out, 'Trezi.app')]) {
  const signed = Bun.spawnSync(['codesign', '--force', '--sign', '-', path], { stdout: 'inherit', stderr: 'inherit' })
  if (signed.exitCode) process.exit(signed.exitCode)
}
if (/require\(["']electron["']\)/.test(readFileSync(join(backendDir, 'index.cjs'), 'utf8')))
  throw new Error('Native backend still imports Electron')
console.log(
  'Built Trezi: Swift/AppKit UI, Bun services (bundled Bun), isolated WebKit project preview. Start it with open -a Trezi or trezi.'
)
