# Trezi rename plan (LKM-85)

Base: `94b6dd6d3746e14cc0bf26e7fbd4a8fce1837f7e` (native candidate).
Head: manager-owned final commit; this worker does not stage or commit.

1. Inventory tracked text and paths; preserve the source-linked baseline in
   [BASELINE.json](BASELINE.json). Inspect ignored output names only, never secrets.
2. Rename owned branding, source identifiers, package/CLI and generated app paths.
   Keep external URLs at their existing destinations and historical progress intact.
3. Add legacy environment/CLI, preferences, project-data, preview and branch
   compatibility. Preserve the old native profile's physical location and absolute
   worktree references; expose it through a Trezi alias. Do not import Electron data.
4. Exercise fresh, legacy, repeat, interruption, collision and ownership fixtures;
   run typechecks, unit tests and the normal native build/integration command.
5. Publish residual occurrences, migration/rollback and LKM-84 reconciliation notes.

No backend ownership changes, remote repository/domain administration, other
worktree changes, provider calls, commits or merges belong to this worker.
