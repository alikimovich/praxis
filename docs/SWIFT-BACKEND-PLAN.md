# Swift Backend Migration Plan

Goal: replace the Bun-hosted application backend with a Swift-owned service
architecture. Swift owns workspace/chat coordination, persistence, provider
lifecycle, Git/worktrees, source transactions, managed servers, and recovery.
JavaScript remains narrowly scoped to provider SDK adapters and web-language
parsing helpers.

## Status

Initiated 2026-09-27. This is the canonical plan document; update it as
phases complete.

## End-state architecture

| Layer | Responsibility |
|---|---|
| Swift AppKit/SwiftUI app | Presentation, user input, WebKit, native dialogs, OS integrations. Holds display state, not authoritative workflow state. |
| Swift service process | Workspace/chat coordination, persistence, provider sessions, Git/worktrees, source transactions, managed servers, recovery. |
| Provider adapters | Translate provider events/commands into a typed Praxis contract. Native protocols where sufficient; SDK helpers where needed. |
| Source-analysis helpers | Parse framework sources, resolve types/schemas, propose edits. No authority to commit changes or manage app state. |
| Project processes / preview | User project servers and their runtimes; JavaScript instrumentation inside WebKit. |

Transport: versioned, typed local protocol over XPC with explicit requests,
events, cancellation, and reconnection.

## Service owners

- Workspace/session coordinator
- Repository coordinator per Git repository
- Source transaction service
- Process supervisor
- Persistence service

## Migration order

1. Define contracts and correctness criteria
2. Stand up Swift service and supervision (Bun becomes supervised legacy service)
3. Move persistence and basic workspace services
4. Move managed servers
5. Move Git and source transaction ownership
6. Move chat and provider orchestration
7. Move editing and application controllers
8. Remove legacy service and complete distribution

## Correctness rules

- Each state domain has exactly one authoritative writer.
- Transfer whole ownership boundaries; avoid dual writes.
- Every mutation carries operation ID + expected revision.
- Persist operation intent and recovery checkpoints.
- Acceptance exercises interrupted operations and restarts.

## What stays JavaScript

- TypeScript type checking, React prop extraction, Svelte/Babel transforms
- Framework-specific source stamping and build plugins
- Provider SDK integrations via thin Node adapters
- WebKit DOM observation and interaction
- User project dev servers (including Bun when required by project)

## Open questions

- Exact provider integration boundary (native protocol vs SDK helper)
- Source parser helper contract and expected-content hashing
- Persistence format migration strategy

## Links

- PM conversation: agent-os talk_to_project conversationId d52bdc53-9410-492c-9ecc-7f2e2ae5bad5
