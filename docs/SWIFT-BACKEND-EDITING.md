# Swift editing coordinator: islands, controls sidecars, content drafts, navigation (S12)

LKM-99, roadmap row S12 ("Editing/controls/content/composition/preview controllers") of
the [canonical plan](SWIFT-BACKEND-PLAN.md) and [roadmap](SWIFT-BACKEND-ROADMAP.md). It
follows [providers](SWIFT-BACKEND-PROVIDERS.md). Under the default launch
(`TREZI_BACKEND_OWNER=swift`) the service's editing coordinator decides the editing
workflows that hold state between the preview, the inspectors and the chat. Bun keeps
the JS helpers the plan says stay JavaScript (manifest and recipe validation, Jev
composition, literal resolution and splicing), the isolated WebKit instrumentation,
and the inspector views. Source writes are still proposals to the
[source owner](SWIFT-BACKEND-SOURCE.md); turns are the
[conversation owner's](SWIFT-BACKEND-CONVERSATION.md).

- `src/service/EditingOwner.swift`: requests, validation, turn binding, lanes, drain.
- `src/service/EditingIslands.swift`: island history files and the island state machine.
- `src/service/EditingStores.swift`: the controls sidecar commit, content drafts,
  deferred navigation.
- `src/native/editing-service.ts`: Bun's client. `src/main/editing-owner.ts` is the
  seam, `src/main/editing-model.ts` the rollback twin (`editingOwner()` answers the
  installed owner or the twin).
- Bun's users: `src/main/chat-islands.ts` (views, composition preview, JS helpers),
  `src/main/control-panels.ts` and `src/main/content-controls.ts` (render the next
  store), `src/native/content-controller.ts` (drafts), `src/native/navigation-controller.ts`
  (performs a released navigation), `src/native/turn-boundaries.ts` (which turn an
  agent event begins or ends).

## The domain, exactly

| Item | Owner (swift launch) | Owner (legacy launch) |
| --- | --- | --- |
| Island history `<profile>/chat-islands/<sha256(root\0record)>.json` (unchanged `JSON.stringify(records)`) | Swift | Bun twin |
| Island admission, activation, command admission, batch revision chain, per-island Undo group | Swift (service lifetime) | Bun twin (process lifetime) |
| `.trezi/control-panels.json`, `.trezi/content-controls.json` writes | Swift, hash-bound, in the repository lane | Bun twin, hash-bound, in the Bun chain / lease |
| Unsaved content-editor drafts `<profile>/service/editing/content-drafts/` | Swift (persisted) | Bun memory only (as before) |
| Pending `open_preview` navigation | Swift | Bun twin |
| Manifest/recipe/definition validation, Jev composition, literal lex/render, island source reads | Bun JS helpers | Bun |
| Island, content and control source edits | Bun proposes, Swift source owner commits | Bun writes |
| Inspector views (styles, props, custom controls), content forms, composing preview | Bun controllers, rendered by AppKit | Bun |
| Preview DOM instrumentation (selection, styles, layers, comments) and its message allowlist | isolated WebKit JS | same |
| Composer queue, drafts and attachments; project UI composition enablement | Bun (not moved, see TASKS) | Bun |

## Rules

- **Origin.** A definition is bound to the turn that made it. Bun attributes the tool
  call to the provider's turn in flight (`currentTurn`); the owner asks the
  conversation coordinator (`ConversationOwner.turn(of:)`) and records *its* turn as
  the island's `origin`. A definition attributed to another turn (a stale attribution,
  a turn that already ended) is refused. One with no attribution outside a turn (the
  native smoke) is accepted without an origin, as the legacy owner did.
- **Activation.** A waiting island becomes `ready` (landed) or `unavailable` (failed,
  parked, stopped) only on a terminal of its own turn. Bun attributes terminals with
  `TurnBoundaries`: events carry their turn; the landing's untagged `isolation` event
  belongs to the `done` that asked for it; a late (`stale`) terminal ends nothing. So a
  late event of turn 1 cannot activate turn 2's island, and a landing that finishes
  after turn 2 began is still turn 1's. A duplicate success never revives a failed
  definition. An island without origin (older history) is settled by any terminal.
- **Composition.** `islandDefine` reserves the id and revision (same turn: same id, next
  revision; later turn: a fresh island) and marks the chat composing; `islandCommit`
  is refused if the chat closed or the composition's turn ended meanwhile. At most one
  composition or command per chat; 30 islands per chat.
- **Commands.** Admitted only for the island's current revision, once it is ready, one
  at a time. The admission answers the source revision the command must be computed
  against: within one queued batch (a slider drag whose frames arrive before the
  previous write settled) it advances through the batch's own writes only, so an
  external edit's revision is never blessed. The write is a hash-bound proposal; the
  owner records the resulting group as the island's Undo group. Undo reverts that
  group through the source owner; Reset writes the island's initial values.
- **Restart.** A history reopened after a restart keeps `ready` islands; a `waiting`
  one lost its turn and is `unavailable`. Damaged history opens empty and is never
  rewritten until the chat defines a new island (as before).
- **Sidecars.** Bun renders the next store (validation stays JS) and sends it with the
  SHA-256 of the bytes it read (null for "absent"). The owner commits only if the file
  still holds them, atomically, in the repository lane or the lease the calling chain
  holds. A hand edit in between is refused and kept. `.trezi` must be a plain folder of
  the resolved root and the store a regular file: a symlink is refused (the legacy
  writer followed a link that stayed inside the project; it now refuses too). 1 MiB cap.
- **Content drafts.** `{panel, revision, value}` per project root, saved (debounced) while
  the form is dirty, cleared on save, reload and removal. A restored draft stays bound
  to the revision it was edited against, so if the document changed meanwhile the form
  shows the conflict and Save is refused by the revision check; Reload discards it. A
  damaged drafts file is refused, never overwritten.
- **Navigation.** `open_preview` from a turn waits for that turn to land; failure or park,
  a newer user turn and leaving the chat drop it; one made outside a turn opens now.
  Bun loads it only in the chat and project that asked, once the web server runs,
  origin-relative (`previewPath` rules: project-root paths only). This restores the
  deferred behaviour the Electron renderer had and the native app had lost.
- **Test hooks.** The fixture's `EDITING_FAULT` crash points exist only in the test
  fixture's options; nothing on the pipe exposes them. The native smoke's islands use
  scratch histories through the ordinary `register` path.

## Protocol

Private pipe, S01 frames, no revision, empty scope:
`{"service":"editing","id":n,"request":{…,"service":"editing","method",…}}`.

| Method | Mode | Body | Result |
| --- | --- | --- | --- |
| `islandsOpen` / `islandsClose` / `islands` | mutation / mutation / read | `{chat, root, record}` / `{chat}` / `{chat}` | `{records}` / `{composing}` / `{records}` |
| `islandDefine` | mutation | `{chat, turn, origin?, id?, revision?}` | `{token, id, revision, turn, replacing}` |
| `islandCommit` / `islandAbort` | mutation | `{chat, token, definition:{manifest, blocks}, engine, initial, fallback?}` / `{chat, token}` | `{records}` / `{}` |
| `islandSettle` | mutation | `{chat, successful, turn?}` | `{records \| null, cancelled}` |
| `islandCommand` / `islandFinish` | mutation | `{chat, id, revision, action, sourceRevision}` / `{chat, ticket, ok, last, group?, revision?}` | `{ticket, expected, group?, initial?}` / `{}` |
| `navigate` / `navigation` / `navigationTake` / `navigationState` | mutation ×3 / read | `{chat, root, path, turn?}` / `{chat, kind, turn?}` / `{chat}` / `{}` | `{ready}` / `{ready}` / `{root, path} \| {path:null}` / `[…]` |
| `contentDrafts` / `saveContentDraft` / `clearContentDraft` | read / mutation / mutation | `{root}` / `{root, panel, revision, value}` / `{root, panel}` | `[{panel, revision, value, updated}]` / `{}` / `{}` |
| `sidecar` | mutation (lane) | `{root, name, expectedHash \| null, content, leases?}` | `{ok, hash}` / `{ok:false, conflict}` |

## Rollback (tightened to this domain)

- **Launch-time switch only.** Quit, relaunch with `TREZI_BACKEND_OWNER=legacy`; the
  profile lock admits one owner and no editing writer is hot-switched.
- **Drain before switching.** At quit, after Bun has exited, the service refuses new
  editing requests together with source requests (a sidecar commit queued behind a
  released lease answers "stopping"), closes the repository coordinator, then waits
  (bounded, 2 s) for a decision already underway. Island decisions are answered only
  after their history write; a write cut short leaves the previous file whole (atomic
  replace, tested).
- **What is preserved.** Island histories keep their format and location, so the legacy
  owner reads and continues the Swift owner's histories and the Swift owner keeps what
  the legacy owner wrote (tested both ways; the added `origin` field is ignored by an
  older reader's spread). Sidecars are ordinary files in the repository. The content
  drafts under `<profile>/service/editing/` are never read or written by the legacy
  owner and are still there when Swift returns (tested). The per-island Undo group and
  the batch chain live for the owning process in both launches, as before.
- **Reverting the code.** A pre-LKM-99 build ignores `service/editing/` and the `origin`
  field; saved drafts can be read there as JSON.

## Verification

`test/editing-owner.mjs` (unit tier) compiles the real owners into a fixture
(`test/fixtures/editing-owner/main.swift`, with the conversation, repository and source
owners) and drives them through Bun's clients:
- **parity:** one scripted session (52 steps: definitions, same-turn replacement,
  another turn's late terminal, its own landing, a reordered batch and its chain, Undo,
  Reset, reload, a later turn, a stopped turn cutting its composition short, duplicate
  success, origin-less records, two chats on one history, restart normalization,
  navigation, content drafts) gives identical answers and identical history bytes on the
  legacy twin and the Swift owner; 9 sidecar steps (create, stale, bound update, hand
  edit kept, name, symlinked file and folder, size) are identical too;
- **turns:** the conversation owner decides the origin (a stale attribution refused, the
  turn in flight recorded), activation waits for that turn, navigation waits and then
  loads only in the asking chat once its server runs; `TurnBoundaries` attributes a
  landing that finishes after the next turn began to the earlier turn;
- **suites:** `chat-islands`, `shadow-controls`, `control-panels`, `content-controls` and
  `native-content` re-run unchanged with the Swift owners preloaded
  (`test/helpers/editing-owner-preload.mjs`);
- **drafts** (crash and restart, save/reload clear, stale base refused, damaged file
  untouched), **lanes** (a sidecar waits for another chain's lease, runs inside its own),
  **crash** (SIGKILL before and after the history rename), **rollback**, **drain** and
  **schema**.

Not verified here: the native smoke under the desktop lock (islands and Shadow Light use
this owner through the real app) is the manager's run; there is no live provider call.
