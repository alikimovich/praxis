/**
 * dsgn agent rules (v8 R) — a small, VERSIONED set of operating instructions
 * dsgn injects so the agent behaves consistently across turns and backends. One
 * source of truth: a pure string builder (no electron import) so it's unit-testable
 * and reusable by every provider.
 *
 * Injection per backend:
 * - Claude — appended to the `claude_code` preset (`systemPrompt.append`).
 * - Codex / Gemini (subprocess, no system-prompt arg) — prepended to the first
 *   turn's prompt (skills/CLAUDE.md are Claude-only, so rules are how non-Claude
 *   backends inherit dsgn behavior).
 *
 * Bump DSGN_RULES_VERSION whenever the rule text changes (so logs/tests can pin it).
 */
export const DSGN_RULES_VERSION = 1

export function dsgnRules(): string {
  return [
    `# dsgn operating rules (v${DSGN_RULES_VERSION})`,
    `You are editing the user's real repository inside dsgn — a Claude-powered chat on`,
    `the left, a live preview of that same repo on the right. Edits hot-reload into the`,
    `preview. Follow these rules so changes stay consistent across the project.`,
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
  ].join('\n')
}
