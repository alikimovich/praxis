import type { NativeBridge } from './bridge'

/** Real WebKit input: page capture listeners are registered by the HTML fixture. */
export async function checkSelectionInput(host: NativeBridge): Promise<void> {
  const evaluate = (code: string, isolated = false) =>
    host.request('evaluate', { view: 'preview', code, isolated })
  const wait = async (code: string): Promise<void> => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(code)) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`Preview input timed out: ${code}`)
  }
  await wait(`document.documentElement.style.cursor === 'crosshair'`)
  await evaluate('window.previewInputs = []')
  // Synthetic events exercise the complete event family; real key/click input
  // below additionally verifies editing defaults and the trusted gesture path.
  const canceled = await evaluate(`(() => {
    const target = document.querySelector('#native-title');
    return ['keydown','keyup','keypress','pointerdown','mousedown','click','dblclick'].every(type =>
      !target.dispatchEvent(new Event(type, {bubbles:true,cancelable:true})));
  })()`)
  if (!canceled || (await evaluate('window.previewInputs.length')) !== 0)
    throw new Error('Selection input reached page capture listeners')
  const point = await evaluate(`(() => { const r = document.querySelector('#native-title').getBoundingClientRect(); return {x:r.x+20,y:r.y+r.height/2}; })()`)
  await host.request('previewInput', point)
  await host.request('previewInput', { ...point, clicks: 2 })
  await wait(`document.querySelector('#native-title').isContentEditable`)
  await host.request('previewInput', { key: 'ArrowRight' })
  await wait(`getSelection().isCollapsed`)
  await host.request('previewInput', { key: 'x' })
  await wait(`document.querySelector('#native-title').textContent === 'Native Praxis fixturex'`)
  if ((await evaluate('window.previewInputs.length')) !== 0)
    throw new Error('Inline editing leaked input to the preview app')
  await host.request('previewInput', { key: 'Escape' })
  await wait(`!document.querySelector('#native-title').isContentEditable && document.documentElement.style.cursor !== 'crosshair'`)
  if (await evaluate(`document.querySelector('#native-title').textContent !== 'Native Praxis fixture'`))
    throw new Error('Escape did not restore the inline text')
  await host.request('previewInput', point)
  await host.request('previewInput', { key: 'ArrowRight' })
  await wait(`window.previewInputs.includes('keydown') && window.previewInputs.includes('click')`)
  await host.request('shellPerform', { action: 'select-object' })
  await wait(`document.documentElement.style.cursor === 'crosshair'`)
  await host.request('previewInput', { ...point, clicks: 2 })
  await wait(`document.querySelector('#native-title').isContentEditable`)
  await host.request('previewInput', { key: 'Enter' })
  await wait(`!document.querySelector('#native-title').isContentEditable`)
  console.log('Native selection blocks page input; inline caret movement and normal interaction passed.')
}
