# Praxis runtime prototype

From the Praxis repository root, run `bun run dev:native`. Arguments are forwarded:
`bun run dev:native --url http://localhost:3000` previews an existing server and
`bun run dev:native --test` runs the native integration check and exits. The
commands below also work directly inside `experimental/native-runtime/`.

A macOS feasibility prototype: Bun backend, Swift/AppKit window, system WKWebView preview. No Electron, bundled Chromium, or npm dependencies. Requires macOS 13.3+, Xcode command-line tools, and Bun. Built locally on Apple Silicon.

```sh
bun run dev
# Preview an already-running project dev server:
bun run dev --url http://localhost:3000
# Automated native integration test (requires a desktop session):
bun run test
```

Select an element to inspect its tag, text, bounds, computed styles, and nearest `data-praxis-source` stamp. Toggle Select off to interact normally. Capture preview writes `artifacts/preview.png`. Editing the bundled fixture triggers a reload; external projects use their own dev server's HMR. This prototype does not start or stop external project servers. For Praxis-managed projects, let Praxis own that lifecycle.

## Architecture

Bun launches a small native executable and exchanges newline-delimited JSON over private stdin/stdout pipes. AppKit owns the main thread and window. WebKit owns browser rendering. Only the native host receives load, inspect, reload, capture, and quit commands; the preview has no backend command bridge. Its selection handler exists in a named isolated `WKContentWorld`. The ordinary page cannot access that handler or the inspector's JavaScript globals. Selection data is untrusted and never evaluated as code or used as a file path.

Preview storage is ephemeral. Navigation is restricted to the configured origin, popups have no host implementation, and media capture is denied. This is a feasibility prototype, not a completed security review or full browser permission layer. Frames are not inspected. Escape stops the overlay until Select is toggled again or the page reloads.

## Scope and next steps

The inspector is native AppKit; the full Praxis React shell and agent backend have not been ported. The stamp format is recognized, but the event payload is a small prototype contract, not a drop-in implementation of PraxisApi. Source editing, agent SDK compatibility, clipboard/dialog/keychain adapters, developer tooling, complete permission handling, signing, packaging, updating, and Linux remain future work. The fixture uses save-triggered full reload rather than module HMR.

The integration test launches the actual Swift host and WKWebView, selects a stamped element through the isolated-world command, verifies the page cannot access the selection bridge, reloads and reselects, then writes a real WebKit snapshot. It does not substitute for a physical mouse interaction test. The prototype does not load or modify Praxis's application data.

## Verification on 2026-09-23

The native integration test passed on this Mac; the captured preview was visually inspected. A desktop launch also succeeded. The physical mouse/resize check could not run because macOS was locked. Bun is supplied by the local installation; the native executable's size does not include Bun or system frameworks. Start through `bun run dev`, not by double-clicking the internal host app, which expects Bun's pipe connection and script path.
