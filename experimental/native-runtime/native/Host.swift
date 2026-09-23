import AppKit
import WebKit

func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value), let text = String(data: data, encoding: .utf8) else { return }
    print(text); fflush(stdout)
}

final class Host: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var inspector: NSTextView!
    var selectButton: NSButton!
    var currentURL: URL!
    var selectionEnabled = true
    let world = WKContentWorld.world(name: "PraxisPreview")
    let script: String
    init(script: String) { self.script = script; super.init() }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, contentWorld: world, name: "selection")
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: world))
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.isInspectable = true
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1160, height: 800), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Praxis Runtime · Bun + WebKit"
        window.minSize = NSSize(width: 850, height: 500)
        let root = NSView()
        let toolbar = NSStackView(); toolbar.orientation = .horizontal; toolbar.spacing = 12; toolbar.edgeInsets = NSEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
        selectButton = NSButton(checkboxWithTitle: "Select", target: self, action: #selector(toggleSelection)); selectButton.state = .on
        toolbar.addArrangedSubview(selectButton)
        toolbar.addArrangedSubview(NSButton(title: "Reload", target: self, action: #selector(reload)))
        toolbar.addArrangedSubview(NSButton(title: "Capture preview", target: self, action: #selector(requestCapture)))
        toolbar.addArrangedSubview(NSTextField(labelWithString: "Escape stops selection · Bun owns the backend"))
        let split = NSSplitView(); split.isVertical = true; split.dividerStyle = .thin
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true
        inspector = NSTextView(); inspector.isEditable = false; inspector.font = .monospacedSystemFont(ofSize: 12, weight: .regular); inspector.textContainerInset = NSSize(width: 16, height: 20)
        inspector.string = "ELEMENT INSPECTOR\n\nSelect an element in the preview.\n\nProject content can send selection data only. It has no file or command access."
        scroll.documentView = inspector
        split.addArrangedSubview(scroll); split.addArrangedSubview(web)
        root.addSubview(toolbar); root.addSubview(split)
        for view in [toolbar, split] { view.translatesAutoresizingMaskIntoConstraints = false }
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: root.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: 52),
            split.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            split.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            split.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            split.bottomAnchor.constraint(equalTo: root.bottomAnchor)
        ])
        scroll.widthAnchor.constraint(greaterThanOrEqualToConstant: 240).isActive = true
        window.contentView = root; window.center(); window.makeKeyAndOrderFront(nil)
        split.setPosition(310, ofDividerAt: 0)
        NSApp.activate(ignoringOtherApps: true)
        let menu = NSMenu(); let appItem = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Praxis Runtime", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"); appItem.submenu = appMenu; menu.addItem(appItem); NSApp.mainMenu = menu
        DispatchQueue.global().async { [weak self] in
            while let line = readLine() {
                guard let data = line.data(using: .utf8), let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                DispatchQueue.main.async { self?.command(command) }
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
        emit(["event":"ready"])
    }
    @objc func toggleSelection() {
        selectionEnabled = selectButton.state == .on
        web.evaluateJavaScript("praxisPreview.setEnabled(\(selectionEnabled))", in: nil, in: world) { _ in }
    }
    @objc func reload() { web.reload() }
    @objc func requestCapture() { emit(["event":"captureRequested"]) }
    func command(_ c: [String: Any]) {
        let id = c["id"] as? Int ?? 0
        switch c["method"] as? String {
        case "load":
            guard let raw = c["url"] as? String, let url = URL(string: raw), ["http", "https"].contains(url.scheme ?? "") else { emit(["event":"error", "id":id,"message":"Expected HTTP URL"]); return }
            currentURL = url; web.load(URLRequest(url: url))
        case "inspect":
            guard let selector = c["selector"] as? String, let data = try? JSONSerialization.data(withJSONObject: [selector]), let json = String(data: data, encoding: .utf8) else { return }
            web.evaluateJavaScript("praxisPreview.select(\(json)[0])", in: nil, in: world) { result in
                if case .failure(let error) = result { emit(["event":"error","id":id,"message":error.localizedDescription]) }
            }
        case "capture":
            guard let path = c["path"] as? String else { return }
            web.takeSnapshot(with: nil) { image, error in
                do {
                    guard let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { throw error ?? NSError(domain: "Snapshot", code: 1) }
                    try png.write(to: URL(fileURLWithPath: path)); emit(["event":"captured","id":id,"path":path])
                } catch { emit(["event":"error","id":id,"message":error.localizedDescription]) }
            }
        case "probeIsolation":
            web.evaluateJavaScript("typeof globalThis.praxisPreview === 'undefined' && !(window.webkit?.messageHandlers?.selection)") { result, error in
                emit(["event":"isolation", "isolated":result as? Bool ?? false])
            }
        case "reload": web.reload()
        case "quit": NSApp.terminate(nil)
        default: emit(["event":"error","id":id,"message":"Unknown method"])
        }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let tag = body["tag"] as? String, tag.count < 100, let text = body["text"] as? String, text.count <= 500 else { return }
        if let data = try? JSONSerialization.data(withJSONObject: body, options: [.prettyPrinted, .sortedKeys]), data.count < 16384 {
            inspector.string = "SELECTED ELEMENT\n\n" + (String(data: data, encoding: .utf8) ?? "")
            emit(["event":"selection", "element":body])
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        web.evaluateJavaScript("praxisPreview.setEnabled(\(selectionEnabled))", in: nil, in: world) { _ in }
        emit(["event":"loaded","url":web.url?.absoluteString ?? ""])
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { emit(["event":"error","message":error.localizedDescription]) }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let base = currentURL, url.scheme == base.scheme, url.host == base.host, url.port == base.port else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

guard CommandLine.arguments.count == 2, let script = try? String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8) else { fatalError("Expected selection script path") }
let app = NSApplication.shared
let host = Host(script: script)
app.setActivationPolicy(.regular); app.delegate = host; app.run()
