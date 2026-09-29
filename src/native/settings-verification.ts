import assert from 'node:assert/strict'

export interface SettingsEvidence {
  foreground: boolean
  width: number
  height: number
  minimumWidth: number
  values: Record<string, string>
  controls: {
    id: string
    selected: string
    enabled: boolean
    contained: boolean
    hitTarget: boolean
  }[]
  text: string[]
}
/** Always exercise the live minimum plus the normal and wider window widths. */
export function settingsVerificationWidths(minimumWidth: number): number[] {
  assert.ok(
    Number.isFinite(minimumWidth) && minimumWidth > 0 && minimumWidth <= 600,
    'Settings minimum must be valid and no wider than its normal 600-point window'
  )
  return [...new Set([minimumWidth, 600, 800])]
}

/** Fail closed on missing pixels, clipped help, stale choices or hidden controls. */
export function assertSettingsEvidence(
  evidence: SettingsEvidence,
  width: number,
  enabled: boolean,
  engine: 'agent' | 'jev'
) {
  assert.equal(evidence.foreground, true, 'Settings must own foreground focus')
  assert.ok(Math.abs(evidence.width - width) <= 1, 'Requested Settings content width')
  assert.ok(evidence.width >= evidence.minimumWidth)
  assert.equal(evidence.values.projectUi, String(enabled))
  assert.equal(evidence.values.engine, engine, 'Preserve saved engine even while Off')
  const ids = evidence.controls.map((c) => c.id).sort()
  assert.deepEqual(
    ids,
    (enabled ? ['default', 'projectUi', 'engine'] : ['default', 'projectUi']).sort(),
    'Rendered picker visibility'
  )
  for (const control of evidence.controls) {
    assert.ok(
      control.enabled && control.contained && control.hitTarget,
      `Usable, unclipped picker: ${control.id}`
    )
  }
  assert.equal(
    evidence.controls.find((c) => c.id === 'projectUi')?.selected,
    enabled ? 'On' : 'Off'
  )
  if (enabled)
    assert.equal(
      evidence.controls.find((c) => c.id === 'engine')?.selected,
      engine === 'agent' ? 'Chat model' : 'Jev layout engine'
    )
  const lines = evidence.text.map(words)
  for (const required of [
    'Experimental Gen UI',
    'Generate UI using your project’s existing components and styles. Experimental; supports React and Svelte.',
    ...(enabled
      ? [
          'UI layout method',
          'Chat model uses your selected chat model to arrange components. Jev uses a separate layout model and requires an AI Gateway API key.'
        ]
      : [])
  ])
    assert.ok(rendersText(lines, words(required)), `Missing complete foreground text: ${required}`)
  if (!enabled) {
    assert.ok(!rendersText(lines, words('UI layout method')), 'Off hides engine label')
    assert.ok(!rendersText(lines, words('requires an AI Gateway API key')), 'Off hides engine help')
  }
}

// Normalize typography only; every word is still required, in order.
// SF Pro draws capital I and lowercase l as the same glyph, so Vision reads the
// rendered "UI"/"AI" as "Ul"/"Al". Fold only that pair before lowercasing; a
// dotted lowercase i stays distinct. Every comparison goes through words().
function words(text: string): string[] {
  return text
    .replace(/I/g, 'l')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

const startsWith = (line: string[], part: string[], at = 0) =>
  part.length <= line.length - at && part.every((word, i) => line[at + i] === word)

/**
 * Whether `sentence` appears in OCR observations, one per visual line. Vision
 * returns a wrapped sentence's lines in no guaranteed order (the continuation
 * can come first), and the capture carries no boxes to sort by. So chain the
 * sentence across lines anchored at line edges: it starts at the END of one
 * line, passes through whole lines, and finishes at the START of another. The
 * pieces must concatenate to exactly the sentence — no dropped or reordered
 * words — only the observation order is free.
 */
function rendersText(lines: string[][], sentence: string[]): boolean {
  if (!sentence.length) return false
  if (lines.some((line) => line.some((_, at) => startsWith(line, sentence, at)))) return true
  const rest = (remaining: string[], used: Set<number>): boolean =>
    lines.some((line, i) => {
      if (used.has(i) || !line.length) return false
      if (startsWith(line, remaining)) return true
      return (
        line.length < remaining.length &&
        startsWith(remaining, line) &&
        rest(remaining.slice(line.length), new Set([...used, i]))
      )
    })
  return lines.some((line, i) => {
    for (let k = 1; k < sentence.length && k <= line.length; k++)
      if (
        startsWith(line, sentence.slice(0, k), line.length - k) &&
        rest(sentence.slice(k), new Set([i]))
      )
        return true
    return false
  })
}
