import assert from 'node:assert/strict'
import {
  assertSettingsEvidence,
  settingsVerificationWidths
} from '../src/native/settings-verification.ts'

const help =
  'Generate UI using your project’s existing components and styles. Experimental; supports React and Svelte.'
const engineHelp =
  'Chat model uses your selected chat model to arrange components. Jev uses a separate layout model and requires an AI Gateway API key.'
const control = (id, selected) => ({
  id,
  selected,
  enabled: true,
  contained: true,
  hitTarget: true
})
assert.deepEqual(settingsVerificationWidths(540), [540, 600, 800])
assert.deepEqual(settingsVerificationWidths(600), [600, 800])
for (const invalid of [0, -1, NaN, Infinity, 601])
  assert.throws(() => settingsVerificationWidths(invalid))
for (const width of settingsVerificationWidths(540))
  for (const enabled of [false, true])
    for (const engine of ['agent', 'jev']) {
      const good = {
        foreground: true,
        width,
        height: 600,
        minimumWidth: 540,
        values: { projectUi: String(enabled), engine },
        controls: [
          control('default', 'Use last selected model'),
          control('projectUi', enabled ? 'On' : 'Off'),
          ...(enabled
            ? [control('engine', engine === 'agent' ? 'Chat model' : 'Jev layout engine')]
            : [])
        ],
        text: ['Experimental Gen UI', help, ...(enabled ? ['UI layout method', engineHelp] : [])]
      }
      assertSettingsEvidence(good, width, enabled, engine)
      const reject = (mutate) => {
        const bad = structuredClone(good)
        mutate(bad)
        assert.throws(() => assertSettingsEvidence(bad, width, enabled, engine))
      }
      reject((e) => (e.foreground = false))
      reject((e) => (e.width = width - 40))
      reject((e) => (e.minimumWidth = width + 1))
      reject((e) => (e.controls[0].contained = false))
      reject((e) => (e.controls[0].hitTarget = false))
      reject((e) => (e.controls[1].selected = enabled ? 'Off' : 'On'))
      reject((e) => (e.values.engine = engine === 'jev' ? 'agent' : 'jev'))
      reject((e) => (e.text[1] = help.slice(0, -10)))
      // Vision reads SF Pro's identical I/l glyphs either way; only that pair folds.
      const homoglyphs = (e) => (e.text = e.text.map((line) => line.replace(/I/g, 'l')))
      const ocrRead = structuredClone(good)
      homoglyphs(ocrRead)
      assertSettingsEvidence(ocrRead, width, enabled, engine)
      reject((e) => (e.text[1] = help.replace('Experimental;', 'Experlmental;')))
      reject((e) => (e.text[1] = help.replace(' Svelte', '')))
      if (enabled) {
        reject((e) => e.controls.pop())
        reject((e) => e.text.pop())
      } else {
        reject((e) => e.controls.push(control('engine', 'Chat model')))
        reject((e) => e.text.push('UI layout method', engineHelp))
        reject((e) => {
          e.text.push('UI layout method', engineHelp)
          homoglyphs(e)
        })
      }
    }
// Verbatim OCR from the manager's foreground 540-point Off capture (the pixels
// render "UI"/"AI" correctly; Vision returned "Ul"/"Al"). Must pass.
assertSettingsEvidence(
  {
    foreground: true,
    width: 540,
    height: 600,
    minimumWidth: 540,
    values: { engine: 'agent', default: 'last-used', projectUi: 'false' },
    controls: [control('default', 'Use last selected model'), control('projectUi', 'Off')],
    text: [
      'Changes save automatically. The detault model applies to new chats; Ul',
      'generation options apply to your next message.',
      'Default model',
      'Use last selected model',
      'Experimental Gen UI',
      "Generate Ul using your project's existing components and styles. Experimental;",
      'supports React and Svelte.',
      'Off "',
      'Al providers...'
    ]
  },
  540,
  false,
  'agent'
)
// Verbatim OCR from the manager's foreground 800-point On/Chat capture: Vision
// returned the wrapped engine help's continuation BEFORE its first line. The
// capture carries text only (no observation boxes). Must pass.
const outOfOrder = {
  foreground: true,
  width: 800,
  height: 600,
  minimumWidth: 540,
  values: { engine: 'agent', default: 'last-used', projectUi: 'true' },
  controls: [
    control('default', 'Use last selected model'),
    control('projectUi', 'On'),
    control('engine', 'Chat model')
  ],
  text: [
    'Changes save automatically. The default model applies to new chats; Ul generation options apply to your next message.',
    'Default model',
    'Use last selected model',
    'Experimental Gen Ul',
    "Generate Ul using your project's existing components and styles. Experimental; supports React and Svelte.",
    'On :',
    'Ul layout method',
    'Gateway API key.',
    'Chat model uses your selected chat model to arrange components. Jev uses a separate layout model and requires an Al',
    'Chat model',
    'Saved automatically.',
    'Al providers...'
  ]
}
assertSettingsEvidence(outOfOrder, 800, true, 'agent')
const rejectWrapped = (mutate, enabled = true) => {
  const bad = structuredClone(outOfOrder)
  bad.values.projectUi = String(enabled)
  mutate(bad)
  assert.throws(() => assertSettingsEvidence(bad, 800, enabled, 'agent'))
}
// Wrapping never excuses a dropped, misspelled or reordered word.
rejectWrapped((e) => (e.text[7] = 'Gateway key.'))
rejectWrapped((e) => (e.text[7] = 'Gateway APl key.'.replace('key', 'kay')))
rejectWrapped((e) => (e.text[8] = e.text[8].replace(' an Al', ' Al')))
rejectWrapped((e) => (e.text[7] = 'API Gateway key.'))
rejectWrapped((e) => (e.text[8] = e.text[8].replace(' requires an Al', '')))
// The fragments must meet at line edges, not float inside other text.
rejectWrapped((e) => (e.text[7] = 'Saved Gateway API key. automatically'))
// Off: out-of-order engine text is still detected as visible.
rejectWrapped((e) => {
  e.controls.pop()
  e.controls[1].selected = 'Off'
  e.text.splice(6, 1)
  e.text.splice(8, 1)
}, false)
console.log(
  'SETTINGS EVIDENCE PASS — rejects unfocused, clipped, occluded, stale and incorrectly visible native evidence'
)
