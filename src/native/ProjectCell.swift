import AppKit

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
    private func updateVisibility() { more.alphaValue = hovered || selected || backgroundStyle == .emphasized ? 1 : 0 }
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
    override func draw(_ dirtyRect: NSRect) {
        if isHighlighted {
            NSColor.quaternaryLabelColor.setFill()
            NSBezierPath(roundedRect: bounds, xRadius: 7, yRadius: 7).fill()
        }
        let iconRect = NSRect(x: 6, y: (bounds.height - 16) / 2, width: 16, height: 16)
        if let symbol = image?.withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [.labelColor])), symbol.size.width > 0, symbol.size.height > 0 {
            // SF Symbols have different intrinsic aspect ratios; drawing directly
            // into the square slot stretches their artwork.
            let scale = min(iconRect.width / symbol.size.width, iconRect.height / symbol.size.height)
            let size = NSSize(width: symbol.size.width * scale, height: symbol.size.height * scale)
            symbol.draw(in: NSRect(x: iconRect.midX - size.width / 2, y: iconRect.midY - size.height / 2, width: size.width, height: size.height))
        }
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: NSFont.systemFontSize), .foregroundColor: NSColor.labelColor]
        let text = NSAttributedString(string: title, attributes: attributes)
        text.draw(in: NSRect(x: 29, y: (bounds.height - text.size().height) / 2, width: bounds.width - 39, height: text.size().height))
    }
}
