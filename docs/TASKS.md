# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.

## Now / next

- [x] **Verify a real agent turn.** ✅ 2026-06-23 — `bun run verify` → AGENT-E2E OK
      (agent edited the fixture; SDK subprocess spawns fine in Electron).
- [x] **v2 first slice: click-to-select → source → chat.** ✅ 2026-06-23 — overlay
      preload, inspector, `data-dsgn-source` resolution, composer hand-off; covered by
      `test/select-element.mjs`.
- [ ] **Next:** polish / cross-file prop resolution / design-token manifests (see below).

## v2 — design-system-aware select & edit (the differentiator)

- [x] Inject a preload into the preview `WebContentsView` with a click-to-select overlay.
      (`src/preview/preload.ts` — shadow-DOM highlight + pick.)
- [x] Map selected DOM → source location via the `data-dsgn-source` stamp
      (nearest-ancestor resolution; CSS-selector fallback). See `docs/DESIGN.md`.
- [x] `react-docgen` prop schemas. ✅ 2026-06-23 — `src/main/props.ts` parses the source
      file at the stamp line and runs react-docgen for the component's prop types/enums.
- [x] `DESIGN.md` convention started — `data-dsgn-source` stamping + a reference Vite/Babel
      plugin documented. (Full open-design 9-section schema is still future work.)
- [x] **Prop/token editor panel.** ✅ 2026-06-23 — typed controls in the inspector
      (string/number/boolean/enum); **hybrid apply**: simple literals are spliced straight
      into source (instant hot-reload), complex values fall back to the agent. Covered by
      `test/prop-edit.mjs`.
  - [x] Cross-file component resolution. ✅ 2026-06-23 — follows the component's relative
        import to its definition file and runs react-docgen there (matches the exported name;
        barrel re-exports can't mis-attach).
  - [x] **Design tokens.** ✅ 2026-06-23 — `src/main/tokens.ts` auto-detects the source per
        project (`.dsgn/tokens.json` manifest → `tailwind.config.*` static parse → CSS custom
        properties) and the inspector shows a token palette; clicking a token applies it via
        the agent.

## v3 — engineer handoff

- [x] Annotations stored in a repo sidecar (`.dsgn/annotations.json`). ✅ 2026-06-23 —
      `src/main/annotations.ts`; the agent is denied writes under `.dsgn/` (agent.ts guard).
      Rendered as numbered pins over the preview (`src/preview/preload.ts`) + a notes panel.
- [x] **Publish → branch + GitHub PR.** ✅ 2026-06-23 — `publishToPr` creates a branch,
      commits, pushes, and `gh pr create`s with a generated body (notes + changed files).
      Covered by `test/annotations.mjs` (storage + UI); the live `gh` path is user-triggered.

## Polish (anytime)

- [x] First-run auth onboarding panel — auth-error detection (`isAuthError`) → amber
      guidance banner pointing at `claude setup-token`. (`08-auth-onboarding.png`.)
- [x] **Permission approve/deny cards.** ✅ 2026-06-23 — `canUseTool` now surfaces an
      approve/deny card per gated tool and awaits the user (read-only tools auto-allowed so
      Ask mode stays usable). A toolbar selector sets the SDK permission mode:
      **Ask (`default`) · Auto-accept edits (`acceptEdits`) · Auto: approve all
      (`bypassPermissions`)** — "Auto" is real SDK bypass via `query.setPermissionMode`, and
      the mode is also passed at project-open so it persists. This is the backstop for the
      v2 select→prompt injection surface.
- [ ] Live thinking-level changes — **blocked**: the SDK `Query` has `setModel` but no
      live effort setter, so changing it mid-session would require restarting the
      session (losing history). Applied at project-open for now.
- [ ] Revisit assistant-ui once v2 UI needs grow (store seam is ready).
