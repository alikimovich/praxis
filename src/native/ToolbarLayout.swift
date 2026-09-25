import AppKit

private var toolbarSymbolCache: [String: NSImage] = [:]

func toolbarSymbol(_ name: String, _ label: String? = nil) -> NSImage? {
    let key = name + "|" + (label ?? "")
    if let cached = toolbarSymbolCache[key] { return cached }
    // Toolbar controls reconfigure SF Symbols to their own standard size.
    // Give AppKit a template bitmap with fixed glyph bounds instead, keeping
    // system tinting and native buttons without the symbol-size override.
    guard let symbol = NSImage(systemSymbolName: name, accessibilityDescription: label)?
        .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 14, weight: .regular)),
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 40, pixelsHigh: 40,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
        let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return nil }
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = context
    let scale = 36 / max(symbol.size.width, symbol.size.height)
    let size = NSSize(width: symbol.size.width * scale, height: symbol.size.height * scale)
    symbol.draw(in: NSRect(x: (40 - size.width) / 2, y: (40 - size.height) / 2, width: size.width, height: size.height))
    NSGraphicsContext.restoreGraphicsState()
    let image = NSImage(size: NSSize(width: 20, height: 20))
    image.addRepresentation(bitmap); image.isTemplate = true
    image.accessibilityDescription = label
    toolbarSymbolCache[key] = image
    return image
}

/// Keep the system sidebar toggle consistent with the preview toolbar symbols.
final class ToolbarLayout {
    init(toolbar: NSToolbar, sidebar: NSSplitViewItem) {
        toolbar.items.first { $0.itemIdentifier == .toggleSidebar }?.image = toolbarSymbol("sidebar.left", "Toggle Sidebar")
    }
}

/// Use an explicit momentary control: selectionMode on a group assembled from
/// subitems does not configure AppKit's automatically created segmented view.
final class MomentaryToolbarGroup: NSToolbarItemGroup {
    private let control: NSSegmentedControl
    init(identifier: NSToolbarItem.Identifier, items: [NSToolbarItem]) {
        control = NSSegmentedControl(images: items.map { $0.image ?? NSImage() }, trackingMode: .momentary, target: nil, action: nil)
        super.init(itemIdentifier: identifier)
        subitems = items; selectionMode = .momentary
        control.segmentStyle = .texturedRounded
        for index in items.indices { control.setWidth(32, forSegment: index) }
        view = control
        target = self; action = #selector(activate(_:))
        control.target = self; control.action = #selector(activate(_:))
        refresh()
    }
    func refresh() {
        for (index, item) in subitems.enumerated() {
            control.setImage(item.image, forSegment: index)
            control.setEnabled(item.isEnabled, forSegment: index)
            control.setToolTip(item.toolTip ?? item.label, forSegment: index)
        }
    }
    var hasMomentaryControl: Bool {
        (control.cell as? NSSegmentedCell)?.trackingMode == .momentary && control.selectedSegment == -1
    }
    func clickSegment(_ identifier: String) -> Bool {
        guard let index = subitems.firstIndex(where: { $0.itemIdentifier.rawValue == identifier }), subitems[index].isEnabled else { return false }
        // Momentary cells only expose selection during mouse tracking. Simulate
        // that transient selection for the automation action, then restore it.
        guard let cell = control.cell as? NSSegmentedCell else { return false }
        cell.trackingMode = .selectOne
        defer { cell.trackingMode = .momentary }
        control.selectedSegment = index
        control.sendAction(control.action, to: control.target)
        return true
    }
    @objc private func activate(_ sender: NSSegmentedControl) {
        let index = sender.selectedSegment
        guard subitems.indices.contains(index) else { return }
        let item = subitems[index]
        if item.isEnabled, let action = item.action { NSApp.sendAction(action, to: item.target, from: item) }
        // Clear immediately, independent of later renderer state updates.
        sender.setSelected(false, forSegment: index)
    }
}
