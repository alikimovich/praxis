# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.

## Now / next

- [x] **Verify a real agent turn.** ✅ 2026-06-23 — `bun run verify` → AGENT-E2E OK
      (agent edited the fixture; SDK subprocess spawns fine in Electron).
- [x] **v2 first slice: click-to-select → source → chat.** ✅ 2026-06-23 — overlay
      preload, inspector, `data-dsgn-source` resolution, composer hand-off; covered by
      `test/select-element.mjs`.
- [ ] **Next:** polish / cross-file prop resolution / design-token manifests (see below).

## v4 — React Native / iOS-Simulator preview (macOS-only)

Show a booted iOS Simulator running an Expo/RN app in the right pane instead of a
web browser. Phased: mirror → interact → element-select. See
`docs/CONTEXT.md` and the 2026-06-25 PROGRESS entry.

- [x] **Phase 1 — view-only live mirror.** ✅ 2026-06-25 — detect `expo`/`react-native`
      (`previewKind: 'simulator'`), `simulator.preflight()` gates macOS+Xcode (clean card
      otherwise), `src/main/simulator.ts` boots a sim + starts Metro/launches the app + serves
      an MJPEG "sim bridge" that the existing `WebContentsView` loads as just-another-URL.
      Tests: `sim-detect`, `sim-preflight`, `sim-frame` (transport, off-macOS), `sim-e2e`
      (macOS-gated SKIP).
- [ ] **Phase 2 — interaction.** Forward tap/scroll/type from the bridge page → `idb`
      (optional dep) over a `/control` WebSocket; degrade to view-only without idb.
- [ ] **Phase 3 — element-select → RN source.** Babel `testID` stamp (the `data-dsgn-source`
      analog, `setup.ts` strategy `babel-plugin-rn`) + `idb` view-hierarchy hit-test → reuse the
      existing Inspector/`props.inspect` flow.

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

## Editing readiness (built)

- [x] **Gate prop editing on dsgn-readiness.** ✅ 2026-06-23 — only schema-backed components
      are editable (`hasSchema`); unready ones are prompt-only.
- [x] **Floating prop panel** on the preview's right edge (reserves a strip; native view can't
      be floated over). ✅ 2026-06-23.
- [x] **On-open setup offer** — detects unstamped projects and offers to scaffold the stamping
      plugin + agent-type the components. ✅ 2026-06-23.
- [x] **Framework-aware setup** — detect the UI framework from `package.json` deps BEFORE
      generating anything, emit the right instrumentation into `.dsgn/` (React/Solid Babel plugin,
      Svelte markup preprocessor; Vue→inspector, unknown→nothing), send framework-correct agent
      instructions, verify stamps actually fired, and offer `setup:uninstall`. ✅ 2026-06-24 —
      `src/main/setup.ts`, `test/setup-detect.mjs`.
- [x] **Inline text editing.** ✅ 2026-06-24 — double-click a stamped text-only element in the
      preview to edit its text in place; writes straight to source (`applyTextEdit`), agent
      fallback for expression/mixed/Svelte content. (`test/text-edit.mjs`.)
- [x] **Auto-restart the preview after setup** so the wired-in config applies without a manual
      reload; the post-restart readiness report is the verdict. ✅ 2026-06-24 — `App.restartPreview`,
      `test/setup-restart.mjs`.
- [x] **Svelte inline text-splice** — rewrite a plain-text `.svelte` element's content directly in
      source (svelte/compiler), agent-fallback for expression/mixed. ✅ 2026-06-24 —
      `applySvelteTextEdit` in props-svelte.ts, `test/text-edit-svelte.mjs`.
- [x] **First-run `.dsgn/tokens.json` offer** — when a project has no tokens at all, offer a
      starter manifest (deterministic write; never shadows Tailwind/CSS or clobbers a manifest).
      ✅ 2026-06-24 — `scaffoldManifest` in tokens.ts, `TokenOfferCard`, `test/tokens-scaffold.mjs`.
- [x] **Svelte component prop schema reachable (option D).** A host element inside a component
      definition surfaces that file's own props (no DOM node carries the usage stamp); edits route
      to the agent as a default change. ✅ 2026-06-25 — `inspectSvelteProps`, `test/prop-svelte-self.mjs`.
- [ ] **Svelte per-instance prop editing (option C).** Map a clicked DOM node → its owning Svelte 5
      component instance → the usage location, for true per-instance edits across all component shapes.

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
