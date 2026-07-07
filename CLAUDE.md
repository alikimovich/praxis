# CLAUDE.md — working guide for Praxis (repo: dsgn)

Praxis (package/product name; repo, remote, and the `data-dsgn-source`
protocol still say **dsgn**) is an Electron app: an AI chat on the left that
edits a user's repo, with that repo's dev server live-previewed on the right.
Distributed as source (clone + `bun install` + `bun run dev`); each user
authenticates with their own provider subscription (`claude setup-token` /
`claude login`; Codex and Gemini backends exist behind the same seam).

## Start here every session

1. Read `docs/CONTEXT.md` (current state, decisions + rationale, what's verified).
2. Read `docs/TASKS.md` (the roadmap / what to do next).
3. When you finish a chunk, append to `docs/PROGRESS.md` (newest first) and
   tick `docs/TASKS.md`. **If your change invalidates a claim in CONTEXT.md or
   this file, fix that doc in the same commit** — stale docs mislead the next
   agent more than no docs.

## Commands

| Command | What |
| --- | --- |
| `bun run dev` | Launch the app (electron-vite, HMR) |
| `bun run build` | Build main/preload/preview/renderer to `out/` |
| `bun run typecheck` | Type-check all three tsconfig projects (node, web, preview). Run after every change |
| `bun run test:<name>` | One test (see package.json for ~40 aliases) |
| `bun run test` | Fast tier + all Electron UI tests |
| `bun run verify` | Everything incl. live-agent e2e (needs display + creds) |

Use **bun**, not npm/yarn. Node 22 (`.nvmrc`). `postinstall` runs
`scripts/patch-electron.mjs` (macOS-only, idempotent): it rebrands the dev
Electron.app bundle to Praxis — the dev bundle IS the product.

## Verify your own work WITHOUT asking the user

Tests come in three tiers — pick the cheapest that proves your change:

1. **Pure-bun logic tests** (`bun test/pr-body.mjs` etc., ~15 files) — no
   build, no display, run in seconds. Always run the relevant ones.
2. **Playwright/Electron UI tests** (`node test/<name>.mjs` after
   `electron-vite build`, or `bun run test:<name>` which builds first) — drive
   the built app, screenshot to `test/artifacts/`. **Read the PNGs** to see
   the actual UI; that's how you confirm work visually without a human.
3. **Live e2e** (`test:agent`, `test:codex`, `test:sim-e2e`) — run a REAL
   provider turn / iOS simulator. They self-SKIP (exit 0) without credentials
   or a sim; they FAIL if the turn ran but didn't produce the edit.

While iterating, run targeted `test:<name>` scripts; before declaring a chunk
done, run `bun run typecheck && bun run test` (and `verify` when agent/sim
behavior changed). Note: the preview is a native `WebContentsView` — a
separate CDP target that does NOT appear in renderer screenshots; capture it
with `capturePage()` or read its URL via
`electronApp.evaluate(({webContents}) => ...)`.

## Architecture — four process boundaries

```
src/
  main/           Electron main (CJS, Node)
    index.ts        window + native WebContentsView preview (IPC geometry sync)
    devserver.ts    detect framework/PM, spawn dev server, parse URL, readiness
    agent.ts        persistent multi-turn agent session (streams over agent:* IPC)
    backends/       provider seam: claude.ts, codex.ts, gemini.ts behind pickProvider
                    (gemini currently has NO SDK dep — treat as experimental)
    simulator.ts    iOS Simulator preview (Metro/Expo detect, MJPEG sim bridge)
    props.ts / props-svelte.ts   prop editing engines (React via react-docgen /
                    Svelte 5); they mirror each other's splice/apply contract
    tokens.ts       design-token detection/scaffold   annotations.ts  comments → PR
    git.ts, worktrees.ts          setup.ts, scaffold.ts, xcode.ts
    diagnose.ts, diag-cache.ts, diag-rules.ts         sessions-store.ts, edit-history.ts
  preload/index.ts  contextBridge → window.api (contextIsolation on, sandboxed)
  preview/preload.ts  SECOND preload, injected into the PREVIEWED app's
                    WebContentsView: element select/hover, comments, annotations.
                    Own tsconfig (tsconfig.preview.json)
  shared/api.ts     the IPC contract — single source of truth for cross-process types
  renderer/src/     React 18 UI: App.tsx, components/ (ChatPanel, PreviewPane,
                    PropPanel, CodeDrawer, Rail, …), zustand store.ts, shadcn ui/
test/             hand-rolled .mjs tests + fixtures/ + artifacts/ (PNGs, gitignored)
docs/             CONTEXT / TASKS / PROGRESS / DESIGN / plans / REVIEW-*
```

- The chat runs in `main` via provider SDKs; output streams over `agent:*` IPC
  into the zustand store. The store is the seam between transport and UI.
- Praxis **owns** the dev-server lifecycle of the target repo (never run the
  target's `dev` manually).

## Conventions

- **Tailwind CSS v4 + shadcn/ui** in the renderer (decision reversed from
  plain-CSS on 2026-06-26). Legacy custom-property CSS still lives in
  `renderer/src/styles.css`; prefer Tailwind utilities + shadcn primitives for
  new UI, and migrate legacy rules out of styles.css when you touch them.
- The Claude Agent SDK is **ESM-only** — `main` is CJS, so it's loaded via
  dynamic `import()` in `agent.ts`/`backends/` (never static/`require`).
- All cross-process types go in `src/shared/api.ts`; keep `DsgnApi`, the
  preload bridge, and the ipcMain handlers in sync — a change to one is a
  change to all three.
- New test = new `.mjs` in `test/` **plus** an entry in BOTH the `test` and
  `verify` package.json chains (they drift silently — check both; see
  `docs/REVIEW-2026-07-07.md` item 2 for the planned runner that fixes this).
- Keep files under ~500 lines; extract instead of appending to `App.tsx`,
  `store.ts`, or `styles.css` (already oversized — see the review doc).
- Auth is per-user at runtime; never commit secrets. Nothing sensitive in-repo.
- Commit in small, focused commits with the Co-Authored-By trailer.
