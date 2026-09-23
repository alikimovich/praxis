# Native Praxis on macOS

```sh
bun run dev:native
bun run dev:native --project /absolute/path/to/project
bun run build:native
bun run test:native
```

The default `bun run dev` remains Electron. The native command builds and launches
the real Praxis interface, not the earlier fixture-only prototype. The old
prototype remains in `experimental/native-runtime/` as a minimal reference; run
its own `bun run dev` there if needed.

Requires macOS 13.3+, Bun, Xcode command-line tools and the normal Praxis
dependencies (`bun install`). `build:native` emits `out/native/index.cjs`, the
renderer/preload bundles and `Praxis Native.app`. Start through the Bun command:
the internal app bundle is a host subprocess, not a standalone distributable.
The selected architecture follows the local machine. No Electron or Chromium
binary is loaded by the native backend; Bun itself remains a local prerequisite.

## Shared code and host boundaries

`scripts/build-native.mjs` bundles `src/native/index.ts` and the existing
application services. It aliases `electron` to the private `src/native/platform.ts`
adapter only for that build. The existing renderer, `PraxisApi` preload, and full
preview instrumentation are reused. This is a deliberately bounded compatibility
layer for Praxis's own dependencies, not a general Electron implementation.

Bun owns agents, Git, files, source editing, session storage and project dev
servers. Swift owns AppKit windows, folder dialogs, trash, menus, screenshots,
Keychain encryption and WKWebView surfaces. Main UI, preview, inspector and
pop-out editors use separate webviews. Main-renderer screenshots exclude the
overlaid preview surface, just as in Electron; capture both surfaces when testing.

The host and backend exchange JSON over private subprocess pipes. Swift stamps
message source identity from the actual webview. The preview gets its bridge only
in a named isolated WKContentWorld and may send only the existing selection,
comment, style-read and layer-result events; it cannot invoke app commands. The
main application loads only its own generated assets. Preview main-frame
navigation stays on the origin assigned by Bun; preview storage is ephemeral.
Camera/microphone permission requests are denied. The media URL scheme is
installed only in trusted views and uses the shared opaque-file-token registry.

The renderer asset server binds to loopback port 4188, with an unguessable path
prefix and no backend HTTP command API. Set `PRAXIS_NATIVE_PORT` to change it;
changing the port also changes the renderer's browser-storage origin. Tests use
an ephemeral port and WebKit store. App-shell navigation cannot leave its own
asset page. External HTTP(S) links from the trusted UI open in the default browser.

## Profiles and credentials

Native backend state lives under `~/Library/Application Support/Praxis Native`.
It is deliberately separate from Electron's profile. A process lock prevents two
native instances from writing that profile. Renderer preferences live in the
native app's WebKit store. Existing provider CLI sign-ins can be reused, but
saved custom endpoints and conversation history are not imported from Electron.

Custom endpoint keys are encrypted with AES-GCM. The random encryption key is
stored in macOS Keychain; plaintext values pass to the native cipher helper through
stdin, never argv. Cipher errors fail closed. The integration test does not create
Keychain entries or save actual credentials; that path still needs an interactive
credential round-trip check.

## Verification

`test:native` starts a real WKWebView window with the production React build and
a disposable profile/project. It opens the project through the renderer, starts
Praxis's managed static server, reads and selects a stamped layer, checks computed
styles, applies a real HTML source edit, and verifies live reload. It checks the
preview cannot access the privileged bridge and cannot invoke source-read IPC.
PNG artifacts are written under `test/artifacts/native/`.
The native check also exercises undo/redo, registered media-file delivery and
opening the shared code editor in a separate native window.

`test:native-live` additionally submits an edit through the real composer to the
configured Claude provider, using a temporary fixture and automatic permissions.
This sends fixture information to the provider and uses the signed-in account.
After explicit approval, execution reached the provider SDK but returned
“Not logged in · Please run /login.” Native AI source editing remains unverified
until Claude authentication is available. The test is registered
in the live tier, while the deterministic test is in the desktop tier.

## Remaining differences

- Native app-shell edits rebuild on launch; frontend HMR for Praxis itself is not
  wired. Project preview HMR/live reload still comes from its managed dev server.
- In-app updater/relaunch is disabled with an explicit error; update the checkout
  and restart the native command.
- File attachments use bytes; WebKit does not reveal a dropped File's disk path.
- Linux, signing, distributable Bun bundling, browser download UI and broader
  permission handling are not implemented.
- iOS Simulator handlers are shared but have not been tested in this native host.
- Real pointer interaction and full macOS permission behavior still need manual
  verification. Automated selection uses the actual layer-selection IPC path.
- System WebKit follows macOS updates and may render projects differently from
  Electron's bundled Chromium.
