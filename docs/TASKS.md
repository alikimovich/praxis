# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.

## Now / next

- [x] **Verify a real agent turn.** ✅ 2026-06-23 — `bun run verify` → AGENT-E2E OK
      (agent edited the fixture; SDK subprocess spawns fine in Electron).
- [x] **v2 first slice: click-to-select → source → chat.** ✅ 2026-06-23 — overlay
      preload, inspector, `data-dsgn-source` resolution, composer hand-off; covered by
      `test/select-element.mjs`.
- [ ] **Next:** prop/token editor panel (below) — turn "edit the file" into
      "edit the prop/token" without a full agent round-trip.

## v2 — design-system-aware select & edit (the differentiator)

- [x] Inject a preload into the preview `WebContentsView` with a click-to-select overlay.
      (`src/preview/preload.ts` — shadow-DOM highlight + pick.)
- [x] Map selected DOM → source location via the `data-dsgn-source` stamp
      (nearest-ancestor resolution; CSS-selector fallback). See `docs/DESIGN.md`.
  - [ ] Still TODO: `react-docgen` prop schemas (needed for the editor panel below).
- [x] `DESIGN.md` convention started — `data-dsgn-source` stamping + a reference Vite/Babel
      plugin documented. (Full open-design 9-section schema is still future work.)
- [ ] Prop/token editor panel rendered from a manifest; element comments + edits
      spawn a subagent to make the change.

## v3 — engineer handoff

- [ ] Annotations stored in a repo sidecar (`.dsgn/annotations.json`) the agent must
      NOT edit; render as pins in the UI.
- [ ] Publish → create a branch + GitHub PR with a generated summary + the annotations.

## Polish (anytime)

- [x] First-run auth onboarding panel — auth-error detection (`isAuthError`) → amber
      guidance banner pointing at `claude setup-token`. (`08-auth-onboarding.png`.)
- [ ] Permission approve/deny cards (tools are auto-approved today). **Now also a
      security priority:** v2 lets the semi-trusted previewed page seed prompt text, so an
      auto-approving Bash/edit agent widens the injection surface. Renderer-side input is
      sanitized (control-char stripping, source validation, length caps), but real
      approve/deny UI is the proper backstop before the select→prompt path is trusted further.
- [ ] Live thinking-level changes — **blocked**: the SDK `Query` has `setModel` but no
      live effort setter, so changing it mid-session would require restarting the
      session (losing history). Applied at project-open for now.
- [ ] Revisit assistant-ui once v2 UI needs grow (store seam is ready).
