// Rebrand the dev Electron.app bundle so `bun run dev` presents as Praxis.
//
// In development the macOS app-menu title, Cmd-Tab entry, and Activity Monitor
// name all come from node_modules/electron/dist/Electron.app's Info.plist —
// `app.setName()` cannot override them. Since dsgn is distributed as source and
// run via `bun run dev`, the dev bundle IS the product, so we patch it in place:
// set CFBundleName/CFBundleDisplayName, swap the .icns, and ad-hoc re-sign
// (editing a signed bundle breaks its seal; unsigned apps are killed on arm64).
//
// Runs from postinstall (every `bun install` restores a stock Electron), and is
// a no-op on non-macOS or when the bundle is already patched.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_NAME = 'Praxis'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appBundle = join(root, 'node_modules/electron/dist/Electron.app')
const plist = join(appBundle, 'Contents/Info.plist')
const icns = join(appBundle, 'Contents/Resources/electron.icns')
const ourIcns = join(root, 'build/icon.icns')

if (process.platform !== 'darwin' || !existsSync(plist)) process.exit(0)

const plistBuddy = (cmd) =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', cmd, plist]).toString().trim()

const alreadyNamed = plistBuddy('Print :CFBundleName') === APP_NAME
const iconCurrent =
  existsSync(ourIcns) && existsSync(icns) &&
  readFileSync(ourIcns).equals(readFileSync(icns))
if (alreadyNamed && iconCurrent) process.exit(0)

plistBuddy(`Set :CFBundleName ${APP_NAME}`)
try {
  plistBuddy(`Set :CFBundleDisplayName ${APP_NAME}`)
} catch {
  plistBuddy(`Add :CFBundleDisplayName string ${APP_NAME}`)
}
if (existsSync(ourIcns)) copyFileSync(ourIcns, icns)

execFileSync('codesign', ['--force', '--deep', '--sign', '-', appBundle], {
  stdio: 'inherit',
})
console.log(`[patch-electron] dev Electron.app rebranded as ${APP_NAME}`)
