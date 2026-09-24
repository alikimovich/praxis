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
