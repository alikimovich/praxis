# Trezi migration and rollback

Trezi is the current product, package, CLI and generated app name. Compatibility
names below are supported without a scheduled removal date. Removing an alias
requires a separately tested migration; no external account rename is implied.

## Profiles, sessions and ownership

New installations use `~/.trezi`, `~/Library/Application Support/Trezi Native`
and its `trezi` session directory. The profile directory keeps its `Trezi Native`
name even though the built app is `Trezi.app` (LKM-108). `TREZI_HOME` overrides installation location;
`TREZI_USER_DATA` explicitly selects a native profile. Every `PRAXIS_*` environment
variable is accepted as a fallback to its `TREZI_*` counterpart; Trezi wins when
both are supplied. The installer reuses an existing `~/.praxis` checkout rather
than moving it. It installs both `trezi` and the `praxis` launcher alias.

When only the old native profile exists, Trezi atomically creates a directory
symlink `Trezi Native → Praxis Native`. The legacy physical directory stays put.
Inside the profile, `trezi → praxis` (or `dsgn` for the older layout) similarly
preserves all conversations, drafts, attachments, endpoint ciphertext, project
memory, workspace records and absolute worktree paths. Existing `.git` pointers
and parent Git administrative records still resolve; relocation and `git worktree
repair` are unnecessary. A real Git-worktree fixture verifies this property.

Alias publication is atomic and restartable: before publication the legacy tree
is unchanged, and after publication both names resolve to the same data. Both
native app versions acquire the same `native.lock` in that physical directory.
A live owner blocks startup; migration never removes its lock. Tests exercise a
live lock through the built backend. Do not run both versions simultaneously.
Retired Electron profiles are inventoried but neither imported nor modified.

If distinct old/new profiles coexist, startup stops without modifying either;
select one with `TREZI_USER_DATA`. Distinct session stores also stop initialization,
requiring explicit reconciliation. There is no automatic destructive merge.
Dangling or unexpected aliases fail rather than replacing an existing entry.

## Project metadata and instrumentation

On project detection, files under `.praxis` are copied to `.trezi` through an
exclusive temporary file and atomic hard-link publication. Original files stay
in place. Missing entries resume on retry; an interrupted unpublished temporary
file cannot become canonical data. Existing `.trezi` entries win. Differing
collisions emit a warning naming both paths and preserve both copies. Hidden
migration temporary files left by a killed process can be removed after all app
instances close; never remove canonical files to resolve a collision blindly.

Known `.dsgn` annotation/token/control data follows the prior migration policy,
using exclusive publication before removing the old data file. Its helpers stay.
Project metadata directories and entries must not be symlinks. All three sidecar
names remain excluded/protected from agent edits and destructive worktree cleaning.

Existing `.praxis/praxis-*` build imports keep working. Worktree synchronization
copies both generations of executable setup helpers, never user data. New setup
writes `.trezi/trezi-*` helpers and `data-trezi-*` stamps. Preview reads both stamp
families, preferring Trezi when both exist; old React Native IDs and simulator
query flags remain readable. Explicit setup uninstall handles both generations.

## Settings, credentials and protocol identities

Preferences read both prefixes. `trezi:*`/`trezi.*` values win even when null;
otherwise legacy values are exposed under the new key. Writes use Trezi keys,
retaining the old entries for recovery. Original workspace/session record schemas
and existing absolute path values are preserved, not text-substituted.

The bundle identifier `dev.praxis.native` and Keychain service
`dev.praxis.native.secrets` deliberately remain stable OS identities. Changing
these merely for branding would detach WebKit website data/permissions and the
master encryption key. The displayed app/bundle/executable/icon names are Trezi; the bundle is `Trezi.app`.
The rename does not read, export, rotate or log real user credentials; provider CLI
logins remain in their provider-owned stores. Actual Keychain access still requires
an unlocked macOS user session and was not exercised against personal credentials.

MCP uses the stable `praxis` server namespace so resumed transcripts keep their
qualified tool names; the executable is now `bin/trezi-agent-mcp.mjs`, with an old
entrypoint wrapper. The Claude plugin namespace and Codex `praxis-connection`
provider ID likewise remain stable. Preview IPC accepts the old prefix only
through the same view identity and allowlist checks. Media tokens accept both
schemes. Animation replay emits both event names for existing project listeners.
Existing `praxis/` and `dsgn/` work branches remain recognized; new branches use
`trezi/`. Old chat recovery branches remain included in recovery/pruning queries.

## Rollback

Close the app and preserve a backup before reconciliation or rollback. For native
profiles, remove only the Trezi symlink if desired; the original directory and
absolute worktree paths have not moved. Never recursively delete either alias.
If new and old stores coexist, compare and reconcile them offline, preserving
both originals; do not replace whole stores or concatenate session JSON blindly.

Project migration retains the Praxis originals; newer writes are in `.trezi`.
Before using an older binary, deliberately copy any desired newer records back
from a backup/reconciled copy. Preference legacy keys also represent the older
values, not a continuously updated downgrade mirror. Rolling back the program
alone cannot promise to expose every post-migration edit. Keep all backups until
conversations, settings, Git worktrees and project data have been verified.
