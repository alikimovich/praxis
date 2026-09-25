import AppKit

final class NativeActivity: NSObject, NSWindowDelegate {
    var window: NSWindow?
    let text = NSTextView()
    var count = 0
    func update(_ state: [String: Any]) {
        guard state["visible"] as? Bool == true else { window?.orderOut(nil); return }
        if window == nil {
            let panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 420), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
            panel.title = "Activity"; panel.isReleasedWhenClosed = false; panel.delegate = self
            let content = NSView(); panel.contentView = content
            let clear = NSButton(title: "Clear", target: self, action: #selector(clearLog))
            let copy = NSButton(title: "Copy All", target: self, action: #selector(copyLog))
            let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true
            text.isEditable = false; text.isSelectable = true; text.isRichText = false
            text.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
            text.textContainerInset = NSSize(width: 12, height: 12)
            text.isVerticallyResizable = true; text.isHorizontallyResizable = false
            text.autoresizingMask = [.width]; text.textContainer?.widthTracksTextView = true
            scroll.documentView = text
            for view in [clear, copy, scroll] { view.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(view) }
            NSLayoutConstraint.activate([
                clear.topAnchor.constraint(equalTo: content.topAnchor, constant: 8), clear.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
                copy.centerYAnchor.constraint(equalTo: clear.centerYAnchor), copy.trailingAnchor.constraint(equalTo: clear.leadingAnchor, constant: -8),
                scroll.topAnchor.constraint(equalTo: clear.bottomAnchor, constant: 8), scroll.leadingAnchor.constraint(equalTo: content.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: content.trailingAnchor), scroll.bottomAnchor.constraint(equalTo: content.bottomAnchor)
            ])
            panel.center(); window = panel
        }
        let pinned = text.visibleRect.maxY >= text.bounds.maxY - 24
        let lines = state["lines"] as? [[String: Any]] ?? []; count = lines.count
        let output = NSMutableAttributedString()
        for line in lines {
            let color: NSColor = line["kind"] as? String == "error" ? .systemRed : line["kind"] as? String == "success" ? .systemGreen : .labelColor
            output.append(NSAttributedString(string: "\(line["time"] as? String ?? "")  \(line["text"] as? String ?? "")\n", attributes: [.foregroundColor: color, .font: NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)]))
        }
        text.textStorage?.setAttributedString(output)
        if pinned { text.scrollToEndOfDocument(nil) }
        if window?.isVisible != true { window?.makeKeyAndOrderFront(nil) }
    }
    @objc func clearLog() { emit(["event":"activity-action", "action":"clear"]) }
    @objc func copyLog() { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text.string, forType: .string) }
    func windowWillClose(_ notification: Notification) { emit(["event":"activity-action", "action":"hide"]) }
}
