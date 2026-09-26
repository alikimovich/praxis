import AppKit
import AVKit

final class SourceTextView: NSTextView {
    var save: (() -> Void)?
    var component: ((String) -> Void)?
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "s" { save?(); return true }
        return super.performKeyEquivalent(with: event)
    }
    override func mouseDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command) {
            let point = convert(event.locationInWindow, from: nil)
            let position = characterIndexForInsertion(at: point)
            let text = string as NSString
            if let regex = try? NSRegularExpression(pattern: "[A-Za-z_$][A-Za-z0-9_$]*") {
                let range = NSRange(location: 0, length: text.length)
                if let match = regex.matches(in: string, range: range).first(where: { NSLocationInRange(position, $0.range) }) { component?(text.substring(with: match.range)); return }
            }
        }
        super.mouseDown(with: event)
    }
}

final class SourceLineRuler: NSRulerView {
    weak var text: NSTextView?
    init(scroll: NSScrollView, text: NSTextView) { self.text = text; super.init(scrollView: scroll, orientation: .verticalRuler); clientView = text; ruleThickness = 48 }
    required init(coder: NSCoder) { fatalError() }
    override func drawHashMarksAndLabels(in rect: NSRect) {
        guard let text, let manager = text.layoutManager, let container = text.textContainer else { return }
        NSColor.controlBackgroundColor.setFill(); bounds.fill()
        guard manager.numberOfGlyphs > 0 else { return }
        let ns = text.string as NSString
        let visible = text.visibleRect
        let glyphs = manager.glyphRange(forBoundingRect: visible, in: container)
        let start = manager.characterIndexForGlyph(at: min(glyphs.location, max(0, manager.numberOfGlyphs - 1)))
        var line = ns.substring(to: min(start, ns.length)).filter { $0 == "\n" }.count + 1
        var position = start
        while position < ns.length {
            let range = ns.lineRange(for: NSRange(location: position, length: 0))
            let glyph = manager.glyphIndexForCharacter(at: range.location)
            let frame = manager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
            if frame.minY > visible.maxY { break }
            let label = "\(line)" as NSString
            label.draw(at: NSPoint(x: 6, y: frame.minY + text.textContainerOrigin.y - visible.minY), withAttributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular), .foregroundColor: NSColor.secondaryLabelColor])
            position = NSMaxRange(range); line += 1
        }
    }
}

final class NativeSourceEditor: NSView, NSTextViewDelegate, NSSearchFieldDelegate, NSWindowDelegate {
    var root = "", source = "", revision = 0, state: [String: Any] = [:]
    var files: [String] = [], filtered: [String] = []
    let code = SourceTextView(), scroll = NSScrollView(), tree = SourceFileTree(), search = NSSearchField()
    let status = NSTextField(labelWithString: ""), filename = NSTextField(labelWithString: "")
    let image = NSImageView(), player = AVPlayerView(), binary = NSTextField(labelWithString: "")
    var popout: NSWindow?, updating = false
    var highlightWork: DispatchWorkItem?
    var dock: (() -> Void)?
    var controls: [String: NSButton] = [:]
    var documentKey = "", reveal = -1
    init() {
        super.init(frame: .zero); wantsLayer = true; layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        let header = NSStackView(); header.orientation = .horizontal; header.spacing = 6
        filename.lineBreakMode = .byTruncatingMiddle; filename.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        header.addArrangedSubview(filename)
        for (name, label) in [("back", "←"), ("forward", "→"), ("save", "Save"), ("reload", "Reload"), ("external", "Open in Editor"), ("popout", "Pop Out"), ("hide", "Close")] {
            let button = NSButton(title: label, target: self, action: #selector(buttonAction(_:))); button.identifier = NSUserInterfaceItemIdentifier(name); button.controlSize = .small; header.addArrangedSubview(button); controls[name] = button
        }
        let split = NSSplitView(); split.isVertical = true; split.dividerStyle = .thin
        let sidebar = NSView(), content = NSView(); split.addArrangedSubview(sidebar); split.addArrangedSubview(content)
        search.placeholderString = "Filter files"; search.delegate = self
        let treeScroll = NSScrollView(); treeScroll.hasVerticalScroller = true; treeScroll.autohidesScrollers = true
        tree.open = { [weak self] source in self?.send("open", ["source":source]) }
        treeScroll.documentView = tree
        let operations = NSStackView(); operations.spacing = 6
        for (name, label) in [("create", "+"), ("rename", "Rename"), ("delete", "Trash")] { let b = NSButton(title: label, target: self, action: #selector(buttonAction(_:))); b.identifier = NSUserInterfaceItemIdentifier(name); b.controlSize = .small; operations.addArrangedSubview(b) }
        scroll.hasVerticalScroller = true; scroll.hasHorizontalScroller = true; scroll.autohidesScrollers = true
        code.isRichText = false; code.isEditable = true; code.isSelectable = true; code.allowsUndo = true; code.usesFindBar = true; code.isIncrementalSearchingEnabled = true
        code.isAutomaticQuoteSubstitutionEnabled = false; code.isAutomaticDashSubstitutionEnabled = false; code.isAutomaticTextReplacementEnabled = false; code.isAutomaticSpellingCorrectionEnabled = false
        code.font = .monospacedSystemFont(ofSize: 12, weight: .regular); code.textColor = .labelColor; code.textContainerInset = NSSize(width: 8, height: 10)
        code.minSize = NSSize(width: 0, height: 0); code.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        code.isVerticallyResizable = true; code.isHorizontallyResizable = false; code.autoresizingMask = [.width]; code.textContainer?.widthTracksTextView = true
        code.layoutManager?.allowsNonContiguousLayout = true
        code.delegate = self; scroll.documentView = code
        scroll.verticalRulerView = SourceLineRuler(scroll: scroll, text: code); scroll.hasVerticalRuler = true; scroll.rulersVisible = true
        code.save = { [weak self] in self?.send("save") }; code.component = { [weak self] name in self?.send("component", ["name":name]) }
        image.imageScaling = .scaleProportionallyUpOrDown
        binary.alignment = .center; binary.textColor = .secondaryLabelColor
        status.lineBreakMode = .byTruncatingMiddle; status.font = .systemFont(ofSize: 11); status.textColor = .secondaryLabelColor
        for view in [header, split, status] { view.translatesAutoresizingMaskIntoConstraints = false; addSubview(view) }
        for view in [search, treeScroll, operations] { view.translatesAutoresizingMaskIntoConstraints = false; sidebar.addSubview(view) }
        for view in [scroll, image, player, binary] { view.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(view); NSLayoutConstraint.activate([view.leadingAnchor.constraint(equalTo: content.leadingAnchor), view.trailingAnchor.constraint(equalTo: content.trailingAnchor), view.topAnchor.constraint(equalTo: content.topAnchor), view.bottomAnchor.constraint(equalTo: content.bottomAnchor)]) }
        NSLayoutConstraint.activate([
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10), header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10), header.topAnchor.constraint(equalTo: topAnchor, constant: 6), header.heightAnchor.constraint(equalToConstant: 28),
            split.leadingAnchor.constraint(equalTo: leadingAnchor), split.trailingAnchor.constraint(equalTo: trailingAnchor), split.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 6), split.bottomAnchor.constraint(equalTo: status.topAnchor, constant: -4),
            status.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10), status.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10), status.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -5), status.heightAnchor.constraint(equalToConstant: 16),
            sidebar.widthAnchor.constraint(greaterThanOrEqualToConstant: 180), sidebar.widthAnchor.constraint(lessThanOrEqualToConstant: 360),
            search.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor, constant: 6), search.trailingAnchor.constraint(equalTo: sidebar.trailingAnchor, constant: -6), search.topAnchor.constraint(equalTo: sidebar.topAnchor, constant: 4),
            treeScroll.topAnchor.constraint(equalTo: search.bottomAnchor, constant: 4), treeScroll.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor), treeScroll.trailingAnchor.constraint(equalTo: sidebar.trailingAnchor), treeScroll.bottomAnchor.constraint(equalTo: operations.topAnchor, constant: -4),
            operations.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor, constant: 6), operations.bottomAnchor.constraint(equalTo: sidebar.bottomAnchor, constant: -4)
        ])
        split.setPosition(210, ofDividerAt: 0)
    }
    required init?(coder: NSCoder) { fatalError() }
    func send(_ action: String, _ extra: [String: Any] = [:]) { var payload: [String: Any] = ["event":"source-action", "root":root, "action":action, "source":source]; payload.merge(extra) { _, new in new }; emit(payload) }
    @objc func buttonAction(_ sender: NSButton) {
        let action = sender.identifier?.rawValue ?? ""
        if action == "popout" { send(state["popped"] as? Bool == true ? "dock" : "popout"); return }
        if action == "reload" && state["dirty"] as? Bool == true || action == "delete" {
            let alert = NSAlert(); alert.messageText = action == "delete" ? "Move this file to Trash?" : "Discard unsaved changes?"; alert.informativeText = action == "delete" ? source : "Reload \(source) from disk. Your unsaved edits will be lost."; alert.addButton(withTitle: action == "delete" ? "Move to Trash" : "Discard and reload"); alert.addButton(withTitle: "Cancel")
            guard let window else { return }; alert.beginSheetModal(for: window) { [weak self] response in if response == .alertFirstButtonReturn { self?.send(action) } }; return
        }
        if action == "create" || action == "rename" {
            let alert = NSAlert(); alert.messageText = action == "create" ? "New file" : "Rename file"; alert.informativeText = "Enter a file path within this project, for example src/Button.tsx."; let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24)); input.stringValue = action == "rename" ? source : ""; alert.accessoryView = input; alert.addButton(withTitle: action == "create" ? "Create" : "Rename"); alert.addButton(withTitle: "Cancel")
            guard let window else { return }; alert.beginSheetModal(for: window) { [weak self] response in if response == .alertFirstButtonReturn { self?.send(action, ["name":input.stringValue]) } }; return
        }
        send(action)
    }
    func update(_ value: [String: Any]) {
        state = value; root = value["root"] as? String ?? ""; source = value["source"] as? String ?? ""
        let newFiles = value["files"] as? [String] ?? []; if files != newFiles { files = newFiles; filter() }
        filename.stringValue = source + (value["dirty"] as? Bool == true ? " •" : "")
        let error = value["error"] as? String ?? ""; status.stringValue = !error.isEmpty ? error : value["busy"] as? Bool == true ? "Working…" : "⌘S Save · ⌘F Find · ⌘Click component to navigate"
        status.toolTip = status.stringValue; status.textColor = error.isEmpty ? .secondaryLabelColor : .systemRed
        controls["back"]?.isEnabled = value["canBack"] as? Bool == true
        controls["forward"]?.isEnabled = value["canForward"] as? Bool == true
        controls["save"]?.isEnabled = value["busy"] as? Bool != true && value["dirty"] as? Bool == true
        controls["popout"]?.title = value["popped"] as? Bool == true ? "Dock" : "Pop Out"
        let document = value["document"] as? [String: Any] ?? [:], incoming = value["text"] as? String ?? "", nextRevision = value["revision"] as? Int ?? 0
        let key = root + "/" + source, changed = key != documentKey
        if changed || nextRevision >= revision && incoming != code.string {
            updating = true; code.string = incoming; updating = false
            if changed { code.undoManager?.removeAllActions(); documentKey = key; let line = document["line"] as? Int ?? 1; let pieces = incoming.split(separator: "\n", omittingEmptySubsequences: false); let offset = pieces.prefix(max(0, line - 1)).reduce(0) { $0 + ($1 as NSString).length + 1 }; code.setSelectedRange(NSRange(location: min(offset, (incoming as NSString).length), length: 0)); code.scrollRangeToVisible(code.selectedRange()) }
            highlight()
        }
        if let nextReveal = value["reveal"] as? Int, nextReveal != reveal {
            reveal = nextReveal
            let line = max(1, document["line"] as? Int ?? 1)
            let pieces = incoming.split(separator: "\n", omittingEmptySubsequences: false)
            let offset = pieces.prefix(line - 1).reduce(0) { $0 + ($1 as NSString).length + 1 }
            code.setSelectedRange(NSRange(location: min(offset, (incoming as NSString).length), length: 0)); code.scrollRangeToVisible(code.selectedRange())
        }
        revision = max(changed ? 0 : revision, nextRevision)
        let media = document["media"] as? [String: Any], isBinary = document["binary"] as? Bool == true
        scroll.isHidden = media != nil || isBinary; image.isHidden = true; player.isHidden = true; binary.isHidden = !isBinary
        binary.stringValue = "Binary file · \(document["bytes"] as? Int ?? 0) bytes"
        if let path = value["mediaPath"] as? String, let media { if media["kind"] as? String == "image" { image.isHidden = false; image.image = NSImage(contentsOfFile: path) } else { player.isHidden = false; if changed { player.player?.pause(); player.player = AVPlayer(url: URL(fileURLWithPath: path)) } } } else { player.player?.pause() }
        tree.selectFile(source)
    }
    func textDidChange(_ notification: Notification) { guard !updating else { return }; revision += 1; send("edit", ["text":code.string, "revision":revision]); highlight() }
    func highlight() {
        highlightWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.code.hasMarkedText(), let storage = self.code.textStorage else { return }
            let text = self.code.string, full = NSRange(location: 0, length: (text as NSString).length)
            storage.beginEditing(); storage.addAttribute(.foregroundColor, value: NSColor.labelColor, range: full)
            if full.length < 500_000 {
                for (pattern, color) in [("\\b(?:import|from|export|default|const|let|var|function|return|class|interface|type|if|else|async|await|true|false|null|for|while|switch|case|public|private|func|struct)\\b", NSColor.systemPurple), ("\\b[0-9]+(?:\\.[0-9]+)?\\b", NSColor.systemBlue), ("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`", NSColor.systemRed), ("//[^\\n]*|/\\*[\\s\\S]*?\\*/|<!--[\\s\\S]*?-->", NSColor.secondaryLabelColor)] {
                    if let regex = try? NSRegularExpression(pattern: pattern) { for match in regex.matches(in: text, range: full) { storage.addAttribute(.foregroundColor, value: color, range: match.range) } }
                }
            }
            storage.endEditing(); self.scroll.verticalRulerView?.needsDisplay = true
        }
        highlightWork = work; DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: work)
    }
    func filter() { tree.update(files, query: search.stringValue) }
    func controlTextDidChange(_ obj: Notification) { filter() }
    func windowShouldClose(_ sender: NSWindow) -> Bool { send("hide"); return false }
}
