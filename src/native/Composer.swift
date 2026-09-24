import AppKit
import UniformTypeIdentifiers

final class ComposerTextView: NSTextView {
    var pasteFiles: ((NSPasteboard) -> Bool)?
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if string.isEmpty && !hasMarkedText() {
            ("Ask Praxis  (/ for skills)" as NSString).draw(at: NSPoint(x: 7, y: 4), withAttributes: [.font:font ?? NSFont.systemFont(ofSize: 14), .foregroundColor:NSColor.placeholderTextColor])
        }
    }
    override func paste(_ sender: Any?) {
        if pasteFiles?(NSPasteboard.general) == true { return }
        super.paste(sender)
    }
    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        if pasteFiles?(sender.draggingPasteboard) == true { return true }
        return super.performDragOperation(sender)
    }
}

/// Uses Apple's Liquid Glass directly; no custom blur, gradient or glass shader.
final class NativeComposer: NSView, NSTextViewDelegate {
    let text = ComposerTextView()
    let content = NSView()
    let scroll = NSScrollView()
    let sendButton = NSButton()
    let plus = NSPopUpButton(frame: .zero, pullsDown: true)
    let chips = NSStackView()
    let context = NSButton()
    let attachments = NSPopUpButton(frame: .zero, pullsDown: true)
    let suggestions = NSPopUpButton(frame: .zero, pullsDown: true)
    var pickers: [String: NSPopUpButton] = [:]
    var state: [String: Any] = [:]
    var chat = ""
    var revision = 0
    var applying = false
    var glass = false
    var choicesSignature = Data()

    override init(frame: NSRect) {
        super.init(frame: frame)
        let backdrop: NSView
        if #available(macOS 26.0, *) {
            let effect = NSGlassEffectView(); effect.style = .regular
            effect.cornerRadius = 24; effect.contentView = content
            content.frame = effect.bounds; content.autoresizingMask = [.width, .height]
            backdrop = effect; glass = true
        } else {
            let effect = NSVisualEffectView(); effect.material = .popover
            effect.blendingMode = .withinWindow; effect.state = .followsWindowActiveState
            effect.wantsLayer = true; effect.layer?.cornerRadius = 24; effect.layer?.masksToBounds = true
            effect.addSubview(content); content.frame = effect.bounds; content.autoresizingMask = [.width, .height]
            backdrop = effect
        }
        backdrop.frame = bounds; backdrop.autoresizingMask = [.width, .height]; addSubview(backdrop)
        text.isRichText = false; text.allowsUndo = true; text.importsGraphics = false; text.drawsBackground = false
        text.font = .systemFont(ofSize: 14); text.textColor = .labelColor; text.insertionPointColor = .labelColor
        text.textContainerInset = NSSize(width: 2, height: 4)
        text.isVerticallyResizable = true; text.isHorizontallyResizable = false
        text.frame = NSRect(x: 0, y: 0, width: 400, height: 70)
        text.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        text.autoresizingMask = [.width]; text.textContainer?.widthTracksTextView = true
        text.textContainer?.containerSize = NSSize(width: 400, height: CGFloat.greatestFiniteMagnitude)
        text.delegate = self; text.setAccessibilityLabel("Message to Praxis")
        text.registerForDraggedTypes([.fileURL, .png, .tiff])
        text.pasteFiles = { [weak self] board in self?.readPasteboard(board) ?? false }
        scroll.documentView = text; scroll.drawsBackground = false; scroll.hasVerticalScroller = true
        scroll.borderType = .noBorder
        let controls = NSStackView(); controls.orientation = .horizontal; controls.spacing = 4
        plus.addItem(withTitle: ""); plus.image = NSImage(systemSymbolName: "plus", accessibilityDescription: "Attach or select")
        plus.bezelStyle = .roundRect; plus.setAccessibilityLabel("Attachments and tools")
        for (title, action) in [("Attach Files…", "attach"), ("Select Element", "select"), ("Show Layers", "layers")] {
            let item = NSMenuItem(title: title, action: #selector(menuAction(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = ["action":action]; plus.menu?.addItem(item)
        }
        controls.addArrangedSubview(plus)
        for label in ["Provider", "Model", "Permission mode"] {
            let picker = NSPopUpButton(frame: .zero, pullsDown: false)
            picker.menu?.autoenablesItems = false
            picker.controlSize = .small; picker.font = .systemFont(ofSize: 11)
            picker.setAccessibilityLabel(label); picker.target = self; picker.action = #selector(pick(_:))
            picker.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            picker.addItem(withTitle: label); pickers[label] = picker; controls.addArrangedSubview(picker)
            picker.widthAnchor.constraint(greaterThanOrEqualToConstant: 35).isActive = true
        }
        sendButton.bezelStyle = .circular; sendButton.isBordered = true
        sendButton.target = self; sendButton.action = #selector(send(_:))
        controls.addArrangedSubview(sendButton)
        for button in [plus, sendButton] { button.widthAnchor.constraint(equalToConstant: 30).isActive = true }
        chips.orientation = .horizontal; chips.spacing = 4
        context.bezelStyle = .roundRect; context.controlSize = .small; context.lineBreakMode = .byTruncatingTail
        context.target = self; context.action = #selector(clearContext(_:))
        context.widthAnchor.constraint(lessThanOrEqualToConstant: 160).isActive = true
        chips.addArrangedSubview(context); chips.addArrangedSubview(attachments); chips.addArrangedSubview(suggestions)
        attachments.controlSize = .small; suggestions.controlSize = .small
        for view in [chips, scroll, controls] { view.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(view) }
        NSLayoutConstraint.activate([
            chips.topAnchor.constraint(equalTo: content.topAnchor, constant: 10), chips.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12), chips.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor, constant: -12), chips.heightAnchor.constraint(equalToConstant: 22),
            scroll.topAnchor.constraint(equalTo: chips.bottomAnchor, constant: 4), scroll.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12), scroll.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12), scroll.bottomAnchor.constraint(equalTo: controls.topAnchor, constant: -5),
            controls.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 10), controls.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -10), controls.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -10), controls.heightAnchor.constraint(equalToConstant: 30)
        ])
        isHidden = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func emitAction(_ action: String, _ extra: [String: Any] = [:]) {
        var message = extra; message["event"] = "composer-action"; message["action"] = action; message["chat"] = chat
        emit(message)
    }
    func textDidChange(_ notification: Notification) { changed() }
    func textViewDidChangeSelection(_ notification: Notification) { if !text.hasMarkedText() { changed() } }
    func changed() {
        guard !applying, !chat.isEmpty else { return }
        revision += 1
        emitAction("input", ["text":text.string, "caret":text.selectedRange().location, "revision":revision])
    }
    func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        if text.hasMarkedText() { return false }
        let commands = ["insertNewline:":"Enter", "insertTab:":"Tab", "moveUp:":"ArrowUp", "moveDown:":"ArrowDown", "cancelOperation:":"Escape"]
        guard let key = commands[NSStringFromSelector(selector)] else { return false }
        let hasSuggestions = !(state["suggestions"] as? [Any] ?? []).isEmpty
        if key == "Enter" && !(NSApp.currentEvent?.modifierFlags.contains(.shift) ?? false) || hasSuggestions {
            emitAction("key", ["key":key]); return true
        }
        return false
    }
    @objc func send(_ sender: Any?) { if sendButton.isEnabled { emitAction("send") } }
    @objc func clearContext(_ sender: Any?) { emitAction("context") }
    @objc func pick(_ sender: NSPopUpButton) {
        guard let label = pickers.first(where: { $0.value === sender })?.key,
              let value = sender.selectedItem?.representedObject as? String else { return }
        emitAction("choice", ["label":label, "value":value])
    }
    @objc func menuAction(_ item: NSMenuItem) {
        guard let value = item.representedObject as? [String: Any], let action = value["action"] as? String else { return }
        if action == "attach" {
            let panel = NSOpenPanel(); panel.allowsMultipleSelection = true; panel.canChooseDirectories = false
            guard let window = window else { return }
            panel.beginSheetModal(for: window) { [weak self] result in if result == .OK { self?.attach(panel.urls) } }
        } else if action == "select" { emit(["event":"menu", "action":"select"]) }
        else { emitAction(action, value) }
    }
    func attach(_ urls: [URL]) {
        var files: [[String: String]] = []
        for url in urls {
            let type = UTType(filenameExtension: url.pathExtension)
            let image = type?.conforms(to: .image) ?? false
            if image {
                guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 10 * 1024 * 1024,
                      let data = try? Data(contentsOf: url) else { continue }
                files.append(["path":url.path, "name":url.lastPathComponent, "type":type?.preferredMIMEType ?? "image/png", "data":data.base64EncodedString()])
            } else { files.append(["path":url.path, "name":url.lastPathComponent, "type":"application/octet-stream", "data":""]) }
        }
        for file in files { emitAction("files", ["files":[file]]) }
    }
    func readPasteboard(_ board: NSPasteboard) -> Bool {
        if let urls = board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly:true]) as? [URL], !urls.isEmpty { attach(urls); return true }
        let data = board.data(forType: .png) ?? board.data(forType: .tiff).flatMap { NSBitmapImageRep(data: $0)?.representation(using: .png, properties: [:]) }
        if let data = data, data.count <= 10 * 1024 * 1024 {
            emitAction("files", ["files":[["name":"Pasted image.png", "path":"", "type":"image/png", "data":data.base64EncodedString()]]]); return true
        }
        return false
    }
    func update(_ next: [String: Any]) {
        applying = true; defer { applying = false }
        state = next; isHidden = !(next["visible"] as? Bool ?? false)
        if let b = next["bounds"] as? [String: Double], let x = b["x"], let y = b["y"], let width = b["width"], let height = b["height"], [x,y,width,height].allSatisfy({ $0.isFinite && abs($0) < 100000 }) {
            frame = NSRect(x: x, y: y, width: max(0, width), height: max(0, height))
        }
        let nextChat = next["chat"] as? String ?? ""
        if chat != nextChat { text.undoManager?.removeAllActions(); chat = nextChat; revision = 0 }
        if (next["revision"] as? Int ?? 0) >= revision && !text.hasMarkedText() {
            let value = next["text"] as? String ?? ""
            if text.string != value {
                text.string = value
                let cursor = min((value as NSString).length, next["caret"] as? Int ?? (value as NSString).length)
                text.setSelectedRange(NSRange(location: cursor, length: 0))
            }
        }
        sendButton.isEnabled = next["enabled"] as? Bool ?? false
        let stop = next["stop"] as? Bool ?? false
        sendButton.image = NSImage(systemSymbolName: stop ? "stop.fill" : "arrow.up", accessibilityDescription: next["sendLabel"] as? String)
        sendButton.setAccessibilityLabel(next["sendLabel"] as? String ?? "Send")
        let choices = next["choices"] as? [[String: Any]] ?? []
        let signature = (try? JSONSerialization.data(withJSONObject: choices, options: [.sortedKeys])) ?? Data()
        if signature != choicesSignature {
        choicesSignature = signature
        for choice in choices {
            guard let label = choice["label"] as? String, let picker = pickers[label] else { continue }
            picker.removeAllItems()
            for option in choice["options"] as? [[String: Any]] ?? [] {
                picker.addItem(withTitle: option["label"] as? String ?? "")
                picker.lastItem?.representedObject = option["value"] as? String
                picker.lastItem?.isEnabled = !(option["disabled"] as? Bool ?? false)
                if option["value"] as? String == choice["value"] as? String { picker.select(picker.lastItem) }
            }
            picker.isEnabled = !(choice["disabled"] as? Bool ?? false)
            picker.toolTip = picker.titleOfSelectedItem
        }
        }
        let selected = next["context"] as? String ?? ""
        context.isHidden = selected.isEmpty; context.title = selected; context.toolTip = "Clear selected element: " + selected
        configure(attachments, title: "Attachments", entries: (next["attachments"] as? [String] ?? []).enumerated().map { ($0.element, ["action":"remove", "index":$0.offset]) })
        configure(suggestions, title: "Skills / commands", entries: (next["suggestions"] as? [[String: Any]] ?? []).enumerated().map { ($0.element["title"] as? String ?? "", ["action":"suggestion", "index":$0.offset]) })
    }
    func configure(_ popup: NSPopUpButton, title: String, entries: [(String, [String: Any])]) {
        popup.isHidden = entries.isEmpty; popup.removeAllItems(); popup.addItem(withTitle: title)
        for (label, payload) in entries {
            let item = NSMenuItem(title: label, action: #selector(menuAction(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = payload; popup.menu?.addItem(item)
        }
    }
    func inspect() -> [String: Any] { layoutSubtreeIfNeeded(); return ["contentWidth":content.bounds.width, "inputHeight":scroll.bounds.height, "sendWidth":sendButton.bounds.width, "visible":!isHidden, "glass":glass, "text":text.string, "chat":chat, "enabled":sendButton.isEnabled, "revision":revision, "choices":state["choices"] ?? [], "attachments":state["attachments"] ?? [], "bounds":["x":frame.minX,"y":frame.minY,"width":frame.width,"height":frame.height]] }
    func perform(_ c: [String: Any]) {
        if let value = c["text"] as? String { text.string = value; text.setSelectedRange(NSRange(location: (value as NSString).length, length: 0)); changed() }
        if c["action"] as? String == "send" { send(nil) }
        if let key = c["key"] as? String { emitAction("key", ["key":key]) }
        if let label = c["label"] as? String, let value = c["value"] as? String, let picker = pickers[label], picker.isEnabled,
           let item = picker.itemArray.first(where: { $0.representedObject as? String == value }) { picker.select(item); pick(picker) }
        if let paths = c["files"] as? [String] { attach(paths.map { URL(fileURLWithPath: $0) }) }
        if let index = c["remove"] as? Int { emitAction("remove", ["index":index]) }
    }
}
