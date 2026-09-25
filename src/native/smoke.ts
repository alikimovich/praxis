import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { dispatchIPC, views } from './platform'
import { checkSelectionInput } from './smoke-input'
import { checkNativeChat } from './smoke-chat'
import { nativeChat } from './chat-runtime'
import { checkNativeSheets } from './smoke-sheets'
import { nativeWorkspace } from './workspace-runtime'

export async function runNativeSmoke(host: NativeBridge, fixture: string, root: string) {
  const evaluate = async (code: string, view = 'main', isolated = false) => {
    try {
      return await host.request('evaluate', { view, code, isolated })
    } catch (error) {
      throw new Error(`Native evaluation failed in ${view}: ${code}: ${String(error)}`, { cause: error })
    }
  }
  const wait = async (code: string, view = 'main', timeout = 30000) => {
    const end = Date.now() + timeout
    let error: unknown
    while (Date.now() < end) {
      try {
        const value = await evaluate(code, view)
        if (value) return value
      } catch (e) {
        error = e
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(`Native check timed out: ${code}; ${error || ''}`)
  }
  await wait('!!window.api && !!document.querySelector(".native-empty-placeholder")')
  const welcome: any = await host.request('welcomeInspect')
  if (!welcome.visible || welcome.catFrames < 10) throw new Error('Native welcome/cat missing')
  const emptyShell: any = await host.request('shellInspect')
  if (emptyShell.visibleToolbar.includes('chat')) throw new Error('Empty chat toolbar remains')
  mkdirSync(join(root, 'test/artifacts/native'), { recursive: true })
  writeFileSync(join(root, 'test/artifacts/native/welcome.png'), Buffer.from(await host.request('captureShell'), 'base64'))
  if (views.has('panel')) throw new Error('Property panel must not load before first use')
  if (await evaluate('navigator.userAgent.includes("Electron")'))
    throw new Error('Unexpected Electron renderer')
  if (!(await host.request('shellPerform', { action: 'open-project' })))
    throw new Error('Native open toolbar unavailable')
  await wait('!!document.querySelector("#native-title")', 'preview')
  await wait('!!window.__praxisSession?.getState().projectRoot')
  await checkNativeSheets(host, nativeWorkspace.state.activeKey!, join(root, 'test/artifacts/native'))
  await wait('getComputedStyle(document.querySelector(".rail")).display === "none"')
  await wait(`getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('.pane--chat')).backgroundColor === 'rgba(0, 0, 0, 0)'`)
  // Page-derived background must follow live html/body changes without moving
  // page content into the toolbar's safe area.
  await evaluate(`(() => { document.documentElement.style.backgroundColor = 'rgb(40, 80, 120)'; document.body.style.backgroundColor = 'transparent'; })()`, 'preview')
  let surface: any
  for (let i = 0; i < 40; i++) {
    surface = await host.request('previewSurfaceInspect')
    if (Math.abs(surface.red - 40 / 255) < 0.02) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (Math.abs(surface.red - 40 / 255) > 0.02 || Math.abs(surface.green - 80 / 255) > 0.02 || Math.abs(surface.blue - 120 / 255) > 0.02)
    throw new Error(`Preview toolbar did not follow page background: ${JSON.stringify(surface)}`)
  if (surface.toolbarHeight <= 0 || surface.viewportTop > surface.contentTop + 1 || surface.dividerHeight !== surface.surfaceHeight)
    throw new Error(`Incorrect full-height preview surface: ${JSON.stringify(surface)}`)
  if (!(await host.request('shellInspect')).previewHeaderLightText) throw new Error('Dark preview needs light address/branch text')
  await evaluate(`(() => { document.documentElement.style.backgroundColor = 'rgb(250, 250, 250)'; })()`, 'preview')
  for (let i = 0; (await host.request('shellInspect')).previewHeaderLightText && i < 40; i++) await new Promise(resolve => setTimeout(resolve, 100))
  if ((await host.request('shellInspect')).previewHeaderLightText) throw new Error('Light preview needs dark address/branch text')
  await evaluate(`(() => { document.documentElement.style.removeProperty('background-color'); document.body.style.removeProperty('background-color'); })()`, 'preview')
  // Wait for the debounced renderer snapshot to reach the system sidebar.
  let shell = await host.request('shellInspect')
  for (let i = 0; (!shell.rows.length || !shell.enabled.code) && i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    shell = await host.request('shellInspect')
  }
  if (!shell.rows.some((row: any) => row.kind === 'project') || !shell.enabled.code)
    throw new Error(
      `Native sidebar or toolbar state did not follow project opening: ${JSON.stringify(shell)}`
    )
  if (shell.toolbar.filter((id: string) => ['address', 'interaction', 'tools', 'publish'].includes(id)).join(',') !== 'address,interaction,tools,publish' || shell.toolbar[0] !== 'projects' || !shell.toolbar[1].includes('ToggleSidebar')) throw new Error(`Unexpected native toolbar: ${JSON.stringify(shell.toolbar)}`)
  if (shell.outlineRows !== shell.rows.filter((row: any) => row.kind === 'project').length || !shell.chatTitlePlain || shell.chatActions.join(',') !== 'history,new-chat')
    throw new Error('Native project-only sidebar or chat header is incorrect')
  if (shell.toolGroup.join(',') !== 'code,layers,expand') throw new Error('Incorrect native tools group')
  if (shell.toolbar.includes('home') || shell.toolbar.includes('branch') || shell.domain !== new URL(shell.address).host) throw new Error('Expected stacked domain and branch header without Home')
  if (shell.interactionGroup.join(',') !== 'select-object,device') throw new Error('Select Object must share a group with the device toggle')
  await host.request('shellPerform', { action: 'select-object' })
  await wait('window.__praxisSelection.getState().selectMode')
  if (process.env.PRAXIS_NATIVE_BACKGROUND_TEST === '1') console.log('SKIP real preview input and animation sampling: explicit PRAXIS_NATIVE_BACKGROUND_TEST')
  else await checkSelectionInput(host)
  await host.request('shellPerform', { action: 'select-object' })
  await wait('!window.__praxisSelection.getState().selectMode')
  if (!shell.projectsMenuOnly) throw new Error("Projects must open its menu from the whole button")
  if (!shell.publishStandard || shell.toolbar.at(-1) !== 'publish' || !shell.sidebarAutohidesScrollers) throw new Error('Native primary action or scroller configuration is incorrect')
  if (!shell.sidebarContainsTrafficLights || shell.sidebarListTop > shell.contentTop || shell.detailTop > shell.contentTop + 1)
    throw new Error(`Native sidebar must extend behind traffic lights while content stays below toolbar: ${JSON.stringify(shell)}`)
  for (let i = 0; !(await host.request('shellInspect')).projectIconCount && i < 40; i++) await new Promise(resolve => setTimeout(resolve, 100))
  const projectLayout = await host.request('shellInspect')
  if (!projectLayout.projectIconCount || projectLayout.outlineWidth > projectLayout.outlineClipWidth + 1)
    throw new Error(`Project favicon or sidebar fit failed: ${JSON.stringify(projectLayout)}`)
  for (const width of [180, 300, 230]) {
    await host.request('shellPerform', { action: 'sidebar-width', row: String(width) })
    await new Promise(resolve => setTimeout(resolve, 150))
    const layout = await host.request('shellInspect')
    if (layout.outlineWidth > layout.outlineClipWidth + 1 || layout.projectMoreRightEdges.some((right: number) => right > layout.outlineClipWidth))
      throw new Error(`Project actions clipped at sidebar width ${width}: ${JSON.stringify(layout)}`)
  }
  const checkChatAlignment = async () => {
    let geometry: any
    for (let i = 0; i < 30; i++) {
      geometry = await host.request('shellInspect')
      if (Math.abs(geometry.chatHeaderTrailing - geometry.detailLeading - geometry.chatWidth) < 2) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Chat toolbar missed its column boundary: ${JSON.stringify(geometry)}`)
  }
  await checkChatAlignment()
  for (const delta of [-80, 60, 20]) {
    const before: any = await host.request('dividerInspect')
    if (!before.visible || !before.hitTarget) throw new Error('Native resize handle is covered')
    await host.request('dividerPerform', { delta })
    await wait(`Math.abs(document.querySelector('.pane--chat').getBoundingClientRect().width - ${before.width + delta}) < 2`)
    await new Promise(resolve => setTimeout(resolve, 350))
    await checkChatAlignment()
  }
  await host.request('shellPerform', { action: 'address', row: '/?native-navigation=1#section' })
  await wait(`location.search === '?native-navigation=1' && location.hash === '#section'`, 'preview')
  for (let i = 0; !(await host.request('shellInspect')).address.includes('native-navigation=1') && i < 30; i++) await new Promise(resolve => setTimeout(resolve, 100))
  if (!(await host.request('shellInspect')).address.includes('native-navigation=1')) throw new Error('Native address did not track navigation')
  await host.request('shellPerform', { action: 'address', row: '/' })
  await wait(`location.pathname === '/' && !location.search && !location.hash`, 'preview')
  await host.request('shellPerform', { action: 'device' })
  await wait(`window.__praxisViewport.getState().viewport === 'mobile'`)
  await host.request('shellPerform', { action: 'device' })
  await wait(`window.__praxisViewport.getState().viewport === 'desktop'`)
  await wait(`getComputedStyle(document.querySelector('.previewbar')).display === 'none'`)
  if (shell.sidebarActions.join(',') !== 'new-project,open-project,settings') throw new Error('Missing sidebar project actions')
  await host.request('shellPerform', { action: 'layers' })
  for (let i = 0; !(await host.request('layersInspect')).visible && i < 40; i++) await new Promise(resolve => setTimeout(resolve, 100))
  if (!(await host.request('layersInspect')).visible) throw new Error('Native layers did not open')
  await host.request('shellPerform', { action: 'layers' })
  for (let i = 0; (await host.request('layersInspect')).visible && i < 40; i++) await new Promise(resolve => setTimeout(resolve, 100))
  if ((await host.request('layersInspect')).visible) throw new Error('Native layers did not close')
  const waitSource = async (predicate: (state: any) => boolean) => {
    for (let i = 0; i < 80; i++) { const state = await host.request('sourceInspect', { root: fixture }); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 100)) }
    throw new Error('Native source editor did not reach expected state: ' + JSON.stringify(await host.request('sourceInspect', { root: fixture })))
  }
  await host.request('shellPerform', { action: 'code' })
  await waitSource(state => state.visible && !!state.source)
  await host.request('shellPerform', { action: 'code' })
  await waitSource(state => !state.visible)
  await evaluate(`(() => {
    window.__nativeExpansionSamples = [];
    window.__nativeExpansionTimer = setInterval(() => {
      const pane = document.querySelector('.pane--chat');
      window.__nativeExpansionSamples.push([pane.getBoundingClientRect().width, pane.querySelector('.chat').getBoundingClientRect().width]);
    }, 10);
  })()`)
  await host.request('shellPerform', { action: 'expand' })
  await wait('window.__praxisWorkspace.getState().chatHidden')
  await new Promise(resolve => setTimeout(resolve, 350))
  const expansion = await evaluate(`(() => {
    clearInterval(window.__nativeExpansionTimer);
    return { samples: window.__nativeExpansionSamples, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
  })()`)
  if (process.env.PRAXIS_NATIVE_BACKGROUND_TEST !== '1' && !expansion.reduced && !expansion.samples.some(([width, content]: number[]) => width > 1 && width < content - 1))
    throw new Error('Native expansion skipped intermediate widths')
  if (expansion.samples.some(([, content]: number[]) => content < 320))
    throw new Error('Native expansion squeezed the conversation and its scrollbar')
  if (!(await host.request('shellInspect')).sidebarCollapsed) throw new Error('Expand did not hide the native sidebar')
  await host.request('shellPerform', { action: 'expand' })
  await wait('!window.__praxisWorkspace.getState().chatHidden')
  for (let i = 0; (await host.request('shellInspect')).sidebarCollapsed && i < 30; i++) await new Promise(resolve => setTimeout(resolve, 100))
  await host.request('shellPerform', { action: 'toggle-sidebar' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const collapsed = await host.request('shellInspect')
  if (!collapsed.toolbarGroupsMomentary) throw new Error('Toolbar action group retained selection after expand/restore')
  if (collapsed.toolbar.includes('projects')) throw new Error('Collapsed sidebar kept Projects in toolbar/overflow')
  await checkChatAlignment()
  if (!collapsed.sidebarCollapsed || collapsed.detailWidth <= shell.detailWidth)
    throw new Error(
      `Native sidebar did not collapse and release detail space: ${JSON.stringify({ before: shell, after: collapsed })}`
    )
  await host.request('shellPerform', { action: 'toggle-sidebar' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const surfaceArtifacts = join(root, 'test/artifacts/native')
  mkdirSync(surfaceArtifacts, { recursive: true })
  writeFileSync(join(surfaceArtifacts, 'preview-surface.png'), Buffer.from(await host.request('captureShell'), 'base64'))
  console.log('Native page background, safe-area viewport, full-height divider and expand/restore checks passed.')
  for (const width of [850, 1100, 1320]) {
    await host.request('shellPerform', { action: 'window-width', row: String(width) })
    await new Promise(resolve => setTimeout(resolve, 300))
    const toolbarState = await host.request('shellInspect')
    for (const key of ['interaction', 'tools', 'publish']) {
      if (!toolbarState.visibleToolbar.includes(key)) throw new Error(`Toolbar hid ${key} at width ${width}: ${JSON.stringify(toolbarState.visibleToolbar)}`)
    }
  }
  const originalChat = shell.selected
  const waitComposer = async (check: (state: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const state = await host.request('composerInspect')
      if (check(state)) return state
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Native composer state timed out (${check.toString()}): ${JSON.stringify(await host.request('composerInspect'))}; DOM: ${JSON.stringify(await evaluate(`({key:document.querySelector('.composer__input')?.closest('[data-slot="input-group"]')?.dataset.nativeChat,value:document.querySelector('.composer__input')?.value})`))}`)
  }
  const layout = await waitComposer(state => state.visible)
  if (!layout.pickersPlain || !layout.attachIsPlus || Object.values(layout.pickerWidths).some(width => Number(width) > 60.5)) throw new Error('Native composer selectors must be plain, compact, and accompanied by a plus')
  if (!layout.autohidesScrollers || layout.contentWidth < 60 || layout.inputHeight < 20 || layout.sendWidth !== 30 || !layout.controlsBelowForm || !layout.sendInsideForm || Math.abs(layout.sendRightInset - 10) > 1 || layout.inputTopInset > 15) throw new Error(`Native composer layout invalid: ${JSON.stringify(layout)}`)
  for (const text of ['A', 'A native', 'A native draft']) await host.request('composerPerform', { text })
  await host.request('composerPerform', { text: 'A native draft\nwith a second line' })
  await waitComposer(state => state.text === 'A native draft\nwith a second line')
  const projectKey = nativeWorkspace.state.activeKey!
  await evaluate('(() => { window.__workspaceDispatch = window.__praxisNativeDispatch; window.__praxisNativeDispatch = () => {}; return true })()')
  let added: string
  try {
    await nativeWorkspace.command({ type: 'new-chat', key: projectKey })
    added = nativeWorkspace.active!.activeSessionKey
    await waitComposer(state => state.chat === added && state.text === '')
  } finally {
    await evaluate('window.__praxisNativeDispatch = window.__workspaceDispatch')
    await nativeWorkspace.command({ type: 'attach' })
  }
  if (added === originalChat.slice(5)) throw new Error('New Chat reused an unsent draft')
  await new Promise((resolve) => setTimeout(resolve, 150))
  if (!(await host.request('shellPerform', { action: 'history-select', row: `chat:${added}` })))
    throw new Error('Native chat history entry not selectable')
  await wait(
    `window.__praxisWorkspace.getState().projects.some(p=>p.activeSessionKey===${JSON.stringify(added)})`
  )
  await waitComposer(state => state.chat === added && state.text === '')
  await host.request('shellPerform', { action: 'history-select', row: originalChat })
  await wait(
    `window.__praxisWorkspace.getState().projects.some(p=>'chat:'+p.activeSessionKey===${JSON.stringify(originalChat)})`
  )
  const composer = await waitComposer(state => state.text === 'A native draft\nwith a second line')
  console.log(`Native composer: ${composer.glass ? 'NSGlassEffectView Liquid Glass' : 'legacy visual-effect fallback'}; typing and per-chat drafts passed.`)
  await host.request('composerPerform', { text: '' })
  await waitComposer(state => state.text === '')
  writeFileSync(join(fixture, 'attachment.txt'), 'Native attachment fixture')
  await host.request('composerPerform', { files: [join(fixture, 'attachment.txt')] })
  await waitComposer(state => state.attachments.length === 1)
  await host.request('composerPerform', { remove: 0 })
  await waitComposer(state => state.attachments.length === 0)
  const choices = (await host.request('composerInspect')).choices
  const permission = choices.find((choice: any) => choice.label === 'Permission mode')
  const alternative = permission.options.find((option: any) => option.value !== permission.value && !option.disabled)
  await host.request('composerPerform', { label: permission.label, value: alternative.value })
  await waitComposer(state => state.choices.some((choice: any) => choice.label === permission.label && choice.value === alternative.value))
  await host.request('composerPerform', { label: permission.label, value: permission.value })
  await waitComposer(state => state.choices.some((choice: any) => choice.label === permission.label && choice.value === permission.value))
  const originalCommands = nativeChat.get(nativeChat.active).commands
  nativeChat.event({ type: 'commands', projectKey: nativeChat.active, commands: [{name: 'native-fixture', description: 'Native keyboard test', source: 'project'}] })
  await host.request('composerPerform', { text: '/native' })
  await waitComposer(state => state.skillListVisible && state.skillCount > 0)
  await host.request('composerPerform', { key: 'Tab' })
  await waitComposer(state => state.text === '/native-fixture ')
  await host.request('composerPerform', { text: '' })
  nativeChat.event({ type: 'commands', projectKey: nativeChat.active, commands: originalCommands })
  await evaluate(`window.__praxisProviders.getState().setSettingsOpen(true)`)
  for (let i = 0; !(await host.request('sheetInspect')).visible && i < 60; i++) await new Promise(resolve => setTimeout(resolve, 50))
  if ((await host.request('sheetInspect')).title !== 'Settings') throw new Error('Settings is not a native sheet')
  await host.request('sheetPerform', { action: 'cancel' })
  await waitComposer(state => state.visible)
  console.log('Native composer permission picker, slash completion, and native settings sheet passed.')
  console.log('Native preview toolbar, sidebar project actions, code toggle, expand/restore and split-view collapse passed.')
  if (!(await host.request('shellPerform', { action: 'publish-mode', row: 'pr' }))) throw new Error('Native publish mode unavailable')
  for (let i = 0; (await host.request('shellInspect')).publishLabel !== 'Create PR' && i < 30; i++) await new Promise(resolve => setTimeout(resolve, 100))
  if ((await host.request('shellInspect')).publishLabel !== 'Create PR') throw new Error('Native publish label did not follow selected mode')
  await host.request('shellPerform', { action: 'publish-mode', row: 'merge' })
  const detected = await evaluate(`window.api.project.detect(${JSON.stringify(fixture)})`)
  if (detected.framework !== 'static')
    throw new Error(`Unexpected project detection: ${JSON.stringify(detected)}`)
  const isolated = await evaluate(
    '!globalThis.webkit?.messageHandlers?.praxis && !globalThis.api',
    'preview'
  )
  if (!isolated) throw new Error('Preview has access to the privileged bridge')
  let denied = false
  try {
    await dispatchIPC('preview', {
      type: 'invoke',
      channel: 'source:read',
      args: [fixture, 'index.html:1:0']
    })
  } catch {
    denied = true
  }
  if (!denied) throw new Error('Preview IPC invoke was not denied')
  const source = await evaluate(
    `window.api.source.read(${JSON.stringify(fixture)}, 'index.html:3:1')`
  )
  if (!source) throw new Error('Source read failed')
  await evaluate('window.api.preview.setSelectMode(true)')
  const layers = await evaluate('window.api.layers.read()')
  if (!layers) throw new Error('Isolated preview layers did not answer')
  const title = layers.nodes.find((node: any) => node.id === 'native-title')
  if (!title) throw new Error('Stamped heading is missing from layers')
  await evaluate(
    `window.api.layers.select(${JSON.stringify(title.path)}, ${JSON.stringify({ tag: title.tag, source: title.source })})`
  )
  await wait(`window.__praxisSelection.getState().selected?.source === 'index.html:3:1'`)
  await evaluate('window.__praxisPropsIsland.getState().setOpen(true)')
  await wait('!!document.querySelector(".panelapp")', 'panel')
  const firstPanel = views.get('panel')
  if (!firstPanel) throw new Error('Property panel did not load on first selection')
  await evaluate('window.__praxisPropsIsland.getState().setOpen(false)')
  await evaluate('window.__praxisPropsIsland.getState().setOpen(true)')
  await wait('!!document.querySelector(".panelapp")', 'panel')
  if (views.get('panel') !== firstPanel) throw new Error('Property panel was recreated on reopen')
  console.log('Lazy property panel first-use state and reuse passed.')
  const styles = await evaluate(`window.api.styles.read(['font-size'])`)
  if (!styles?.values?.['font-size'])
    throw new Error('Selected element computed styles unavailable')
  const edited = await evaluate(
    `window.api.text.apply(${JSON.stringify(fixture)}, {source:'index.html:3:1', text:'Edited through Praxis Native'})`
  )
  if (!edited?.applied) throw new Error(`Source edit failed: ${JSON.stringify(edited)}`)
  await wait(
    `document.querySelector('#native-title')?.textContent === 'Edited through Praxis Native'`,
    'preview'
  )
  console.log('Native selection, computed styles, source edit, and managed live reload passed.')
  await evaluate(`window.api.edits.undo(${JSON.stringify(fixture)})`)
  await wait(
    `document.querySelector('#native-title')?.textContent === 'Native Praxis fixture'`,
    'preview'
  )
  await evaluate(`window.api.edits.redo(${JSON.stringify(fixture)})`)
  await wait(
    `document.querySelector('#native-title')?.textContent === 'Edited through Praxis Native'`,
    'preview'
  )
  writeFileSync(
    join(fixture, 'native-image.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=',
      'base64'
    )
  )
  await host.request('composerPerform', { files: [join(fixture, 'native-image.png')] })
  await waitComposer(state => state.attachments.length === 1)
  await host.request('composerPerform', { remove: 0 })
  await waitComposer(state => state.attachments.length === 0)
  const media = await evaluate(
    `window.api.source.read(${JSON.stringify(fixture)}, 'native-image.png:1:0')`
  )
  if (!media?.media?.url) throw new Error('Native media token was not issued')
  const mediaWidth = await evaluate(
    `new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth);image.onerror=()=>reject(new Error('Media image failed to load'));image.src=${JSON.stringify(media.media.url)}})`
  )
  if (mediaWidth !== 1) throw new Error('Native media scheme did not deliver the registered image')
  await evaluate(`window.api.source.popout(${JSON.stringify(fixture)}, 'index.html:3:1')`)
  const nativeEditor = await waitSource(state => state.popped && state.source === 'index.html')
  if ([...views.keys()].some(id => id.startsWith('editor-'))) throw new Error('Source editing must not create a WebView')
  await host.request('sourcePerform', { action: { root: fixture, action: 'edit', source: 'index.html', revision: 100, text: nativeEditor.text + '\n<!-- native editor save -->' } })
  await waitSource(state => state.dirty)
  await host.request('sourcePerform', { action: { root: fixture, action: 'save' } })
  await waitSource(state => !state.dirty && !state.error)
  if (!readFileSync(join(fixture, 'index.html'), 'utf8').includes('native editor save')) throw new Error('Native editor did not save through the source service')
  await host.request('sourcePerform', { action: { root: fixture, action: 'dock' } })
  await waitSource(state => !state.popped && state.visible)
  await host.request('sourcePerform', { action: { root: fixture, action: 'hide' } })
  await waitSource(state => !state.visible)
  console.log('Native undo/redo, media scheme, AppKit source save and pop-out/dock reuse passed.')
  const artifacts = join(root, 'test/artifacts/native')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(join(artifacts, 'composer-content.png'), Buffer.from(await host.request('captureComposer', { contentOnly: true }), 'base64'))
  writeFileSync(join(artifacts, 'composer.png'), Buffer.from(await host.request('captureComposer'), 'base64'))
  writeFileSync(
    join(artifacts, 'shell.png'),
    Buffer.from(await host.request('captureShell'), 'base64')
  )
  writeFileSync(
    join(artifacts, 'sidebar.png'),
    Buffer.from(await host.request('captureSidebar'), 'base64')
  )
  writeFileSync(join(artifacts, 'layers.json'), JSON.stringify(layers, null, 2))
  for (const view of ['main', 'preview']) {
    const image = await host.request('capture', { view })
    writeFileSync(join(artifacts, `${view}.png`), Buffer.from(image.png, 'base64'))
  }
  await checkNativeChat(host, join(artifacts, 'swift-chat.png'))
  const snapshot = await evaluate('window.api.agent.workspaceSnapshot()')
  if (!snapshot) throw new Error('Shared agent backend did not answer')
  if (!(await host.request('previewInspector', { action: 'show' }))) throw new Error('Native Web Inspector unavailable')
  let inspector: any
  for (let i = 0; i < 50; i++) {
    inspector = await host.request('previewInspector')
    if (inspector.visible) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!inspector?.visible || !inspector.inspectable) throw new Error('Preview Web Inspector did not open')
  await host.request('previewInspector', { action: 'showConsole' })
  await host.request('previewInspector', { action: 'close' })
  console.log('Native preview Web Inspector opened and closed successfully.')
  console.log(
    `${process.env.PRAXIS_NATIVE_BACKGROUND_TEST === '1' ? 'NATIVE BACKGROUND CHECKS PASS (preview input/animation skipped)' : 'NATIVE APP PASS'} — Swift chat, shared web panels, managed server, source/agent services, isolated layers and captures.`
  )
  if (process.argv.includes('--live')) {
    const provider = process.env.PRAXIS_NATIVE_TEST_PROVIDER || 'claude'
    if (!['claude', 'codex'].includes(provider)) throw new Error('Unsupported native test provider')
    const model = provider === 'claude' ? 'haiku' : 'default'
    await evaluate(
      `(()=>{window.__praxisSession.getState().setProvider(${JSON.stringify(provider)});window.__praxisSession.getState().setModel(${JSON.stringify(model)});window.__praxisPermissions.getState().setMode('bypassPermissions');return true})()`
    )
    const options = {
      provider,
      permissionMode: 'bypassPermissions',
      ...(provider === 'claude' ? { model } : {})
    }
    const restarted = await evaluate(
      `(()=>{const root=${JSON.stringify(fixture)};const entry=window.__praxisWorkspace.getState().projects.find(p=>p.root===root);return window.api.agent.restartChat(root,entry.activeSessionKey??entry.key,${JSON.stringify(options)})})()`
    )
    if (!restarted.ok) throw new Error(`Could not start ${provider}: ${restarted.error}`)
    await evaluate(
      `(()=>{window.__nativeTestEvents=[];window.api.agent.onEvent(e=>window.__nativeTestEvents.push(e));return true})()`
    )
    const prompt =
      'Edit index.html in this temporary test project. Replace only the heading text "Edited through Praxis Native" with "NATIVE_AGENT_VERIFIED". Make the edit now, then reply briefly.'
    await host.request('composerPerform', { text: prompt })
    await waitComposer(state => state.enabled && state.text === prompt)
    await host.request('composerPerform', { action: 'send' })
    await wait(
      `window.__nativeTestEvents.some(e=>e.type==='done'||e.type==='error')`,
      'main',
      180000
    )
    const events = await evaluate('window.__nativeTestEvents')
    writeFileSync(join(artifacts, 'live-events.json'), JSON.stringify(events, null, 2))
    const image = await host.request('capture', { view: 'main' })
    writeFileSync(join(artifacts, 'chat.png'), Buffer.from(image.png, 'base64'))
    const errors = events
      .filter((event: any) => event.type === 'error')
      .map((event: any) => event.message)
      .join('\n')
    const reply = events
      .filter((event: any) => event.type === 'delta')
      .map((event: any) => event.text)
      .join('')
    if (
      /^Not logged in\s*[·—-]\s*Please run \/login\s*$/i.test(reply.trim()) ||
      /unauthori[sz]ed|invalid api key|not logged in|authentication|credential|setup-token|please.*login/i.test(
        errors
      )
    ) {
      console.log('NATIVE-RUNTIME-LIVE SKIP — provider authentication is unavailable.')
      return
    }
    if (errors) throw new Error(`Native live agent failed: ${errors.slice(0, 1200)}`)
    if (!readFileSync(join(fixture, 'index.html'), 'utf8').includes('NATIVE_AGENT_VERIFIED'))
      throw new Error('Native live agent finished without the requested fixture edit')
    await wait(
      `document.querySelector('#native-title')?.textContent === 'NATIVE_AGENT_VERIFIED'`,
      'preview'
    )
    console.log(
      'NATIVE LIVE PASS — actual chat composer, provider turn, source edit, streamed reply, and preview reload.'
    )
  }
}
