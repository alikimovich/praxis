# CONTEXT — collapsed project state

> The handoff doc. Read this first to resume work (esp. on another machine).
> Last updated: 2026-06-23.

## What dsgn is

An Electron app for AI-assisted design/prototyping **on your own repos**. Open a
folder → dsgn detects the framework, runs its dev server, and shows it live on
the right; a Claude chat on the left edits the running repo (hot-reload). Unlike
Figma Make / Claude Code's sandbox, it previews *your real repository* and
respects that repo's `CLAUDE.md` + skills.

Internal team tool, distributed as **source** (clone + run). Per-user Claude
subscription auth. Repo: `alikimovich/dsgn` (private).

## Locked decisions (and why)

- **Electron** (electron-vite + React + TypeScript). Chat left, preview right.
- **Agent core = Claude Agent SDK** in the main process (not ACP). Chosen because
  the product differentiator (custom tools wired to the renderer: select element →
  edit props → annotate → PR) needs in-process SDK tools. Pricing is NOT a factor —
  both run on the Claude subscription.
- **Preview = native `WebContentsView`** (not iframe), positioned by main via IPC
  geometry sync — so a preload can be injected into the previewed app for v2.
- **Plain CSS**, no Tailwind / no UI kit (user preference). assistant-ui was
  evaluated and **deferred**: its styled UI now needs shadcn/Tailwind scaffolding =
  risk; the zustand store is kept as the seam so it can drop in later.
- **React-first** for the eventual element/prop inspection.
- **dsgn owns the dev-server lifecycle** (spawns + stops it; user must not also run
  `dev` manually for an opened project — port/lock clash). Killed on app quit.
- **Distribution: clone-and-run from source.** No signing/installer/auto-update.

## Current state (all building green)

Works: open folder → detect → spawn dev server (readiness-polled) → native preview;
multi-turn Agent SDK chat (cwd=repo, `settingSources` + `claude_code` preset so the
repo's CLAUDE.md/skills apply); markdown rendering; tool-use status lines; model
picker (live via `query.setModel`), thinking/effort selector, `/` skill menu (from
the SDK init message's `slash_commands`); drag-to-resize split; custom dev-command
escape hatch; Reload/Stop. Hardened per an adversarial review (session epoch guard,
sandboxed windows, preview navigation pinning, etc. — see PROGRESS.md).

## Verification status

- **Real agent turn: VERIFIED (2026-06-23).** `test/agent-e2e.mjs` ran a live Claude
  turn that opened the editable fixture and edited `index.html` — proving the full
  pipeline (open → dev server → agent → tool-use file edit) works AND that the Agent
  SDK's CLI subprocess spawns correctly inside Electron (the previously-flagged runtime
  risk is resolved). Re-run `bun run verify` on any machine with `claude login`; it
  SKIPs cleanly where no credentials exist.

## Key files

- `src/main/agent.ts` — Agent SDK session, `InputStream` queue, streaming → IPC,
  epoch guard, slash-commands, setModel. ESM SDK loaded via dynamic `import()`.
- `src/main/devserver.ts` — detect + spawn + URL parse + readiness + conflict errors.
- `src/main/index.ts` — window, native preview view, geometry sync, hardening.
- `src/renderer/src/components/ChatPanel.tsx` — chat UI, toolbar, slash menu.
- `src/renderer/src/store.ts` — `useChat` + `useSession` (the assistant-ui seam);
  exposes `window.__dsgnStore/__dsgnSession` for the test harness.
- `src/shared/api.ts` — the IPC contract (keep preload + handlers in sync).

## Gotchas

- Agent SDK is ESM-only; `main` is CJS → dynamic `import()` only.
- Native `WebContentsView` is a separate CDP target — not in renderer screenshots
  (use `capturePage()`); it also eats mouse events (hidden during resize drag).
- bun blocks postinstall for untrusted deps — `electron`/`esbuild` are in
  `trustedDependencies` so their binaries install.
