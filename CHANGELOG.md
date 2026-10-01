# Changelog

All notable user-visible changes to Trezi are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Trezi uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0, a minor
release carries new features or breaking changes and a patch release only fixes.

Every change that alters user-visible behaviour adds one line under Unreleased.
`bun run release <major|minor|patch>` moves those lines into a dated version section.

## [Unreleased]

### Added
- Native macOS app: a Swift/AppKit chat and shell beside the project's live preview in system WebKit, started with `open -a Trezi` or `trezi`.
- Trezi Service: a Swift XPC service that owns the profile lock, the operation ledger, and every write to preferences, workspaces, memory, repositories, sources, conversations and providers.
- Provider helpers: Claude, Codex and Responses-API providers run in separate helper processes that the service supervises, with clearer cold-start status and sign-in handling.
- Inspector island: element controls open from chat, show authored fields by default and apply live to the source, with one Undo per gesture.
- Editor toolbar and a popped-out source editor with a file tree.
- Versioning: Settings › General and `trezi --version` show "Trezi X.Y.Z (build N, short sha)"; About Trezi shows the same; `bun run release` cuts tagged releases with this changelog.

### Changed
- Settings redesign: one native window with a General, AI Providers and Experimental sidebar that saves automatically.
- Renamed the app to Trezi; projects that use the earlier setup names are migrated once on open.
- Chat: steadier scrolling and follow behaviour, composer attachments as thumbnails, queued messages, interactive islands in the conversation and more reliable Stop and recovery.
- Chat: per-turn token counts show inline with the working status while a turn runs and under each response’s Copy/Revert row when it finishes, instead of pinned above the composer; scroll-to-latest is a centered round control just above the composer, with transcript content faded out behind it when you have scrolled up.

### Fixed
- Chat: the transcript no longer goes blank after sending until scrolled.

### Removed
- The Electron app, the React renderer, browser and Tailscale modes, and the old in-page content controls.
