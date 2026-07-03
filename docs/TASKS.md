# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.

Shipped milestones (v2–v8) and dropped work now live in `docs/TASKS-archive.md`.
The active focus is **v9**.

## v9 — in-tool code view  ⭐ (2026-07-03, user-requested)

See the code of the inspected element without leaving dsgn (today that means
alt-tabbing to an editor).

- [x] **Phase 1 — read-only code peek + open-in-editor.** ✅ 2026-07-03 — a "Code"
      toggle on the Inspector shows the stamped file (highlight.js, line-number
      gutter, element line-span marked, auto-scrolled to the stamp) via a new
      `source:read` IPC; `source:open-in-editor` jumps to `file:line:col` in
      code/cursor/zed/subl (fallback: OS default app). `test/code-peek.mjs`.
- [x] **Phase 2 — editable code drawer.** ✅ 2026-07-02 — CodeMirror 6 in a bottom
      drawer under the preview. `usePanelInset` gained a `bottom` value; `PreviewPane`
      shrinks the native view's HEIGHT by it (the DOM drawer fills the freed strip,
      since it can't float over the native view). Opened from the read-only peek's
      "Edit" ⤢; whole file, scrolled to the stamp with its line span highlighted.
      Save (⌘S) routes through `source:write` → `commitEdit`, so undo/redo + HMR are
      free; a stale-baseline write is refused as a conflict (with Reload). `useCodeDrawer`
      store; closes on project switch. `test/code-drawer.mjs`.
      **Known limit:** when the floating PropPanel (right strip) is also open, it
      overlaps the drawer's top-right in a narrow window — they're complementary but
      unaware of each other's inset.
