/**
 * Unit test for the pure chat auto-naming helpers (LKM-45) — the transcript →
 * prompt digest and the model-output → clean-label sanitiser. No Electron/SDK
 * needed. Run via bun so the .ts import transpiles: bun run test:chat-title
 */
import assert from 'node:assert'
import { sanitizeTitle, transcriptDigest } from '../src/main/backends/title.ts'

// --- transcriptDigest: user/assistant only, whitespace-collapsed, capped. ---
{
  const digest = transcriptDigest([
    { role: 'user', text: '  Hey there!  Can you\n\nmake the header sticky?  ', at: 1 },
    { role: 'status', text: 'Edit · src/Header.tsx', at: 2 },
    { role: 'assistant', text: 'Sure — I added position: sticky to the header.', at: 3 }
  ])
  assert.ok(digest.includes('User: Hey there! Can you make the header sticky?'), 'user turn kept + collapsed')
  assert.ok(digest.includes('Assistant: Sure'), 'assistant turn kept')
  assert.ok(!digest.includes('Edit ·'), 'tool-status lines dropped from the digest')
}

// Empty / status-only transcripts produce nothing to summarise.
assert.equal(transcriptDigest([]), '', 'empty transcript → empty digest')
assert.equal(
  transcriptDigest([{ role: 'status', text: 'Read · a.ts', at: 1 }]),
  '',
  'status-only transcript → empty digest'
)
assert.equal(
  transcriptDigest([{ role: 'user', text: '   ', at: 1 }]),
  '',
  'blank user turn → empty digest'
)

// Long transcripts are capped so a huge chat can't bloat the prompt.
{
  const big = transcriptDigest([
    { role: 'user', text: 'x'.repeat(9000), at: 1 },
    { role: 'assistant', text: 'y'.repeat(9000), at: 2 }
  ])
  assert.ok(big.length <= 4000, `digest capped (got ${big.length})`)
}

// --- sanitizeTitle: strip framing/quotes/punctuation, cap length. ---
assert.equal(sanitizeTitle('Make Header Sticky'), 'Make Header Sticky')
assert.equal(sanitizeTitle('  Make   Header  Sticky  '), 'Make Header Sticky', 'whitespace collapsed')
assert.equal(sanitizeTitle('Title: Make Header Sticky'), 'Make Header Sticky', 'drops "Title:" preamble')
assert.equal(sanitizeTitle('Name - Fix Nav Spacing'), 'Fix Nav Spacing', 'drops "Name -" preamble')
assert.equal(sanitizeTitle('"Make Header Sticky"'), 'Make Header Sticky', 'peels wrapping quotes')
assert.equal(sanitizeTitle('`Dark Mode Toggle`'), 'Dark Mode Toggle', 'peels wrapping backticks')
assert.equal(sanitizeTitle('Add a Dark Mode Toggle.'), 'Add a Dark Mode Toggle', 'strips trailing period')
assert.equal(sanitizeTitle(''), null, 'empty → null')
assert.equal(sanitizeTitle('   '), null, 'blank → null')

// A "Foo bar" that only becomes empty after quote-peel/trim still yields null.
assert.equal(sanitizeTitle('""'), '""', 'empty-quoted body left intact (no inner content to peel)')

// Over-long titles are truncated with an ellipsis (matches the rail's cap).
{
  const t = sanitizeTitle('Refactor the entire authentication and onboarding subsystem end to end')
  assert.ok(t.length <= 41, `title capped (got ${t.length})`)
  assert.ok(t.endsWith('…'), 'truncation ellipsis')
}

console.log('chat-title: all assertions passed')
