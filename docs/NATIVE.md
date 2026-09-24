# Native Praxis on macOS

```sh
bun run dev:native
bun run dev:native --project /absolute/path/to/project
bun run build:native
bun run test:native
PRAXIS_NATIVE_TEST_PROVIDER=codex bun run test:native-live
```

The default `bun run dev` remains Electron. The native command builds and launches
the real Praxis interface, not the earlier fixture-only prototype. The old
prototype remains in `experimental/native-runtime/` as a minimal reference; run
its own `bun run dev` there if needed.

Requires macOS 13.3+, Bun, command-line tools with the macOS 26 SDK, and the normal Praxis
dependencies (`bun install`). `build:native` emits `out/native/index.cjs`, the
renderer/preload bundles and `Praxis Native.app`. Start through the Bun command:
the internal app bundle is a host subprocess, not a standalone distributable.
The selected architecture follows the local machine. No Electron or Chromium
binary is loaded by the native backend; Bun itself remains a local prerequisite.

## Shared code and host boundaries

The macOS shell uses a standard `NSOutlineView` sidebar, `NSSplitViewController`
divider and `NSToolbar` items with system symbols and appearance. The open sidebar
extends through the titlebar behind the system traffic lights; its list and the
WebKit content respect the toolbar safe area. The sidebar lists projects only.
A More menu on each hovered or selected project offers Project Memory and Close
Project; right-click provides the same actions. The toolbar follows the columns:
a Projects menu (New Project/Open Project) and sidebar toggle above the sidebar;
the plain current chat title on the left, History and New Chat on the right; preview actions
above the preview. Settings stays at the bottom of the sidebar as a 36-point circular gear button,
using native Liquid Glass on macOS 26 and a circular system bezel on older macOS. The chat header
tracks the web pane’s measured width, including resizing and sidebar collapse,
and compacts when the preview is expanded. History lists the current project’s
open and saved chats, marks the active chat, and uses the existing switch/review
handlers. The preview section provides the current branch menu,
Home, editable preview address, desktop/mobile, Show/Hide Code and Expand/Restore
Preview. Publish/Create PR (or Connect to GitHub) is an accent-colored native button
at the far right, with its mode menu beside it.
Branch switching, new branches and Git Updates reuse the shared handlers; the
publish menu retains both PR-only and merge modes. Expanding hides chat and the
native sidebar; restoring returns the sidebar to its previous collapsed state.
The running web preview header is hidden only in the native build; startup/error
status remains visible. The address follows preview navigation without replacing
an edit in progress. Enter navigates within the project origin, Escape restores
the current URL, and Home returns to the project's base URL. The device toggle is
disabled for simulator projects.

Sidebar and composer scroll views use auto-hiding overlay scrollers. The empty
composer fits its document to the available height, avoiding artificial overflow.
Its empty chip row collapses, with a 112-point minimum form height. Pickers size
to the selected label (using Electron’s ten-character compact-label rule), with
full menu titles and tooltips. A flexible gap holds the 36-point Send/Stop button
at the right edge. The chat pane itself has no separate background fill.
Native-mode web chat uses a thin scrollbar without reserving a permanent gutter.
Project-preview scrollbars remain controlled by the page and WebKit.

Chat history, settings, inspectors, code editing and the detailed preview toolbar remain
React/WebKit. The native build hides the React rail and titlebar drag regions;
Electron still renders them. A native-only bridge mirrors compact workspace
snapshots and calls the existing renderer actions. Streamed text does not rebuild
the native sidebar unless its displayed state changes. Inline chat renaming,
manual row ordering and background-agent rows are not yet in the native sidebar.

The composer uses `NSGlassEffectView` on macOS 26+, with a native multiline
`NSTextView`, attachment/tools menu, provider/model/permission popups and send/stop
button. Older macOS versions use `NSVisualEffectView`. Enter submits; Shift+Enter
inserts a newline. Selected-element context, attachment removal and slash-command
choices use native controls. Typing `/` opens a scrollable list above the composer
with names, descriptions and the active keyboard choice. Click a row or use
Arrow keys and Enter/Tab; filtering and completion reuse the shared handlers. Files from the picker or native drop retain their
paths; PNG/TIFF clipboard images are passed as PNG. Image transfer is limited to
10 MiB per file. Oversized or unreadable images are currently skipped.

`src/native/composer-transport.ts` mirrors the existing React composer's state and
geometry, and forwards native actions into its existing handlers. Drafts, queues,
provider/model confirmation and agent submission therefore retain the shared
behavior. The web form stays mounted but hidden in the native build; Electron
keeps its existing form. Keep the adapter's DOM selectors aligned with ChatPanel.
The composer and skill list hide for web dialogs. Native image thumbnails remain
follow-up work.

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
It opens the project through the actual AppKit sidebar, switches between real
chat sessions through the native History menu, checks toolbar ordering, code visibility,
expand/restore, address/Home navigation, desktop/mobile, primary Publish placement,
publish-mode selection, automatic scrollers and sidebar
collapse, verifies native text/draft restoration, file/image attachment add/remove,
permission changes, slash completion and modal visibility, and
captures native controls separately. Full-window offscreen caching
does not reliably composite WebKit and vibrancy layers; use the separate sidebar,
main and preview captures for QA. Liquid Glass composer captures are currently
blank despite valid control geometry, so its visual appearance and pointer
interactions still need an unlocked-desktop check.

`test:native-live` additionally submits an edit through the real composer to
Claude by default, or Codex with `PRAXIS_NATIVE_TEST_PROVIDER=codex`, using a
temporary fixture and automatic permissions. It restarts the backend session with
the selected provider before submitting, rather than only changing the UI state.
This sends fixture information to the provider and uses the signed-in account.
The authorized Codex run passed the real composer → provider → source edit →
WebKit preview reload flow. The Claude run returned “Not logged in · Please run
/login”; successful Claude editing remains unverified. The test is registered
in the live tier, while the deterministic test is in the desktop tier.

## Remaining differences

- Native app-shell edits rebuild on launch; frontend HMR for Praxis itself is not
  wired. Project preview HMR/live reload still comes from its managed dev server.
- In-app updater/relaunch is disabled with an explicit error; update the checkout
  and restart the native command.
- Files dropped directly onto web content still lack local paths; use the native
  composer or its attachment picker for path-based files.
- Linux, signing, distributable Bun bundling, browser download UI and broader
  permission handling are not implemented.
- iOS Simulator handlers are shared but have not been tested in this native host.
- Real pointer interaction and full macOS permission behavior still need manual
  verification. Automated selection uses the actual layer-selection IPC path.
- System WebKit follows macOS updates and may render projects differently from
  Electron's bundled Chromium.
