/**
 * Anti-drift check — every repo path referenced in the load-bearing docs
 * (CLAUDE.md, README.md) must resolve to something real. This is the guard that
 * would have caught the stale `PropEditor.tsx` / `TokenPalette.tsx` references
 * the docs carried before the 2026-07-07 cleanup. Pure fs+git, runs under bun
 * (unit tier).
 *
 * Validity is decided against git, not the filesystem, so it's stable in a clean
 * CI checkout: a referenced path is OK if it's a tracked file, a directory that
 * contains tracked files, or a gitignored/generated path (e.g. `test/artifacts/`,
 * which only exists after tests run). A path that is none of those — an
 * untracked, non-ignored reference — is drift and fails.
 *
 * Only anchored paths are checked (those starting src/ test/ scripts/ docs/
 * build/ .github/) — unanchored prose like `renderer/src/...` and placeholders
 * (`test/<name>.mjs`, `agent:*`) don't match the path grammar below.
 *
 * Run with: bun test/docs-links.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = ['CLAUDE.md', 'README.md']
// Anchored to a real top-level dir at a genuine path start (the lookbehind
// rejects mid-path matches like the `src/` inside `renderer/src/styles.css`).
// The char class excludes : < > * { } so line suffixes (file.ts:91) and
// placeholders (test/<name>.mjs) fall out naturally.
const PATH_RE = /(?<![\w/.-])(?:src|test|scripts|docs|build|\.github)\/[A-Za-z0-9_./-]+/g

// Valid set = every tracked file + all its ancestor directories.
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const valid = new Set()
for (const f of tracked) {
  valid.add(f)
  for (let d = dirname(f); d && d !== '.'; d = dirname(d)) valid.add(d)
}

// A gitignored path (build output, test artifacts) is a legit reference target
// even though it isn't tracked and may not exist in a clean checkout. Check both
// the bare path and the trailing-slash form: a directory-only ignore pattern
// (e.g. `test/artifacts/`) matches `test/artifacts` only when git knows it's a
// directory, which in a clean clone it can't unless we pass the slash.
const isIgnored = (p) => {
  for (const cand of [p, `${p}/`]) {
    try {
      execFileSync('git', ['check-ignore', '-q', cand], { cwd: root })
      return true // exit 0 = ignored
    } catch {
      // not ignored under this form; try the next
    }
  }
  return false
}

let failed = 0
let checked = 0
const missing = []

for (const doc of DOCS) {
  const text = readFileSync(join(root, doc), 'utf8')
  const seen = new Set()
  for (const m of text.matchAll(PATH_RE)) {
    const p = m[0].replace(/[.,)]+$/, '').replace(/\/$/, '') // strip trailing punctuation + slash
    if (seen.has(p)) continue
    seen.add(p)
    checked++
    if (valid.has(p)) continue
    if (isIgnored(p)) continue
    missing.push(`${doc} → ${p}`)
  }
}

if (missing.length) {
  console.error('FAIL: docs reference paths that are neither tracked nor gitignored:')
  for (const m of missing) console.error(`  - ${m}`)
  failed += missing.length
}

if (failed) {
  console.error(`DOCS-LINKS FAILED — ${failed} problem(s)`)
  process.exit(1)
}
console.log(`DOCS-LINKS OK — ${checked} path references in ${DOCS.join(', ')} all resolve`)
