# Swift provider owner: provider adapters and helper capability enforcement (S10)

LKM-98, roadmap row S10 ("Provider adapters, authentication, catalogs and tools") of the
[canonical plan](SWIFT-BACKEND-PLAN.md) and [roadmap](SWIFT-BACKEND-ROADMAP.md). It
follows [conversation](SWIFT-BACKEND-CONVERSATION.md). Under the default launch
(`TREZI_BACKEND_OWNER=swift`) every provider session is opened in the Swift service
first and gets its grant there. The service answers the session's permission requests
and tool authorizations, holds Stop's deadline, persists the provider thread a restored
chat resumes, and supervises provider helpers, holding them to their grant.

- `src/service/ProviderOwner.swift`: requests, session lifecycle, Stop's deadline,
  violations and relays, drain. `src/service/ProviderFrames.swift`: helper frames, tool
  replies and value checks (events, record deltas, images, tool results).
- `src/service/ProviderPolicy.swift`: the policy, pure: grants, permission decisions,
  tool authorization, bounds, image validation.
- `src/service/ProviderHelper.swift`: helper processes (descriptors, environment,
  process group, bounded frames).
- `src/service/ProviderStore.swift`: `sessions.json` and `resume.json`.
- `src/native/provider-service.ts`: Bun's client. `src/main/provider-owner.ts` is the
  seam; `src/main/provider-model.ts` is the in-process twin (the rollback owner), and
  `src/main/provider-policy.ts` the twin's policy (the Swift policy mirrors it).
- `src/main/provider-sessions.ts` opens every session agent.ts starts with the owner.
  `src/main/session-tools.ts` runs Trezi's tools for Codex's bridge and for helpers.
- `src/main/backends/helper-host.ts` runs inside a helper;
  `src/main/backends/helper-session.ts` is Bun's view of a helper-hosted session.

## The integration boundary, decided

The open question in the plan was "native protocol vs SDK helper". Neither SDK has a
public protocol Trezi could speak natively with established parity: the Claude Agent SDK
drives the Claude Code CLI over its private control protocol, and the Codex SDK drives the
`codex` CLI. So providers stay **SDK adapters**, and the end state is one supervised
**helper** process per session, running the adapter under the helper host.

Live provider calls are not authorized for verification, so parity of the real Claude
and Codex adapters inside helpers is reported SKIP (not PASS). In this step:

- the helper runtime is complete: the service spawns, supervises, bounds and polices
  helpers, and Bun hosts their sessions as ordinary `ProviderSession`s. It is verified
  with a scripted fake provider inside the real helper host (below);
- under the Swift launch the built-in adapters (Claude, Codex, experimental Gemini) run
  in supervised helpers (`provider-helper.cjs` via `ProviderOwner.Options.helper`). They
  no longer decide anything the owner decides; they ask it for permission answers, tool
  authorization and Stop's deadline, and report turns, terminal events and thread ids;
- remaining before the retirement gate opens: move the provider catalog, connections
  store and related Bun-owned census rows to the Swift owner; hand a Codex connection's
  key to its helper over the open frame (today `resolveConnection` decrypts it in Bun);
  route the Claude model-catalog update through Bun without Bun writing the cache file.

## The domain, exactly

| Item | Owner (swift launch) | Owner (legacy launch) |
| --- | --- | --- |
| Session grants: which Trezi tools a session may run (a background edit: not `open_code` or `chat_island`), its roots, its chat | Swift, fixed at `open` from provider, background flag and roots | TS twin |
| Permission decisions (Claude's `canUseTool`, helper requests): questions, Trezi tools, `.trezi/` sidecar, Trezi's own data, read-only tools, closed session, else ask | Swift decides; the adapter settles the SDK callback | TS twin (same policy) |
| Trezi tool authorization (Claude's in-process tools, Codex's MCP bridge, helper tool calls) | Swift; Bun runs an authorized tool | TS twin |
| Stop: the graceful cancel's deadline and the decision to kill | Swift; Bun runs an in-process adapter's kill switch, Swift kills a helper itself | TS twin (same deadline) |
| Session lifecycle journal `<profile>/service/providers/sessions.json` | Swift | untouched |
| Resume ids `<profile>/service/providers/resume.json` (newest per session record, 500 kept) | Swift | untouched (records carry `sdkSessionId`, as before) |
| Helper processes: spawn, environment, descriptors, process group, watchdog, runtime journal entry, frame checks | Swift | none (the twin hosts no helpers) |
| Provider SDK sessions, prompts, streaming, title and memory generation | Bun (in-process adapters) | Bun |
| Credentials: Claude login in the Keychain / `~/.claude`, Codex login in `~/.codex`, connection keys encrypted by `providers-store.ts` | unchanged stores; the owner never sees or passes a secret | unchanged |
| Chat records, turns, approvals registry, spawn admission | conversation owner (S11) | TS twin |

## Rules

- **Grants.** `open` fixes a session's chat, provider, roots and background flag. The
  granted tools derive from them (`ProviderPolicy.granted`). Nothing a session asks
  for later widens its grant, and a closed or stopped session is granted nothing.
- **Permissions.** In order, exactly as the pre-S10 Claude adapter decided (so its
  behaviour is unchanged): `AskUserQuestion` → question (deny if the session is
  closed); Trezi's own tools → allow (a background session is denied `open_code` and
  `chat_island`); an edit path or Bash command touching `.trezi/`, `.praxis/` or
  `.dsgn/` → deny; an edit path inside Trezi's profile but outside the session's own
  roots → deny (new: another chat's worktree, the session files, the service
  stores); read-only tools → allow; a closed session → deny; else ask the user. An
  owner that cannot answer fails closed. Only the path or command crosses Bun's pipe
  (a `Write` carries the whole file, and a line over the pipe's 32 MiB limit fails the
  private bridge closed); one longer than 4 Mi UTF-16 units is denied unchecked.
- **Tools.** A Trezi tool runs only if it is in the grant and its JSON arguments are at
  most 256 KiB. A refusal is the tool's `{error}` result the model reads. Claude's
  in-process tools, the Codex MCP bridge and helper tool calls all pass the same check.
- **Stop.** `cancel` starts the owner's 3 s deadline and answers when the graceful stop
  settled (`escalate: false`) or the deadline passed (`escalate: true`). An in-process
  adapter's kill switch (`ProviderSession.forceStop`, else shutdown) then runs once, and
  nothing is reported settled after it. A graceful answer that races the deadline keeps
  the session. An unreachable owner falls back to the same local bound, so Stop always
  works (`interruptWithOwner`).
- **Resume.** Each new thread id a session reports is persisted with its session record
  id. Reopening a project whose current record lacks `sdkSessionId` (a crash between
  the provider reporting one and the record being saved) resumes the persisted one. A
  record's own id always wins.
- **Sessions journal.** A session still listed at launch was cut off by a crash; `status`
  reports it (`interrupted` if a turn was in flight) and the list starts empty.

## Helpers: privilege enforcement, not pipe isolation

A pipe does not isolate a process: the helper runs as the user. What it can reach is
decided by the service and checked:

- **Descriptors.** Only stdin, stdout and stderr, each a new pipe
  (`POSIX_SPAWN_CLOEXEC_DEFAULT`). No Bun pipe, XPC connection or profile lock. Tested:
  a descriptor the service holds open without close-on-exec is not in the helper.
- **Environment.** Rebuilt from an allowlist: HOME, PATH, user, shell, locale, temp,
  plus its own provider's prefixes (`ANTHROPIC_`/`CLAUDE_`, `OPENAI_`/`CODEX_`). Every
  `TREZI_*` variable (profile path, service pid, the agent tool socket token) and other
  providers' keys are left out. Tested with planted secrets.
- **Process group.** Its own group, a `--watch-group` watchdog and a runtime journal
  entry, so a crashed service's helper is stopped at the next launch (tested with a
  helper that ignores EOF and SIGTERM).
- **Frames.** Lines of at most 24 MiB (a screenshot or pasted images fit). Every frame
  is validated against the protocol and the grant. A **violation** refuses the frame and
  stops the helper, and a turn it cut off ends once. Violations are: a longer line, a
  non-object, an unknown type, an event for another chat or spawn, an event type the
  protocol does not relay (`permission-request`, `question-request` and `title` go
  through the owner, never straight from a helper), a user transcript entry, extra
  fields, or more than 8 open tool calls or 32 open approvals. `status` lists them.
- **Tools.** A tool call outside the grant is refused with the tool's error (the model
  asked), not a violation. An authorized one is run by Bun and its result is validated
  before the helper gets it: bounded, and every image block an allowed type with
  well-formed base64.
- **Approvals.** A helper's permission request is decided by the owner. Only `ask`
  reaches the user, built by the owner from bounded fields. An answer is accepted once,
  and only for the session that asked.
- **Failures.** A helper that exits mid-turn ends its turn with one `error` and one
  `done`. One that is not ready within 15 s is stopped (`deadlineExceeded`). One that
  reports a failed start answers `providerFailure`. One whose graceful stop does not
  answer by the deadline is killed, its turn ended once, and Bun rebuilds the chat
  (`hardStopped`).

The helper host (`helper-host.ts`) imports no Bun module (tested): Trezi's tools reach
it only as authorized `tool` frames.

## Image semantics

Images keep their bytes and media type end to end. Pasted or dropped images on a turn
(`ImageAttachment`) are validated (png, jpeg, gif, webp; base64; 16 per turn, about
10 MiB each, 20 MiB of base64 together) and handed to the adapter unchanged. Claude sends them as base64 vision
blocks, and Codex still ignores composer images, as before. A preview screenshot tool
result is an MCP `image` block (`image/jpeg`, bounded by `preview-observation-tools.ts`).
Claude gets it in-process, Codex through its MCP bridge, and a helper through the owner,
which validates it. The test compares SHA-256 digests of the bytes the helper receives.

## Protocols

Bun ↔ service: private pipe, S01 frames, no revision, empty scope:
`{"service":"provider","id":n,"request":{…,"service":"provider","method",…}}`.

| Method | Body | Result |
| --- | --- | --- |
| `open` | `{session, chat, provider, root, liveRoot, background}` | `{tools}` |
| `openHelper` | the same plus `{options, context}` (answered when the helper is ready) | `{tools}` |
| `permission` | `{session, tool, target?}` (the edit path or Bash command only) | `{decision: allow\|deny\|ask\|question, message?}` |
| `authorize` | `{session, tool, bytes}` | `{}` or `unauthorized` / `invalidRequest` |
| `turn` / `terminal` / `settled` | `{session}` / `{session, kind}` / `{session}` | `{}` |
| `send` (helper) | `{session, text, images?}` | `{}` |
| `cancel` | `{session}` (answered at settle or deadline) | `{escalate}` |
| `resume` / `recover` (read) | `{session, id, record}` / `{record}` | `{}` / `{recovered}` |
| `answer` / `configure` (helper) | `{session, id, kind, value}` / `{session, model?, mode?}` | `{}` |
| `close` | `{session}` | `{}` |
| `snapshot` / `status` (read) | `{}` | `{sessions}` / `{recovered, violations}` |

For helper sessions the service pushes
`{"event":"service-event","service":"provider","kind":"event"|"record"|"tool"|"exit","session",…}`.
Bun answers a `tool` push with `{"service":"provider-helper","id",result|error}`.

Service ↔ helper (stdin/stdout, one JSON object per line). Service to helper: `open`,
`send`, `interrupt`, `permission-result`, `question-result`, `configure`, `tool-result`,
`tool-error`, `shutdown`. Helper to service: `ready`, `failed`, `event`, `record` (new
assistant and status entries, files touched, thread id), `permission`, `question`,
`tool`, `settled`.

## Rollback (tightened to this domain)

- **Launch-time switch only.** Quit, relaunch with `TREZI_BACKEND_OWNER=legacy`; the
  profile lock admits one owner. No provider decision is hot-switched.
- **Drain before switching.** At quit Bun shuts its sessions down (each `close`d). The
  service then refuses new provider requests, answers any waiting Stop
  (`escalate: false`) and stops every helper (bounded) before releasing the lock.
  Sessions still listed are reported at the next Swift launch.
- **What is preserved.** Nothing the legacy owner uses changes format: credentials,
  session records (`sdkSessionId`) and connection keys are where they were. The legacy
  twin never reads or writes `<profile>/service/providers/` (tested byte-for-byte), so
  the Swift stores are intact when Swift returns. A resume id there never overrides a
  record's own, so work done under the legacy owner wins.
- **Reverting the code.** A pre-LKM-98 build ignores `service/providers/`; its adapters
  decide permissions and Stop in-process exactly as this owner does.

## Verification

`test/provider-owner.mjs` (unit tier, about 8 s with a cached fixture) compiles the real
owner into a fixture (`test/fixtures/provider-owner/main.swift`; `PROVIDER_FAULT=<point>`
SIGKILLs inside a write). Its helper command is a scripted fake provider
(`test/fixtures/provider-owner/fake-helper.mjs`) running in the real helper host. No
SDK, network or credential is used. Sections:

- **policy:** 42 permission cases (20 requests on a foreground and a background session,
  a 40 MiB `Write` checked by its path alone, a command too long to check), 10
  authorization cases and the lifecycle give identical
  answers on the legacy twin and the Swift owner. The lifecycle covers a settled
  cancel, a deadline escalation, a late settle reviving the session, resume/recover,
  helper-only methods refused and a closed session;
- **helper:** stream, a tool, error then done, record deltas (text, files touched),
  resume persisted and recovered, a resumed session's thread id, permissions (policy
  answers never reach the user; an asked one settles once; a late answer finds
  nothing), questions, and model and permission-mode changes;
- **images:** a 300 KB preview screenshot and pasted png/webp images arrive with
  identical digests. A wrong type, malformed base64 and oversized text are refused, and
  the turn still ends once;
- **privilege:** scrubbed environment (planted `TREZI_*` and provider secrets absent),
  no inherited descriptor, six forged frames each refused with the helper stopped and
  its turn ended once, an oversized line, tools outside a background grant, a context
  naming another chat, root or spawn, an unhosted provider, a cross-session answer,
  and the helper host's imports;
- **failure:** a crash mid-turn, a graceful Stop that keeps the session, a wedged helper
  killed at the deadline (`hardStopped`, its group gone), a stalled start and a failed start;
- **recovery:** SIGKILL of the service with a live helper (swept at the next launch;
  both sessions reported, interrupted or not; resume ids recovered), a crash inside the
  resume write (previous file intact) and a damaged sessions file (moved aside);
- **rollback**, **drain**, **wrapper** (the in-process adapter path on both owners: grant
  delivery, resume reporting, graceful and escalated Stop with the kill switch run once,
  tool authorization, close; plus Stop with an unreachable owner) and **schema**.

Real-provider behaviour (Claude and Codex SDK sessions under the owner, and any adapter
inside a helper) is **not verified**: live provider calls need separate authorization.
