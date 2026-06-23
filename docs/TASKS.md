# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.

## Now / next

- [x] **Verify a real agent turn.** ✅ 2026-06-23 — `bun run verify` → AGENT-E2E OK
      (agent edited the fixture; SDK subprocess spawns fine in Electron).
- [ ] **Next: start v2** (element selection overlay — see below).

## v2 — design-system-aware select & edit (the differentiator)

- [ ] Inject a preload into the preview `WebContentsView` with a click-to-select overlay.
- [ ] Map selected DOM → React component + source location (babel/vite plugin in the
      target repo that stamps source attrs; `react-docgen` for prop schemas).
- [ ] `DESIGN.md` convention (fork open-design's 9-section schema; extend the
      components section with prop/token manifests). This defines what's editable.
- [ ] Prop/token editor panel rendered from the manifest; element comments + edits
      spawn a subagent to make the change.

## v3 — engineer handoff

- [ ] Annotations stored in a repo sidecar (`.dsgn/annotations.json`) the agent must
      NOT edit; render as pins in the UI.
- [ ] Publish → create a branch + GitHub PR with a generated summary + the annotations.

## Polish (anytime)

- [ ] First-run auth onboarding panel (friendly guidance if no Claude credentials).
- [ ] Permission approve/deny cards (tools are auto-approved today).
- [ ] Live thinking-level changes (currently applied only at project-open).
- [ ] Revisit assistant-ui once v2 UI needs grow (store seam is ready).
