# Verification — 2026-09-27

Executed in the supplied native worktree using Bun 1.3.13. No provider calls,
Git staging/commits, external resource mutations or other worktree edits.

| Check | Result |
| --- | --- |
| Configured Bun loop: `typecheck`, `typecheck:native`, `test:native` | Exit 0 |
| `bun run typecheck` | Pass (backend and preview) |
| `bun run typecheck:native` | Pass |
| `bun run test:native` | Exit 0; normal build produced Trezi Native.app and direct-launch argument checks passed |
| `bun test/rename-compat.mjs` | Pass, including real Git worktree paths, live profile-lock refusal and both CLI names |
| `bun test/sidecar-migrate.mjs` | Pass (existing dsgn behavior) |
| `bun test/provider-skills.mjs`, `bun test/skills-install.mjs`, `bun test/trezi-cli.mjs` | Pass |
| `bun test/run.mjs unit` | 92 pass, 9 fail, 101 total |
| `bun test/docs-links.mjs` | Fails only because new rename docs are not yet in the manager-owned index |
| `bash -n install.sh`, `git diff --check` | Pass |
| `bun scripts/audit-rename.mjs` | Residual occurrence report regenerated |
| `bun run check` | Not applicable: package has no `check` script |

Final unit report: `test/artifacts/runs/run-6OUUdc/summary.json` (ignored runtime
artifact). The earlier run before new docs/fixtures had 92 pass and 8 fail.
Failures in the final run:

- `trezi-agent-tools`, `codex-mcp`: sandbox EPERM when binding a Unix socket.
- `native-shutdown`, `native-preview-recovery`, `devserver-net`: fixture listeners
  cannot bind here (EADDRINUSE/failed-listener/no-free-port outcomes).
- `native-boundary`: undeclared `@modelcontextprotocol/sdk` runtime dependency,
  already reported in the baseline progress log; the runner also reports EPERM
  trying to kill the failed subprocess.
- `setup-next`: missing `@types/react/package.json` fixture dependency.
- `test-runner`: its subprocess success assertion gets exit 1; not resolved here.
- `docs-links`: README references the two new rename documents. This check uses
  the Git index, not file existence. The files exist; the manager must stage them
  and rerun the check. The worker did not weaken the check or stage files.

The native command emitted no smoke-completion evidence or PNGs in this sandbox.
Its successful exit proves build/direct-launch checks, not visible UI acceptance.
No screenshot could be inspected. Native visual behavior and real Keychain access
remain release checks in an unrestricted, unlocked macOS session. Background-test
mode was not enabled. Retained bundle/Keychain identities are documented and were
not tested by reading personal credentials.

Migration coverage uses disposable fixtures: fresh profile naming; legacy profile
and session aliases; repeated/restarted alias creation; partially copied project
data; old/new profile and session collisions; canonical sidecar collision precedence
with both copies preserved; symlink rejection; preference precedence and canonical
writes; environment precedence; legacy sidecar protections; old source stamps and
branches; and actual Git worktree resolution after logical migration. Simulated
interruption checks do not represent a power-loss/fsync durability guarantee.

Manager follow-up: stage the complete new files, rerun docs-links, supply the final
head hash in the coordination report, and rerun blocked native/MCP/network checks
in an unrestricted environment before acceptance.
