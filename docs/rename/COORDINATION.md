# LKM-84 reconciliation map

Original native audit base: `94b6dd6d3746e14cc0bf26e7fbd4a8fce1837f7e`.
Committed implementation head reviewed here: `567e69642a8c132d4ce5720afb3501d4332af764`.
Actual integration target (`candidate`, recorded 2026-09-27):
`c4b1aad8f7086a5f92d6f776b7b6273b792bf348`, also the merge base of that head and target.
This follow-up corrects legacy recovery/stamping and records these pinned references;
its working-tree changes are additional to the recorded implementation head.
LKM-84 (`agent-os/lkm-84-3b404096`, run `3b404096-0886-44d6-a7b9-56796792aacf`)
is an independent audit, not a prerequisite. Its worktree was not accessed.

| Old | New | Compatibility / integration note |
| --- | --- | --- |
| `bin/praxis.mjs` | `bin/trezi.mjs` | Old executable symlinks to new entrypoint |
| `bin/praxis-agent-mcp.mjs` | `bin/trezi-agent-mcp.mjs` | Old helper wrapper retained |
| `src/main/praxis-agent-tools.ts` | `src/main/trezi-agent-tools.ts` | Update source links/imports, interface prefix `Trezi` |
| `test/praxis-agent-tools.mjs`, `test/praxis-cli.mjs` | `test/trezi-agent-tools.mjs`, `test/trezi-cli.mjs` | Runner registrations updated |
| `agent-plugin/skills/praxis-preview` | `agent-plugin/skills/trezi-preview` | Legacy skill entry remains available |
| `test/fixtures/tokens-priority/.praxis` | `test/fixtures/tokens-priority/.trezi` | Canonical fixture metadata |
| `Praxis Native.app`, `PraxisHost`, `Praxis.icns` | `Trezi Native.app`, `TreziHost`, `Trezi.icns` | Normal build regenerates outputs |
| `dev.praxis.native`, `dev.praxis.native.secrets` | unchanged | OS persistence and credential identities |
| native profile `Praxis Native` / session `praxis` | `Trezi Native` / `trezi` | In-place aliases, same writer lock and absolute Git paths |
| `.praxis/praxis-*` | `.trezi/trezi-*` | Existing helpers retained/synchronized |
| `PRAXIS_*` | `TREZI_*` | Legacy environment fallback; canonical wins |
| `praxis:`/`praxis.` preferences | `trezi:`/`trezi.` | Legacy read, canonical write, original values retained |
| `praxis:preview:*` | `trezi:preview:*` | Incoming aliases normalize before allowlist |
| `data-praxis-source`, component stamp | `data-trezi-source`, component stamp | Dual readers, canonical precedence; HTML stamping preserves existing legacy mappings |
| `praxis-media:` | `trezi-media:` | Opaque registered capabilities only; both schemes |
| `praxisSim`, RN `praxis:` | `treziSim`, RN `trezi:` | Legacy query/ID accepted |
| MCP/plugin `praxis`, Codex `praxis-connection` | unchanged | Stable resumed-session identities |
| `praxis/chat-*`, `praxis/comment-*` | `trezi/chat-*`, `trezi/comment-*` | Existing branches retained; recovery recognizes both |
| external GitHub repository / installer URLs | unchanged | Separate administration pending |

The target already contains LKM-84 commits
`86d224c27931025b6f8158d0d44156f8f6afe7a2` and
`678de9570fceb5b40c5e279fe72dae35ebd0af9d`. Rename/audit reconciliation is recorded in
`831c771eb90cf44da5d5cccc30460c2a4c039cdd` before the implementation head above.
The seven `docs/SWIFT-BACKEND-*.md` documents are byte-identical between the pinned
target and implementation head. Reproduce that check with:

```sh
git diff c4b1aad8f7086a5f92d6f776b7b6273b792bf348 567e69642a8c132d4ce5720afb3501d4332af764 -- 'docs/SWIFT-BACKEND-*.md'
git diff --name-status c4b1aad8f7086a5f92d6f776b7b6273b792bf348 567e69642a8c132d4ce5720afb3501d4332af764
```

Integration order is therefore the recorded candidate audit, the committed rename
implementation, then these review corrections. The manager should compare any newer
candidate with the pinned target before integrating; do not reapply or overwrite the
LKM-84 snapshots. Keep future contract changes in its separate audit proposal until
authorized. Shared areas include AGENTS, README, NATIVE, PROVIDERS,
WORKTREES, native platform/index/Host, preferences, provider backends, setup,
preview instrumentation and test/build entrypoints. Transport payload schemas,
Bun service ownership, Swift responsibilities and provider lifecycle architecture
are unchanged. Do not mechanically change the retained compatibility identifiers.
Rerun typechecks, migration fixtures, native integration and the affected provider
and worktree tests after reconciliation. No automatic merge or backend rewrite.
