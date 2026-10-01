/**
 * Info.plist of the XPC service (`Trezi.app/Contents/XPCServices/dev.trezi.service.xpc`).
 *
 * `JoinExistingSession` (LKM-125): without it launchd starts the service in a new
 * security session, which has no login keychain. Every process the service starts
 * (Bun, the `TreziSecrets --crypto` Keychain helper, provider helpers and the Claude CLI)
 * inherits that session, so saving a key failed with "Keychain encryption unavailable"
 * and a `claude auth login` from Terminal read as logged out. With it the service runs
 * in the host's session, like the host started from Terminal or by `open -a`.
 */
export function serviceInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.trezi.service</string>
<key>CFBundleName</key><string>Trezi Service</string>
<key>CFBundleExecutable</key><string>TreziService</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleVersion</key><string>1</string>
<key>XPCService</key><dict><key>ServiceType</key><string>Application</string><key>RunLoopType</key><string>dispatch_main</string><key>JoinExistingSession</key><true/></dict>
</dict></plist>`
}
