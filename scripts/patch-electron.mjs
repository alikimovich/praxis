// Rebrand the dev Electron.app bundle so `bun run dev` presents as Praxis.
//
// In development the macOS app-menu title, Cmd-Tab entry, and Activity Monitor
// name all come from node_modules/electron/dist/Electron.app's Info.plist —
// `app.setName()` cannot override them. Since dsgn is distributed as source and
// run via `bun run dev`, the dev bundle IS the product, so we patch it in place:
// set CFBundleName/CFBundleDisplayName, install the icon, and ad-hoc re-sign
// (editing a signed bundle breaks its seal; unsigned apps are killed on arm64).
//
// The icon ships two ways:
//  - build/Assets.car + CFBundleIconName "dsgn": the macOS 26 layered icon
//    (compiled from the Icon Composer source with actool). This is what the
//    Dock/Cmd-Tab actually render on Tahoe — native icons get the system's
//    sizing treatment; a flat legacy .icns alone draws ~10% oversized.
//  - electron.icns swap: fallback for pre-26 macOS and anything else that
//    reads CFBundleIconFile.
//
// Runs from postinstall (every `bun install` restores a stock Electron), and is
// a no-op on non-macOS or when the bundle is already patched.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_NAME = 'Praxis'
const ICON_NAME = 'dsgn' // asset name inside Assets.car
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appBundle = join(root, 'node_modules/electron/dist/Electron.app')
const plist = join(appBundle, 'Contents/Info.plist')
const resources = join(appBundle, 'Contents/Resources')
const icns = join(resources, 'electron.icns')
const car = join(resources, 'Assets.car')
const ourIcns = join(root, 'build/icon.icns')
const ourCar = join(root, 'build/Assets.car')

if (process.platform !== 'darwin' || !existsSync(plist)) process.exit(0)

const plistBuddy = (cmd) =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', cmd, plist]).toString().trim()
const setOrAdd = (key, value) => {
  try {
    plistBuddy(`Set :${key} ${value}`)
  } catch {
    plistBuddy(`Add :${key} string ${value}`)
  }
}
const fileMatches = (ours, theirs) =>
  existsSync(ours) && existsSync(theirs) &&
  readFileSync(ours).equals(readFileSync(theirs))

let iconName = ''
try {
  iconName = plistBuddy('Print :CFBundleIconName')
} catch {
  /* key absent on stock Electron */
}
const patched =
  plistBuddy('Print :CFBundleName') === APP_NAME &&
  iconName === ICON_NAME &&
  fileMatches(ourIcns, icns) &&
  fileMatches(ourCar, car)
if (patched) process.exit(0)

setOrAdd('CFBundleName', APP_NAME)
setOrAdd('CFBundleDisplayName', APP_NAME)
setOrAdd('CFBundleIconName', ICON_NAME)
if (existsSync(ourIcns)) copyFileSync(ourIcns, icns)
if (existsSync(ourCar)) copyFileSync(ourCar, car)

execFileSync('codesign', ['--force', '--deep', '--sign', '-', appBundle], {
  stdio: 'inherit',
})
console.log(`[patch-electron] dev Electron.app rebranded as ${APP_NAME}`)
