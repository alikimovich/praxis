# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.
Full narrative for shipped work lives in `docs/PROGRESS.md`.

## Provider preview observation (2026-09-24)

- [x] Wire live preview location and MCP screenshot image results into Codex and custom endpoint sessions.

## On-demand native chat islands (2026-09-24)

Implementation sequence and exit checks: [Chat islands plan](CHAT-ISLANDS.md).

- [x] Define the product direction and staged plan for Jev-composed native chat islands.
- [ ] Islands 1: versioned contracts, native catalog and constrained Jev composition spike.
- [ ] Islands 2: inline SwiftUI rendering, typed interactions and durable history restoration.
- [ ] Islands 3: revision-checked source bindings, grouped Undo/Reset, Replay and landing lifecycle.
- [ ] Islands 4: provider tools, on-demand Jev composition and follow-up island revisions.
- [ ] Islands 5: Bézier/spring editors, combined animations and typography acceptance scenarios.
- [ ] Islands later: runtime preview adapters, retained prop/style targets and timeline/keyframe blocks.

## Native runtime development entrypoint (2026-09-23)

- [x] Group History and New Chat in a shared rounded native toolbar control.

- [x] Remove the Chat total prefix from the token footer.

- [x] Add native project drag reordering with persistent order and remove Move Up/Down menu actions.

- [x] Use plain folder/plus sidebar actions and stable animal emoji for projects without favicons.

- [x] Match sidebar project actions and project rows in height, typography and symbol color.

- [x] Move the footer cat into live activity, replacing the thinking orb at 20 points.

- [x] Move queued messages into compact stacked rows behind the composer, with removal, copy and paused-queue resume.

- [x] Speed up the beam, restrict it to active generation, and add a native thinking orb, live status transitions and streamed word reveals.

- [x] Add a native border beam to running Stop/Queue buttons and a one-time chat-ready sweep on the composer.

- [x] Improve chat typography with a shared regular body font, relaxed line/paragraph spacing and monospaced activity rows.

- [x] Clarify cumulative chat token totals with compact counts and a cached-input breakdown.

- [x] Filter recurring Codex skill-budget advice from new chat activity and preserve complete actionable warnings.

- [x] Open the inspector sidebar only from the selection toolbar, preserving explicit visibility across picks.

- [x] Grow the native composer with wrapped/multiline drafts up to a bounded height, then scroll.

- [x] Add local Running Servers inspection and confirmed Stop & Retry recovery to native preview errors and Actions.

- [x] Fix native sidebar switching between open projects and cover repeated project/chat/preview transitions.

- [x] Enable native composer Paste for clipboard images and copied files, with AppKit validation and attachment regression coverage.
- [x] Enlarge History and New Chat glyphs to correct the previous size reduction; keep the sidebar toggle unchanged.
- [x] Align sidebar action labels/icons with project rows and preserve symbol aspect ratios.
- [x] Put Open Project and New Project in the native sidebar with neutral text, distinct icons and spacing before projects.

- [x] Remove solid welcome/preview-status backgrounds so the native window surface shows through.

Migration sequence and exit checks: [Native migration plan](NATIVE-MIGRATION.md).

- [x] Native migration 1: Bun project/chat navigation, preferences, shell state, branch/publish and chat context.
  - [x] Bun project/chat navigation, restore, warm-project lifetime and profile-owned preferences.
  - [x] Service-owned native chat context, setup/token offers, annotations and background-agent state.
  - [x] Native branch/publish orchestration and landed environment refresh.
- [x] Native migration 2: authoritative AppKit layout and preview presentation.
  - [x] AppKit frames, column clipping, mobile artwork and persisted divider width; remove native DOM rectangle observers.
  - [x] Native preview loading, setup, failure and retry surfaces.
- [x] Native migration 3: core workflows without the main UI WebView.
- [x] Native migration 4: native settings, project/Git sheets, review and activity screens.
  - [x] Native New Project, project memory, Settings and provider connection forms.
  - [x] Native selectable activity log and saved-session review/actions.
  - [x] Native Git updates, GitHub connection and publish conflict output.
  - [x] Native feedback attachments and propose-first diagnosis/retry sheets.
- [x] Native migration 5: native layers, properties, styles/tokens and editing controls.
  - [x] Native layers tree, preview hover/selection and source-backed reorder routing.
  - [x] Native property/style/token/custom controls and recipe-driven content windows.
  - [x] Native inspector selection/controls and recipe-backed content save checks; see NATIVE.md for verification scope.
- [x] Native migration 6: native source editor and remaining chat/sidebar parity.
  - [x] AppKit source editor, scoped drafts/conflict-safe saves, file operations and reusable pop-out.
  - [x] Native file tree/navigation/find, streaming Markdown/tables, IME guard, drafts/conflicts, and repeated resizing checks.
- [x] Native migration 7: remove native React build/assets and validate core native workflows.

- [x] Move startup/empty workspace UI and animated cat into Swift; remove empty chat toolbar and own repeated chat resizing in AppKit.

- [x] Render native chat and interactive cards in SwiftUI; replace hidden React form forwarding with typed composer actions.
- [x] Move native chat drafts, streaming, composer actions, queues and model/permission control out of React into Bun.
- [x] Move workspace/session navigation and layout into native/Bun; replace remaining web panels and remove the main UI WebView/React bundle.
- [x] Native Markdown tables, code coloring, attachment errors and sticky request context.

- [x] Block preview app input during selection and inline editing, preserving caret movement and verifying native WebKit event isolation.
- [x] Preserve native sidebar projects and active selection across launches in profile-owned workspace storage.

- [x] Reduce native idle work and unused renderer memory; verify lazy panel state, composer parity and paired performance measurements.
- [x] Retire Electron, its React UI/browser mode, build pipeline and unused dependencies; review remaining native backend ownership.
- [ ] Validate remaining native platform/provider parity, older macOS releases and iOS Simulator for release.

- [x] Fix persistent toolbar highlights with explicit momentary segmented controls and exercise their action callback in native checks.

- [x] Animate preview expand/restore, preserve conversation width during clipping, and follow the transition in the native sidebar/header.

- [x] Expose native preview Web Inspector, Console shortcuts, and WebKit Inspect Element context menu.

- [x] Make toolbar action groups momentary and bundle/set the Praxis icon for the native app.

- [x] Compare current native/Electron build size, startup, resident memory, idle CPU and preview frame timing; document failures and measurement limits.

- [x] Adjust compact toolbar icons to approximately 20% below their original rendered size.

- [x] Enforce smaller rendered toolbar glyphs using fixed-size template artwork; verify actual screenshot pixel bounds.

- [x] Keep native preview action groups visible at narrow widths, shrink toolbar icons, and remove Projects while the sidebar is closed.

- [x] Adapt preview domain/branch contrast to page background and remove the duplicate web resize-divider paint.

- [x] Extend preview page background behind the native toolbar, use a lighter full-height divider, and remove delayed/zero-size resize updates.

- [x] Include the standalone macOS prototype in the repo and expose `bun run dev:native`, forwarding preview URL and integration-test arguments.
- [x] Connect the shared Praxis UI and application core to the native host while retaining Electron as the default.
- [x] Verify a successful live provider edit through the native composer (Codex source edit and WebKit preview reload passed; Claude still requires login).
- [x] Add a standard macOS project/chat sidebar, split-view divider and toolbar around the shared web content.
- [x] Add a native multiline composer, actual macOS 26 Liquid Glass, shared draft/action bridge and attachment controls.
- [x] Move project actions into the sidebar and preview branch/publish/code/expand into the native toolbar, with a leading sidebar toggle.
- [x] Move Home/address/device controls into the native toolbar, make Publish the trailing primary action, and remove persistent sidebar/composer scrollbar tracks.
- [x] Remove the extra gray chat-pane fill in native mode and align its fades with the theme content background.
- [x] Align native toolbar actions with the sidebar, chat and preview columns, following chat resizing and sidebar collapse.
- [x] Extend the open native sidebar through the titlebar to include the traffic lights, keeping content below the toolbar.
- [x] Make the entire Projects toolbar button open its menu, including the folder icon.
- [x] Show projects only in the native sidebar with hover actions; move chat history beside the plain chat title and New Chat button.
- [x] Use an icon-only circular Liquid Glass Settings button at the bottom of the sidebar.
- [x] Remove the chat fill, collapse empty composer chip spacing, compact selectors to their labels, and enlarge/right-align Send.
- [x] Replace the native slash dropdown with a visible skill list above the composer, including descriptions and keyboard completion.
- [x] Separate the native device button, group Code/Layers/Expand, and use a standard standalone Publish button.
- [x] Clean up native managed servers on terminal hangup and expose the native window surface through transparent WebKit/chat layers.
- [x] Stack the branch menu below the editable preview domain and remove the native Home button.
- [x] Move native composer selectors below the glass form and use a smaller standard Send arrow inside it.
- [x] Use a plain left-hand plus, text-only selectors capped at 60 points, and a smaller empty native form.
- [x] Move Select Object from the composer menu into the native toolbar group with desktop/mobile.
- [x] Fit native project rows and hover actions inside the sidebar and display available project favicons.
- [ ] Native composer polish: image thumbnails and attachment error feedback; verify pointer interaction and IME on an unlocked desktop.
- [ ] Native sidebar parity: inline rename, manual ordering and background-agent rows.
- [ ] Native parity: shared-profile migration/coordination, app-shell HMR, updater/relaunch, browser permission and download handling.

## Comment agent model routing (2026-09-22)

- [x] Use latest Sonnet for Claude comments, Sol for Codex comments and the exact selected model for Gateway comments, with matching child labels and unchanged parent settings.

## Selection toolbar cleanup (2026-09-22)

- [x] Remove the annotation action from the selection toolbar and update the expected action order.

## Per-chat composer model restoration (2026-09-22)

- [x] Keep last-used Gateway model IDs and connections out of existing chats when restoring their composer settings; cover persisted snapshots and sidebar switching.

## Compact preview address input (2026-09-21)

- [x] Cap the editable preview path at 200px and verify focused width in a wide window.

## Controls workflow skill and no-key fallback (2026-09-21)

- [x] Bundle surface-controls, expose it in provider skill menus and route natural controls requests through it.
- [x] Register validated chat-model candidates when Gateway credentials are absent, reporting the engine and fallback explicitly.

## Jev saved credentials and unavailable content (2026-09-21)

- [x] Reuse the encrypted Settings Gateway key for content, animation and component Jev requests, with deterministic connection selection.
- [x] Bound missing-source retries, recover editors after landing and retain drafts.
- [x] Fall back to chat for unsupported or malformed source during text editing.

## Property inspection console errors (2026-09-21)

- [x] Skip unsupported source formats during React inspection and handle incomplete source syntax without rejected IPC; verify recovery after repair.

## Content controls and Jev (2026-09-21)

- [x] Integrate the local content-controls package into persistent preview-area editors.
- [x] Expose catalog/registration to Claude and Codex, with JSON source saves, drafts, collections, Undo and stale-write protection.
- [x] Let Jev choose content sections and animation/component parameters from validated candidates.
- [x] Complete regression and live Jev verification; retain the recorded unrelated agent-multi failure.

## History row styling (2026-09-21)

- [x] Pull candidate updates and place History in the chat list with matching typography and row spacing, retaining muted gray.

## Subagent cat entrance (2026-09-21)

- [x] Play the existing appearance sprites once before each subagent runs or idles; respect reduced motion.

## Actual portfolio source access (2026-09-21)

- [x] Diagnose the running Next portfolio, install the missing development integration, and verify selection → Code → exact source after navigation and refresh.

## Project component composition (2026-09-18)

- [x] Add a default-off, persistent Settings toggle captured per submitted message.
- [x] Discover exported React components and styles, build a json-render catalog, and export validated TSX.
- [x] Gate Claude/Codex composition tools per chat across desktop and browser transports.
- [x] Cover source rendering, invalid specs, tool transport, toggle persistence and a live Codex preview flow.
- [x] Add selectable Jev composition, bounded Gateway requests and a real Jev-to-preview test.
- [ ] Extend discovery to imported/conditional prop types, custom adapters and other frameworks.

## Candidate push reconciliation (2026-09-18)

- [x] Integrate remote candidate history and adapt newer tests to native pickers.

## Preview address alignment (2026-09-18)

- [x] Center Home and URL text with consistent spacing in the preview toolbar.

## Test execution and evaluation (2026-09-18)

- [x] Add bounded unit concurrency and an audited Electron allowlist with exclusive barriers.
- [x] Add per-test logs, JSON reports, timeouts, cleanup, filters, and a checkout lock.
- [x] Separate skipped coverage from passing tests and benchmark serial versus concurrent units.
- [x] Build an opt-in Jev failure-triage pilot with curated splits, a baseline, cost limits, redaction, and offline tests.
- [ ] Run the live Jev pilot after configuring an ignored local TypeSafe credential; independently review labels before broader evaluation.

## Code access in exploded view (2026-09-18)

- [x] Keep the selected layer's Code action available inside the 3D workspace.

## Composer queue action (2026-09-18)

- [x] Show queued messages in an inset card above the composer, with queue/trash icons.

- [x] Replace the running Stop button with Queue while composing a follow-up.

## Automatic chat conflict reconciliation (2026-09-18)

- [x] Merge independent edits to existing text files without a Resolve click.
- [x] Try one automatic AI reconciliation for overlapping text in the originating chat.
- [x] Hold queued messages through landing; preserve Stop and manual recovery.
- [x] Cover clean/overlapping edits, staged work, bounded retries, and fallback behavior.

## Open project pages from chat (2026-09-17)

- [x] Add scoped `open_preview` to Claude and Codex/custom endpoints.
- [x] Navigate desktop/browser previews after landing, preserving route query/hash.

## Next.js setup and inspection (2026-09-17)

- [x] Separate Next framework/version/router and script-derived bundler detection.
- [x] Add development-only Next config/loader adapters and an MDX source transform.
- [x] Synchronize and hash setup helpers in new and existing agent worktrees.
- [x] Remove bulk prop-typing prompts; add a TypeScript schema fallback.
- [x] Provision Next dependencies inside worktrees and refresh changed manifests.
- [x] Reject stale-document setup verification; expose separate preview/Git evidence.
- [x] Exercise the Next 15.5.12/16.1.6 fixture matrix and run full regression verification (remaining failures recorded in PROGRESS).
- [ ] Attribute the exact compiled revision (currently explicitly unverified).

## Native animation panels (2026-09-17)

- [x] Replace DialKit integration with Praxis's existing control primitives.
- [x] Persist animation panels independently of selection, with collapse/reopen.
- [x] Wire targeted Replay and existing source-edit/Undo behavior.

## Candidate merge reconciliation (2026-09-17) — SHIPPED

- [x] **Merge remote updates while retaining native composer pickers and local
      regression fixes.** Reconcile both logs and check desktop menu behavior on
      the project action menu.

## Show exact code from chat (2026-09-17)

- [x] Add `open_code` for Claude and Codex/custom endpoints.
- [x] Open the mini editor with exact highlighted source, independent of selection.
- [x] Scope requests to the active chat/project, wait for landing, and preserve drafts.

## Selection-independent animation controls (2026-09-17)

- [x] Bundle `/animation-controls` and route ordinary animation-control requests to it.
- [x] Make the skill discoverable by Claude, Codex/custom endpoints, and Gemini.
- [x] Add selection-independent panels (now native Praxis panels; supersedes the initial project UI approach).
- [x] Keep native inspector controls distinct and update the animation action prompt.

## Selection, message queues, and preview navigation (2026-09-17)

- [x] Shift-click to add/remove selected objects and send the full group as chat context.
- [x] Queue follow-ups per chat with captured attachments, removal, and pause/resume.
- [x] Keep successful merges quiet while retaining Revert and conflict notices.
- [x] Open chat links separately, guard the desktop renderer, and add Back to project.

## Consistent sidebar hover (2026-09-17)

- [x] Match project and Open/New action hovers to chat rows using one shared
      translucent fill and 6px corners in both themes.

## Compact chat composer (2026-09-17)

- [x] Hide the draft scrollbar, equalize attachment spacing at 8px, reduce content
      and control insets to 8px, and size Send/Stop to 28×28px.

## Local branch preview refresh (2026-09-17)

- [x] Refresh the preview after ordinary local-branch and named work-branch switches.
- [x] Re-detect the destination environment and install dependencies when manifests
      or lockfiles differ; reload attached previews and explain external-server restarts.

## Git updates and remote branches (2026-09-16)

- [x] Preserve the preview freeze when handing off from the branch menu to Git
      updates, and verify native visibility through updates and dismissal.

- [x] Add Git updates to the branch menu: fetch remotes, pull a selected remote
      branch into the current branch, and check out remote branches locally.
- [x] Preserve local branches and commits; reject dirty trees, active agents,
      stale branch selections, and existing Git operations; abort conflicting pulls.
- [x] Serialize with the repository writer and refresh previews after changes;
      expose the same root-scoped controls in browser mode.

## Project setup and environment changes (2026-09-16)

- [x] Ask how to start before scaffolding: defaults, Next.js, Svelte, or a custom
      setup conversation in an empty repository.
- [x] Open empty projects in chat and retain chat when preview startup fails.
- [x] Refresh managed web previews after landed environment changes; re-detect
      framework/package manager, install live-checkout dependencies, preserve
      custom commands, and defer background refreshes until activation.
- [x] Wait for setup edits to land before verifying instrumentation.

## Subagent tooltip clipping (2026-09-16) — FIXED

- [x] Keep cat tooltips inside the chat pane so the native preview cannot cover
      long labels; verify hover and keyboard focus placement.

## Desktop surfaces (2026-09-15, user-requested)

- [x] Inset the default-model chevron and capture the project actions menu.

- [x] Restyle shared dialogs and dropdowns with compact desktop proportions,
      quiet light/dark surfaces, inset menu separators, and reduced-motion fades.
- [x] Rework Settings into grouped preferences with a persistent header and a
      scrolling form; bring history review onto the shared accessible dialog.
- [x] Cover keyboard dismissal, focus return, small windows, and form cleanup
      in the Electron regression suite.

## Chat-render regression (2026-09-15) — FIXED

- [x] Supply the required permission mode in synthetic per-chat settings so
      switching chats preserves a valid permission picker; log renderer errors.

## Sidebar ordering (2026-09-15, user-requested) — SHIPPED

- [x] **Drag projects and chats to reorder the sidebar.** Project groups, live
      chats within a project, and History rows have a native lifted drag image,
      before/after drop indicator, Escape cancellation, and edge auto-scroll.
- [x] **Persist manual display order independently of session lifecycle.** Keep
      session keys, active chat, expansion state, and LRU recency unchanged;
      reconcile new/deleted entries and retain ordering across renderer reloads.
- [x] **Support keyboard reordering.** Alt+Up/Down on a row name retains focus
      and announces the move. Rename/close buttons remain separate actions.

## 3D component inspection (2026-09-15, user-requested)

- [x] **Isolate a selected component in an exploded 3D workspace.** Desktop
      selection-toolbar entry, orbit/pan/zoom, separation, front/reset, and
      surface/dropdown selection connected to the existing inspector.
- [x] **Keep edits connected to the live page.** Refresh captured surfaces after
      DOM/style changes, retain source edits and undo, recover only unambiguous
      replaced nodes, and return without navigating or remounting the page.
- [ ] **Expand rendering fidelity.** Pseudo-elements, clip/transform/effect
      reconstruction, portals and framework component grouping, continuously
      animated surfaces, and browser-mode parity. See `docs/THREE_D.md`.

## Controls from chat and authored inspector fields (2026-09-14) — SHIPPED

- [x] **Select objects and open their inspector from the agent.** Add
      `open_controls` for Claude, Codex, and custom endpoints; registering a
      custom panel requests its Custom tab, with landing retries and project scoping.
- [x] **Register animation controls on the Codex harness.** Share validated
      manifests and literal-anchor checks with Claude, including background edits.
- [x] **Show authored fields by default.** Hide absent optional props and
      browser-default styles behind Show all; retain declared falsy defaults,
      add numeric prop scrubbing, and keep rows stable while edits settle.

## Required agent-browser workflow (2026-09-14, user-requested) — SHIPPED

- [x] **Require agent-browser for browser verification when available.** Shared
      provider instructions check availability, use isolated sessions, cover three
      responsive sizes, require screenshots, and report missing/stale verification.
      Document prompt-level enforcement and preserve explicit user tool choices.

## Optional agent-browser installation (2026-09-14, user-requested) — SHIPPED

- [x] **Recommend agent-browser and offer to install it during setup.** Prompt via
      the terminal for piped installers, default to No, skip existing installs or
      absent terminals, and keep optional failures from blocking Praxis setup.

## Simultaneous startup reveal (2026-09-14, user-requested) — SHIPPED

- [x] **Reveal the entire startup cat equally at once.** Synchronize contour
      opacity and blur, preserving the four-second intro and app crossfade.

## Cat animation test reliability (2026-09-16) — SHIPPED

- [x] **Replace the long reduced-motion sleep with idle-timer assertions.** Check
      suppression and cancellation while retaining real sprite timing coverage.

## Candidate remote sync (2026-09-16) — SHIPPED

- [x] **Pull the latest sentence-case sidebar headings and preserve local commits.**

## Chat regression failures (2026-09-15) — SHIPPED

- [x] **Repair chat-render's incomplete settings fixture and surface renderer errors.**
- [x] **Wait for the asynchronous provider restart in provider-skills-menu.**

## Sync remote main (2026-09-15) — SHIPPED

- [x] **Merge the latest remote main updates and reconcile both project logs.**

## System accent focus rings (2026-09-14, user-requested) — SHIPPED

- [x] **Replace the orange/white browser focus outline with a single system-accent
      ring.** Use the same accent for shared focus tokens in both themes and keep
      the ring inside controls so sidebar clipping does not cut it off.

## Control cursors and chat action hover (2026-09-14, user-requested) — SHIPPED

- [x] **Use the arrow on remaining clickable controls.** Include selects, links,
      annotation pins, editor folding controls, and the shadow-DOM file tree.
- [x] **Remove the hover fill from chat rename and close buttons.**

## Cat activity animations (2026-09-12, user-requested) — SHIPPED

- [x] **Play the supplied thinking animation while a question awaits an answer.**
- [x] **Play idle occasionally and jump once when the active task completes.**
      Use a randomized 15–30 second rest interval, suppress completion jumps for
      errors and Stop, reset on chat switches, and respect reduced motion.
- [x] **Save all 12 supplied animations and their original timings for future use.**

## Default button cursor (2026-09-12, user-requested) — SHIPPED

- [x] **Use the default arrow on Praxis buttons.** Cover the shell, expandable
      chat messages, and preview-overlay action buttons.

## Merge local and remote main (2026-09-12) — SHIPPED

- [x] **Integrate origin/main while preserving native composer pickers.** Retain
      remote startup artwork/test changes and reconcile the progress log.

## Faster test startup (2026-09-12, user-requested) — SHIPPED

- [x] **Skip the desktop intro in ordinary suite runs.** Keep the dedicated
      startup test animated, retain app/profile isolation and other motion, and
      document the environment switch for targeted tests.

## Project action icon hover (2026-09-11, user-requested) — SHIPPED

- [x] **Use lighter gray project action icons, black on hover, with no hover fill.**

## Svelte inspector defaults (2026-09-11, user-reported) — SHIPPED

- [x] **Show declared Svelte defaults without turning them into overrides.** Cover
      Svelte 4/5, falsy values, negative numbers, expressions, definition routing,
      mounted-input refresh, and reset-to-default in the Electron regression.

## System-style dropdown menus (2026-09-11, user-requested)

- [x] **Polish existing branch, publish, and project action dropdowns.** Retain
      shadcn, softer corners/shadow, and checkmarks for selected choices.
- [x] **Restore the original provider, model, and permission pickers.** The user
      prefers their native menus; composer pickers are outside this work's scope.
- [ ] **Add a quick spring zoom with Motion to the existing action menus.**

## Supplied icon artwork (2026-09-11, user-requested) — SHIPPED

- [x] **Replace the 35 Lucide imports with the supplied SVG set.** Preserve
      artwork, sizes, and theme inheritance; retain source SVGs for future edits.
- [x] **Animate project folders and the sidebar toggle between supplied states.**
      Morph mounted paths with CSS, keep folders visible on hover, and respect
      reduced motion.

## Centered startup animation (2026-09-11, user-requested) — SHIPPED

- [x] **Use the supplied joined SVG contours.** Reveal its 21 shapes as whole
      pieces instead of animating 60 individual squares.

- [x] **Crossfade into the app after the reveal.** Fade the completed cat out and
      the interface in over 500ms; keep native preview bounds suppressed until
      the transition ends and preserve reduced-motion behavior.

- [x] **Play the supplied blue pixel-cat reveal before showing the app.** Center
      it in the window, preserve 4s/16px/24% settings, omit demo controls, and
      skip for reduced motion. Keep native previews behind the intro on reload.

## Live viewport resizing (2026-09-11, user-reported) — SHIPPED

- [x] **Reflow the preview continuously during divider dragging.** Capture the
      pointer on the divider and keep the native view live so text and responsive
      layouts update before release. Recover on cancellation and lost focus.

## Preview size readout (2026-09-11, user-requested) — SHIPPED

- [x] **Show the actual preview dimensions while resizing.** Display width ×
      height in CSS pixels at the top right, including divider-drag snapshots,
      then hide after one second without a size change.

## Scrollable project memory (2026-09-11, user-reported) — SHIPPED

- [x] **Keep long memory inside the window.** Bound the dialog and editor height,
      scroll the text internally, and keep Save and Close accessible.

## Subagent cats (2026-09-10, user-requested) — SHIPPED

- [x] **Replace nested subagent rows with smaller cats beside the composer.**
      Show up to six cats on the right of the status line for the active chat;
      hover/focus explains each operation, queued cats idle, and clicking cancels.
- [x] **Align the small cats with the border beneath the big cat.**

## Compact composer selectors (2026-09-10, user-requested) — SHIPPED

- [x] **Size provider, model, and permission selectors to their selected text.**
      Display at most 10 characters followed by `...` for longer names, retaining
      full native menu labels and allowing further truncation in narrow panes.

## Sent file attachments (2026-09-10, user-requested) — SHIPPED

- [x] **Keep files visible on sent messages.** Show an icon and filename badge
      beside image thumbnails, with the full file path on hover.

## Expanded preview header (2026-09-10, user-reported) — SHIPPED

- [x] **Keep the branch clear of traffic lights when the preview is expanded.**
      Apply clearance only to native macOS windows outside fullscreen.

## Sidebar toggle alignment (2026-09-09, user-requested) — SHIPPED

- [x] **Move the sidebar toggle up one pixel.**
- [x] **Add 8px of space beside the traffic lights, preserving the fullscreen inset.**

## Copy-on-write workspace investigation (2026-09-09)

- [x] **Measure current worktrees against native CoW workspace creation.** Added a
      reproducible disposable-repo benchmark and recorded results/limitations in
      `docs/COW-INVESTIGATION.md`; retain current production behavior.
- [x] **Profile recurring snapshot/index work before choosing an optimization.**
      Recorded per-command timings, 13 passing oracle checks, and three semantic
      hazards in `docs/SNAPSHOT-INVESTIGATION.md`. Retained-index prototypes reduce
      warm snapshot costs substantially; production remains unchanged.
- [ ] **Implement and measure a guarded private-index fast path.** Include attribute/
      config invalidation, stat-setting fallbacks, cache-boundary locking and
      recovery. Keep fresh-index fallback; CoW remains exploratory.

## Model-switch conversation handoff (2026-09-09, user-requested) — SHIPPED

- [x] **Preserve conversation context when changing models mid-chat.** Replay
      recorded history once to the selected model after explicit confirmation
      explaining additional input-token usage. Cancel preserves the current model;
      empty chats switch directly; active responses block switching.

## Escape selection shortcut (2026-09-09, user-requested) — SHIPPED

- [x] **Escape turns off S selection mode across the app and floating inspector.**
      Inline text edits cancel and disarm together; focused controls cannot swallow
      the main renderer's selection cancellation.

## Automatic visual-edit subagents (2026-09-09, user-requested) — SHIPPED

- [x] **Start AI-required preview/inspector edits immediately in background agents.**
      Props, styles, custom controls, inline text, and layer moves preserve the
      draft/main transcript and auto-apply successful results. Codex and gateway
      sessions now support detached children; failures/cancellation keep partial
      work recoverable. Literal edits retain immediate direct source writes.

## Chat title marquee (2026-09-09, user-requested) — SHIPPED

- [x] **Fit titles around revealed buttons and marquee overflowing text.** Reserve
      the action width on hover/focus, reveal the final words, reset on exit,
      and preserve static ellipsis for reduced motion.

## Chat scroll fade (2026-09-09, user-requested) — SHIPPED

- [x] **Replace the top blur with shadcn scroll-fade.** Use the real scroller's
      scroll-driven mask, keep the pinned request crisp above its answer, and
      preserve the visible scrollbar gutter.

## Codex runtime and cross-provider skills (2026-09-09, user-reported) — SHIPPED

- [x] **Update the bundled Codex SDK/CLI for GPT-6 Astra.** Upgrade from 0.146.0
      to 0.154.0; verify a live `gpt-6-astra` request succeeds.
- [x] **Populate `/` skills for Codex, custom endpoints, and experimental Gemini.**
      Discover project/user skills before the first turn and attach the selected
      skill file reference to the prompt; retain project precedence and symlinks.

## Preview sibling dragging (2026-09-04, user-requested) — SHIPPED

- [x] **Cmd/Ctrl-drag the selected element among its siblings in the native preview.**
      Generic geometry supports columns, rows, and grids, promotes nested hit
      content to the selected object, and never changes parents. Includes insertion
      feedback, movement threshold, boundary tolerance, cancellation, source edits,
      undo, and the existing agent-prompt fallback for ambiguous moves.
- [ ] **Bring the gesture to the browser preview bridge.** Native preview ships first;
      browser Layers/selection editing parity remains tracked below.

## Chat/preview divider (2026-09-04, user-requested) — SHIPPED

- [x] **Add a border between chat and preview.** The existing resize handle is
      a full-height 1px line using the shared border token; hiding chat removes it.

## Compact sidebar and flush preview (2026-09-04, user-requested) — SHIPPED

- [x] **Remove Chats headings and chat-row model labels.** Keep titles and actions.
- [x] **Keep the chat scrollbar above the fades.** Reserve its gutter at both ends.
- [x] **Use the full desktop preview pane.** Remove outer padding and rounded corners.

## Reliable rail-status regression (2026-09-04, user-requested) — SHIPPED

- [x] **Fix the recurring rail-chat-status failure.** Target Finished chat by
      identity instead of its DOM child position, wait for project initialization
      before seeding chats, and isolate the test in a temporary profile.

## Browse project chats without switching (2026-09-04, user-requested) — SHIPPED

- [x] **Project names toggle their chat lists.** Clicking the expanded project
      collapses it; clicking a collapsed project expands it and folds the others.
      Header clicks preserve the active chat and preview. Select a chat directly
      to switch to it.

## Project header actions (2026-09-04, user-requested) — SHIPPED

- [x] **Reveal project actions on hover.** Memory and Remove project share an
      ellipsis menu, followed by a New chat compose icon at the header's right edge.
      Keyboard focus reveals the controls too; touch keeps them available.

## Red measurement labels (2026-09-04, user-requested) — SHIPPED

- [x] **Match measurement value badges to their red geometry.** Value labels now
      use the same `#f24822` fill as measurement lines and caps, with an end-to-end
      assertion preventing the fills from diverging again.

## Quiet remote status (2026-09-04, user-requested) — SHIPPED

- [x] **Reduce the remote badge's visual weight.** The bordered accent pill is now
      a small connection dot with an accessible status label and full tooltip.

## Compact composer controls (2026-09-04, user-requested) — SHIPPED

- [x] **Truncate long provider/model labels instead of wrapping the toolbar.**
      The provider, model, and permission pickers now stay on one line with bounded,
      shrinkable widths while the send button remains visible in narrow chat panes.

> **The Electron tier runs on a machine with NO display** (found 2026-08-12),
> which the 2026-08-07 correction below didn't cover: after an
> `electron-vite build`, `PRAXIS_USER_DATA=$(mktemp -d) xvfb-run -a node
> test/<name>.mjs` launches a real window under a virtual X server, screenshots
> and all. So "needs a display" is no longer a reason to leave an electron-tier
> assertion unrun anywhere below.

## Clean selection titles (2026-09-04, user-reported) — SHIPPED

- [x] **Hide compiler style-scope classes everywhere selections are named.**
      PR #223's predicate is now shared by Layers, the native preview badge and
      `SelectedElement` payload, and the browser preview bridge. CSS selectors retain
      raw classes; only human-facing identity is filtered. `test/select-element.mjs`
      covers both the visible badge and renderer payload.

## Option-hover spacing measurement (2026-09-04, user-reported) — SHIPPED

- [x] **Restore the unmerged Figma-style measurement overlay.** ✅ 2026-09-04 —
      The pure geometry and preview input/rendering path are integrated. Select an
      element, hold Option/Alt, and hover another to see facing-edge
      gaps or matched-edge insets. `test/measure-distance.mjs` and
      `test/measure-alt.mjs` cover geometry, the real gesture, cleanup, and pixels.

## Flat peer chats (2026-09-04, user-requested) — SHIPPED

- [x] **Remove the Main/secondary hierarchy.** Every live chat now uses its own
      title, renders in the same newest-first list, and has the same rename and
      close actions. The Main-only context reset was removed; a fresh context is
      simply a new peer chat. When sessions stop, relaunch continuity follows the
      last-active chat instead of privileging the project's first-created key.
      Legacy `slot: 'main'` records remain readable and migrate to `slot: 'current'`.

## Rail accordion (2026-09-04, user-requested) — SHIPPED

- [x] **Switching projects hands the open chat list over.** ✅ 2026-09-04 — the
      rail keeps exactly one project unfolded: `foldOthers` in `store.ts` runs on
      `activate`/`openOrActivate` and on the chevron (which unfolds exclusively
      too), so the project you leave folds as the one you pick opens instead of
      every visited project stacking up. `.rail__project-body` animates from
      `height: 0` to `auto` so the swap is motion, not a pop. `test/rail.mjs`.
      See PROGRESS 2026-09-04.

## Browser and hosted Praxis (2026-09-03, user-requested) — IN PROGRESS

- [x] **Write the architecture plan.** ✅ 2026-09-03 — `docs/BROWSER.md` covers a
      shared browser client for localhost, remote access to a local workstation, and
      a Railway-style hosted workspace; it includes security boundaries, persistence,
      preview bridging, delivery phases, and acceptance criteria.
- [x] **Build the local-browser foundation.** ✅ 2026-09-03 — `praxis serve <repo>`
      runs the existing workspace engine without a desktop window and serves the
      shared React UI on loopback. A single-use launch exchange, scoped HTTP RPC,
      WebSocket events, sandboxed preview gateway, and browser `postMessage` bridge
      cover project open, dev-server startup, agent commands/streaming, preview, and
      stamped element selection. `test/browser-mode.mjs` covers auth, scope/origin
      rejection, agent event completion, dev-server proxying, and bridge injection;
      the real browser flow was also driven through source selection.
- [x] **Restore browser design-token detection and starter scaffolding.** ✅
      2026-09-04 — the browser router now shares the Electron token service, so
      **Add tokens** writes the root-scoped, idempotent `.praxis/tokens.json` and
      existing Tailwind/CSS/manifest tokens are detected instead of receiving a
      false offer.
- [ ] **Bring the remaining native editing tools to browser parity.** Move the
      props/styles/text/source/history/setup/publish handlers onto the shared router,
      expand the browser preview runtime beyond selection, and run a real provider
      edit through the browser adapter. Native-only affordances should keep explicit
      browser fallbacks.
- [x] **Add secure single-client remote-workstation access.** ✅ 2026-09-04 —
      `praxis serve <repo> --remote` keeps control and preview services on separate
      loopback ports and publishes them as separate, tailnet-only Tailscale Serve
      HTTPS origins. It adds one-time browser pairing, exact public-origin checks,
      secure cookies, reconnect replay, graceful route cleanup, and a visible remote
      indicator. The CLI detects disconnected/disabled Tailscale state and existing
      port conflicts before exposing anything.
- [ ] **Harden mode 2 for multiple clients and unattended use.** Add presence and
      selective revocation UI, writer arbitration, suspend/lock controls, and a
      launchd/systemd user service. The current process-lifetime mode intentionally
      pairs one browser profile.
- [ ] **Deferred: personal Railway alpha and multi-tenancy.** The 2026-09-03 product
      decision prioritizes local-browser and remote-workstation modes first. Later,
      containerize the web runtime, persist `/data`, add application/Git/provider
      auth and quotas, and verify edit/recovery/publish across a redeploy. Multi-user
      workspaces require the separate control-plane/isolated-worker phase in
      `docs/BROWSER.md`.

## Git-based PR descriptions (2026-09-02, user-reported) — SHIPPED

- [x] **Create PR must not paste the chat transcript.** ✅ 2026-09-02 — PR title
      and body now come from change-bearing branch commits, changed-file scopes, and
      diffstat. Conversation-only messages, logs, slash commands, and old
      `Changes requested in Praxis` publish commits are excluded. Existing PRs get
      their title/body refreshed on the next Create PR. Regression fixture mirrors
      the broken `about-me-2026` PR #8.

## Inline chat color previews (2026-09-02, user-requested) — SHIPPED

- [x] **Show a swatch beside hex colors in assistant messages.** ✅ 2026-09-02 —
      assistant prose and inline code now preview 3/4/6/8-digit CSS hex literals with
      a small outlined swatch. Fenced code and links remain untouched. Covered by the
      pure `test/markdown-color.mjs` component regression and the visual
      `test/chat-render.mjs` Electron regression.

## Automatic background agents for complex text edits (2026-09-01, user-reported) — SHIPPED

- [x] **Run agent-required inline text edits without posting in chat.** ✅ 2026-09-01 —
      direct text splices remain instant; expression/mixed/error fallbacks now enter
      the detached worktree queue automatically with the active model. A `text-edit`
      event origin keeps the composer and transcript untouched, uses the rail for
      progress, and reports completion in the activity log. The prompt is constrained
      to the smallest selected-element edit. Unsupported backends/non-repos retain the
      composer fallback so intent is never lost. `test/text-edit.mjs`.

## Automatic cleanup for completed chat branches (2026-09-01, user-reported) — SHIPPED

- [x] **Prune branch-only residue without risking unfinished work.** ✅ 2026-09-01 —
      project open now follows orphan-worktree recovery with a local
      `praxis/chat-*` branch sweep. It removes only unattached, unparked refs whose tip
      is reachable from live `HEAD` or has a patch-equivalent commit there; unique
      patches remain recoverable. Backup, normal work, comment-agent, remote, and
      checked-out branches are outside the deletion set. `test/worktrees.mjs` covers
      the equivalent-commit case plus every preservation boundary.

## Contextual animation controls + opt-in generation (2026-09-01, user-requested) — SHIPPED

- [x] **Hide inert transition controls.** ✅ 2026-09-01 — browser computed defaults
      (`all 0s ease`) no longer materialize the Transition group. A positive-duration,
      non-`none` transition restores the existing duration/delay/Bezier/Replay editor.
- [x] **Generate animation controls only on request.** ✅ 2026-09-01 — the empty
      transition state offers a separate description input; submitting it asks the
      agent to add motion in the project's existing idiom and expose meaningful values
      through the Dialkit-style custom-control path.
- [x] **Evaluate `interface-kit`.** ✅ 2026-09-01 — inspected npm `0.1.3` and its
      published bundle without installing it. Its broader visual property coverage is
      useful reference material, but React 19-only integration and a DOM-preview → copy-
      prompt edit model are a regression from Praxis's source-aware editing seam, so it
      was not adopted. See PROGRESS 2026-09-01.

## Codex can operate Praxis-owned worktree recovery (2026-08-28, user-requested) — SHIPPED

- [x] **Stop handing complex landing conflicts back to the user.** ✅ 2026-08-28 —
      Codex and gateway sessions now receive session-scoped `workspace_state` and
      `prepare_conflict_resolution` MCP tools. They read/mutate the authoritative
      in-process coordinator through a token-scoped local socket and the existing
      repository queue; Codex resolves the staged markers in its own checkout and
      normal turn completion lands them. No raw Git or discard/reset capability is
      exposed. `test/praxis-agent-tools.mjs`, `test/chat-worktrees.mjs`, `test/rules.mjs`.

## Remote publish reconciliation (2026-08-27, user-reported)

- [x] **Preserve and reconcile both work-branch histories before push.** ✅
      2026-08-27 — Publish now holds a per-repository lock, fetches/prunes origin,
      records recovery refs for both tips, chooses normal push vs fast-forward vs
      explicit merge from ancestry, and retries a remote-moved rejection at most
      three total attempts. Conflicts pause with their exact files and never use
      force/rebase/reset or a blanket ours/theirs strategy. Existing conflicts are
      refused before staging. `test/publish-reconcile.mjs` covers the full graph
      matrix plus a real push race.
- [ ] **Replace permanent work-branch publishing with unique publish branches.**
      Build each `praxis/publish/<session-id>` from a freshly fetched
      `origin/<base>`, apply the session's squashed changes there, open/merge its
      PR, delete the temporary branch, and seed the next chat from the newly
      fetched base. This removes cross-session branch-name collisions entirely;
      it needs a deliberate migration for current PR-only mode and existing open
      PRs rather than being hidden inside the rejection repair.

## Terminal shutdown errors (2026-08-24, user-reported) — SHIPPED

- [x] **Stop the endless `write EIO` dialog loop after the launch terminal closes.** ✅
      2026-08-24 — stdout/stderr now absorb only write-side `EIO`/`EPIPE` from a
      vanished PTY before those errors reach the global crash reporter and get
      logged recursively. Other stream errors still surface.
      `test/terminal-streams.mjs` covers the classifier and guard behavior.

## Default model + Main surviving reload (2026-08-18, user-requested) — SUPERSEDED

- [x] **New chats follow last-used, or a Settings default.** ✅ 2026-08-18 —
      Claude is no longer hardcoded as the only fallback. `preferred-model.ts`
      remembers the last picker choice (any chat) and Settings → Models can pin
      a specific model instead. Existing chats keep their own `chatSettings`.
      See PROGRESS 2026-08-18.
- [x] **Main keeps its thread across quit/relaunch.** ✅ 2026-08-18 — closing or
      quitting persists Main as `slot: 'main'` (hidden from History). The next
      `open-project` restores the transcript in place and resumes the Claude SDK
      session when it can. **Clear context** is still what archives it into
      History. `test/agent-history.mjs`, `test/restore-reload.mjs`.

## Cross-origin iframe navigation (2026-08-18, user-reported) — SHIPPED

- [x] **Let iframe redirects load without weakening the pinned preview origin.** ✅
      2026-08-18 — `will-navigate` / `will-redirect` now use Electron 43's
      `details.url` and `details.isMainFrame`; subframes proceed untouched while the
      main frame remains pinned to the exact origin and port. Preview popup requests
      are denied silently because `setWindowOpenHandler` exposes no reliable
      user-activation signal. `test/preview-iframe-navigation.mjs` covers a
      cross-origin iframe 302, the no-external-open invariant during mount, and a
      blocked/externalized top-level navigation to the iframe's localhost port.

## Architecture + security review fixes (2026-08-14, user-requested) — SHIPPED

- [x] **Preview hardening.** ✅ 2026-08-14 — untrusted preview moved to its own
      `persist:praxis-preview` partition with deny-all permission handlers;
      `will-redirect` guarded like `will-navigate`; navigation pinned to the
      loaded dev-server origin (was: any localhost port); `shell:true`
      invariants documented at both spawn sites. See PROGRESS 2026-08-14.
- [x] **Background chats' permission/question cards were dead.** ✅ 2026-08-14 —
      cards now carry `sessionKey` and render only in their own chat; main
      resolves responses across ALL sessions instead of only the active one.
- [x] **Cross-boundary mirrors made single-source.** ✅ 2026-08-14 — layer types
      import from `shared/api.ts`; preview channel names in
      `shared/preview-channels.ts`; style-prop allowlist in
      `shared/style-props.ts` with a `satisfies` check on the renderer meta;
      `SimElementPick`/`ProjectCreateResult` named and drift-fixed.
- [x] **Lifecycle fixes.** ✅ 2026-08-14 — `nativeTheme` listener registered
      once (was leaking per dock re-activate); spawn cap reserved synchronously
      (was racy under concurrent `pumpQueue`).
- [x] **Size/duplication.** ✅ 2026-08-14 — `preview-ipc.ts` extracted from
      `index.ts` (1263 → 968) with a shared `requestReply` helper; preload's 24
      subscribe wrappers → one `on<T>()` factory; new `test/style-tokens.mjs`
      unit test.
- [ ] **Deferred splits (each its own PR):** `App.tsx` (2194 lines, 31
      useEffects), `store.ts` (1755 — ~25 stores + helpers + test handles),
      `ChatPanel.tsx` (1704 — composer vs message list), and `props.ts` (1330 —
      extract the shared source-file plumbing used by styles/move-node/controls
      into a `source.ts`).

## A project's favicon leads its rail row (2026-08-12, user-requested) — SHIPPED

- [x] **Show the project's own favicon instead of the folder icon.** ✅ 2026-08-12
      — new `src/main/project-icon.ts` resolves an icon from the project's source
      tree (declared `<link rel="icon">` first, then the conventional paths) and
      inlines it as a `data:` URL over a new `project:icon` IPC; a
      `useProjectIcons` store feeds `Rail.tsx`, where the `<img>` rides
      `.rail__folder` so it keeps the 16px slot and the hover-to-chevron
      cross-fade. Reads FILES, not the running page, so a cold project has an
      icon too. `test/project-icon.mjs` (unit), `test/rail-favicon.mjs`
      (electron, screenshot 19). See PROGRESS 2026-08-12.
- [ ] **Follow-up: a first favicon added mid-session needs a relaunch.** Main
      revalidates a *changed* icon by mtime, but the renderer caches a miss for
      the session, so a project that gains its first favicon while open keeps
      the folder until next launch. A `refresh()` on the store (called after a
      turn touches the project) closes it; not worth a poll.

## Editor media previews (2026-08-09, user-reported)

- [x] **Opening an image in the editor showed its bytes as text.** ✅ 2026-08-09 —
      `source:read` now classifies media/binary instead of always decoding utf8, and
      the drawer renders `MediaPreview` (image on a checkerboard, video/audio with
      controls, placeholder otherwise) served over a token-scoped, range-capable
      `praxis-media://` protocol. See PROGRESS 2026-08-09.
- [ ] **Give the file tree a type hint.** `source:tree` returns bare paths, so the
      sidebar can't show an image icon or a thumbnail until it carries per-entry
      metadata — and the editor can't warn before opening a 200 MB asset.
- [ ] **No video fixture in the suite.** `test/code-drawer.mjs` proves the protocol's
      206/`Content-Range` path with a PNG, but nothing exercises a real `<video>`
      (seeking, `video/quicktime` on a .mov). Needs a checked-in seconds-long clip.

## Main chat, child agents, and project memory (2026-08-08) — SUPERSEDED

- [x] **Make Main a stable, visible project role.** ✅ 2026-08-08 — Main is pinned
      first, cannot be closed like a secondary, and History is a separate rail section.
- [x] **Show comment agents under the chat that launched them.** ✅ 2026-08-08 —
      spawn identity now carries the parent session key; rows show their inherited
      model and aggregate onto the parent/project working status.
- [x] **Durable per-project memory + clear Main context.** ✅ 2026-08-08 — curated,
      16k-bounded memory lives outside Git in Praxis userData, enters every provider,
      and survives a Main reset; the old transcript is archived into History.
- [x] **Sort the rail's per-project controls by what they act on.** ✅ 2026-08-09 —
      project memory is a brain action on the project row (× is hover-only now),
      "New chat" is a full-width button under the chat list it appends to, and
      History folds as an accordion. See PROGRESS 2026-08-09.
- [x] **Put the whole rail block on one indent grid.** ✅ 2026-08-09 — the "New chat"
      + and the History chevron moved into the same 16px glyph slot as the folder and
      the status dots (labels all at 31px); row actions became a hover overlay so
      every row's model/time ends on one trailing edge instead of Main's running 34px
      further right; History now starts folded and the memory brain is hover-revealed
      like ×. See PROGRESS 2026-08-09.
- [x] **Learn unified project memory from conversation decisions.** ✅ 2026-09-04 —
      after each successful turn, Claude and Codex run a tool-free, conservative
      evaluator that merges durable decisions into shared memory. Per-project queues
      prevent peer-chat races and protect concurrent manual edits; the memory editor
      remains the user's direct review and override surface. See PROGRESS 2026-09-04.
- [x] **Enable detached background agents on Codex/gateway sessions.** Shipped
      2026-09-09 with tagged child output, automatic visual-edit routing, safe
      terminal outcomes, and real Codex auto-landing/cancellation verification.

## Per-chat isolation (2026-08-08, user-reported)

- [x] **Merge conflict on almost every turn, listing `node_modules`.** ✅ 2026-08-08
      — a trailing-slash `node_modules/` `.gitignore` is directory-only and doesn't
      match the symlink Praxis stitches into each worktree, so `git add -A` staged
      it and the auto-merge choked (`EISDIR`) → parked every turn. Fixed by
      excluding `RUNTIME_DEPS` (node_modules/.env) from every stage explicitly
      instead of trusting `.gitignore` (`worktrees.ts`, `chat-worktrees.ts`), plus a
      slash-free scaffold `.gitignore`. Regression: `test/chat-worktrees.mjs` repo9.

## Codex turn streaming (2026-08-08, user-reported)

- [x] **A connection running DeepSeek works end-to-end.** ✅ 2026-08-08 — the user
      ran `deepseek/deepseek-v4-flash` through a gateway connection and got real
      multi-turn replies (38k in / 513 out). That closes the "Kimi/DeepSeek
      unproven" item below for DeepSeek: an open model really does drive a chat on
      the Codex harness. Its `apply_patch` reliability is still unmeasured — that
      needs a turn that actually EDITS a file.
- [x] **Assistant replies were missing their opening, mid-word.** ✅ 2026-08-08 —
      "ve reliable visibility…", "ing else?". Codex streams whole items and praxis
      emits the unsent SUFFIX, but the CLI numbers items PER TURN while the
      tracker lived for the whole SESSION — so turn 2's `item_0` inherited turn
      1's length and lost exactly that many leading characters. Longer replies
      still rendered, just beheaded, which is why it went unnoticed. New pure
      `backends/codex-stream.ts`, reset each turn. Same bug silently DROPPED tool
      steps on later turns (an id already "surfaced"). `test/codex-stream.mjs`.
- [ ] **"Model metadata for `<model>` not found" is repeated every turn.** The
      string lives in the vendored `codex` binary, so it's the CLI warning about a
      non-OpenAI model id, and it lands in the chat's step list on EVERY turn —
      pure noise after the first. Worth finding which event carries it (it renders
      as a step, not a red error) and showing it at most once per session, or
      dropping it: the user can't act on it and it isn't wrong, just loud.

## Props island + preview port (2026-08-07, five failing Electron tests)

- [x] **The island's first state push had nowhere to land.** ✅ 2026-08-07 — the
      view is created by `panel:show`, which follows the first `setState`, and
      the `did-finish-load` re-push races the island's own listener. The island
      now PULLS (`panel:request-state`) after subscribing. See PROGRESS.
- [x] **A reopened island could stay at its 160px default.** ✅ 2026-08-07 —
      `PanelHost` remounts with a fresh size state while the island page (and its
      ResizeObserver) lives on, so an unchanged card height reported nothing.
      `PanelApp` re-measures on every state push.
- [x] **`isPortFree` missed a dual-stack occupant.** ✅ 2026-08-07 — SO_REUSEADDR
      lets a 127.0.0.1 bind succeed under a wildcard listener, so praxis handed
      out an occupied port and then previewed whatever already answered there.
      Both probes now run; the wildcard one only votes on `EADDRINUSE`.
- [ ] **`custom-controls`'s burst assert is still latency-sensitive.** It needs
      three `applyLiteral` records inside edit-history's 500ms window; main-side
      apply latency is usually 15–135ms but was measured at 496ms once under
      load. If it flakes again, the honest fix is main-side (why does a
      read-splice-write occasionally take half a second?), not a bigger
      COALESCE_MS.
- [ ] **Leaked fixture dev servers survive a killed test run.** Seven `node
      server.mjs` processes from July/August runs were still holding 7777–7783 on
      this machine (`before-quit` → `stopAll` only runs on a graceful quit). The
      port fix makes praxis route around them; nothing reaps them.

## Settings "Connecting…" hang + publish guidance (2026-08-07, user-reported)

- [ ] **STILL NOT REPRODUCED — the user's Connect hangs, mine doesn't.** They see
      "Contacting ai-gateway.vercel.sh… 94s" with no error. Measured inside the
      BUILT app's main process on this machine, every case ends promptly: real
      gateway + bogus key → 401 in 0.7s, closed port → instant, blackhole IP →
      the 10s abort fires. So main is healthy here and the difference is on their
      machine or in their build. Two theories, neither confirmed: (a) they run
      `bun run dev`, where React.StrictMode double-invokes mount effects — the
      `live` ref was cleanup-only, so `live.current` would stay false forever and
      `stale()` would be permanently true, meaning the probe could never render,
      error, OR hit its own deadline. Fixed the ref regardless (it was a real
      bug), but a `--mode development` build did NOT reproduce it, so this is
      unproven. (b) something network-level (proxy/VPN/DNS) that main's own abort
      somehow doesn't cover. NEXT: ask which command they launch with, and get
      the error text now that the state-driven deadline forces one after 12s.
- [x] **Made the hang structurally impossible instead of guessing.** ✅
      2026-08-07 — the deadline is now driven by the rendered `inFlight` state,
      not by a closure gated on `stale()`. Any path that disowns a probe without
      clearing the state used to strand the button; now if `inFlight` is set it
      is cleared when the deadline passes, whatever went wrong. Plus the first
      real UI test of the dialog (`test/settings-connect.mjs`) — two rounds of
      fixing this shipped without one, which is why both missed.
- [ ] **The never-answering-IPC path isn't test-reachable.** The preload bridge is
      frozen so a test can't stub `providers.catalog` to hang, and main always
      answers within its 10s abort — so the state-driven deadline is reasoned,
      not asserted. Needs either an injectable IPC seam or a main-side switch to
      stall a probe on demand.
- [x] **Publish failure now says how to fix it.** ✅ 2026-08-07 — "this folder
      isn't the repository root" named no repo and no action. It now distinguishes
      "not a git repository at all" (→ `git init` here) from "inside the repo at
      <path>" (→ open that, or `git init` here), and `scaffold.ts` no longer
      SWALLOWS a failed `git init`/first commit — that silence is what let a new
      project look fine until publish blamed something unrelated.

## Stop / interrupt (2026-08-07, user-reported)

- [x] **Stop was a dead button on Claude, and a silent no-op on Gemini.** ✅
      2026-08-07 — the SDK's `interrupt()` control request has no timeout, so a
      wedged subprocess made Stop hang forever with the spinner still running.
      New pure `src/main/backends/interrupt.ts` (ask, then kill), claude.ts
      escalates to its abort signal and emits the missing `done`, agent.ts caps
      its wait and rebuilds the dead session. Gemini gained a real `interrupt`.
      `test/interrupt-escalation.mjs`. See PROGRESS 2026-08-07.
- [ ] **The wedge itself was never reproduced.** The fix is reasoned from the SDK
      source + event paths and its escalation logic is unit-tested, but nobody has
      seen it rescue a real hang. If it recurs: confirm Stop now returns within
      ~3s, the chat restarts, and the "force-stopped" message appears. Worth
      capturing what triggers it (large image attachment? long session? a
      particular tool?) — the user reported it as intermittent.
- [ ] **A hard stop loses the model's context.** The restarted chat is a fresh SDK
      query, so earlier turns are gone from the model's view even though praxis
      still shows them. The record captures `sdkSessionId`, and v9 resume already
      exists, so restarting via `resume` instead of fresh would keep the context —
      not attempted here because a wedged session's id may itself be unusable.
- [ ] **Codex/connection turns can't be force-stopped, only aborted locally.** Its
      `turnAbort` cancels praxis's read of the stream; whether the underlying CLI
      process actually dies wasn't verified. Worth checking a connection turn
      against a slow endpoint.

## v10 — bring-your-own-model connections (2026-08-07, user-requested)

- [x] **Connections: user-added OpenAI-compatible endpoints.** ✅ 2026-08-07 —
      harness and endpoint split apart (`AgentOptions.connectionId` beside
      `provider`); `src/main/providers-store.ts` (pure) +
      `src/main/providers.ts` (safeStorage cipher, `providers:*` IPC, `/models`
      probe, `resolveConnection`); Codex SDK aimed at the endpoint via a
      dedicated `model_providers."praxis-connection"` block.
      `test/providers-store.mjs`. See PROGRESS 2026-08-07.
- [x] **Settings dialog + model-first picker.** ✅ 2026-08-07 —
      `SettingsDialog.tsx` / `ProviderForm.tsx` / `renderer/src/providers-store.ts`;
      `ChatPanel.tsx`'s hardcoded model arrays and Backend dropdown deleted in
      favour of one grouped list from `providers.choices()`.
- [ ] **NOTHING here has hit a live third-party endpoint.** Every verification
      was a local probe server plus the real SDK/CLI. SUPERSEDED 2026-08-07 for the
      gateway — see the next item; still open for Groq and other hosts.
- [x] **The connection path works against a live AI Gateway.** ✅ 2026-08-07 —
      real key, real turn, real edit: `anthropic/claude-sonnet-4.6` through
      `https://ai-gateway.vercel.sh/v1` on the Codex harness read the file, wrote
      a correct edit, left the untargeted function alone, and finished in 15.5s
      with ZERO error events. That settles the two big unknowns: the gateway's
      `/responses` accepts Codex's request shape, and the
      `model_providers."praxis-connection"` block (websockets off) is right — no
      reconnect attempts appeared. `/models` returned 322 models including all
      eight Kimi variants and nine DeepSeek ones.
- [ ] **Kimi/DeepSeek still unproven — the test key was free-tier.** Every open
      model returns 403 "Free tier users do not have access to this model", then
      429 once the free allowance is spent; only `anthropic/*` was reachable. So
      the `apply_patch` question below is still open, and needs paid gateway
      credits to answer. (Note the irony: the first fully working connection ran
      Claude through the Codex harness.)
- [ ] **Open models may fumble Codex's `apply_patch` format.** GPT-5 was trained
      on it; Kimi/DeepSeek weren't, so edits may need retries or fail. Blocked on
      paid credits (above). If it's bad, the fix the user asked for is an appended
      system-prompt section teaching the patch format (praxis already prepends its
      rules to the first Codex turn, so there's a hook).
- [ ] **Connection runs inherit the user's global `~/.codex/config.toml` MCP
      servers.** Observed live: an unauthenticated `mcp.vercel.com` entry on the
      dev machine dumped an OAuth `AuthRequired` blob into the turn's error text.
      Praxis only overrides `model_provider`, so this is expected — but it means a
      user's unrelated MCP config can pollute a connection chat. Decide whether a
      connection run should start from a clean MCP set.
- [ ] **A chat pointing at a deleted connection.** The picker falls back to an
      option echoing the raw stored value and `AgentOptions` still carries the
      dead `connectionId`; main fails the turn soft with "re-add it in Settings".
      Deliberate (don't silently rewrite a user's chat settings) but the UX of
      that state hasn't been designed.
- [ ] **Untested UI paths:** the `unsupported: true` free-text fallback (host
      with no `/models` route) and the edit-an-existing-connection auto-probe.
      Both need a host that exhibits them.
- [x] **Both seats' model lists are discovered, not curated.** ✅ 2026-08-07 —
      `src/main/model-catalog.ts` (pure: parsers + TTL cache, injected
      clock/baseDir, persisted to `<userData>/praxis/model-catalog.json`) +
      `src/main/codex-models.ts` (runs `codex debug models` on the SDK's vendored
      binary). Claude answers `Query.supportedModels()`, handed back from
      `backends/claude.ts` since it needs a live session. `test/model-catalog.mjs`.
      See PROGRESS 2026-08-07.
- [ ] **Codex-seat parity holes** (these now matter for every connection model,
      not just ChatGPT users): praxis's in-process tools aren't available (serve
      them over a local MCP server injected via `CodexOptions.config`, whose
      `mcp_tool_call` events `backends/codex.ts` already maps); no
      `AskUserQuestion` equivalent; no resume (`resumeThread(id)` +
      `ThreadStartedEvent.thread_id` make this nearly free). Background spawning shipped
      2026-09-09; provider-thread resume remains open.
      Per-tool approve/deny cards are NOT closable — the SDK event stream has no
      approval-request event; user accepted that trade-off 2026-08-07.

## Design-token naming accuracy (2026-07-30/31, user-reported)

- [x] **A token from another property family can't name a row.** ✅ 2026-07-30 —
      `--rmt-radius-none` was labelling `padding: 0`. `groupAffinity` (a coarse
      `TokenKind`) became `groupRole` (a semantic `TokenRole`). Superseded the
      next day by the proof requirement below for `css`/`tailwind` sources
      (role-based ranking is no longer how naming is decided for them — proof
      is); still load-bearing for `manifest`, which has no proof mechanism.
      `src/shared/token-match.ts`, `test/token-match.mjs`. See PROGRESS 2026-07-30.
- [x] **Naming requires PROOF a value comes from a token, not just equals one.**
      ✅ 2026-07-31 — `getComputedStyle` always resolves `var()` away, so value
      equality alone can never distinguish "IS this token" from "coincidentally
      equals it." New `src/preview/style-provenance.ts` reads the SPECIFIED
      (unresolved) declaration — inline `style=` or a matched stylesheet/scoped-
      `<style>` rule — threaded through `styles:read` as `declaredVars`.
      `resolveTokenForValue` now requires it for `css`/`tailwind` sources;
      `manifest` (no reference mechanism exists) keeps the value+role heuristic
      above. `test/token-match.mjs`, `test/style-provenance.mjs` (new, real
      headless-Chromium DOM/CSSOM test), `test/style-edit.mjs`. See PROGRESS
      2026-07-31.
- [ ] **`sameCssValue` doesn't equate bare `0` with `0px`.** Found 2026-07-30
      while writing the above. A theme declaring `--space-0: 0` (unitless —
      legal CSS, and `tokenValueKind` already accepts it as a length) can never
      match a computed `0px`, so that token is offered but never names anything.
      Fix belongs in the renderer's `css-values.ts` comparator; it shifts
      matching for every property, so it wants its own pass.
- [ ] **`test/style-edit.mjs`'s token assertions are written but unrun.**
      CORRECTED 2026-08-07: the reason recorded here ("the Electron tier can't
      launch a window on this machine") was WRONG — see the new gotcha in
      CLAUDE.md. The tier runs fine through `test/run.mjs`, which gives each test
      a fresh `PRAXIS_USER_DATA`; the `.empty__open` timeout only happens when a
      test is invoked DIRECTLY (`node test/style-edit.mjs`), because it then uses
      the real app state, and if any project is open the empty state never
      renders. `style-edit` does still fail under the runner, but on a genuine
      assertion ("inspector never showed src/Styled.tsx:5 after clicking
      #tw-box") — that's the real bug to chase. Same gap as the styles-ladder
      fix (2026-07-30); worth a real run wherever the Electron window can
      reliably take focus.

## Styles ladder — respect the project's styling convention (2026-07-30, user-requested)

- [x] **Never INTRODUCE an inline style.** ✅ 2026-07-30 — S2 now only extends a
      `style` attribute that already exists; absent → S3, whose prompt names the
      project's own approaches and forbids the agent from adding one either.
      Fixes a token pick writing `style="color: var(--color-title)"` onto a bare
      `<h1>` in a CSS-variable project. `src/main/styles.ts`,
      `styles-svelte.ts`; contrast case + `BareCard` fixture in
      `test/style-edit.mjs`. See PROGRESS 2026-07-30.
      Deliberately NOT planned (dropped 2026-07-30, user call): teaching S1 to
      CREATE a class attribute for Tailwind projects. The mirror-image gap is
      real — an unclassed element in a Tailwind project pays an agent turn it
      shouldn't — but reliable project-level Tailwind detection is the blocker
      (v4 is CSS-first and often ships no `tailwind.config.*`), and agent-routing
      it is correct, just slower.
- [ ] **A runnable tier for the styles ladder.** CORRECTED 2026-08-07 — the
      premise ("can't launch a window on the current dev machine, dies at
      `.empty__open`, at HEAD too") was wrong: that only happens when the test is
      run directly instead of through `test/run.mjs`, which isolates
      `PRAXIS_USER_DATA` per test. The window launches fine. The S2-refusal
      assertion is still unrun because `style-edit` fails earlier on a real
      inspector assertion. Verified instead with a throwaway harness driving
      the real `applyStyleEdit` in node (PROGRESS 2026-07-30 has the details).
      Worth making permanent if the Electron tier stays unrunnable.

## Rail chat statuses + rename (2026-08-05, user-requested) — SHIPPED

- [x] **A status dot per chat row + inline rename.** ✅ 2026-08-05 — hollow ring
      = stale, filled grey and blinking = a turn in flight, filled green = a turn
      finished while you were on another chat. Dots occupy the project row's own
      16px folder-glyph slot, so they share its centre line while the chat names
      keep their indent. New `needsReview` on the chat slice (set by `finish`
      only for a chat that isn't on screen, cleared by `setActiveChat`). Rename
      goes through main, the only writer of a chat's name:
      `agent:rename-chat` for a live chat (it also blocks the auto-namer),
      `sessions:rename` for a past one. New
      `src/renderer/src/components/RailChatRow.tsx`,
      `test/rail-chat-status.mjs`. See PROGRESS 2026-08-05.

## Layers panel (2026-07-29, user-requested) — SHIPPED

- [x] **DOM tree + click-select + drag-to-reorder.** ✅ 2026-07-29 — a tree of
      the previewed page above the chat, toggled from the composer. Selecting
      a row reuses the real in-page click path; dragging writes a real source
      edit for a same-parent sibling reorder (React/Svelte/static HTML), and
      seeds a chat prompt for anything ambiguous (list items, reparenting,
      cross-file). New `src/preview/layers.ts`, `src/main/move-node*.ts`,
      `src/main/ast-walk.ts`, `LayersPanel.tsx`/`LayersTree.tsx`.
      `test/layers-move.mjs` (unit), `test/layers-panel.mjs` (electron, new
      `test/fixtures/layers-app/`). See PROGRESS 2026-07-29.
      Deliberately NOT planned (dropped 2026-07-30, user call): reparenting /
      cross-parent / cross-file moves stay agent-routed; label live-refresh
      and tree virtualization only if real use demands them.

## Design tokens in the Styles panel (2026-07-28, user-requested) — SHIPPED

- [x] **Name the token instead of the value, and offer a picker.** ✅ 2026-07-28
      — every token-able row (colors, padding/margin/gap, radius, font-size /
      -weight, line-height, letter-spacing, opacity) shows the matching token's
      name and expands an inline `TokenPicker`; picking one writes a *reference*
      (`var(--name)` / a Tailwind token class), never the resolved value.
      New `src/shared/token-match.ts` + `src/main/style-tokens.ts`,
      `TokenSet` on `PanelState`, `.less`/`.sass` detection. `test/token-match.mjs`,
      extended `tw-styles.mjs` / `tokens.mjs` / `style-edit.mjs`. See PROGRESS 2026-07-28.
      Deliberately NOT planned (dropped 2026-07-30, user call): Svelte
      scoped-`<style>` editing (token picks there keep seeding the agent),
      "save this value as a token", and deleting the dead `props:applyToken`
      path (dead-but-harmless; only `test/prop-edit*.mjs` exercise it).

## Vanilla HTML / static sites (2026-07-09, user-requested) — SHIPPED

- [x] **Open plain HTML/CSS/JS projects.** ✅ 2026-07-09 — `detect()` falls back
      to `framework:'static'` for folders with an HTML entry and no runnable dev
      command; a new in-process `src/main/static-server.ts` serves them (with
      live-reload). Anything un-auto-launchable now errors with "Enter a command
      to launch this project", which the preview error bar already turns into a
      custom-command retry. `test/static-serve.mjs`.
- [x] **Don't offer/greypanel setup on a project that can't be instrumented.**
      ✅ 2026-07-27 — `setup:detect` read-only probe (`{ framework, canInstrument }`);
      the on-open offer gates on `canInstrument` (no dead-end "Set it up" on a
      static/vanilla repo) and the Styles tab's no-source state shows tailored
      guidance + an "Ask Praxis to restyle it" seed instead of greyed controls.
      Extended `test/setup-detect.mjs`. See PROGRESS 2026-07-27.
- [ ] **Follow-up:** driven screenshot test for the static path — offer absent +
      StylePanel read-only guidance rendered on a JS-generated (no-source) element.

## v9 — in-tool code view  ⭐ (2026-07-03, user-requested) — SHIPPED

- [x] **Phase 1 — read-only code peek + open-in-editor.** ✅ 2026-07-03 — a "Code"
      toggle on the Inspector shows the stamped file (highlight.js, line-number
      gutter, element line-span marked, auto-scrolled to the stamp) via a new
      `source:read` IPC; `source:open-in-editor` jumps to `file:line:col` in
      code/cursor/zed/subl (fallback: OS default app). `test/code-peek.mjs`.
- [x] **Phase 2 — editable code drawer.** ✅ 2026-07-02 — CodeMirror 6 in a bottom
      drawer under the preview. Save (⌘S) routes through `source:write` →
      `commitEdit`, so undo/redo + HMR are free; a stale-baseline write is refused
      as a conflict. `test/code-drawer.mjs`.
      **Known limit:** the floating PropPanel overlaps the drawer's top-right in a
      narrow window — complementary but unaware of each other's inset.
- [x] **Phase 3 — pop the drawer out into its own window.** ✅ 2026-07-14 (LKM-48)
      — a pop-out button opens the editor in a standalone, freely-resizable
      `BrowserWindow` (same renderer bundle via `?praxisEditor=1`, new `EditorWindow`
      entry + `CodeDrawer` `variant="window"`). One window per project root;
      re-focuses + retargets on a repeat pop-out. `source.popout/closeWindow/
      onNavigate` IPC. `test/code-drawer.mjs`.
- [x] **Phase 4 — file-tree sidebar in the pop-out.** ✅ 2026-07-20 — the pop-out
      window gains a left file tree (`@pierre/trees`, vanilla/shadow-DOM entry so
      it's decoupled from the renderer's React 18). Click a file → opens in the
      shared drawer store. `src/main/file-tree.ts` + `source:tree` IPC list the
      project (git ls-files, fs-walk fallback). `test/file-tree.mjs`. Also renamed
      the toolbar "Editor" button → "IDE" and dropped the pop-out's redundant
      close button (native traffic lights close it).
- [x] **Phase 5 — the sidebar became a file manager.** ✅ 2026-08-05
      (user-requested) — new file / rename / delete from the tree: a toolbar above
      it plus Finder's click-the-selected-file-again to rename. New
      `src/main/file-ops.ts` (pure) behind `source:create-file`/`rename-file`/
      `delete-file`; every renderer path is re-validated (no traversal, no
      `.git`/`.praxis`/`.dsgn`/`node_modules`), create/rename never clobber, and
      delete goes to the OS trash because the content-diff undo history can't
      represent a deleted file. `test/file-ops.mjs`. See PROGRESS 2026-08-05.
      Deliberately out of scope: directory create/rename/delete (a nested path
      makes dirs implicitly; git doesn't track empty ones anyway) and drag-to-move.
- [ ] **Follow-up:** see the sidebar's new chrome rendered. CORRECTED 2026-08-07
      — "the Electron tier can't launch a window here (`test:codedrawer` dies at
      `.empty__open`, at HEAD too)" was wrong; that's the run-it-directly trap
      (see CLAUDE.md). `code-drawer` PASSES through `test/run.mjs`, so the
      toolbar / rename field / delete confirm are unverified
      visually, as is whether the tree widget re-fires a selection change for an
      already-selected row (the `dblclick` fallback exists because it might not).

## Per-chat worktree isolation (2026-07-16, concurrent-chat safety) — SHIPPED

- [x] **Isolate concurrent chats in per-repo worktrees.** ✅ 2026-07-16 —
      Every interactive chat on a git repo root gets its own long-lived worktree,
      created before `startSession` and removed on close. A `praxis/chat-<id>`
      recovery branch is attached during a turn; successful `done` events land via
      the repo queue and delete it, while errors/interruption or conflicts park on
      the branch for review. The preview always serves live, never a worktree. The
      `SessionReview` UI. `src/main/chat-worktrees.ts` (turn operations),
      `src/main/chat-isolation.ts` (lifecycle + crash recovery), extended
      `src/main/worktrees.ts` (C1 primitives), `test/chat-worktrees.mjs` (unit),
      `test/chat-isolation.mjs` (Electron).
- [x] **Parked-conflict UX — sidebar badge + AI "Resolve it".** ✅ 2026-07-16 —
      a parked live chat shows an amber "conflict" badge in the rail, and an
      in-chat `ConflictCard` explains the collision in plain language and offers
      **Resolve it** (the AI reconciles both sides — `stageResolve` re-lays the
      chat's diff onto the user's live tree, then either auto-merges cleanly with
      no turn or runs a resolution turn on the conflict markers) / **Discard
      changes**. New `agent.resolveConflict`/`discardConflict` IPC keyed by the
      active session; `src/renderer/src/components/ConflictCard.tsx`;
      `stageResolve` + `resolveParkedChat`/`discardParkedChat`; extended
      `test/chat-worktrees.mjs`.
- [x] **One commit per turn on the LIVE checkout.** ✅ 2026-08-05 (user-requested
      — "so that I can easily revert or follow the progress") — the merge back
      onto the live tree is now also committed there, one commit per turn, with
      the prompt as the subject. Only the turn's own files are staged and it's a
      partial (pathspec) commit, so the user's unrelated dirty/staged work is
      untouched; non-repo-root projects are skipped. `src/main/live-commit.ts`,
      wired from `chat-isolation.ts` + `agent.ts`'s spawn finalizer;
      `publishToPr`'s file list now diffs vs the default branch instead of HEAD
      (extracted to `src/main/publish-scope.ts`).
      `test/live-commit.mjs`. See PROGRESS 2026-08-05.
      Not done deliberately: no user-facing toggle (the whole point is that it's
      always on) and no UI surfacing of the commit sha — `git log` is the UI.
- [x] **One repository landing writer + ephemeral chat branches.** ✅ 2026-08-08 —
      per-chat chains did not protect the shared live index from two different chats.
      Every snapshot/landing/resolve/teardown now crosses a repo-scoped queue. A chat's
      `praxis/chat-*` branch exists only during a turn or while parked; successful
      landing/discard detaches the still-live worktree and deletes the branch, and the
      next `beforeTurn` recreates it for crash recovery. `src/main/repo-write-queue.ts`,
      `src/main/{chat-isolation,chat-worktrees,worktrees}.ts`, `test/live-commit.mjs`.
- [x] **Resolver independence + artifact/marker safety.** ✅ 2026-08-08 — the
      3-way path now uses a temporary index seeded from the live working tree, leaving
      the user's staged state untouched and eliminating `does not match index` failures.
      `.env*` secrets, `node_modules`, `*.tsbuildinfo`, and sidecars are excluded at
      snapshot/turn/live-commit boundaries; unresolved marker triplets remain parked.
      Isolation setup fails closed. `src/main/{worktrees,chat-worktrees,live-commit}.ts`,
      `test/{chat-worktrees,live-commit}.mjs`.
- [x] **Terminal outcomes are explicit and idempotent.** ✅ 2026-08-08 — only a
      clean `done` auto-lands; `error`/interruption commits partial work to the recovery
      branch and parks it. A per-turn tracker collapses Codex's `error→done` sequence so
      finalization runs once. `src/main/turn-terminal.ts`, `src/main/{agent,
      chat-isolation,chat-worktrees}.ts`, `test/{turn-terminal,live-commit}.mjs`.

## v10 — Styles tab + AI-surfaced control panels (2026-07-18, user-requested) — SHIPPED

- [x] **Dialkit-style Styles tab.** ✅ 2026-07-18 — the island gained a
      `Props | Styles` switch; scrub-to-adjust controls over the v1 CSS set with
      live preview injection, committing via Tailwind class rewrite → inline
      splice → agent fallback through `commitEdit`. `src/main/styles.ts`,
      `styles-svelte.ts`, `tw-styles.ts`, `inline-style.ts`,
      `src/renderer/src/lib/css-values.ts`, `components/StylePanel.tsx` +
      `components/styles/{ScrubInput,ColorControl,BezierEditor}.tsx`.
      `test/{tw-styles,inline-style,css-values}.mjs`, `test/style-edit.mjs`.
- [x] **Transitions + cubic-bezier editor.** ✅ 2026-07-18 — duration/delay/
      property plus a draggable bezier editor with preset snap and replay.
- [x] **AI-surfaced control panels.** ✅ 2026-07-18 — "Surface controls with AI"
      runs a real agent turn that instruments the source and calls a new
      `define_controls` tool; main validates and owns
      `.praxis/control-panels.json`; the Custom tab renders the manifest with the
      Styles primitives. `src/main/control-manifest.ts`, `control-panels.ts`,
      `components/CustomPanel.tsx`, `lib/controls-prompt.ts`.
      `test/control-panels.mjs` (unit), `test/custom-controls.mjs` (Electron),
      `test/controls-agent.mjs` (live).

**Follow-ups (not started):**

- [ ] **Springs / framer-motion animation params.** v1 is CSS transitions only;
      a spring config isn't a single CSS value, so it needs its own control
      shape and a library-aware apply path. The 2026-09-01 opt-in generator can
      now surface these through Custom controls; this item remains the native,
      automatically detected apply path.
- [ ] **More style properties** — width/height, box-shadow, per-corner radius,
      borders, position/inset; each needs a family mapping + a sane control.
- [ ] **Responsive / state variants** (`hover:`, `md:`) — the rewrite currently
      treats variant-prefixed classes as neither candidates nor blockers, so
      editing them at all is unimplemented, not merely unsupported.
- [ ] **Auto re-pick after navigation.** A full navigation wipes the preview
      preload's selection; the panel asks for a manual re-click today.
- [x] **`define_controls` for Codex and custom endpoints.** Shared validated
      registration through the session-scoped MCP bridge, including background edits.
- [ ] **`define_controls` for experimental Gemini.** Still uses typed-prop fallback.

## Health / infra (from the 2026-07-07 review)

Ranked by leverage. Deferred items note *why* they're not auto-completable.

- [x] **Test runner to replace the package.json mega-chains.** ✅ 2026-07-07 —
      `test/run.mjs` (`node test/run.mjs unit|electron|live|all`): keep-going,
      exit-0=pass (incl. e2e self-SKIP), builds once before the electron tier,
      summary table, non-zero exit on any failure. `test` = `unit electron`,
      `verify` = `all`; the ~40 `test:*` aliases are unchanged. Verified: unit
      tier 15/15 green.
- [x] **CI.** ✅ 2026-07-07 — `.github/workflows/ci.yml`: checkout → setup-bun
      1.3.x → `bun install --frozen-lockfile` → `bun run typecheck` →
      `node test/run.mjs unit`. Electron/live tiers left for a macOS runner (noted
      inline).
- [x] **Lint/format tool.** ✅ 2026-07-07 — Biome 2.5.2 (dev dep) + `biome.json`
      tuned to the existing style (2-space, single quotes, no semicolons, width
      100); `lint`/`format` scripts. The repo-wide `biome check --write` reformat
      is deliberately NOT done — run it as its own commit when ready.
- [x] **Gemini backend gated.** ✅ 2026-07-07 — `pickProvider` returns Claude for
      `provider:'gemini'` unless `PRAXIS_EXPERIMENTAL_GEMINI=1`; `gemini.ts` banner
      marks it experimental/unwired; removed from the renderer picker so it can't be
      silently selected. Add the SDK dep + a self-skipping e2e test to un-gate.
- [ ] **Shared test harness.** 55 `.mjs` tests re-derive root + Playwright/Electron
      launch (~6.2k lines, much boilerplate). Add `test/lib/harness.mjs`
      (`launchApp`, `openFixture`, `shot`) and migrate opportunistically.
      *Deferred: large, migrate-when-touched, not a single-shot task.*
- [ ] **Split the god files.** `App.tsx` (1646), `styles.css` (1836), `props.ts`
      (1189), `simulator.ts` (1169), `store.ts` (981). Extract, don't append.
      *Deferred: high-risk refactor; needs the Electron UI running to verify, which
      isn't possible headless — do interactively with the app open.*
- [x] **Rename the `dsgn` internals to Praxis.** Done 2026-07-17: `data-praxis-source`,
      `PraxisApi`, `.praxis/`, `praxis/*` branches, `<userData>/praxis`. Clean break for
      stamped target repos (re-run setup); legacy shims cover uninstall, old work
      branches, and one-time sidecar/userData migration. See PROGRESS 2026-07-17.

- [ ] Fix startup-intro regression: recognize localhost native previews and keep the restored preview hidden throughout the intro crossfade (observed during Git-update verification, 2026-09-16).
