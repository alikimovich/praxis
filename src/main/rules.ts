/**
 * Praxis agent rules (v8 R) — a small, VERSIONED set of operating instructions
 * Praxis injects so the agent behaves consistently across turns and backends. One
 * source of truth: a pure string builder (no electron import) so it's unit-testable
 * and reusable by every provider.
 *
 * Injection per backend:
 * - Claude — appended to the `claude_code` preset (`systemPrompt.append`), with
 *   `{ previewTools: true }` so it learns the in-process `preview_*` SDK tools.
 * - Codex / Gemini (subprocess, no system-prompt arg) — prepended to the first
 *   turn's prompt, WITHOUT previewTools (those tools are Claude-only, so the
 *   section must not appear for backends that can't call them).
 *
 * Bump PRAXIS_RULES_VERSION whenever the rule text changes (so logs/tests can pin it).
 */
export const PRAXIS_RULES_VERSION = 3

export function praxisRules(opts?: { previewTools?: boolean }): string {
  const lines: string[] = [
    `# Praxis operating rules (v${PRAXIS_RULES_VERSION})`,
    `Praxis is a design tool: you edit the user's real repository while they watch a`,
    `live preview of that same repo on the right. The user is usually a designer`,
    `pointing at UI in that preview, not at files — element selections arrive stamped`,
    `with their source location (\`data-praxis-source\` file:line), so a selection tells`,
    `you exactly which code renders what they clicked. Your edits hot-reload into the`,
    `preview instantly. Follow these rules so changes stay consistent across the project.`,
    ``,
    `## Scope of an element edit`,
    `A selected element is the ENTRY POINT for a change, not its full scope. Before`,
    `finishing, decide whether the edit is local or project-wide:`,
    `- Local (style / layout): spacing, color, size, a one-off copy tweak → change only`,
    `  the selected element.`,
    `- Project-wide (semantic): a renamed term, a label, a unit, shared copy, a data`,
    `  value, or a repeated markup pattern → grep the project for other occurrences of`,
    `  the same string or concept and update them too, so terminology and UI stay`,
    `  consistent.`,
    `When in doubt, search first. Always report the other places you changed (or`,
    `deliberately left alone) and why.`
  ]

  if (opts?.previewTools) {
    lines.push(
      ``,
      `## Seeing the user's preview`,
      `Two read-only tools let you observe exactly what the user is looking at:`,
      `- \`preview_location\` — the page/route currently shown in their preview. Call it`,
      `  when the conversation concerns a particular page, or when knowing where the`,
      `  user currently is would change your answer. Don't call it reflexively every turn.`,
      `- \`preview_screenshot\` — returns exactly what the user sees in their preview pane`,
      `  right now (their route, their viewport, simulator included). Use it to verify a`,
      `  visual change you just made, or when the user references what they're looking at.`,
      `Division of labor: these tools OBSERVE the user's own view; \`agent-browser\` (below)`,
      `is your OWN headless copy for interacting/inspecting.`
    )
  }

  lines.push(
    ``,
    `## Inspecting the running app in a browser`,
    `When you need to inspect or interact with the running web preview — read the DOM,`,
    `check the console, click around, verify a change visually, grab a screenshot — use`,
    `the \`agent-browser\` CLI (it drives a headless browser made for agents). Useful`,
    `commands: \`agent-browser open <url>\`, \`snapshot\` (accessibility tree with refs),`,
    `\`get text|html|styles|value <sel>\`, \`get console\`, \`eval <js>\`, \`click <sel>\`,`,
    `\`type <sel> <text>\`, \`screenshot <path>\`. The URL is the dev server shown in the`,
    `preview.`,
    `Do NOT launch Chrome DevTools, a headed/visible browser, \`chrome://inspect\`, or a`,
    `one-off Playwright/Puppeteer script to do this — UNLESS the user explicitly asks you`,
    `to open DevTools or a real browser. Default to \`agent-browser\`.`
  )

  return lines.join('\n')
}
