# Testing Praxis

The test runner is `node test/run.mjs unit|native|live|all`. Unit checks run with
bounded concurrency (default up to four workers). Native desktop and live provider
checks are serial. Logs and JSON summaries are written to `test/artifacts/runs/`;
a lock prevents overlapping runner invocations. PASS, SKIP, FAIL, timeout and
cancellation remain distinct outcomes.

```sh
bun run typecheck
bun run typecheck:native
node test/run.mjs unit
node test/run.mjs unit --filter=praxis-cli,native-workspace-controller
node test/run.mjs unit --serial
bun run test:native
```

`bun run test` runs unit and native tiers. `bun run verify` adds live provider
turns; those require explicit authorization and credentials. Native test scripts
perform their own build and skip on non-macOS hosts or without Swift tooling.
Electron/Playwright application tests were removed when the runtime was retired.
Their historical coverage is not claimed as native parity.

Native integration uses a disposable profile/project, Swift host and real Bun
controllers. It checks project switching, sheets, streaming/queues, permissions,
source/content/style writes, window geometry, docking, preview input isolation and
that exactly one WebKit view exists. `PRAXIS_NATIVE_BACKGROUND_TEST=1` skips real
pointer gestures/animation timing, which must be reported as reduced coverage.
`test:native-live` separately submits a real provider turn against a fixture.

Read screenshots in `test/artifacts/native/` for UI verification. Offscreen
AppKit captures do not faithfully paint Liquid Glass; visible inspection may be
necessary. Never start the target project server manually alongside Praxis.

New tests belong in the appropriate array in `test/run.mjs`. Pure tests must own
their temporary directories/ports and clean up processes. Use injected service
registries when testing lifecycle behavior without the desktop. Renderer-specific
unit tests were removed; retained backend generation tests use React as a dev
fixture to verify that generated project code actually renders.
