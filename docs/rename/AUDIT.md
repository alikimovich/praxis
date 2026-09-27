# Native rename occurrence audit (LKM-85)

Base commit: `94b6dd6d3746e14cc0bf26e7fbd4a8fce1837f7e`.
Head: manager-owned commit pending; all implementation is left in this worktree.
This audit replaces the earlier Electron-baseline audit; no parent or parallel
worktree was read or modified.

[BASELINE.json](BASELINE.json) records each matching tracked source line, its path,
case variants and planned disposition. It includes package and lock metadata,
binaries, Swift/TypeScript names, assets/configuration, all environment variables,
preview events and stamps, provider tools, branch names, scripts, fixtures and
current/historical documentation. Source links resolve at the stated base commit;
line numbers in [RESIDUAL.json](RESIDUAL.json) resolve in the implementation head.
Renamed path mappings are in [COORDINATION.md](COORDINATION.md).

[PLAN.md](PLAN.md) describes the implementation stages. The manager owns staging
and final commits, including the audit/plan; the worker did not use Git write
commands. [MIGRATION.md](MIGRATION.md) describes behavior, precedence, interruption,
rollback and retained identities. [RUNTIME-INVENTORY.json](RUNTIME-INVENTORY.json)
is an existence-only inventory of legacy/current user locations plus generated
app paths. No user profile content, credentials, other worktrees or provider
account data was read. Ignored dependencies and test artifacts are not renamed or
committed. Normal native builds regenerate output under `out/native`.

## Remaining names

Run `bun scripts/audit-rename.mjs` to regenerate the complete residual source-linked
list. Every residual falls into these reviewed classes:

- Historical reference: existing `docs/PROGRESS.md` entries are immutable. Rename
  evidence and this scanner intentionally mention old names.
- Intentional compatibility alias: legacy CLI/helper wrappers and package scripts;
  environment fallback; profile/session aliases; old preference keys; legacy
  sidecar migration/protection/setup imports; old Git branch recognition; old
  source stamps, simulator IDs, media/preview/replay protocols; stable MCP/plugin,
  endpoint provider, bundle and Keychain identities; fixtures for these behaviors;
  documentation explaining those contracts. They are not accidental branding.
- Externally controlled dependency: upstream vendored catalog/provenance content
  remains byte-identical, and public URLs retain the existing repository name.
  The vendor package's host description is updated, but upstream examples are not
  rewritten or presented as new Trezi-generated output.
- Renamed: all other owned product/source occurrences and applicable paths now use
  Trezi. The baseline report records original names, not residual runtime usage.

## External URL inventory and prerequisites

The external references are `https://github.com/alikimovich/praxis.git` and
`https://raw.githubusercontent.com/alikimovich/praxis/main/install.sh`. Both remain
unchanged. No Trezi repository/domain/endpoint destination was invented. Repository
rename, redirects and installer URL migration require separate owner administration
and verification. Feedback and self-update use the checkout's actual Git remote.
The baseline's `http://${HOST}:${port}/?praxisSim=1` is a locally generated simulator
route, not an external endpoint: new routes use `treziSim`, and old query flags work.

## Verification

See [VERIFICATION.md](VERIFICATION.md) for exact outcomes and limitations. Existing
credentials were not extracted or exercised against personal Keychain entries.
Retaining the OS identity avoids credential rotation and WebKit store relocation;
a release still needs a visible native run and a user-authorized authentication
check in an unrestricted environment. No real provider call was made.
