import AppKit

func toolbarSymbol(_ name: String, _ label: String? = nil) -> NSImage? {
    let image = NSImage(systemSymbolName: name, accessibilityDescription: label)?
        .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 14, weight: .regular))
    image?.size = NSSize(width: 16, height: 16)
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
