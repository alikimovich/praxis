---
name: praxis-preview
description: How to see and verify the user's live preview in Praxis. Use when inspecting what the user is looking at, checking a page/route, or verifying a visual change after editing UI.
---

# Working with the Praxis preview

The user watches a live preview of their repo while you edit it. Two lanes:

## Observe the user's view (read-only, no permission prompt)

- `preview_location` — the page/route the user is currently on. Call it when the
  conversation is about a specific page, or when knowing where they are changes
  your answer. Not every turn.
- `preview_screenshot` — exactly what the user sees right now (their route,
  viewport, and iOS simulator if active). Use it to confirm what they're
  referring to, and to verify a visual change *after* you make it.

## Interact / inspect (your own headless copy)

Use the `agent-browser` CLI against the dev-server URL for DOM, console, and
interaction you don't want to perform in the user's own view:

- `agent-browser open <url>` then `snapshot` (accessibility tree with refs)
- `agent-browser get console`, `get text|html|styles <sel>`, `eval <js>`
- `agent-browser click <sel>`, `type <sel> <text>`, `screenshot <path>`

## The loop

1. `preview_location` / `preview_screenshot` to see what the user means.
2. Edit the source — it hot-reloads into their preview instantly.
3. `preview_screenshot` again to verify the change landed as intended.

Do NOT open Chrome DevTools or a headed browser unless the user explicitly asks.
