# Testing Trezi

The test runner is `node test/run.mjs unit|native|live|all`. Unit checks run with
bounded concurrency (default up to four workers). Native desktop and live provider
checks are serial. Logs and JSON summaries are written to `test/artifacts/runs/`;
a lock prevents overlapping runner invocations. PASS, SKIP, FAIL, timeout and
cancellation remain distinct outcomes.

```sh
bun run typecheck
bun run typecheck:native
node test/run.mjs unit
node test/run.mjs unit --filter=trezi-cli,native-workspace-controller
node test/run.mjs unit --serial
bun run test:native
```

`bun run test` runs unit and native tiers. `bun run verify` adds live provider
turns; those require explicit authorization and credentials. The native-runtime test
builds the app; focused native checks reuse that build and skip when unavailable.
`bun run test:native` runs native-runtime and then native-chat-scroll with
`--require-build`, so a missing host there fails instead of skipping.
Electron/Playwright application tests were removed when the runtime was retired.
Their historical coverage is not claimed as native parity.

Native integration uses a disposable profile/project, Swift host and real Bun
controllers. It checks project switching, sheets, streaming/queues, permissions,
source/content/style writes, window geometry, docking, preview input isolation and
that exactly one WebKit view exists. `TREZI_NATIVE_BACKGROUND_TEST=1` skips real
pointer gestures/animation timing, which must be reported as reduced coverage.
`test:native-live` separately submits a real provider turn against a fixture.

`node test/native-source-window.mjs` checks the popped-out editor's initial size,
programmatic resizing, code viewport, docking/reopening and draft retention using
a disposable native host. It requires an existing build and writes
`test/artifacts/native/source-window.png`. It does not exercise pointer resizing.

`node test/native-chat-scroll.mjs` uses a disposable native host with fixture
snapshots to check that sent questions and streamed responses remain visible
above the floating composer across short/long histories and shrinking drafts.
It also reveals a nested chat island (mid-history, starting offscreen) at 440pt
and the 320pt minimum chat width:
each top/bottom reveal must settle with its anchor within 8pt of the reading
edge, and overlapping pairs (top→bottom, bottom→top, top→top) must reject the
older request as superseded (naming the newest revision) while the newest
settles. It requires an existing native build and makes no provider calls.
Captures are written to `test/artifacts/native/chat-scroll/`, including
`reveal-<width>-{top,bottom}.png`, `reveal-<width>-overlap-<first>-<second>.png`
and the measured revisions/frames in `reveal-<width>.json`.

`node test/native-next-hmr.mjs` checks Next.js 16.3.5 in Webpack mode through
Trezi's managed dev server and system WebKit. It installs dependencies into a
disposable copy of the Next fixture (registry access/cache required), checks
ordinary component edits plus chat-island commits and Undo, and asserts that the
page is never reloaded. It needs an existing native build and runs in the native
tier after `native-runtime`. No provider calls are made. Static-site live reload
coverage alone does not verify framework Fast Refresh.

Shadow Light verification requires macOS 14.4+ for ScreenCaptureKit's
current-process window capture. It captures only Trezi's own foreground window,
then crops to chat pixels and checks visible labels with OCR. It does not launch
an external screen recorder or request access to other applications. Inspect
`shadow-light-{initial,adjusted,restored}.png` and their `-bottom` companions against
the approved mockup; OCR presence is not a substitute for layout review. Capture
or OCR failures fail verification without an offscreen fallback.

Read screenshots in `test/artifacts/native/` for UI verification. Offscreen
AppKit captures do not faithfully paint Liquid Glass; visible inspection may be
necessary. Never start the target project server manually alongside Trezi.

New tests belong in the appropriate array in `test/run.mjs`. Pure tests must own
their temporary directories/ports and clean up processes. Use injected service
registries when testing lifecycle behavior without the desktop. Renderer-specific
unit tests were removed; retained backend generation tests use React as a dev
fixture to verify that generated project code actually renders.
