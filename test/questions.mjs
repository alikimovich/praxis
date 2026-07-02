/**
 * Store-driven visual test of the agent-question interface (the SDK's
 * AskUserQuestion tool → interactive multiple-choice cards). No agent/auth: we
 * push a `question-request` into the store the way main's `agent:event` does, then
 * exercise the card (single-select auto-submit, multi-select + Send, Skip).
 *
 * The full canUseTool round-trip (a live AskUserQuestion answered back to the
 * model) needs Claude credentials and is out of scope here — like the permission
 * card, clicking without an open session only exercises the renderer.
 *
 * Run with: node test/questions.mjs
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })

  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await win.evaluate(() => window.__dsgnWorkspace.getState().openOrActivate('/tmp/dsgn-test-project'))
  await win.waitForSelector('.composer__input', { timeout: 15000 })

  // 1) A single single-select question renders as a card with header + options.
  await win.evaluate(() => {
    window.__dsgnQuestions.getState().addRequest({
      id: 'q_single',
      questions: [
        {
          header: 'Approach',
          question: 'Which layout should the hero use?',
          multiSelect: false,
          options: [
            { label: 'Centered', description: 'Title + CTA stacked and centered' },
            { label: 'Split', description: 'Copy left, image right' }
          ]
        }
      ]
    })
  })
  await win.waitForSelector('.question', { timeout: 5000 })
  const header = (await win.textContent('.question__header'))?.trim()
  if (header !== 'Approach') throw new Error(`unexpected question header: ${header}`)
  const qtext = (await win.textContent('.question__text'))?.trim() ?? ''
  if (!/which layout/i.test(qtext)) throw new Error(`unexpected question text: ${qtext}`)
  const optCount = await win.$$eval('.question__option', (els) => els.length)
  // 2 real options + the always-present "Other…" affordance.
  if (optCount !== 3) throw new Error(`expected 3 option buttons (2 + Other), got ${optCount}`)
  await win.screenshot({ path: join(artifacts, '10-question-card.png') })

  // Clicking a concrete option on a single single-select question answers it and
  // removes the card (auto-submit).
  await win.click('.question__option:has-text("Centered")')
  await win.waitForFunction(() => !document.querySelector('.question'), { timeout: 5000 })

  // 2) A multi-select question does NOT auto-submit: pick two, then Send. The
  // Send button is disabled until at least one option is chosen.
  await win.evaluate(() => {
    window.__dsgnQuestions.getState().addRequest({
      id: 'q_multi',
      questions: [
        {
          header: 'Features',
          question: 'Which sections should I add?',
          multiSelect: true,
          options: [
            { label: 'Pricing', description: 'A 3-tier pricing grid' },
            { label: 'FAQ', description: 'Accordion of common questions' },
            { label: 'Testimonials', description: 'Customer quotes' }
          ]
        }
      ]
    })
  })
  await win.waitForSelector('.question', { timeout: 5000 })
  const sendDisabled = await win.$eval('.question__send', (b) => b.disabled)
  if (!sendDisabled) throw new Error('Send should be disabled before any option is chosen')
  await win.click('.question__option:has-text("Pricing")')
  await win.click('.question__option:has-text("FAQ")')
  // Both stay selected (multi-select toggles, not radio).
  const selected = await win.$$eval('.question__option.is-selected', (els) =>
    els.map((e) => e.textContent?.trim() ?? '')
  )
  if (selected.length !== 2) throw new Error(`multi-select should keep 2 picks, got ${selected.length}`)
  await win.click('.question__send')
  await win.waitForFunction(() => !document.querySelector('.question'), { timeout: 5000 })

  // 3) "Skip" dismisses a question without answering.
  await win.evaluate(() => {
    window.__dsgnQuestions.getState().addRequest({
      id: 'q_skip',
      questions: [
        {
          header: 'Style',
          question: 'Rounded or square corners?',
          multiSelect: false,
          options: [
            { label: 'Rounded', description: 'Soft, friendly' },
            { label: 'Square', description: 'Sharp, technical' }
          ]
        }
      ]
    })
  })
  await win.waitForSelector('.question', { timeout: 5000 })
  await win.click('.question__skip')
  await win.waitForFunction(() => !document.querySelector('.question'), { timeout: 5000 })

  // 4) A `question-resolved` event from main clears a still-open card (e.g. the
  // agent answered elsewhere, or the turn was interrupted).
  await win.evaluate(() => {
    window.__dsgnQuestions.getState().addRequest({
      id: 'q_resolved',
      questions: [
        {
          header: 'Copy',
          question: 'Formal or casual tone?',
          multiSelect: false,
          options: [
            { label: 'Formal', description: 'Professional' },
            { label: 'Casual', description: 'Conversational' }
          ]
        }
      ]
    })
  })
  await win.waitForSelector('.question', { timeout: 5000 })
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('agent:event', {
      type: 'question-resolved',
      id: 'q_resolved'
    })
  })
  await win.waitForFunction(() => !document.querySelector('.question'), { timeout: 5000 })

  console.log('QUESTIONS OK — single-select auto-submit, multi-select + Send, Skip, resolved-event clear')
} catch (err) {
  console.error('QUESTIONS FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
