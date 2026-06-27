/**
 * Unit test for the Svelte instance content-matcher (no electron / no svelte
 * compiler). Run via bun: bun run test:svelte-instance
 */
import assert from 'node:assert'
import { pickInstance } from '../src/main/svelte-instance.ts'

// The finn case: clicking the rendered "Nothing yet…" subtitle should resolve to
// the convert/+page.svelte usage whose `description` literal equals that text.
const usages = [
  { source: 'src/routes/rates/+page.svelte:23:1', literals: ["Couldn't load rates right now."] },
  {
    source: 'src/routes/convert/+page.svelte:177:2',
    literals: ['Nothing yet. Save a conversion to keep it here.']
  },
  { source: 'src/routes/contacts/+page.svelte:101:1', literals: ['No contacts yet.'] }
]

assert.equal(
  pickInstance(usages, 'Nothing yet. Save a conversion to keep it here.'),
  'src/routes/convert/+page.svelte:177:2',
  'unique exact match resolves to that instance'
)

// Whitespace differences (DOM text vs source literal) must still match.
assert.equal(
  pickInstance(usages, '  Nothing yet.   Save a conversion to keep it here.  '),
  'src/routes/convert/+page.svelte:177:2',
  'normalized whitespace still matches'
)

// No match → null (caller keeps option-D default).
assert.equal(pickInstance(usages, 'Something else entirely'), null, 'no match → null')

// Empty / missing clicked text → null (never guess).
assert.equal(pickInstance(usages, ''), null, 'empty text → null')
assert.equal(pickInstance(usages, null), null, 'null text → null')

// Ambiguous (two instances share the literal) → null, never edit the wrong one.
const dup = [
  { source: 'a.svelte:1:1', literals: ['Save'] },
  { source: 'b.svelte:2:1', literals: ['Save'] }
]
assert.equal(pickInstance(dup, 'Save'), null, 'ambiguous match → null (safe)')

// A usage with only expression props (no literals) is never a candidate.
const exprOnly = [{ source: 'c.svelte:3:1', literals: [] }]
assert.equal(pickInstance(exprOnly, 'whatever'), null, 'no literals → no match')

console.log('SVELTE-INSTANCE OK — unique content-match resolves, ambiguous/empty → null')
