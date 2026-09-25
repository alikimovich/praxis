import AppKit
import WebKit
import CryptoKit
import Security

func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data: data, encoding: .utf8) else { return }
    print(line); fflush(stdout)
}

// Synchronous secret helper used only by the backend's cipher. stdin/stdout carry
// bytes; no API key or encryption key is placed in a process argument or log.
if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--crypto" {
    do {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "dev.praxis.native.secrets", kSecAttrAccount as String: "master-key"]
        var read = query; read[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary, &item)
        var data = item as? Data
        if status == errSecItemNotFound && CommandLine.arguments[2] == "encrypt" {
            let bytes = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
            var create = query; create[kSecValueData as String] = bytes
            create[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(create as CFDictionary, nil) == errSecSuccess else { throw NSError(domain: "Keychain", code: 1) }
            data = bytes
        }
        guard let data = data, data.count == 32 else { throw NSError(domain: "Keychain", code: Int(status)) }
        let key = SymmetricKey(data: data)
        let input = FileHandle.standardInput.readDataToEndOfFile()
        let output: Data
        if CommandLine.arguments[2] == "encrypt" {
            output = try AES.GCM.seal(input, using: key).combined!
        } else { output = try AES.GCM.open(AES.GCM.SealedBox(combined: input), using: key) }
        FileHandle.standardOutput.write(output); exit(0)
    } catch { exit(1) }
}

final class Canvas: NSView { override var isFlipped: Bool { true } }
final class Host: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, WKURLSchemeHandler {
    var window: NSWindow!
    var shell: NativeShell!
    var composer: NativeComposer!
    var chat: NativeChat!
    var welcome: NativeWelcome!
    var chatDivider: NativeChatDivider!
    var previewSurface: PreviewSurface!
    let canvas = Canvas()
    var views: [String: WKWebView] = [:]
    var targets: [String: URL] = [:]
    var editorWindows: [String: NSWindow] = [:]
    var urlObservers: [String: NSKeyValueObservation] = [:]
    var preferences: [String: Any] = [:]
    func installPreferences(_ view: WKWebView) {
        guard let data = try? JSONSerialization.data(withJSONObject: preferences), let json = String(data: data, encoding: .utf8) else { return }
        let controller = view.configuration.userContentController
        controller.removeAllUserScripts()
        let preload = (try? String(contentsOfFile: directory + "/preload.js", encoding: .utf8)) ?? ""
        controller.addUserScript(WKUserScript(source: "globalThis.__praxisPreferences = " + json + ";", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(source: preload, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    var recentMenu = NSMenu(title: "Open Recent")
    var mediaTasks: [String: WKURLSchemeTask] = [:]
    let world = WKContentWorld.world(name: "PraxisPreview")
    let directory: String
    let ephemeral: Bool
    init(directory: String, ephemeral: Bool) { self.directory = directory; self.ephemeral = ephemeral; super.init() }
    func makeView(_ id: String) -> WKWebView {
        let config = WKWebViewConfiguration()
        let isolated = id == "preview"
        if isolated { PreviewInspector.enable(config.preferences) }
        config.websiteDataStore = isolated || ephemeral ? .nonPersistent() : .default()
        let contentWorld: WKContentWorld = isolated ? world : .page
        config.userContentController.add(self, contentWorld: contentWorld, name: "praxis")
        let file = directory + (isolated ? "/preview.js" : "/preload.js")
        let script = (try? String(contentsOfFile: file, encoding: .utf8)) ?? ""
        // Selection must intercept input before the project's capture listeners.
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: contentWorld))
        if !isolated { config.setURLSchemeHandler(self, forURLScheme: "praxis-media") }
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = self; view.uiDelegate = self; view.isInspectable = true
        if id != "preview" { view.underPageBackgroundColor = id == "main" ? .clear : .windowBackgroundColor }
        if id == "main" { view.setValue(false, forKey: "drawsBackground") }
        if !isolated { installPreferences(view) }
        views[id] = view; canvas.addSubview(view)
        urlObservers[id] = view.observe(\.url, options: [.new]) { view, _ in
            emit(["event":"url", "view":id, "url":view.url?.absoluteString ?? ""])
        }
        if id == "main" { view.frame = canvas.bounds; view.autoresizingMask = [.width, .height] }
        else { view.isHidden = true; view.wantsLayer = true }
        return view
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        if let path = Bundle.main.path(forResource: "Praxis", ofType: "icns"), let icon = NSImage(contentsOfFile: path) { NSApp.applicationIconImage = icon }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Praxis · Native"; window.minSize = NSSize(width: 850, height: 550)
        window.contentView = canvas; window.delegate = self
        _ = makeView("main"); _ = makeView("preview")
        shell = NativeShell(window: window, canvas: canvas)
        previewSurface = PreviewSurface(preview: views["preview"]!, canvas: canvas, container: canvas.superview!)
        previewSurface.colorChanged = { [weak self] color in self?.shell.updatePreviewColor(color) }
        shell.updatePreviewColor(views["preview"]!.underPageBackgroundColor)
        previewSurface.leading = { [weak self] in self?.shell.previewLeading ?? 0 }
        chat = NativeChat(); canvas.addSubview(chat)
        composer = NativeComposer(frame: .zero); canvas.addSubview(composer)
        chatDivider = NativeChatDivider(); chatDivider.isHidden = true; canvas.addSubview(chatDivider)
        chatDivider.changed = { width in emit(["event":"shell-action", "action":"chat-resize", "value":String(Double(width))]) }
        welcome = NativeWelcome(); welcome.frame = canvas.bounds; canvas.addSubview(welcome)
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        installMenus()
        DispatchQueue.global().async { [weak self] in
            while let line = readLine() {
                guard let data = line.data(using: .utf8), let c = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                DispatchQueue.main.async { self?.command(c) }
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
        emit(["event":"ready"])
    }
    func installMenus() {
        let menu = NSMenu()
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(); item.title = title; let sub = NSMenu(title: title); item.submenu = sub; menu.addItem(item); return sub
        }
        let appMenu = submenu("Praxis")
        let settings = NSMenuItem(title: "Settings…", action: #selector(menuAction(_:)), keyEquivalent: ","); settings.representedObject = "settings"; settings.target = self; appMenu.addItem(settings)
        appMenu.addItem(withTitle: "Quit Praxis", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let file = submenu("File")
        for (label, key, action) in [("New Project…", "n", "new-project"), ("Open Project…", "o", "open-project")] {
            let item = NSMenuItem(title: label, action: #selector(menuAction(_:)), keyEquivalent: key); item.target = self; item.representedObject = action; file.addItem(item)
        }
        let recent = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: ""); recent.submenu = recentMenu; file.addItem(recent)
        let edit = submenu("Edit")
        let undo = NSMenuItem(title: "Undo", action: #selector(menuAction(_:)), keyEquivalent: "z"); undo.target = self; undo.representedObject = "undo"; edit.addItem(undo)
        let redo = NSMenuItem(title: "Redo", action: #selector(menuAction(_:)), keyEquivalent: "z"); redo.target = self; redo.representedObject = "redo"; redo.keyEquivalentModifierMask = [.command, .shift]; edit.addItem(redo)
        for (label, key, selector) in [("Cut", "x", "cut:"), ("Copy", "c", "copy:"), ("Paste", "v", "paste:"), ("Select All", "a", "selectAll:")] {
            edit.addItem(withTitle: label, action: Selector(selector), keyEquivalent: key)
        }
        let actions = submenu("Actions")
        for (label, key, action) in [("Reload Preview", "r", "reload"), ("Toggle Logs", "l", "logs"), ("Toggle UI", ".", "toggle-chat")] {
            let item = NSMenuItem(title: label, action: #selector(menuAction(_:)), keyEquivalent: key); item.target = self; item.representedObject = action; actions.addItem(item)
        }
        let develop = submenu("Develop")
        for (title, key, action) in [("Show Preview Web Inspector", "i", "show"), ("Show Preview JavaScript Console", "c", "showConsole")] {
            let item = NSMenuItem(title: title, action: #selector(showPreviewInspector(_:)), keyEquivalent: key)
            item.target = self; item.representedObject = action; item.keyEquivalentModifierMask = [.command, .option]; develop.addItem(item)
        }
        NSApp.mainMenu = menu
    }
    @objc func menuAction(_ item: NSMenuItem) { emit(["event":"menu", "action":item.representedObject as? String ?? ""]) }
    @objc func recentAction(_ item: NSMenuItem) { emit(["event":"recent", "root":item.representedObject as? String ?? ""]) }
    func reply(_ id: Int, _ value: Any = NSNull(), error: String? = nil) {
        if let error = error { emit(["event":"reply", "id":id, "error":error]) }
        else { emit(["event":"reply", "id":id, "value":value]) }
    }
    func command(_ c: [String: Any]) {
        let id = c["id"] as? Int ?? 0
        let name = c["view"] as? String ?? "main"
        let view = views[name]
        switch c["method"] as? String {
        case "preferences":
            preferences = c["values"] as? [String: Any] ?? [:]
            for (key, view) in views where key != "preview" { installPreferences(view) }
        case "createPanel": if views["panel"] == nil { _ = makeView("panel") }
        case "previewInspector":
            if let action = c["action"] as? String { reply(id, PreviewInspector.perform(action, on: views["preview"])) }
            else { reply(id, PreviewInspector.status(views["preview"])) }
        case "chatState":
            let state = c["state"] as? [String: Any] ?? [:]
            chat.update(state, composer: composer); chatDivider.update(state)
        case "welcomeInspect": reply(id, welcome.inspect())
        case "dividerInspect": reply(id, ["visible":!chatDivider.isHidden, "width":chatDivider.width, "dragging":chatDivider.dragging, "frame":NSStringFromRect(chatDivider.frame), "hitTarget":canvas.hitTest(NSPoint(x: chatDivider.frame.midX, y: chatDivider.frame.midY)) === chatDivider])
        case "dividerPerform":
            guard ephemeral else { reply(id, false); return }
            chatDivider.begin(at: .zero)
            chatDivider.drag(to: NSPoint(x: (c["delta"] as? Double ?? 0), y: 0)); chatDivider.end()
            reply(id, true)
        case "chatInspect": reply(id, chat.inspect())
        case "chatPerform": chat.model.action(c["action"] as? String ?? "", id: c["card"] as? String, value: c["value"] as? String, answers: c["answers"] as? [String: String]); reply(id)
        case "composerState": composer.update(c["state"] as? [String: Any] ?? [:])
        case "composerInspect": reply(id, composer.inspect())
        case "composerPerform": composer.perform(c); reply(id)
        case "composerFocus": window.makeFirstResponder(composer.text)
        case "captureComposer":
            composer.layoutSubtreeIfNeeded()
            let target: NSView = c["contentOnly"] as? Bool == true ? composer.content : composer
            guard let bitmap = target.bitmapImageRepForCachingDisplay(in: target.bounds) else { reply(id, error: "Composer capture unavailable"); return }
            target.cacheDisplay(in: target.bounds, to: bitmap)
            reply(id, bitmap.representation(using: .png, properties: [:])?.base64EncodedString() ?? "")
        case "shellState":
            let state = c["state"] as? [String: Any] ?? [:]
            shell.update(state)
            if let home = state["homeState"] as? [String: Any] { welcome.update(home) }
        case "shellInspect": reply(id, shell.inspect())
        case "previewSurfaceInspect": reply(id, previewSurface.inspect())
        case "shellPerform": reply(id, shell.perform(c["action"] as? String ?? "", id: c["row"] as? String))
        case "captureShell":
            let content = window.contentView?.superview ?? shell.split.view
            guard let bitmap = content.bitmapImageRepForCachingDisplay(in: content.bounds) else { reply(id, error: "Shell capture unavailable"); return }
            content.cacheDisplay(in: content.bounds, to: bitmap)
            reply(id, bitmap.representation(using: .png, properties: [:])?.base64EncodedString() ?? "")
        case "captureSidebar":
            shell.split.view.layoutSubtreeIfNeeded()
            let content = shell.sidebar.view
            guard let bitmap = content.bitmapImageRepForCachingDisplay(in: content.bounds) else { reply(id, error: "Sidebar capture unavailable"); return }
            content.cacheDisplay(in: content.bounds, to: bitmap)
            // Source-list materials are transparent when cached offscreen. Render
            // the cached native cells over the system background for readable QA.
            let image = NSImage(size: content.bounds.size); image.lockFocus()
            NSColor.windowBackgroundColor.setFill(); NSRect(origin: .zero, size: content.bounds.size).fill()
            let cells = NSImage(size: content.bounds.size); cells.addRepresentation(bitmap)
            cells.draw(in: NSRect(origin: .zero, size: content.bounds.size), from: .zero, operation: .sourceOver, fraction: 1)
            image.unlockFocus()
            let png = image.tiffRepresentation.flatMap { NSBitmapImageRep(data: $0)?.representation(using: .png, properties: [:]) }
            reply(id, png?.base64EncodedString() ?? "")
        case "editor":
            let editor = editorWindows[name] ?? NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            if editorWindows[name] == nil {
                let content = makeView(name); content.removeFromSuperview(); content.isHidden = false
                editor.contentView = content; editor.delegate = self; editor.isReleasedWhenClosed = false
                editor.title = "Praxis · Code"; editor.center(); editorWindows[name] = editor
            }
            editor.makeKeyAndOrderFront(nil); reply(id)
        case "closeEditor": editorWindows[name]?.close()
        case "recents":
            recentMenu.removeAllItems()
            for entry in (c["recents"] as? [[String: String]] ?? []).prefix(8) {
                guard let root = entry["root"], let title = entry["name"] else { continue }
                let item = NSMenuItem(title: title, action: #selector(recentAction(_:)), keyEquivalent: ""); item.representedObject = root; item.target = self; recentMenu.addItem(item)
            }
        case "load":
            guard let raw = c["url"] as? String, let url = URL(string: raw), let view = view else { return }
            targets[name] = url
            view.load(URLRequest(url: url))
        case "bounds":
            guard let b = c["bounds"] as? [String: Double], let view = view else { return }
            let values = [b["x"] ?? 0, b["y"] ?? 0, b["width"] ?? 0, b["height"] ?? 0]
            guard values.allSatisfy({ $0.isFinite && abs($0) < 100000 }) else { return }
            view.frame = NSRect(x: values[0], y: values[1], width: max(0, values[2]), height: max(0, values[3]))
        case "visible": view?.isHidden = !(c["visible"] as? Bool ?? false)
        case "radius":
            let radius = CGFloat(c["radius"] as? Double ?? 0)
            view?.layer?.cornerRadius = radius; view?.layer?.masksToBounds = true
            if name == "preview" { view?.autoresizingMask = radius == 0 && view?.frame.isEmpty == false ? [.width, .height] : []; previewSurface.needsDisplay = true }
        case "deliver":
            guard let message = c["message"], let data = try? JSONSerialization.data(withJSONObject: message), let json = String(data: data, encoding: .utf8) else { return }
            view?.evaluateJavaScript("globalThis.__praxisNativeDispatch?.(\(json))", in: nil, in: name == "preview" ? world : .page) { _ in }
        case "evaluate":
            guard let view = view, let code = c["code"] as? String else { reply(id, error: "Missing evaluation target"); return }
            view.callAsyncJavaScript("return JSON.stringify((await (\(code))) ?? null) ?? 'null';", arguments: [:], in: nil, in: c["isolated"] as? Bool == true ? world : .page) { result in
                switch result {
                case .success(let value):
                    guard let json = value as? String, let data = json.data(using: .utf8), let decoded = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { self.reply(id, error: "Invalid JSON evaluation result"); return }
                    self.reply(id, decoded)
                case .failure(let error): self.reply(id, error: (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription)
                }
            }
        case "previewInput":
            guard ephemeral, let preview = views["preview"] else { reply(id, error: "Test preview unavailable"); return }
            if let key = c["key"] as? String {
                let code: UInt16 = key == "ArrowRight" ? 124 : key == "Escape" ? 53 : key == "Enter" ? 36 : 0
                let chars = key == "ArrowRight" ? "\u{F703}" : key == "Escape" ? "\u{1B}" : key == "Enter" ? "\r" : key
                for type in [NSEvent.EventType.keyDown, .keyUp] {
                    if let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, characters: chars, charactersIgnoringModifiers: chars, isARepeat: false, keyCode: code) { window.sendEvent(event) }
                }
            } else {
                let y = c["y"] as? Double ?? 20
                let point = preview.convert(NSPoint(x: c["x"] as? Double ?? 20, y: preview.isFlipped ? y : preview.bounds.height - y), to: nil)
                for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
                    if let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: c["clicks"] as? Int ?? 1, pressure: 1) { window.sendEvent(event) }
                }
            }
            reply(id)
        case "capture":
            view?.takeSnapshot(with: nil) { image, error in
                guard let image = image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { self.reply(id, error: error?.localizedDescription ?? "Snapshot unavailable"); return }
                let width = min(900, image.size.width), height = image.size.height * width / image.size.width
                let small = NSImage(size: NSSize(width: width, height: height)); small.lockFocus(); image.draw(in: NSRect(x: 0, y: 0, width: width, height: height)); small.unlockFocus()
                let jpeg = small.tiffRepresentation.flatMap { NSBitmapImageRep(data: $0)?.representation(using: .jpeg, properties: [.compressionFactor: 0.65]) } ?? Data()
                self.reply(id, ["png":png.base64EncodedString(), "jpeg":jpeg.base64EncodedString(), "width":bitmap.pixelsWide, "height":bitmap.pixelsHigh])
            }
        case "pick", "pickNew":
            if c["method"] as? String == "pick" {
                let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = false
                panel.beginSheetModal(for: window) { result in self.reply(id, result == .OK ? panel.url?.path as Any? ?? NSNull() : NSNull()) }
            } else {
                let panel = NSSavePanel(); panel.nameFieldStringValue = "my-app"; panel.canCreateDirectories = true
                panel.beginSheetModal(for: window) { result in self.reply(id, result == .OK ? panel.url?.path as Any? ?? NSNull() : NSNull()) }
            }
        case "trash":
            do { try FileManager.default.trashItem(at: URL(fileURLWithPath: c["path"] as? String ?? ""), resultingItemURL: nil); reply(id) }
            catch { reply(id, error: error.localizedDescription) }
        case "fullscreen": reply(id, window.styleMask.contains(.fullScreen))
        case "nativeEdit": NSApp.sendAction(Selector((c["action"] as? String ?? "undo") + ":"), to: nil, from: nil)
        case "mediaReply":
            guard let key = c["task"] as? String, let task = mediaTasks.removeValue(forKey: key), let url = task.request.url else { return }
            let data = Data(base64Encoded: c["data"] as? String ?? "") ?? Data()
            task.didReceive(HTTPURLResponse(url: url, statusCode: c["status"] as? Int ?? 500, httpVersion: "HTTP/1.1", headerFields: c["headers"] as? [String: String])!)
            task.didReceive(data); task.didFinish()
        case "quit": NSApp.terminate(nil)
        default: reply(id, error: "Unsupported native host command")
        }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let name = views.first(where: { $0.value === message.webView })?.key,
              let body = message.body as? [String: Any], let data = try? JSONSerialization.data(withJSONObject: body), data.count <= 16 * 1024 * 1024 else { return }
        // Source identity is supplied by the host, never by page-controlled JSON.
        emit(["event":"ipc", "view":name, "message":body])
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let name = views.first(where: { $0.value === webView })?.key else { return }
        emit(["event":"loaded", "view":name, "url":webView.url?.absoluteString ?? ""])
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        emit(["event":"load-error", "view":views.first(where: { $0.value === webView })?.key ?? "", "message":error.localizedDescription])
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let name = views.first(where: { $0.value === webView })?.key, let target = targets[name], let url = action.request.url else { decisionHandler(.cancel); return }
        // The app shell stays on its own URL. The preview's main frame stays on
        // its exact assigned origin; subframes never receive a privileged bridge.
        if action.targetFrame?.isMainFrame == false { decisionHandler(name == "preview" ? .allow : .cancel); return }
        let sameOrigin = url.scheme == target.scheme && url.host == target.host && url.port == target.port
        let allowed = name == "preview" ? (sameOrigin || url.absoluteString == "about:blank") : (sameOrigin && url.path == target.path)
        if allowed && action.targetFrame != nil { decisionHandler(.allow) }
        else {
            if name != "preview" && ["https", "http"].contains(url.scheme ?? "") { emit(["event":"external", "url":url.absoluteString]) }
            decisionHandler(.cancel)
        }
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let key = UUID().uuidString; mediaTasks[key] = urlSchemeTask
        emit(["event":"media", "task":key, "url":urlSchemeTask.request.url!.absoluteString, "headers":urlSchemeTask.request.allHTTPHeaderFields ?? [:]])
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) { for (key, task) in mediaTasks where task === urlSchemeTask { mediaTasks.removeValue(forKey: key) } }
    func windowDidEnterFullScreen(_ notification: Notification) { emit(["event":"fullscreen", "value":true]) }
    func windowDidExitFullScreen(_ notification: Notification) { emit(["event":"fullscreen", "value":false]) }
    func windowWillClose(_ notification: Notification) {
        if let closed = notification.object as? NSWindow, closed === window { NSApp.terminate(nil); return }
        if let key = editorWindows.first(where: { $0.value === notification.object as? NSWindow })?.key {
            editorWindows.removeValue(forKey: key); views.removeValue(forKey: key); targets.removeValue(forKey: key); urlObservers.removeValue(forKey: key)
            emit(["event":"view-closed", "view":key])
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
guard CommandLine.arguments.count >= 3 else { fatalError("Launch through bun run dev:native") }
let application = NSApplication.shared
let host = Host(directory: CommandLine.arguments[1], ephemeral: CommandLine.arguments[2] == "ephemeral")
application.setActivationPolicy(.regular); application.delegate = host; application.run()
