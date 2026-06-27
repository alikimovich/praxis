# PLAN — Direct manipulation & dsgn agent rules

The throughline: **most changes still round-trip through chat — push them onto the
canvas** (direct, instant, reversible), and make the chat-bound work that remains
(comments) run **in parallel** instead of serializing through the one session.
Plus the first **dsgn rule** — operating instructions the agent follows so edits
stay consistent.

Four workstreams, captured here for sequencing; none implemented yet.

## Where things stand today (grounded)

- **Direct edits** exist for literal props (string/number/boolean/enum) and token
  swaps T1/T2/T3 (`src/main/props.ts`, `src/main/tw-classes.ts`); **non-literal /
  expression values and Svelte component-level cases route to chat** — the "edit
  via chat" buttons in `PropPanel.tsx` (decision at the `field.expression ||
  field.kind === 'other'` branch).
- **Click → source** resolves to the **innermost host element**: `preload.ts`
  `findSource()` walks up to the nearest `data-dsgn-source` stamp. **No
  component-instance resolution** — clicking a composed component lands on the
  deepest `<div>`, often in a shared primitives file, not the instance the user
  authored (this is why the screenshot's `AmountField` panel shows the component's
  *defaults*, with no per-instance value, so `value`/`currency` fall back to chat).
- **Comments** (`C` mode) serialize into the **single active session**:
  `App.tsx` `onComment` → `useComposer.setSubmit(prompt)` → the active `query()`.
- **Agent system prompt** = the `claude_code` preset (`backends/claude.ts:91`),
  no dsgn instructions injected yet. **No undo/redo anywhere** — edits write
  straight to source; users rely on git.

---

## R — dsgn agent rules (operating instructions)

A small, **versioned** set of rules dsgn injects so the agent behaves
consistently across turns and providers. One source of truth (e.g.
`src/main/rules.ts`, a pure string builder — unit-testable, no electron).

**Injection per backend:**
- **Claude** — append to the preset: `systemPrompt: { type: 'preset', preset:
  'claude_code', append: dsgnRules() }` (`backends/claude.ts:91`). *(Verify the
  preset `append` field against the installed Agent SDK before wiring.)*
- **Codex / Gemini** (subprocess adapters, no system-prompt arg) — prepend the
  rules to the turn prompt, or write them to that agent's conventions file
  (`AGENTS.md` / `GEMINI.md`). Skills stay Claude-only, so rules are how
  non-Claude backends inherit dsgn behavior.

Rules are also the natural home for any future "always do X when editing" policy
(R2, R3…). The first:

### R1 — Scope of an element edit

A selected element is the *entry point* for a change, not its full scope.
Before finishing, decide whether the edit is **local** or **project-wide**:

- **Local (style/layout):** spacing, color, size, one-off copy tweak →
  change only the selected element.
- **Project-wide (semantic):** a renamed term, label, unit, shared copy,
  data value, or a repeated markup pattern → grep the project for other
  occurrences of the same string/concept and update them too, so the
  terminology and UI stay consistent.

When in doubt, search first. Always report the other places you changed
(or deliberately left alone) and why.

---

## F1 — Comment → parallel agent session

Today a comment blocks on (or queues behind) the one active session. Make each
submitted comment **spawn its own background agent session** so the user can fire
several at once and keep working.

- **Spawn model:** a one-shot, headless run — `claude -p`-style (or a fresh
  provider `query()` with bounded `maxTurns`) seeded with
  `describeSelectionForPrompt(el)` + the comment text. Runs to completion on its
  own; does not touch the foreground chat stream.
- **Surface it in the rail.** Reuse the existing **working/previous-agents**
  machinery (`sessions-store.ts`, `backends/record.ts`, the `Rail.tsx`
  sub-list): a comment-spawned run appears as a working agent with a status dot,
  then a reviewable past session (transcript + filesTouched, branch/PR tagging).
- **Hook point:** `App.tsx` `onComment` — instead of `setSubmit` into the active
  composer, call a new `agent:spawn-comment` (or reuse the backend seam to start a
  detached `ProviderSession`).
- **Open question — working-tree contention.** Several parallel sessions editing
  the same repo can collide. Options: serialize writes, give each spawned session
  its own git worktree, or keep it advisory (surface conflicts, don't prevent).
  Decide before building; lean toward worktree-per-spawn or a write lock.

This reframes comments from "queue a chat turn" to "dispatch a parallel worker" —
the Conductor-style fan-out the rail was built for.

---

## F2 — Broaden direct editing (less "edit via chat")

Goal from the user: **most changes should apply directly, not via chat.** Two
levers:

1. **More value forms apply directly.** Extend the literal-splice path
   (`applyPropEdit` in `props.ts`) to safely handle more cases, and keep the
   "this is chat-only because X" affordance honest for the genuinely ambiguous
   ones (handlers, arbitrary expressions).
2. **The big unlock is F3.** Most "edit via chat" buttons in the screenshot are
   there because the panel only has the component's **default**, not the
   **instance** value — editing would change every unset instance's default, not
   the one on screen. Once selection resolves to the **instance** (F3), `value`,
   `currency`, etc. become real per-instance literal edits that apply directly.

So F2 is mostly "ride F3 + widen the literal cases," not a separate engine.

---

## F3 — Component-instance prop panel + undo/redo

The headline feature. Two halves: resolve to the **instance** (so the panel edits
the call site the user authored), and make **every** source edit undoable.

### Already built (reuse, don't rebuild)
- Prop **schema + typed controls**: `props.ts` runs `react-docgen` on the
  component definition (cross-file import resolution) and `PropPanel.tsx` renders
  boolean→toggle, enum→select, string/number→input, else→text. ✅
- **AST write-back** for literal attributes (Babel splice, formatting-preserving). ✅
- The gap is **(a) instance resolution** and **(b) undo/redo**.

### (a) Resolve a selection to the component instance, not the host element
The stamping plugin **appends** `data-dsgn-source` after any `{...props}` spread,
so each nesting level overwrites the forwarded source and the **innermost host
element wins** (`CardHeading → CardHeader → <div>` resolves to the `<div>` in
`ui/card.tsx`, not `<CardHeading title=… />` in the feature file).

Approach (pick in a spike):
- **Separate stamp** — emit `data-dsgn-component-source` only on JSX elements
  whose tag is a **component** (capitalized / member-expression tag), authored so
  it is **not** overwritten by children. `setup.ts`'s Babel plugin is the place.
- **or** a **source-position index** of component instances dsgn consults to walk
  from the clicked host node up to its owning instance.
- Add a **"select owner component"** action so the user can move selection up the
  tree (host `<div>` → `CardHeading` → `Card`).
- Read the current attribute value **from the instance call site** (and show the
  default from the definition when omitted) — the panel then edits *that* JSX.

Write-back must handle string literal (`title="x"`), boolean shorthand
(`disabled`), expression containers (`count={3}`, `items={[...]}`), and
**removing** a prop when reset to its default — all AST-based, formatting
preserved.

### (b) Undo / redo  (Cmd+Z / Cmd+Shift+Z / Cmd+Y; Ctrl+ on Win/Linux)
Every source edit dsgn applies must be reversible.

- An **edit-history stack** of applied changes (before/after text per file, or a
  reversible patch) — store enough to revert and re-apply.
- `Cmd+Z` reverts the last edit + refreshes the preview; `Cmd+Shift+Z` / `Cmd+Y`
  redoes; a **new edit clears the redo stack**.
- **Coalesce** rapid edits from one interaction (slider drag, typing) into a
  single undo entry (debounce) — one Cmd+Z shouldn't unwind one keystroke.
- **Restore selection + panel state** on undo/redo so context is kept.
- **On-disk conflict detection:** if the file changed between apply and undo (user
  edited it in their editor), detect and surface it — never clobber.

Undo/redo should wrap **all** dsgn source edits (props, text, token swaps), not
just the new prop panel.

### Acceptance criteria
- Selecting a composed component (e.g. `<CardHeading title="Tokens per day"
  description=… />`) shows a panel listing `title`/`description` with their
  current values; editing a field updates the JSX attribute in the **correct
  source file** and the preview reflects it.
- Typed props render the right control (boolean toggle, enum select, …).
- Resetting a prop to its default **removes** the attribute from source.
- Cmd+Z / Cmd+Shift+Z reliably undo/redo prop edits (and other dsgn source
  edits), with interaction-level coalescing and selection restoration.
- Editing preserves surrounding code formatting.

### Constraints
- **Dev-only**, like the existing stamp plugin — must self-disable in production.
- **Don't break** click-to-source for plain host elements.
- **AST-based** transforms over regex/string splicing (Babel / ts-morph).

---

## Suggested sequencing

1. **R1** — smallest, immediately useful, and de-risks the rules-injection seam
   (one pure module + one `append`). Ships independent of everything else.
2. **F3 (a) instance resolution** — the keystone: unblocks F2's per-instance
   direct edits and makes the prop panel match what the user authored.
3. **F3 (b) undo/redo** — wrap all source edits once instance edits land (more
   edits = more need for undo).
4. **F1** — parallel comment agents; leans on the existing sessions/rail seam, but
   needs the working-tree-contention decision first.

See `docs/TASKS.md` for the roadmap stubs.
