import AppKit

final class ShellRow: NSObject {
    let id: String, title: String, kind: String, project: String
    let running: Bool
    let children: [ShellRow]
    init(_ data: [String: Any]) {
        id = data["id"] as? String ?? ""; title = data["title"] as? String ?? ""
        kind = data["kind"] as? String ?? "chat"; project = data["project"] as? String ?? ""
        running = data["running"] as? Bool ?? false
        children = (data["children"] as? [[String: Any]] ?? []).map(ShellRow.init)
    }
}

/// System sidebar, split-view divider and toolbar. Web content uses detail-local
/// coordinates, so existing preview/inspector geometry remains unchanged.
final class NativeShell: NSObject, NSOutlineViewDataSource, NSOutlineViewDelegate, NSToolbarDelegate, NSMenuDelegate {
    let split = NSSplitViewController()
    let outline = NSOutlineView()
    let sidebar = NSViewController()
    var sidebarItem: NSSplitViewItem!
    var rows: [ShellRow] = []
    var currentProject: String?
    var selectedID: String?
    var applying = false
    var ready = false
    var selecting = false
    var chatHidden = false
    var toolbar: NSToolbar!
    weak var window: NSWindow?
    private var knownProjects = Set<String>()
    private var toolbarItems: [String: NSToolbarItem] = [:]
    private let items = ["open-project", "new-project", "new-chat", "reload", "select", "toggle-chat", "settings"]
    private let labels = ["open-project":"Open Project", "new-project":"New Project", "new-chat":"New Chat", "reload":"Reload Preview", "select":"Select Element", "toggle-chat":"Hide Chat", "settings":"Settings"]
    private let symbols = ["open-project":"folder", "new-project":"folder.badge.plus", "new-chat":"square.and.pencil", "reload":"arrow.clockwise", "select":"cursorarrow.rays", "toggle-chat":"bubble.left", "settings":"gearshape"]

    init(window: NSWindow, canvas: NSView) {
        super.init(); self.window = window
        split.splitView.isVertical = true
        split.view.frame = window.contentLayoutRect
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        column.width = 230; column.resizingMask = .autoresizingMask
        outline.frame = NSRect(x: 0, y: 0, width: 230, height: 600)
        outline.autoresizingMask = [.width]
        outline.addTableColumn(column); outline.outlineTableColumn = column
        outline.headerView = nil; outline.rowSizeStyle = .default; outline.style = .sourceList
        outline.indentationPerLevel = 16; outline.allowsEmptySelection = true
        outline.dataSource = self; outline.delegate = self
        outline.setAccessibilityLabel("Projects and chats")
        let menu = NSMenu(); menu.delegate = self; outline.menu = menu
        let scroll = NSScrollView(); scroll.documentView = outline; scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        sidebar.view = scroll
        sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebar)
        sidebarItem.minimumThickness = 180; sidebarItem.maximumThickness = 340
        sidebarItem.canCollapse = true
        sidebarItem.collapseBehavior = .preferResizingSiblingsWithFixedSplitView
        let detail = NSViewController(); detail.view = canvas
        split.addSplitViewItem(sidebarItem)
        let detailItem = NSSplitViewItem(viewController: detail)
        detailItem.minimumThickness = 500
        split.addSplitViewItem(detailItem)
        window.contentViewController = split
        split.splitView.setPosition(230, ofDividerAt: 0)
        toolbar = NSToolbar(identifier: "PraxisNativeToolbar")
        toolbar.delegate = self; toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = true; toolbar.autosavesConfiguration = true
        window.toolbar = toolbar; window.toolbarStyle = .unified
    }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .flexibleSpace, .space] + items.map { NSToolbarItem.Identifier($0) }
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, NSToolbarItem.Identifier("open-project"), NSToolbarItem.Identifier("new-project"), NSToolbarItem.Identifier("new-chat"), .flexibleSpace,
         NSToolbarItem.Identifier("reload"), NSToolbarItem.Identifier("select"), NSToolbarItem.Identifier("toggle-chat"), NSToolbarItem.Identifier("settings")]
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar: Bool) -> NSToolbarItem? {
        let key = identifier.rawValue
        guard items.contains(key) else { return nil }
        let item = NSToolbarItem(itemIdentifier: identifier)
        item.label = labels[key] ?? key; item.paletteLabel = item.label; item.toolTip = item.label
        item.image = NSImage(systemSymbolName: symbols[key] ?? "circle", accessibilityDescription: item.label)
        item.target = self; item.action = #selector(toolbarAction(_:)); item.autovalidates = false
        toolbarItems[key] = item
        updateToolbar()
        return item
    }
    @objc func toolbarAction(_ item: NSToolbarItem) {
        let action = item.itemIdentifier.rawValue
        if action == "new-chat" {
            guard let project = currentProject else { return }
            emit(["event":"shell-action", "action":"new-chat", "project":project])
        } else { emit(["event":"menu", "action":action]) }
    }
    func updateToolbar() {
        for (key, item) in toolbarItems {
            item.isEnabled = ["reload", "select"].contains(key) ? ready : (["new-chat", "toggle-chat"].contains(key) ? currentProject != nil : true)
        }
        toolbarItems["select"]?.label = selecting ? "Stop Selecting" : "Select Element"
        toolbarItems["select"]?.toolTip = toolbarItems["select"]?.label
        toolbarItems["select"]?.image = NSImage(systemSymbolName: selecting ? "cursorarrow.rays" : "cursorarrow", accessibilityDescription: selecting ? "Stop Selecting" : "Select Element")
        toolbarItems["toggle-chat"]?.label = chatHidden ? "Show Chat" : "Hide Chat"
        toolbarItems["toggle-chat"]?.toolTip = toolbarItems["toggle-chat"]?.label
    }
    func update(_ state: [String: Any]) {
        applying = true; defer { applying = false }
        let expanded = Set(rows.filter { outline.isItemExpanded($0) }.map(\.id))
        rows = (state["rows"] as? [[String: Any]] ?? []).map(ShellRow.init)
        currentProject = state["project"] as? String
        selectedID = state["selected"] as? String
        ready = state["previewReady"] as? Bool ?? false
        selecting = state["selectMode"] as? Bool ?? false
        chatHidden = state["chatHidden"] as? Bool ?? false
        outline.reloadData()
        for row in rows where expanded.contains(row.id) || !knownProjects.contains(row.id) { outline.expandItem(row) }
        knownProjects = Set(rows.map(\.id))
        outline.deselectAll(nil)
        if let selected = allRows.first(where: { $0.id == selectedID }) {
            let index = outline.row(forItem: selected)
            if index >= 0 { outline.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false) }
        }
        window?.subtitle = rows.first(where: { $0.project == currentProject })?.title ?? ""
        updateToolbar()
    }
    var allRows: [ShellRow] { rows.flatMap { [$0] + $0.children } }
    func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int { (item as? ShellRow)?.children.count ?? rows.count }
    func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any { (item as? ShellRow)?.children[index] ?? rows[index] }
    func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool { !(item as! ShellRow).children.isEmpty }
    func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
        let row = item as! ShellRow
        let cell = NSTableCellView()
        let text = NSTextField(labelWithString: row.title + (row.running ? " · Working" : ""))
        text.font = NSFont.systemFont(ofSize: NSFont.systemFontSize)
        text.lineBreakMode = .byTruncatingTail
        let symbol = row.kind == "project" ? "folder" : row.kind == "history" ? "clock" : "bubble.left"
        let icon = NSImageView(image: NSImage(systemSymbolName: symbol, accessibilityDescription: nil)!)
        cell.addSubview(icon); cell.addSubview(text); cell.textField = text; cell.imageView = icon
        icon.translatesAutoresizingMaskIntoConstraints = false; text.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2), icon.centerYAnchor.constraint(equalTo: cell.centerYAnchor), icon.widthAnchor.constraint(equalToConstant: 16), icon.heightAnchor.constraint(equalToConstant: 16),
            text.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 7), text.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -4), text.centerYAnchor.constraint(equalTo: cell.centerYAnchor)
        ])
        cell.toolTip = row.title
        return cell
    }
    func outlineViewSelectionDidChange(_ notification: Notification) {
        guard !applying, let row = outline.item(atRow: outline.selectedRow) as? ShellRow else { return }
        emit(["event":"shell-action", "action":"select", "id":row.id])
    }
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        guard let row = outline.item(atRow: outline.clickedRow) as? ShellRow else { return }
        let actions = row.kind == "history" ? [("Open Chat", "select")] : row.kind == "project" ? [("New Chat", "new-chat"), ("Project Memory…", "memory"), ("Close Project", "close")] : [("Close Chat", "close")]
        for (title, action) in actions {
            let item = NSMenuItem(title: title, action: #selector(contextAction(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = ["event":"shell-action", "action":action, "id":row.id, "project":row.project]; menu.addItem(item)
        }
    }
    @objc func contextAction(_ item: NSMenuItem) { if let payload = item.representedObject as? [String: String] { emit(payload) } }

    // Private pipe-only integration checks exercise actual native controls.
    func inspect() -> [String: Any] {
        split.view.layoutSubtreeIfNeeded()
        return ["rows":allRows.map { ["id":$0.id, "title":$0.title, "kind":$0.kind] }, "selected":selectedID ?? "", "sidebarCollapsed":sidebarItem.isCollapsed,
         "sidebarWidth":sidebar.view.bounds.width, "detailWidth":split.splitViewItems[1].viewController.view.bounds.width,
         "outlineRows":outline.numberOfRows, "outlineWidth":outline.bounds.width,
         "enabled":toolbarItems.mapValues { $0.isEnabled }]
    }
    func perform(_ action: String, id: String?) -> Bool {
        if action == "toggle-sidebar" {
            // No animation in the pipe test: an occluded/locked desktop can pause
            // AppKit animations even though the collapsed state already changed.
            sidebarItem.isCollapsed.toggle(); split.view.layoutSubtreeIfNeeded(); return true
        }
        if action == "select-row", let row = allRows.first(where: { $0.id == id }) {
            if let parent = rows.first(where: { $0.children.contains(row) }) { outline.expandItem(parent) }
            let index = outline.row(forItem: row)
            guard index >= 0 else { return false }
            outline.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false); return true
        }
        guard let item = toolbarItems[action], item.isEnabled else { return false }
        toolbarAction(item); return true
    }
}
