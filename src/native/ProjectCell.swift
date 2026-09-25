import AppKit

enum SidebarRowStyle {
    static let height: CGFloat = 28
    static let font = NSFont.systemFont(ofSize: NSFont.systemFontSize)
}

/// Stable, varied animal artwork for projects that have no favicon.
enum ProjectAnimal {
    private static let animals = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐧", "🐦", "🦉", "🦋", "🐢", "🐙", "🦀", "🐳", "🐬"]
    static func image(for project: String) -> NSImage {
        // Swift's Hasher is randomized each launch; use a stable path hash instead.
        let hash = project.utf8.reduce(UInt64(14695981039346656037)) { ($0 ^ UInt64($1)) &* 1099511628211 }
        let emoji = NSAttributedString(string: animals[Int(hash % UInt64(animals.count))],
            attributes: [.font: NSFont.systemFont(ofSize: 16)])
        return NSImage(size: NSSize(width: 20, height: 20), flipped: false) { bounds in
            let size = emoji.size()
            emoji.draw(at: NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2))
            return true
        }
    }
}

/// Keep project selection on the row and its actions on a separate hover control.
final class ProjectCell: NSTableCellView {
    let more = NSPopUpButton(frame: .zero, pullsDown: true)
    private var tracking: NSTrackingArea?
    var selected = false { didSet { updateVisibility() } }
    private var hovered = false
    override var backgroundStyle: NSView.BackgroundStyle { didSet { updateVisibility() } }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
        addTrackingArea(area); tracking = area
        if let window { hovered = bounds.contains(convert(window.mouseLocationOutsideOfEventStream, from: nil)) }
        updateVisibility()
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; updateVisibility() }
    override func mouseExited(with event: NSEvent) { hovered = false; updateVisibility() }
    private func updateVisibility() {
        let emphasized = backgroundStyle == .emphasized
        more.alphaValue = hovered || selected || emphasized ? 1 : 0
        imageView?.contentTintColor = imageView?.image?.isTemplate == true
            ? (emphasized ? .alternateSelectedControlTextColor : .labelColor) : nil
        more.contentTintColor = emphasized ? .alternateSelectedControlTextColor : .labelColor
    }
}


/// Keep the source-list document and column inside their actual clip viewport.
final class ProjectScrollView: NSScrollView {
    override func tile() {
        super.tile()
        fitRows()
    }
    override func layout() {
        super.layout()
        fitRows()
    }
    private func fitRows() {
        guard let table = documentView as? NSTableView, contentSize.width > 0 else { return }
        if abs(table.frame.width - contentSize.width) > 0.5 {
            table.setFrameSize(NSSize(width: contentSize.width, height: table.frame.height))
            table.sizeLastColumnToFit()
        }
    }
}

final class ShellRow: NSObject {
    let id: String, title: String, kind: String, project: String
    let running: Bool
    let icon: NSImage?
    let children: [ShellRow]
    init(_ data: [String: Any]) {
        id = data["id"] as? String ?? ""; title = data["title"] as? String ?? ""
        kind = data["kind"] as? String ?? "chat"; project = data["project"] as? String ?? ""
        running = data["running"] as? Bool ?? false
        if let uri = data["icon"] as? String, uri.hasPrefix("data:image/"), let comma = uri.firstIndex(of: ",") {
            let body = String(uri[uri.index(after: comma)...])
            let bytes = uri[..<comma].contains(";base64") ? Data(base64Encoded: body) : body.removingPercentEncoding?.data(using: .utf8)
            icon = bytes.flatMap { NSImage(data: $0) }
        } else { icon = nil }
        children = (data["children"] as? [[String: Any]] ?? []).map(ShellRow.init)
    }
}

/// Full-width actions with the same regular label and icon rhythm as project rows.
final class SidebarProjectButton: NSButton {
    private let label = NSTextField(labelWithString: "")
    private let symbol = NSImageView()

    override var title: String { didSet { label.stringValue = title } }
    override var image: NSImage? { didSet { symbol.image = image } }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        label.font = SidebarRowStyle.font
        label.textColor = .labelColor
        label.lineBreakMode = .byTruncatingTail
        symbol.imageScaling = .scaleProportionallyDown
        symbol.contentTintColor = .labelColor
        for view in [symbol, label] {
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
        }
        NSLayoutConstraint.activate([
            symbol.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            symbol.centerYAnchor.constraint(equalTo: centerYAnchor),
            symbol.widthAnchor.constraint(equalToConstant: 16),
            symbol.heightAnchor.constraint(equalToConstant: 16),
            label.leadingAnchor.constraint(equalTo: symbol.trailingAnchor, constant: 7),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            label.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func hitTest(_ point: NSPoint) -> NSView? { super.hitTest(point) == nil ? nil : self }
    override func draw(_ dirtyRect: NSRect) {
        if isHighlighted {
            NSColor.quaternaryLabelColor.setFill()
            NSBezierPath(roundedRect: bounds, xRadius: 7, yRadius: 7).fill()
        }
    }
}

extension NSPasteboard.PasteboardType {
    static let praxisProject = NSPasteboard.PasteboardType("dev.praxis.project-row")
}

extension NativeShell {
    func outlineView(_ outlineView: NSOutlineView, pasteboardWriterForItem item: Any) -> NSPasteboardWriting? {
        guard let row = item as? ShellRow, row.kind == "project" else { return nil }
        let pasteboard = NSPasteboardItem()
        pasteboard.setString(row.project, forType: .praxisProject)
        return pasteboard
    }
    func outlineView(_ outlineView: NSOutlineView, validateDrop info: NSDraggingInfo, proposedItem item: Any?, proposedChildIndex index: Int) -> NSDragOperation {
        guard let source = info.draggingSource as? NSOutlineView, source === outlineView,
              item == nil, index >= 0, index <= rows.count,
              let key = info.draggingPasteboard.string(forType: .praxisProject),
              let from = rows.firstIndex(where: { $0.project == key }),
              index != from, index != from + 1 else { return [] }
        return .move
    }
    func outlineView(_ outlineView: NSOutlineView, acceptDrop info: NSDraggingInfo, item: Any?, childIndex index: Int) -> Bool {
        guard self.outlineView(outlineView, validateDrop: info, proposedItem: item, proposedChildIndex: index) == .move,
              let key = info.draggingPasteboard.string(forType: .praxisProject) else { return false }
        emit(["event":"shell-action", "action":"project-reorder", "project":key,
              "value":index < rows.count ? rows[index].project : ""])
        return true
    }
}
