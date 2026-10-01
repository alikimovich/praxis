// Shared drag, departure counts and WebKit evaluate port for LKM-140 framework measurements.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { ChatIslands } from '../../src/main/chat-islands.ts'
import { IslandOverrides } from '../../src/main/island-overrides.ts'
import { enqueueRepoWrite } from '../../src/main/repo-write-queue.ts'
import { shadowLight } from '../../src/main/shadows.ts'

export const initial = {
  x: 0.72,
  y: -0.28,
  distance: 12,
  blur: 24,
  layers: 3,
  decay: 0.6,
  color: 'rgba(0, 0, 0, 0.35)'
}
export const keys = Object.keys(initial)
export const bounds = [
  [-1, 1],
  [-1, 1],
  [0, 64],
  [0, 80],
  [1, 8],
  [0, 1]
]
export const path = Array.from({ length: 12 }, (_, i) => [
  Number((0.2 + i * 0.04).toFixed(2)),
  Number((-0.3 + i * 0.03).toFixed(2))
])
export const derived = (x, y) => shadowLight({ ...initial, x, y }).css
export const steps = [shadowLight(initial).css, ...path.map(([x, y]) => derived(x, y))]

function shadowConstants(initialValues = initial) {
  return (
    keys.map(key => `const SHADOW_${key} = ${JSON.stringify(initialValues[key])};`).join('\n') +
    `\nconst SHADOW_CSS = ${JSON.stringify(shadowLight(initialValues).css)};\n`
  )
}

export function islandSource(initialValues = initial, format = 'js') {
  const constants = shadowConstants(initialValues)
  const code =
    format === 'tsx'
      ? `'use client'\n\n${constants}\nexport default function ShadowPhone() {
  return (
    <div
      id="shadow-phone"
      style={{
        margin: '80px auto',
        padding: 40,
        width: 180,
        background: 'white',
        borderRadius: 20,
        boxShadow: SHADOW_CSS
      }}
    >
      Shadow phone
    </div>
  )
}
`
      : `${constants}\nexport const shadowCss = SHADOW_CSS;\n`
  return { code, request: buildRequest() }
}

export function buildRequest() {
  return {
    action: 'define',
    engine: 'agent',
    manifest: {
      file: '', // filled by caller
      component: 'Shadow',
      title: 'iPhone Frame Shadow',
      params: [
        ...keys.map((key, i) => ({
          id: key,
          label: key,
          kind: i === 6 ? 'color' : 'number',
          ...(i < 6
            ? { min: bounds[i][0], max: bounds[i][1], step: i === 4 ? 1 : 0.01 }
            : {}),
          apply: { strategy: 'literal', anchor: `const SHADOW_${key} = ` }
        })),
        {
          id: 'output',
          label: 'CSS',
          kind: 'text',
          apply: { strategy: 'literal', anchor: 'const SHADOW_CSS = ' }
        }
      ]
    },
    blocks: [{ id: 'shadow', title: 'Shadow', kind: 'shadow', output: 'css', params: [...keys, 'output'] }]
  }
}

/** Every frame shows the derived value of the current or previous step, in drag order. */
export function departures(frames, computedSteps) {
  let last = -1
  let gaps = 0
  let outOfOrder = 0
  let foreign = 0
  for (const { step, shown } of frames) {
    if (step < 0) continue
    if (shown === 'none' || shown === '') {
      gaps++
      continue
    }
    let index = -1
    if (step < computedSteps.length && shown === computedSteps[step]) index = step
    else if (step > 0 && shown === computedSteps[step - 1]) index = step - 1
    if (index < 0) {
      foreign++
      continue
    }
    if (index < last) outOfOrder++
    last = Math.max(last, index)
  }
  return { gaps, outOfOrder, foreign }
}

const OVERRIDE_BOOT = String.raw`(() => {
  if (window.__treziIslandOverride) return true;
  const PROP = 'box-shadow';
  const overrides = new Map();
  function shadowLayers(value) {
    const layers = [];
    let depth = 0, start = 0;
    for (let i = 0; i <= value.length; i++) {
      const c = value[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if ((c === ',' && depth === 0) || i === value.length) { layers.push(value.slice(start, i).trim()); start = i + 1; }
    }
    return layers.filter(l => !/^rgba\(0, 0, 0, 0\)( 0px){2,4}$/.test(l)).join(', ');
  }
  function computed(css) {
    const probe = document.createElement('div');
    probe.style.display = 'none';
    probe.style.boxShadow = css;
    document.documentElement.append(probe);
    const value = getComputedStyle(probe).boxShadow;
    probe.remove();
    return shadowLayers(value);
  }
  function discover(from) {
    const expected = computed(from);
    if (!expected || expected === 'none' || !document.body) return [];
    const pinned = document.querySelector('#shadow-phone');
    if (pinned instanceof HTMLElement) {
      const shown = shadowLayers(getComputedStyle(pinned).boxShadow);
      if (shown === expected) {
        return [{ el: pinned, original: pinned.style.getPropertyValue(PROP), priority: pinned.style.getPropertyPriority(PROP), shown: null }];
      }
    }
    const found = [];
    for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
      if (!(el instanceof HTMLElement) || shadowLayers(getComputedStyle(el).boxShadow) !== expected) continue;
      found.push({ el, original: el.style.getPropertyValue(PROP), priority: el.style.getPropertyPriority(PROP), shown: null });
      if (found.length >= 64) break;
    }
    return found;
  }
  function owned(t) {
    const style = t.el.style;
    return t.shown !== null && style.getPropertyValue(PROP) === t.shown && style.getPropertyPriority(PROP) === 'important';
  }
  function settledShadow(el) {
    getComputedStyle(el).boxShadow;
    for (const animation of el.getAnimations?.() ?? [])
      if (animation instanceof CSSTransition && animation.transitionProperty === PROP) animation.cancel();
    return shadowLayers(getComputedStyle(el).boxShadow);
  }
  function show(t, css) {
    const style = t.el.style;
    if (t.shown !== null && !owned(t)) {
      t.original = style.getPropertyValue(PROP);
      t.priority = style.getPropertyPriority(PROP);
    }
    style.setProperty(PROP, css, 'important');
    t.shown = style.getPropertyValue(PROP);
  }
  function restore(t) {
    if (!owned(t)) return;
    const style = t.el.style;
    if (t.original) style.setProperty(PROP, t.original, t.priority);
    else style.removeProperty(PROP);
    t.shown = null;
  }
  function apply(key, from, css) {
    let override = overrides.get(key);
    if (override) override.targets = override.targets.filter(t => t.el.isConnected);
    if (!override?.targets.length) {
      let targets = discover(from);
      if (!targets.length) {
        const card = document.querySelector('#shadow-phone');
        if (card instanceof HTMLElement) {
          targets = [{ el: card, original: card.style.getPropertyValue(PROP), priority: card.style.getPropertyPriority(PROP), shown: null }];
        }
      }
      if (!targets.length) { overrides.delete(key); return 0; }
      override = { targets, css };
      overrides.set(key, override);
    }
    override.css = css;
    for (const t of override.targets) show(t, css);
    return override.targets.length;
  }
  function pageShows(css) {
    const expected = computed(css);
    if (!expected || expected === 'none' || !document.body) return false;
    for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
      if (!(el instanceof HTMLElement)) continue;
      if (settledShadow(el) === expected) return true;
    }
    return false;
  }
  function settle(key, css) {
    const override = overrides.get(key);
    if (!override) return true;
    if (override.css !== css) return false;
    const expected = computed(css);
    if (!expected || expected === 'none') return false;
    override.targets = override.targets.filter(t => t.el.isConnected);
    if (!override.targets.length) {
      if (!pageShows(css)) return false;
      overrides.delete(key);
      return true;
    }
    for (const t of override.targets) {
      if (!owned(t)) show(t, css);
      const withOverride = settledShadow(t.el);
      restore(t);
      const own = settledShadow(t.el);
      show(t, css);
      settledShadow(t.el);
      if (withOverride !== expected || own !== expected) return false;
    }
    for (const t of override.targets) restore(t);
    overrides.delete(key);
    return true;
  }
  function clear(key) {
    for (const t of overrides.get(key)?.targets ?? []) if (t.el.isConnected) restore(t);
    overrides.delete(key);
    return true;
  }
  window.__treziIslandOverride = { apply, settle, clear, holding: () => overrides.size > 0 };
  return true;
})()`

const PAGE_SHADOW_LAYERS = String.raw`function shadowLayers(value) {
  const layers = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if ((c === ',' && depth === 0) || i === value.length) { layers.push(value.slice(start, i).trim()); start = i + 1; }
  }
  return layers.filter(l => !/^rgba\(0, 0, 0, 0\)( 0px){2,4}$/.test(l)).join(', ');
}`

const SELECTOR = '#shadow-phone'

async function pullFrames(page) {
  try {
    const batch = await page(`(() => {
      const frames = window.__shadowFrames;
      window.__shadowFrames = [];
      return Array.isArray(frames) ? frames : [];
    })()`)
    return batch
  } catch {
    return []
  }
}

function mergeFrames(nodeFrames, batch) {
  for (const row of batch) {
    if (!Array.isArray(row) || row.length < 2) continue
    nodeFrames.push({ step: row[0], shown: row[1] })
  }
}

async function spotSample(page, step, selector = SELECTOR) {
  try {
    return await page(`(() => {
      ${PAGE_SHADOW_LAYERS}
      const card = document.querySelector(${JSON.stringify(selector)});
      if (!card) return null;
      return { step: ${step}, shown: shadowLayers(getComputedStyle(card).boxShadow) };
    })()`)
  } catch {
    return null
  }
}

/** Wait until the preview card's computed shadow matches the island's derived CSS (post-HMR). */
export async function waitForShadow(page, css, selector = SELECTOR) {
  for (let i = 0; i < 200; i++) {
    try {
      const ok = await page(`(() => {
        ${PAGE_SHADOW_LAYERS}
        const card = document.querySelector(${JSON.stringify(selector)});
        if (!card) return false;
        const probe = document.createElement('div');
        probe.style.boxShadow = ${JSON.stringify(css)};
        document.body.append(probe);
        const expected = shadowLayers(getComputedStyle(probe).boxShadow);
        probe.remove();
        return expected !== 'none' && shadowLayers(getComputedStyle(card).boxShadow) === expected;
      })()`)
      if (ok) return
    } catch {}
    await Bun.sleep(100)
  }
  throw new Error('Preview shadow did not match the island source')
}

/** After a gesture, wait until settle succeeds and the card shows the final shadow. */
export async function waitForGestureSettled(page, css, { selector = SELECTOR, key } = {}) {
  const overrideKey = key ?? ''
  for (let i = 0; i < 240; i++) {
    try {
      const ok = await page(`(() => {
        ${PAGE_SHADOW_LAYERS}
        const css = ${JSON.stringify(css)};
        const key = ${JSON.stringify(overrideKey)};
        if (key && window.__treziIslandOverride?.settle) window.__treziIslandOverride.settle(key, css);
        const card = document.querySelector(${JSON.stringify(selector)});
        if (!card) return false;
        if (window.__treziIslandOverride?.holding?.()) return false;
        if (card.style.getPropertyPriority('box-shadow') === 'important') return false;
        const probe = document.createElement('div');
        probe.style.boxShadow = css;
        document.body.append(probe);
        const expected = shadowLayers(getComputedStyle(probe).boxShadow);
        probe.remove();
        return expected !== 'none' && shadowLayers(getComputedStyle(card).boxShadow) === expected;
      })()`)
      if (ok) return
    } catch {}
    await Bun.sleep(50)
  }
  throw new Error('Preview override did not settle after the gesture')
}

/** Island writes go through the repository queue; reset the fixture source the same way. */
export async function writeSourceFile(root, sourceFile, code) {
  const path = `${root}/${sourceFile}`
  await enqueueRepoWrite(root, async () => {
    await writeFile(path, code, 'utf8')
  })
}

/** After a live-write drag, put the preview back on the initial shadow before the override run. */
export async function resetPreviewSource(page, root, sourceFile, format, open) {
  const { code } = islandSource(initial, format)
  await writeSourceFile(root, sourceFile, code)
  await open()
  await waitForShadow(page, steps[0])
}

export async function installSampler(page, selector = SELECTOR) {
  await page(OVERRIDE_BOOT)
  await page(`(() => {
    const sel = ${JSON.stringify(selector)};
    if (typeof window.__treziFlickerStop === 'function') window.__treziFlickerStop();
    window.__shadowStep = typeof window.__shadowStep === 'number' ? window.__shadowStep : -1;
    window.__shadowFrames = [];
    window.__hmrStyleSwaps = 0;
    let last = '';
    let stopped = false;
    ${PAGE_SHADOW_LAYERS}
    const tick = () => {
      if (stopped) return;
      const card = document.querySelector(sel);
      if (card) {
        const shown = shadowLayers(getComputedStyle(card).boxShadow);
        if (last && shown !== last) window.__hmrStyleSwaps++;
        last = shown;
        window.__shadowFrames.push([window.__shadowStep ?? -1, shown]);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__treziFlickerStop = () => { stopped = true; };
    return !!document.querySelector(sel);
  })()`)
}

export function makePreviewPort(page) {
  const boot = () => page(OVERRIDE_BOOT)
  return {
    apply: async (key, from, css) => {
      await boot()
      const n = await page(
        `window.__treziIslandOverride.apply(${JSON.stringify(key)}, ${JSON.stringify(from)}, ${JSON.stringify(css)})`
      )
      return typeof n === 'number' ? n : 0
    },
    settle: async (key, css) => {
      await boot()
      const done = await page(
        `window.__treziIslandOverride.settle(${JSON.stringify(key)}, ${JSON.stringify(css)})`
      )
      return typeof done === 'boolean' ? done : null
    },
    clear: async key => {
      await boot()
      return page(`window.__treziIslandOverride.clear(${JSON.stringify(key)})`)
    }
  }
}

export async function analyzeFrames(page, stepCss, nodeFrames) {
  const fromPage = await page(`(() => {
    ${PAGE_SHADOW_LAYERS}
    const probe = document.createElement('div');
    document.body.append(probe);
    const computedSteps = ${JSON.stringify(stepCss)}.map(css => {
      probe.style.boxShadow = css;
      return shadowLayers(getComputedStyle(probe).boxShadow);
    });
    probe.remove();
    const pulled = window.__shadowFrames;
    window.__shadowFrames = [];
    const raf = Array.isArray(pulled) ? pulled : [];
    return {
      computedSteps,
      raf,
      hmrStyleSwaps: typeof window.__hmrStyleSwaps === 'number' ? window.__hmrStyleSwaps : 0
    };
  })()`).catch(() => ({ computedSteps: [], raf: [], hmrStyleSwaps: 0 }))
  const frames = [...nodeFrames]
  mergeFrames(frames, fromPage.raf)
  mergeFrames(frames, await pullFrames(page))
  return {
    computedSteps: fromPage.computedSteps?.length ? fromPage.computedSteps : [],
    frames,
    hmrStyleSwaps: fromPage.hmrStyleSwaps ?? 0
  }
}

export async function runDrag({
  page,
  islands,
  chat,
  island,
  sourceFile,
  initialCode,
  withOverrides,
  label,
  waitMs = 40
}) {
  const nodeFrames = []
  await installSampler(page)
  mergeFrames(nodeFrames, await pullFrames(page))
  const writes = []
  const view = () => islands.sessions.get(chat).views.get(island)
  for (const [index, [x, y]] of path.entries()) {
    const step = index + 1
    await page(`window.__shadowStep = ${step}`).catch(() => {})
    const v = view()
    await islands.interact({
      chat,
      id: island,
      revision: v.revision,
      sourceRevision: v.sourceRevision,
      operation: crypto.randomUUID(),
      action: 'commit',
      gesture: `${label}-drag`,
      ended: index === path.length - 1,
      values: { x, y }
    })
    const text = await readFile(sourceFile, 'utf8')
    if (text !== initialCode && !writes.includes(text)) writes.push(text)
    const last = index === path.length - 1
    if (withOverrides && last) {
      await waitForGestureSettled(page, steps[path.length], { key: `${chat}\n${island}` })
      await page(`(() => { if (typeof window.__treziFlickerStop === 'function') window.__treziFlickerStop(); })()`)
      await Bun.sleep(50)
    } else {
      await Bun.sleep(waitMs)
      mergeFrames(nodeFrames, await pullFrames(page))
      const spot = await spotSample(page, step)
      if (spot) nodeFrames.push(spot)
      // Next/Vite HMR can reload the preview world; reattach the sampler when live writes run.
      if (!withOverrides) await installSampler(page)
    }
  }
  if (!withOverrides) {
    await Bun.sleep(300)
    mergeFrames(nodeFrames, await pullFrames(page))
    const spotEnd = await spotSample(page, path.length)
    if (spotEnd) nodeFrames.push(spotEnd)
  } else {
    mergeFrames(nodeFrames, await pullFrames(page))
    const spotEnd = await spotSample(page, path.length)
    if (spotEnd) nodeFrames.push(spotEnd)
  }
  const { frames, hmrStyleSwaps, computedSteps } = await analyzeFrames(page, steps, nodeFrames)
  assert.ok(frames.length > 0, `${label}: record at least one preview shadow sample`)
  assert.ok(computedSteps.length === steps.length, `${label}: derive computed steps in the preview`)
  const counts = {
    steps: path.length,
    hmrStyleSwaps,
    sourceWrites: writes.length,
    ...departures(frames, computedSteps)
  }
  console.log(`ISLAND-FLICKER ${label} ${JSON.stringify(counts)}`)
  return counts
}

export async function setupIsland(chat, root, sourceFile, component, overrides, format = 'js') {
  const { code, request } = islandSource(initial, format)
  request.manifest.file = sourceFile
  request.manifest.component = component
  await writeSourceFile(root, sourceFile, code)
  const islands = new ChatIslands(() => {}, undefined, overrides ? { overrides } : {})
  islands.register(chat, root, `${chat}-record`, () => 1)
  const made = await islands.tool(chat, root, request)
  assert.ok(made.id, JSON.stringify(made))
  await islands.settle(chat, true)
  return { islands, island: made.id, code }
}

export async function measureFramework({
  label,
  page,
  waitForCard,
  root,
  sourceFile,
  component,
  withOverrides
}) {
  const chat = `${label}-${withOverrides ? 'after' : 'before'}-chat`
  const port = withOverrides ? makePreviewPort(page) : null
  const overrides = port
    ? new IslandOverrides(port, { idle: 600, poll: 50, timeout: 8000 })
    : undefined
  const { islands, island, code } = await setupIsland(
    chat,
    root,
    sourceFile,
    component,
    overrides,
    label === 'next' ? 'tsx' : 'js'
  )
  try {
    await waitForCard()
    await waitForShadow(page, steps[0])
    const record = islands.sessions.get(chat)?.records.find(r => r.id === island)
    assert.equal(record?.status, 'ready', `${label}: island record ready before drag`)
    assert.ok(record?.blocks.some(b => b.kind === 'shadow'), `${label}: shadow block present`)
    const counts = await runDrag({
      page,
      islands,
      chat,
      island,
      sourceFile: `${root}/${sourceFile}`,
      initialCode: code,
      withOverrides,
      label: `${label}-${withOverrides ? 'after' : 'before'}`
    })
    if (withOverrides) {
      assert.equal(counts.sourceWrites, 1, `${label} after: one source write per gesture`)
      assert.equal(counts.gaps, 0, `${label} after: no gap frames`)
      assert.equal(counts.outOfOrder, 0, `${label} after: no out-of-order values`)
      assert.equal(counts.foreign, 0, `${label} after: no foreign values`)
    } else {
      assert.ok(counts.sourceWrites > 1, `${label} before: multiple source writes`)
      assert.ok(
        counts.gaps > 0 || counts.foreign > 0 || counts.hmrStyleSwaps >= path.length,
        `${label} before: HMR swap gap or transient mismatch`
      )
    }
    return counts
  } finally {
    islands.close(chat)
  }
}
