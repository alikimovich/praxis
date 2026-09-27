# LKM-84 reconciliation map

Base: `94b6dd6d3746e14cc0bf26e7fbd4a8fce1837f7e`.
Head: this worker's uncommitted result; the manager supplies the final commit hash.
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
| `data-praxis-source`, component stamp | `data-trezi-source`, component stamp | Dual readers, canonical precedence |
| `praxis-media:` | `trezi-media:` | Opaque registered capabilities only; both schemes |
| `praxisSim`, RN `praxis:` | `treziSim`, RN `trezi:` | Legacy query/ID accepted |
| MCP/plugin `praxis`, Codex `praxis-connection` | unchanged | Stable resumed-session identities |
| `praxis/chat-*`, `praxis/comment-*` | `trezi/chat-*`, `trezi/comment-*` | Existing branches retained; recovery recognizes both |
| external GitHub repository / installer URLs | unchanged | Separate administration pending |

Apply/review this rename independently. If LKM-84 lands first, reconcile its source
links and contract names using this table; if it lands later, update its audit to
the final rename head. Shared areas include AGENTS, README, NATIVE, PROVIDERS,
WORKTREES, native platform/index/Host, preferences, provider backends, setup,
preview instrumentation and test/build entrypoints. Transport payload schemas,
Bun service ownership, Swift responsibilities and provider lifecycle architecture
are unchanged. Do not mechanically change the retained compatibility identifiers.
Rerun typechecks, migration fixtures, native integration and the affected provider
and worktree tests after reconciliation. No automatic merge or backend rewrite.
