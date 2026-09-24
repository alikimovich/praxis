import AppKit

func toolbarSymbol(_ name: String, _ label: String? = nil) -> NSImage? {
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
    return image
}

/// A closed sidebar has no project toolbar item, including in overflow.
final class ToolbarLayout {
    private var observation: NSKeyValueObservation?
    init(toolbar: NSToolbar, sidebar: NSSplitViewItem) {
        toolbar.items.first { $0.itemIdentifier == .toggleSidebar }?.image = toolbarSymbol("sidebar.left", "Toggle Sidebar")
        observation = sidebar.observe(\.isCollapsed, options: [.initial, .new]) { [weak toolbar] sidebar, _ in
            guard let toolbar else { return }
            let index = toolbar.items.firstIndex { $0.itemIdentifier.rawValue == "projects" }
            if sidebar.isCollapsed, let index { toolbar.removeItem(at: index) }
            else if !sidebar.isCollapsed && index == nil {
                toolbar.insertItem(withItemIdentifier: NSToolbarItem.Identifier("projects"), at: 0)
            }
        }
    }
}
