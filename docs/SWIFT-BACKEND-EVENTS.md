# Native dispatch and event census

2026-09-27. Source expressions retain payload construction and dynamic dispatch names. This complements RPC registrations; entries include dispatch branches, producers and subscriptions, not a count of unique events. Swift inspection/Perform/capture methods include test instrumentation and must not become helper capabilities. Domain ownership and directions are explained in the [audit](SWIFT-BACKEND-AUDIT.md).

| Source | Dispatch / emission / subscription |
| --- | --- |
| [src/native/PreviewStatus.swift:9](../src/native/PreviewStatus.swift#L9) | func action(_ name: String) { emit(["event":"native-preview-action", "action":name, "project":project, "command":command]) } |
| [src/native/Chat.swift:47](../src/native/Chat.swift#L47) | emit(["event":"island-action", "chat":chat, "id":island.id, "revision":island.revision, |
| [src/native/Chat.swift:52](../src/native/Chat.swift#L52) | var message: [String: Any] = ["event":"chat-action", "chat":chat, "action":name] |
| [src/native/Welcome.swift:27](../src/native/Welcome.swift#L27) | Button { emit(["event":"recent", "root":recent.root]) } label: { |
| [src/native/Welcome.swift:35](../src/native/Welcome.swift#L35) | Button("Open project") { emit(["event":"menu", "action":"open-project"]) }.keyboardShortcut("o", modifiers: .command) |
| [src/native/Welcome.swift:36](../src/native/Welcome.swift#L36) | Button("New project") { emit(["event":"menu", "action":"new-project"]) } |
| [src/native/Layers.swift:36](../src/native/Layers.swift#L36) | func send(_ action: String, _ data: [String: Any] = [:]) { emit(data.merging(["event":"layers-action", "root":root, "action":action]) { _, new in new }) } |
| [src/native/SourceEditor.swift:114](../src/native/SourceEditor.swift#L114) | func send(_ action: String, _ extra: [String: Any] = [:]) { var payload: [String: Any] = ["event":"source-action", "root":root, "action":action, "source":source]; payload.merge(extra) { _, new in new }; emit(payload) } |
| [src/native/platform.ts:67](../src/native/platform.ts#L67) | serviceEvents.emit('command', message.channel, args, result) |
| [src/native/platform.ts:152](../src/native/platform.ts#L152) | if (id === 'main') serviceEvents.emit('event', channel, ...args) |
| [src/native/PreviewPlatform.swift:11](../src/native/PreviewPlatform.swift#L11) | func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { if (error as NSError).code != NSURLErrorCancelled { emit(["event":"download-error", "message":error.localizedDescription]) } } |
| [src/native/PreviewPlatform.swift:12](../src/native/PreviewPlatform.swift#L12) | func downloadDidFinish(_ download: WKDownload) { emit(["event":"download-finished"]) } |
| [src/native/ProjectCell.swift:149](../src/native/ProjectCell.swift#L149) | emit(["event":"shell-action", "action":"project-reorder", "project":key, |
| [src/native/chat-runtime.ts:40](../src/native/chat-runtime.ts#L40) | host.on('island-action', command => { |
| [src/native/chat-runtime.ts:48](../src/native/chat-runtime.ts#L48) | views.get('preview')?.webContents.send('preview:animation-replay', record.manifest.component) |
| [src/native/chat-runtime.ts:57](../src/native/chat-runtime.ts#L57) | host.on('composer-action', action => { void nativeChat.composer(action) }) |
| [src/native/chat-runtime.ts:58](../src/native/chat-runtime.ts#L58) | host.on('chat-action', action => { void nativeChat.action(action) }) |
| [src/native/chat-runtime.ts:59](../src/native/chat-runtime.ts#L59) | serviceEvents.on('event', (channel: string, event: AgentEvent) => { |
| [src/native/chat-runtime.ts:72](../src/native/chat-runtime.ts#L72) | serviceEvents.on('command', (channel: string, args: any[], result: any) => { |
| [src/native/inspector-runtime.ts:24](../src/native/inspector-runtime.ts#L24) | host.on('content-action', action => { void content.action(action.documentID, action).catch(report) }) |
| [src/native/inspector-runtime.ts:25](../src/native/inspector-runtime.ts#L25) | host.on('menu', ({ action }) => { if (action === 'content' && workspace.active) { for (const [key, session] of content.sessions) if (session.root === workspace.active.root) { session.visible = true; content.publish(key, session) }; void openContent(workspace.active.root).catch(report) } }) |
| [src/native/inspector-runtime.ts:26](../src/native/inspector-runtime.ts#L26) | host.on('inspector-action', action => { void controller.action(action).catch(report) }) |
| [src/native/inspector-runtime.ts:35](../src/native/inspector-runtime.ts#L35) | serviceEvents.on('event', (channel, value) => { |
| [src/native/Composer.swift:79](../src/native/Composer.swift#L79) | var event: [String: Any] = ["event":"chat-action", "chat":self.chat, "action":action] |
| [src/native/Composer.swift:221](../src/native/Composer.swift#L221) | } else if action == "select" { emit(["event":"menu", "action":"select"]) } |
| [src/native/Shell.swift:205](../src/native/Shell.swift#L205) | emit(["event":"shell-action", "action":"new-chat", "project":project]) |
| [src/native/Shell.swift:243](../src/native/Shell.swift#L243) | emit(["event":"shell-action", "action":"address", "value":value]) |
| [src/native/Shell.swift:271](../src/native/Shell.swift#L271) | emit(["event":"shell-action", "action":action, "project":project]) |
| [src/native/Shell.swift:272](../src/native/Shell.swift#L272) | } else { emit(["event":"menu", "action":action]) } |
| [src/native/Shell.swift:275](../src/native/Shell.swift#L275) | emit(["event":"shell-action", "action":item.itemIdentifier.rawValue]) |
| [src/native/Shell.swift:286](../src/native/Shell.swift#L286) | emit(["event":"shell-action", "action":"new-branch", "value":input.stringValue]) |
| [src/native/Shell.swift:306](../src/native/Shell.swift#L306) | entry.target = self; entry.representedObject = ["event":"shell-action", "action":"select", "id":row.id, "project":row.project] |
| [src/native/Shell.swift:314](../src/native/Shell.swift#L314) | rename.target = self; rename.representedObject = ["event":"shell-action", "action":"rename-chat", "id":selectedID]; chatMenu.addItem(rename) |
| [src/native/Shell.swift:316](../src/native/Shell.swift#L316) | close.target = self; close.representedObject = ["event":"shell-action", "action":"close", "id":selectedID]; chatMenu.addItem(close) |
| [src/native/Shell.swift:335](../src/native/Shell.swift#L335) | entry.representedObject = ["event":"shell-action", "action":action, "value":value] |
| [src/native/Shell.swift:351](../src/native/Shell.swift#L351) | entry.representedObject = ["event":"shell-action", "action":"publish-mode", "value":value] |
| [src/native/Shell.swift:440](../src/native/Shell.swift#L440) | emit(["event":"shell-action", "action":"select", "id":row.id]) |
| [src/native/Shell.swift:451](../src/native/Shell.swift#L451) | item.target = self; item.representedObject = ["event":"shell-action", "action":action, "id":row.id, "project":row.project]; menu.addItem(item) |
| [src/native/workspace-runtime.ts:15](../src/native/workspace-runtime.ts#L15) | render: state => view.webContents.send('native-workspace:state', state), |
| [src/native/workspace-runtime.ts:46](../src/native/workspace-runtime.ts#L46) | host.on('recent', ({ root }) => run({ type: 'open', root })) |
| [src/native/workspace-runtime.ts:47](../src/native/workspace-runtime.ts#L47) | host.on('menu', ({ action }) => { if (action === 'open-project') run({ type: 'open' }) }) |
| [src/native/workspace-runtime.ts:48](../src/native/workspace-runtime.ts#L48) | host.on('shell-action', (action: NativeShellAction) => { |
| [src/native/index.ts:125](../src/native/index.ts#L125) | const send = (channel: string, ...args: unknown[]) => mainView.webContents.send(channel, ...args) |
| [src/native/index.ts:195](../src/native/index.ts#L195) | host.on('ipc', async ({ view, message }) => { |
| [src/native/index.ts:218](../src/native/index.ts#L218) | host.on('media', async ({ task, url, headers }) => { |
| [src/native/index.ts:236](../src/native/index.ts#L236) | host.on('activity-action', ({ action }) => activityController.action(action)) |
| [src/native/index.ts:237](../src/native/index.ts#L237) | host.on('menu', ({ action }) => { if (action === 'logs') activityController.action('toggle') }) |
| [src/native/index.ts:238](../src/native/index.ts#L238) | serviceEvents.on('event', (channel, line) => { if (channel === 'devserver:log' &#124;&#124; channel === 'simulator:log') activityController.append(line, 'server') }) |
| [src/native/index.ts:239](../src/native/index.ts#L239) | host.on('native-layout-width', ({ width }) => { |
| [src/native/index.ts:243](../src/native/index.ts#L243) | host.on('native-layout-sizes', sizes => { if (['source','layers','inspector'].every(key => Number.isFinite(sizes[key]))) preferences.set('praxis:native-panel-sizes', JSON.stringify({ source:sizes.source, layers:sizes.layers, inspector:sizes.inspector })) }) |
| [src/native/index.ts:244](../src/native/index.ts#L244) | host.on('native-layout-frame', ({ frame }) => { |
| [src/native/index.ts:258](../src/native/index.ts#L258) | host.on('layers-action', action => { void layersController.action(action).catch(error => activityController.append(String(error), 'error')) }) |
| [src/native/index.ts:259](../src/native/index.ts#L259) | host.on('shell-action', action => { if (action.action === 'layers') void layersController.toggle() }) |
| [src/native/index.ts:260](../src/native/index.ts#L260) | serviceEvents.on('event', (channel, value) => { |
| [src/native/index.ts:270](../src/native/index.ts#L270) | host.on('source-action', editorAction) |
| [src/native/index.ts:273](../src/native/index.ts#L273) | host.on('shell-action', action => { |
| [src/native/index.ts:280](../src/native/index.ts#L280) | serviceEvents.on('event', (channel, value) => { |
| [src/native/index.ts:295](../src/native/index.ts#L295) | serviceEvents.on('event', (channel, value) => { |
| [src/native/index.ts:304](../src/native/index.ts#L304) | serviceEvents.on('command', (channel, args, result) => { |
| [src/native/index.ts:314](../src/native/index.ts#L314) | previewView.webContents.send(channels.PREVIEW_HIDE_SCROLLBARS, viewport === 'mobile') |
| [src/native/index.ts:318](../src/native/index.ts#L318) | host.on('menu', ({ action }) => { |
| [src/native/index.ts:326](../src/native/index.ts#L326) | host.on('shell-action', action => { |
| [src/native/index.ts:329](../src/native/index.ts#L329) | serviceEvents.on('event', (channel, value) => { |
| [src/native/index.ts:334](../src/native/index.ts#L334) | serviceEvents.on('command', (channel, args) => { if (channel === 'preview:set-select-mode') { shellController!.selecting = !!args[0]; shellController!.schedule() } }) |
| [src/native/index.ts:337](../src/native/index.ts#L337) | host.on('shell-action', action => { |
| [src/native/index.ts:350](../src/native/index.ts#L350) | host.on('menu', ({ action }) => { if (action === 'updates') void updates.open().catch(error => activityController.append(String(error), 'error')) }) |
| [src/native/index.ts:351](../src/native/index.ts#L351) | host.on('download-error', ({ message }) => activityController.append('Download failed: ${message}', 'error')) |
| [src/native/index.ts:352](../src/native/index.ts#L352) | host.on('download-finished', () => activityController.append('Download finished.', 'success')) |
| [src/native/index.ts:355](../src/native/index.ts#L355) | host.on('menu', ({ action }) => { if (action === 'servers' && workspaceController.state.activeKey) previewRecovery.open(workspaceController.state.activeKey) }) |
| [src/native/index.ts:358](../src/native/index.ts#L358) | host.on('sheet-action', action => { void sheetController.action(action) }) |
| [src/native/index.ts:368](../src/native/index.ts#L368) | host.on('menu', ({ action }) => { if (['new-project', 'settings', 'feedback', 'diagnose'].includes(action)) openSheet(action) }) |
| [src/native/index.ts:369](../src/native/index.ts#L369) | host.on('shell-action', action => { if (action.action === 'rename-chat' && action.id && workspaceController.state.activeKey) sheetController.renameChat(action.id, workspaceController.state.activeKey); if (action.action === 'select' && action.id?.startsWith('history:')) openSheet('review', action.id.slice(8)); if (action.action === 'memory') openSheet('memory', action.project ?? workspaceController.state.activeKey ?? undefined) }) |
| [src/native/index.ts:370](../src/native/index.ts#L370) | host.on('native-preview-action', action => { |
| [src/native/index.ts:378](../src/native/index.ts#L378) | host.on('view-closed', ({ view }) => { |
| [src/native/index.ts:383](../src/native/index.ts#L383) | host.on('url', ({ view, url }) => { |
| [src/native/index.ts:388](../src/native/index.ts#L388) | host.on('fullscreen', ({ value }) => send('window:fullscreen', value)) |
| [src/native/index.ts:389](../src/native/index.ts#L389) | host.on('external', ({ url }) => { |
| [src/native/index.ts:392](../src/native/index.ts#L392) | host.on('load-error', message => { activityController.append(message.message, 'error'); if (message.view === 'preview' && workspaceController.active) { workspaceController.state.status = { kind: 'error', message: message.message }; workspaceController.changed() } }) |
| [src/native/index.ts:393](../src/native/index.ts#L393) | host.on('loaded', ({ view, url }) => { |
| [src/native/index.ts:397](../src/native/index.ts#L397) | previewView.webContents.send(channels.PREVIEW_SET_MODE, state.selectMode) |
| [src/native/index.ts:398](../src/native/index.ts#L398) | previewView.webContents.send(channels.PREVIEW_SET_COMMENT_MODE, state.commentMode) |
| [src/native/index.ts:399](../src/native/index.ts#L399) | previewView.webContents.send(channels.PREVIEW_SET_FRAME, state.frameMode) |
| [src/native/index.ts:400](../src/native/index.ts#L400) | previewView.webContents.send(channels.PREVIEW_HIDE_SCROLLBARS, workspaceController.active?.viewport === 'mobile') |
| [src/native/index.ts:401](../src/native/index.ts#L401) | previewView.webContents.send(channels.PREVIEW_SET_PINS, state.pins) |
| [src/native/index.ts:402](../src/native/index.ts#L402) | previewView.webContents.send(channels.PREVIEW_SET_STATUS, state.statusText) |
| [src/native/index.ts:403](../src/native/index.ts#L403) | previewView.webContents.send(channels.LAYERS_SET_WATCH, state.layersWatch) |
| [src/native/index.ts:406](../src/native/index.ts#L406) | host.on('closed', async () => { |
| [src/native/index.ts:411](../src/native/index.ts#L411) | host.on('host-error', async (error) => { |
| [src/native/index.ts:416](../src/native/index.ts#L416) | host.once('ready', async () => { |
| [src/native/Activity.swift:42](../src/native/Activity.swift#L42) | @objc func clearLog() { emit(["event":"activity-action", "action":"clear"]) } |
| [src/native/Activity.swift:44](../src/native/Activity.swift#L44) | func windowWillClose(_ notification: Notification) { emit(["event":"activity-action", "action":"hide"]) } |
| [src/native/EditingInspector.swift:17](../src/native/EditingInspector.swift#L17) | var message: [String: Any] = ["event":channel, "root":state.root, "generation":state.generation, "action":action] |
| [src/native/Host.swift:86](../src/native/Host.swift#L86) | emit(["event":"url", "view":id, "url":view.url?.absoluteString ?? ""]) |
| [src/native/Host.swift:123](../src/native/Host.swift#L123) | emit(["event":"ready"]) |
| [src/native/Host.swift:163](../src/native/Host.swift#L163) | emit(["event":"menu", "action":action]) |
| [src/native/Host.swift:165](../src/native/Host.swift#L165) | @objc func recentAction(_ item: NSMenuItem) { emit(["event":"recent", "root":item.representedObject as? String ?? ""]) } |
| [src/native/Host.swift:167](../src/native/Host.swift#L167) | if let error = error { emit(["event":"reply", "id":id, "error":error]) } |
| [src/native/Host.swift:168](../src/native/Host.swift#L168) | else { emit(["event":"reply", "id":id, "value":value]) } |
| [src/native/Host.swift:175](../src/native/Host.swift#L175) | case "preferences": |
| [src/native/Host.swift:177](../src/native/Host.swift#L177) | case "webViews": reply(id, views.keys.sorted()) |
| [src/native/Host.swift:178](../src/native/Host.swift#L178) | case "previewInspector": |
| [src/native/Host.swift:181](../src/native/Host.swift#L181) | case "chatState": |
| [src/native/Host.swift:185](../src/native/Host.swift#L185) | case "layoutSizes": nativeLayout.restoreSizes(c["sizes"] as? [String: Double] ?? [:]) |
| [src/native/Host.swift:186](../src/native/Host.swift#L186) | case "layoutWidth": nativeLayout.desiredWidth = CGFloat(c["width"] as? Double ?? 440); nativeLayout.layout() |
| [src/native/Host.swift:187](../src/native/Host.swift#L187) | case "layoutInspect": reply(id, nativeLayout.inspect()) |
| [src/native/Host.swift:188](../src/native/Host.swift#L188) | case "contentState": |
| [src/native/Host.swift:191](../src/native/Host.swift#L191) | case "contentInspect": reply(id, contentWindows.map { key, controller in ["id":key, "visible":controller.window.isVisible, "generation":controller.editor.model.state?.generation ?? 0, "fields":controller.editor.model.state?.fields.count ?? 0] as [String: Any] }) |
| [src/native/Host.swift:192](../src/native/Host.swift#L192) | case "captureContent": |
| [src/native/Host.swift:195](../src/native/Host.swift#L195) | case "inspectorState": editingInspector.update(c["state"] as? [String: Any] ?? [:]); nativeLayout.layout() |
| [src/native/Host.swift:196](../src/native/Host.swift#L196) | case "inspectorInspect": reply(id, ["native":true, "visible":!editingInspector.isHidden, "fields":editingInspector.model.state?.fields.count ?? 0, "error":editingInspector.model.state?.error ?? "", "generation":editingInspector.model.state?.generation ?? 0]) |
| [src/native/Host.swift:197](../src/native/Host.swift#L197) | case "inspectorPerform": guard ephemeral else { return }; emit((c["action"] as? [String: Any] ?? [:]).merging(["event":"inspector-action"]) { _, new in new }); reply(id) |
| [src/native/Host.swift:198](../src/native/Host.swift#L198) | case "layersState": layers.update(c["state"] as? [String: Any] ?? [:]); nativeLayout.layout() |
| [src/native/Host.swift:199](../src/native/Host.swift#L199) | case "layersInspect": reply(id, ["native":true, "visible":!layers.isHidden, "count":layers.nodes.count]) |
| [src/native/Host.swift:200](../src/native/Host.swift#L200) | case "sourceActive": |
| [src/native/Host.swift:204](../src/native/Host.swift#L204) | case "sourceState": |
| [src/native/Host.swift:235](../src/native/Host.swift#L235) | case "sourceInspect": |
| [src/native/Host.swift:238](../src/native/Host.swift#L238) | case "sourceResize": |
| [src/native/Host.swift:241](../src/native/Host.swift#L241) | case "captureSource": |
| [src/native/Host.swift:244](../src/native/Host.swift#L244) | case "sourcePerform": |
| [src/native/Host.swift:245](../src/native/Host.swift#L245) | guard ephemeral else { return }; emit((c["action"] as? [String: Any] ?? [:]).merging(["event":"source-action"]) { _, new in new }); reply(id) |
| [src/native/Host.swift:246](../src/native/Host.swift#L246) | case "activityState": activity.update(c) |
| [src/native/Host.swift:247](../src/native/Host.swift#L247) | case "activityInspect": reply(id, ["visible":activity.window?.isVisible ?? false, "count":activity.count]) |
| [src/native/Host.swift:248](../src/native/Host.swift#L248) | case "sheetState": sheets.update(c["state"] as? [String: Any] ?? [:]) |
| [src/native/Host.swift:249](../src/native/Host.swift#L249) | case "sheetClose": sheets.close(c["id"] as? String ?? "") |
| [src/native/Host.swift:250](../src/native/Host.swift#L250) | case "sheetInspect": reply(id, sheets.inspect()) |
| [src/native/Host.swift:251](../src/native/Host.swift#L251) | case "captureSheet": |
| [src/native/Host.swift:257](../src/native/Host.swift#L257) | case "sheetPerform": |
| [src/native/Host.swift:263](../src/native/Host.swift#L263) | case "welcomeInspect": reply(id, welcome.inspect()) |
| [src/native/Host.swift:264](../src/native/Host.swift#L264) | case "dividerInspect": reply(id, ["visible":!chatDivider.isHidden, "width":chatDivider.width, "dragging":chatDivider.dragging, "frame":NSStringFromRect(chatDivider.frame), "hitTarget":canvas.hitTest(NSPoint(x: chatDivider.frame.midX, y: chatDivider.frame.midY)) === chatDivider]) |
| [src/native/Host.swift:265](../src/native/Host.swift#L265) | case "dividerPerform": |
| [src/native/Host.swift:270](../src/native/Host.swift#L270) | case "islandPerform": |
| [src/native/Host.swift:274](../src/native/Host.swift#L274) | case "chatInspect": reply(id, chat.inspect()) |
| [src/native/Host.swift:275](../src/native/Host.swift#L275) | case "chatPerform": chat.model.action(c["action"] as? String ?? "", id: c["card"] as? String, value: c["value"] as? String, answers: c["answers"] as? [String: String]); reply(id) |
| [src/native/Host.swift:276](../src/native/Host.swift#L276) | case "composerState": composer.update(c["state"] as? [String: Any] ?? [:]) |
| [src/native/Host.swift:277](../src/native/Host.swift#L277) | case "composerInspect": reply(id, composer.inspect()) |
| [src/native/Host.swift:278](../src/native/Host.swift#L278) | case "composerIMECheck": |
| [src/native/Host.swift:286](../src/native/Host.swift#L286) | case "composerPasteCheck": |
| [src/native/Host.swift:289](../src/native/Host.swift#L289) | case "composerPerform": composer.perform(c); reply(id) |
| [src/native/Host.swift:290](../src/native/Host.swift#L290) | case "composerFocus": window.makeFirstResponder(composer.text) |
| [src/native/Host.swift:291](../src/native/Host.swift#L291) | case "captureComposer": |
| [src/native/Host.swift:297](../src/native/Host.swift#L297) | case "shellState": |
| [src/native/Host.swift:301](../src/native/Host.swift#L301) | case "shellInspect": reply(id, shell.inspect()) |
| [src/native/Host.swift:302](../src/native/Host.swift#L302) | case "previewSurfaceInspect": reply(id, previewSurface.inspect()) |
| [src/native/Host.swift:303](../src/native/Host.swift#L303) | case "shellPerform": reply(id, shell.perform(c["action"] as? String ?? "", id: c["row"] as? String)) |
| [src/native/Host.swift:304](../src/native/Host.swift#L304) | case "captureFeedback": |
| [src/native/Host.swift:314](../src/native/Host.swift#L314) | case "captureShell", "captureShellImage": |
| [src/native/Host.swift:321](../src/native/Host.swift#L321) | case "captureSidebar": |
| [src/native/Host.swift:335](../src/native/Host.swift#L335) | case "recents": |
| [src/native/Host.swift:341](../src/native/Host.swift#L341) | case "load": |
| [src/native/Host.swift:345](../src/native/Host.swift#L345) | case "reload": |
| [src/native/Host.swift:348](../src/native/Host.swift#L348) | case "bounds": |
| [src/native/Host.swift:354](../src/native/Host.swift#L354) | case "visible": |
| [src/native/Host.swift:357](../src/native/Host.swift#L357) | case "radius": |
| [src/native/Host.swift:362](../src/native/Host.swift#L362) | case "deliver": |
| [src/native/Host.swift:365](../src/native/Host.swift#L365) | case "evaluate": |
| [src/native/Host.swift:375](../src/native/Host.swift#L375) | case "previewInput": |
| [src/native/Host.swift:391](../src/native/Host.swift#L391) | case "capture": |
| [src/native/Host.swift:399](../src/native/Host.swift#L399) | case "pick", "pickNew": |
| [src/native/Host.swift:407](../src/native/Host.swift#L407) | case "trash": |
| [src/native/Host.swift:410](../src/native/Host.swift#L410) | case "fullscreen": reply(id, window.styleMask.contains(.fullScreen)) |
| [src/native/Host.swift:411](../src/native/Host.swift#L411) | case "nativeEdit": NSApp.sendAction(Selector((c["action"] as? String ?? "undo") + ":"), to: nil, from: nil) |
| [src/native/Host.swift:412](../src/native/Host.swift#L412) | case "mediaReply": |
| [src/native/Host.swift:417](../src/native/Host.swift#L417) | case "quit": terminateHost() |
| [src/native/Host.swift:425](../src/native/Host.swift#L425) | emit(["event":"ipc", "view":name, "message":body]) |
| [src/native/Host.swift:429](../src/native/Host.swift#L429) | emit(["event":"loaded", "view":name, "url":webView.url?.absoluteString ?? ""]) |
| [src/native/Host.swift:433](../src/native/Host.swift#L433) | emit(["event":"load-error", "view":views.first(where: { $0.value === webView })?.key ?? "", "message":error.localizedDescription]) |
| [src/native/Host.swift:439](../src/native/Host.swift#L439) | else { emit(["event":"load-error", "view":"preview", "message":"The preview stopped repeatedly. Use Run to restart it, or inspect the activity log."]) } |
| [src/native/Host.swift:451](../src/native/Host.swift#L451) | if action.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") { emit(["event":"external", "url":url.absoluteString]) } |
| [src/native/Host.swift:462](../src/native/Host.swift#L462) | emit(["event":"media", "task":key, "url":urlSchemeTask.request.url!.absoluteString, "headers":urlSchemeTask.request.allHTTPHeaderFields ?? [:]]) |
| [src/native/Host.swift:465](../src/native/Host.swift#L465) | func windowDidEnterFullScreen(_ notification: Notification) { emit(["event":"fullscreen", "value":true]) } |
| [src/native/Host.swift:466](../src/native/Host.swift#L466) | func windowDidExitFullScreen(_ notification: Notification) { emit(["event":"fullscreen", "value":false]) } |
| [src/native/ChatIsland.swift:39](../src/native/ChatIsland.swift#L39) | emit(["event":"island-action", "chat":chat, "id":island.id, "revision":island.revision, |
| [src/native/ChatIsland.swift:86](../src/native/ChatIsland.swift#L86) | case "toggle": |
| [src/native/ChatIsland.swift:88](../src/native/ChatIsland.swift#L88) | case "select": |
| [src/native/ChatIsland.swift:92](../src/native/ChatIsland.swift#L92) | case "bezier": |
| [src/native/ChatIsland.swift:97](../src/native/ChatIsland.swift#L97) | case "number": |
| [src/native/Sheets.swift:26](../src/native/Sheets.swift#L26) | emit(["event":"sheet-action", "id":state.id, "action":action, "values":values]) |
| [src/native/WorkspaceLayout.swift:30](../src/native/WorkspaceLayout.swift#L30) | func saveSizes() { emit(["event":"native-layout-sizes", "source":Double(sourceHeight), "layers":Double(layersHeight), "inspector":Double(inspectorWidth)]) } |
| [src/native/WorkspaceLayout.swift:59](../src/native/WorkspaceLayout.swift#L59) | emit(["event":"native-layout-width", "width":Double(width)]) |
| [src/native/WorkspaceLayout.swift:120](../src/native/WorkspaceLayout.swift#L120) | emit(["event":"native-layout-frame", "frame":["x":Double(page.minX), "y":Double(page.minY), "width":Double(page.width), "height":Double(page.height), "radius":mobile ? Double(page.width * 0.12) : 0, "leading":Double(leading)]]) |
| [src/shared/preview-channels.ts:18](../src/shared/preview-channels.ts#L18) | export const PREVIEW_SET_MODE = 'praxis:preview:set-select-mode' // → preload (boolean) |
| [src/shared/preview-channels.ts:19](../src/shared/preview-channels.ts#L19) | export const PREVIEW_PICKED = 'praxis:preview:element-picked' // → main (SelectedElement) |
| [src/shared/preview-channels.ts:20](../src/shared/preview-channels.ts#L20) | export const PREVIEW_CANCELLED = 'praxis:preview:select-cancelled' // → main |
| [src/shared/preview-channels.ts:21](../src/shared/preview-channels.ts#L21) | export const PREVIEW_TOGGLE_SELECT = 'praxis:preview:toggle-select' // → main (S pressed) |
| [src/shared/preview-channels.ts:22](../src/shared/preview-channels.ts#L22) | export const PREVIEW_TOOLBAR_ACTION = 'praxis:preview:toolbar-action' // → main (code/delete/props) |
| [src/shared/preview-channels.ts:23](../src/shared/preview-channels.ts#L23) | export const PREVIEW_CLEAR_SELECTED = 'praxis:preview:clear-selected' // → preload (pill ×, send) |
| [src/shared/preview-channels.ts:24](../src/shared/preview-channels.ts#L24) | export const PREVIEW_READINESS = 'praxis:preview:readiness' // → main ({stamps}) |
| [src/shared/preview-channels.ts:25](../src/shared/preview-channels.ts#L25) | export const PREVIEW_TEXT_EDIT = 'praxis:preview:text-edit' // → main ({source, text}) |
| [src/shared/preview-channels.ts:28](../src/shared/preview-channels.ts#L28) | export const PREVIEW_SET_PINS = 'praxis:preview:set-annotations' // → preload (pin list) |
| [src/shared/preview-channels.ts:29](../src/shared/preview-channels.ts#L29) | export const PREVIEW_PIN_CLICK = 'praxis:preview:pin-click' // → main (pin id) |
| [src/shared/preview-channels.ts:32](../src/shared/preview-channels.ts#L32) | export const PREVIEW_SET_COMMENT_MODE = 'praxis:preview:set-comment-mode' // → preload |
| [src/shared/preview-channels.ts:33](../src/shared/preview-channels.ts#L33) | export const PREVIEW_COMMENT_MODE = 'praxis:preview:comment-mode' // → main (keyboard-initiated) |
| [src/shared/preview-channels.ts:34](../src/shared/preview-channels.ts#L34) | export const PREVIEW_COMMENT = 'praxis:preview:comment' // → main (submitted) |
| [src/shared/preview-channels.ts:37](../src/shared/preview-channels.ts#L37) | export const PREVIEW_HIDE_SCROLLBARS = 'praxis:preview:hide-scrollbars' // → preload (native mobile preview) |
| [src/shared/preview-channels.ts:38](../src/shared/preview-channels.ts#L38) | export const PREVIEW_SET_FRAME = 'praxis:preview:set-frame' // → preload (mobile bezel) |
| [src/shared/preview-channels.ts:39](../src/shared/preview-channels.ts#L39) | export const PREVIEW_SET_STATUS = 'praxis:preview:set-status' // → preload (launch pill) |
| [src/shared/preview-channels.ts:42](../src/shared/preview-channels.ts#L42) | export const STYLES_PREVIEW = 'styles:preview' // → preload ({prop, value}) |
| [src/shared/preview-channels.ts:43](../src/shared/preview-channels.ts#L43) | export const STYLES_CLEAR_PREVIEW = 'styles:clear-preview' // → preload ({prop?}) |
| [src/shared/preview-channels.ts:44](../src/shared/preview-channels.ts#L44) | export const STYLES_REPLAY = 'styles:replay' // → preload ({prop, from, to}) |
| [src/shared/preview-channels.ts:45](../src/shared/preview-channels.ts#L45) | export const STYLES_READ = 'styles:read' // → preload ({id, props}) |
| [src/shared/preview-channels.ts:46](../src/shared/preview-channels.ts#L46) | export const STYLES_READ_REPLY = 'styles:read-reply' // → main ({id, values&#124;null, …}) |
| [src/shared/preview-channels.ts:49](../src/shared/preview-channels.ts#L49) | export const LAYERS_READ = 'layers:read' // → preload ({id}) |
| [src/shared/preview-channels.ts:50](../src/shared/preview-channels.ts#L50) | export const LAYERS_READ_REPLY = 'layers:read-reply' // → main ({id, snapshot}) |
| [src/shared/preview-channels.ts:51](../src/shared/preview-channels.ts#L51) | export const LAYERS_CHANGED = 'layers:changed' // → main (debounced mutation ping) |
| [src/shared/preview-channels.ts:52](../src/shared/preview-channels.ts#L52) | export const LAYERS_SELECT = 'layers:select' // → preload ({path, fingerprint}) |
| [src/shared/preview-channels.ts:53](../src/shared/preview-channels.ts#L53) | export const LAYERS_HOVER = 'layers:hover' // → preload ({path, fingerprint} &#124; null) |
| [src/shared/preview-channels.ts:54](../src/shared/preview-channels.ts#L54) | export const LAYERS_SET_WATCH = 'layers:set-watch' // → preload (boolean) |
| [src/shared/preview-channels.ts:56](../src/shared/preview-channels.ts#L56) | export const PREVIEW_MOVE_NODE = 'praxis:preview:move-node' // → main (MoveNodeRequest) |
| [src/shared/preview-channels.ts:58](../src/shared/preview-channels.ts#L58) | export const ANIMATION_REPLAY = 'praxis:preview:animation-replay' // → preload (component name) |
| [src/main/control-panels.ts:274](../src/main/control-panels.ts#L274) | if (!w.webContents.isDestroyed()) w.webContents.send('controls:updated', { root }) |
| [src/main/backends/gemini.ts:97](../src/main/backends/gemini.ts#L97) | sendToRenderer(getWindow, 'agent:event', tagged) |
| [src/main/backends/tools.ts:8](../src/main/backends/tools.ts#L8) | * outlives its 'webContents', so a bare 'getWindow()?.webContents.send(...)' |
| [src/main/backends/tools.ts:12](../src/main/backends/tools.ts#L12) | export function sendToRenderer( |
| [src/main/backends/claude.ts:549](../src/main/backends/claude.ts#L549) | sendToRenderer(getWindow, 'agent:event', tagged) |
| [src/main/backends/claude.ts:617](../src/main/backends/claude.ts#L617) | (channel, payload) => sendToRenderer(getWindow, channel, payload), !!ctx?.sessionId) |
| [src/main/backends/claude.ts:629](../src/main/backends/claude.ts#L629) | (channel, payload) => sendToRenderer(getWindow, channel, payload)) |
| [src/main/backends/claude.ts:641](../src/main/backends/claude.ts#L641) | (channel, payload) => sendToRenderer(getWindow, channel, payload), |
| [src/main/backends/codex.ts:197](../src/main/backends/codex.ts#L197) | sendToRenderer(getWindow, 'agent:event', tagged) |
| [src/main/backends/codex.ts:246](../src/main/backends/codex.ts#L246) | sendToRenderer(getWindow, channel, payload) |
| [src/main/agent.ts:446](../src/main/agent.ts#L446) | safeSend(getWindow_, 'agent:event', { |
| [src/main/agent.ts:464](../src/main/agent.ts#L464) | safeSend(getWindow_, 'agent:event', { |
| [src/main/agent.ts:478](../src/main/agent.ts#L478) | safeSend(getWindow_, 'agent:event', { |
| [src/main/agent.ts:497](../src/main/agent.ts#L497) | function safeSend(get: () => NativeView &#124; null, channel: string, payload: unknown): void { |
| [src/main/agent.ts:525](../src/main/agent.ts#L525) | safeSend(getWindow_, 'agent:event', { |
| [src/main/agent.ts:582](../src/main/agent.ts#L582) | safeSend(getWindow_, 'agent:event', { |
| [src/main/agent.ts:603](../src/main/agent.ts#L603) | safeSend(getWindow_, 'agent:event', { |
| [src/main/agent.ts:1135](../src/main/agent.ts#L1135) | safeSend(getWindow, 'agent:event', { |
| [src/main/agent.ts:1274](../src/main/agent.ts#L1274) | safeSend(getWindow, 'agent:event', { |
| [src/main/preview-ipc.ts:135](../src/main/preview-ipc.ts#L135) | view.webContents.send(opts.request, { id, ...payload }) |
| [src/main/preview-ipc.ts:236](../src/main/preview-ipc.ts#L236) | sendToMain('preview:element-picked', el) |
| [src/main/preview-ipc.ts:241](../src/main/preview-ipc.ts#L241) | sendToMain('preview:select-cancelled') |
| [src/main/preview-ipc.ts:249](../src/main/preview-ipc.ts#L249) | sendToMain('preview:toolbar-action', kind) |
| [src/main/preview-ipc.ts:259](../src/main/preview-ipc.ts#L259) | sendToMain('preview:toggle-select') |
| [src/main/preview-ipc.ts:321](../src/main/preview-ipc.ts#L321) | sendToMain('annotations:pin-click', id) |
| [src/main/preview-ipc.ts:328](../src/main/preview-ipc.ts#L328) | sendToMain('preview:readiness', info) |
| [src/main/preview-ipc.ts:334](../src/main/preview-ipc.ts#L334) | sendToMain('preview:text-edit', edit) |
| [src/main/preview-ipc.ts:347](../src/main/preview-ipc.ts#L347) | sendToMain('preview:comment-mode', mode) |
| [src/main/preview-ipc.ts:361](../src/main/preview-ipc.ts#L361) | sendToMain('preview:comment', payload) |
| [src/main/preview-ipc.ts:396](../src/main/preview-ipc.ts#L396) | sendToMain('layers:changed') |
| [src/main/preview-ipc.ts:402](../src/main/preview-ipc.ts#L402) | sendToMain('layers:move-request', req) |
