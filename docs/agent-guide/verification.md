# Agent guide — commands and verification

Moved from the old `CLAUDE.md` ("Commands", "Verify your own work WITHOUT asking the
user") and `AGENTS.md` ("Commands and verification"). Linked from
[AGENTS.md](../../AGENTS.md). Runner details: `docs/TESTING.md`.

## Commands

Use **bun**, not npm/yarn. Node 22 (`.nvmrc`) remains available for tooling/tests.
Native builds require macOS 13.3+ and command-line tools with the macOS 26 SDK.

| Command | What |
| --- | --- |
| `bun run dev` / `bun run dev:native` | Build and launch the native app (Swift host + Bun services) |
| `bun run build` / `bun run build:native` | Build Swift host, Bun services and preview to `out/native/` |
| `bun run start` | Launch the existing native build |
| `trezi --project <repo>` | Launch/open a project through the CLI |
| `bun run typecheck` | Type-check native/backend/shared code and isolated preview. Run after every change |
| `bun run typecheck:native` | Native/backend/shared check only |
| `node test/run.mjs unit` | Backend and controller tests, no desktop |
| `bun run test:<name>` | One test (see package.json for ~40 aliases) |
| `bun run test:native` | Disposable-profile native desktop integration |
| `bun run test` | Unit + native UI tiers (via `test/run.mjs`) |
| `bun run test:native-live` | Real provider fixture edit; requires authorization |
| `bun run verify` | Everything incl. live-agent e2e (needs display + creds) |
| `bun run lint` | Biome lint over `src` + `test` |

The `dev:native`, `build:native`, and `typecheck:native` aliases remain supported.

## Verify your own work WITHOUT asking the user

- After changes run `bun run typecheck` and the relevant unit tests. Native changes
  also require `bun run typecheck:native` and `bun run test:native`. `bun run test`
  combines unit and native checks.
- Live provider calls (`test:native-live` / `verify`) require authorization. Do not
  run real provider calls without it.
- The runner tiers are `unit`, `native`, `live`, and `all`. Unit jobs are bounded
  (bounded concurrency); native/live jobs are serial and use disposable profiles. Use
  `--serial` for diagnosis. Logs and JSON reports live in `test/artifacts/runs/`.
  SKIP is distinct from PASS. See `docs/TESTING.md` for filtering, logs, timeouts and
  isolation rules.
- Read captured PNGs to verify UI without asking the user. Offscreen AppKit captures
  (image caching) cannot reliably paint Liquid Glass; use visible checks when needed.
- `TREZI_NATIVE_BACKGROUND_TEST=1` skips real preview pointer gestures and animation
  timing; report that reduced coverage.
- No Electron tests remain.
- `bun run dev:native --test --only=group,group` (or `bun test/native-runtime.mjs
  --only=…`) runs only the named native smoke groups: `core`, `islands`,
  `shadow-light`, `sidebar`, `settings`, `chat`, `composer`. An unknown name fails
  before the build; no flag runs every group, which acceptance still requires.
  Groups are defined in `src/native/smoke-groups.ts`.
- `test/docs-links.mjs` (unit tier) fails CI if an anchored path (`src/…`, `docs/…`,
  `test/…`, …) referenced in `AGENTS.md`, `CLAUDE.md`, `README.md` or
  `docs/agent-guide/*.md` no longer exists.

## Evidence budget

The Evidence budget is kept verbatim in `AGENTS.md` (every agent must see it).
