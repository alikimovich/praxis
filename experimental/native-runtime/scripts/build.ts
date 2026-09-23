import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const contents = `${root}build/Praxis Runtime.app/Contents`;
await mkdir(`${contents}/MacOS`, { recursive: true });
await Bun.write(`${contents}/Info.plist`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.praxis.runtime-prototype</string>
<key>CFBundleName</key><string>Praxis Runtime</string>
<key>CFBundleExecutable</key><string>PraxisHost</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSHighResolutionCapable</key><true/>
<key>LSMinimumSystemVersion</key><string>13.3</string>
</dict></plist>`);
const target = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx13.3`;
const result = Bun.spawnSync(['xcrun', 'swiftc', '-O', '-target', target, '-module-cache-path', `${root}build/module-cache`, `${root}native/Host.swift`, '-o', `${contents}/MacOS/PraxisHost`, '-framework', 'AppKit', '-framework', 'WebKit'], { stdout: 'inherit', stderr: 'inherit' });
if (result.exitCode) process.exit(result.exitCode);
console.log('Native host built. Uses system WebKit; no bundled browser.');
