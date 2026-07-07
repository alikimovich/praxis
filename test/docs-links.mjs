/**
 * Anti-drift check — every repo path referenced in the load-bearing docs
 * (CLAUDE.md, README.md) must actually exist. This is the guard that would have
 * caught the stale `PropEditor.tsx` / `TokenPalette.tsx` references the docs
 * carried before the 2026-07-07 cleanup. Pure fs, runs under bun (unit tier).
 *
 * Only anchored paths are checked (those starting src/ test/ scripts/ docs/
 * build/ .github/) — unanchored prose like `renderer/src/...` or the ASCII
 * architecture tree's relative names are intentionally skipped, as are
 * placeholders/globs (`test/<name>.mjs`, `agent:*`) which don't match the
 * path grammar below.
 *
 * Run with: bun test/docs-links.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = ['CLAUDE.md', 'README.md']
// Anchored to a real top-level dir at a genuine path start (the lookbehind
// rejects mid-path matches like the `src/` inside `renderer/src/styles.css`,
// which is the repo's src-relative shorthand, not a root path). The char class
// excludes : < > * { } so line suffixes (file.ts:91) and placeholders
// (test/<name>.mjs) fall out naturally.
const PATH_RE = /(?<![\w/.-])(?:src|test|scripts|docs|build|\.github)\/[A-Za-z0-9_./-]+/g

let failed = 0
let checked = 0
const missing = []

for (const doc of DOCS) {
  const abs = join(root, doc)
  if (!existsSync(abs)) {
    console.error(`FAIL: doc ${doc} itself is missing`)
    failed++
    continue
  }
  const text = readFileSync(abs, 'utf8')
  const seen = new Set()
  for (const m of text.matchAll(PATH_RE)) {
    // Strip trailing sentence punctuation the char class may have swallowed.
    const p = m[0].replace(/[.,)]+$/, '')
    if (seen.has(p)) continue
    seen.add(p)
    checked++
    if (!existsSync(join(root, p))) missing.push(`${doc} → ${p}`)
  }
}

if (missing.length) {
  console.error('FAIL: docs reference paths that no longer exist:')
  for (const m of missing) console.error(`  - ${m}`)
  failed += missing.length
}

if (failed) {
  console.error(`DOCS-LINKS FAILED — ${failed} problem(s)`)
  process.exit(1)
}
console.log(`DOCS-LINKS OK — ${checked} path references in ${DOCS.join(', ')} all exist`)
