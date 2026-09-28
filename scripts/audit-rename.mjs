// Read tracked source and untracked implementation files only; never inspect user state.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const files = [...new Set(paths)].sort()
const residual = []
for (const path of files) {
  if (!existsSync(path) || path.startsWith('docs/rename/') || path === 'scripts/audit-rename.mjs') continue
  const text = readFileSync(path, 'utf8')
  for (const [index, line] of text.split('\n').entries()) {
    if (!/praxis/i.test(line)) continue
    const category = path === 'docs/PROGRESS.md' || path === 'docs/TASKS.md' && /2026-07-17|praxis\/|praxis-source|Praxis/.test(line) ? 'historical reference'
      : path.startsWith('vendor/') || /https?:\/\/[^\s]*praxis/i.test(line) ? 'externally controlled dependency'
      : 'intentional compatibility alias'
    residual.push({ path, line: index + 1, category, variants: [...new Set(line.match(/\S*praxis\S*/gi))] })
  }
}
writeFileSync('docs/rename/RESIDUAL.json', JSON.stringify({
  base: '94b6dd6d3746e14cc0bf26e7fbd4a8fce1837f7e',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  integrationTarget: execFileSync('git', ['rev-parse', 'candidate'], { encoding: 'utf8' }).trim(),
  mergeBase: execFileSync('git', ['merge-base', 'HEAD', 'candidate'], { encoding: 'utf8' }).trim(),
  scanState: 'Working-tree contents based on head; occurrence line numbers include local review corrections.',
  scope: 'Tracked and nonignored implementation files. This audit script and rename evidence documents contain historical names by definition.',
  paths: files.filter(path => /praxis/i.test(path)),
  occurrences: residual
}, null, 2) + '\n')
console.log(`Rename residual report: ${residual.length} source-linked lines`)
