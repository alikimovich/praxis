import AppKit

final class ChatToolbarView: NSView {
    var align: (() -> Void)?
    override func layout() {
        super.layout()
        // Wait for AppKit to place all toolbar items before measuring in window coordinates.
        DispatchQueue.main.async { [weak self] in self?.align?() }
    }
}

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
final class NativeShell: NSObject, NSOutlineViewDataSource, NSOutlineViewDelegate, NSToolbarDelegate, NSMenuDelegate, NSTextFieldDelegate {
    let split = NSSplitViewController()
    let outline = NSOutlineView()
    let sidebar = NSViewController()
    private let contentCanvas: NSView
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
    private let items = ["projects", "chat", "branch", "home", "address", "device", "code", "expand", "publish"]
    private let labels = ["home":"Back to Project", "address":"Preview Address", "device":"Switch to Mobile", "branch":"Branch", "publish":"Publish", "code":"Show Code", "expand":"Expand Preview"]
    private let symbols = ["home":"house", "device":"iphone", "branch":"arrow.triangle.branch", "publish":"arrow.up.circle", "code":"chevron.left.forwardslash.chevron.right", "expand":"arrow.up.left.and.arrow.down.right"]
    private var sidebarButtons: [String: NSButton] = [:]
    private var previewState: [String: Any] = [:]
    private var sidebarBeforeExpand = false
    private let chatHeader = ChatToolbarView()
    private let chatTitle = NSTextField(labelWithString: "Chat")
    private let chatOptions = NSPopUpButton(frame: .zero, pullsDown: true)
    private var chatHeaderWidth: NSLayoutConstraint!
    private let address = NSTextField()
    private let publishButton = NSButton()
    private let publishOptions = NSPopUpButton(frame: .zero, pullsDown: true)

    init(window: NSWindow, canvas: NSView) {
        contentCanvas = canvas
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
        let scroll = NSScrollView(); scroll.documentView = outline; scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true; scroll.scrollerStyle = .overlay
        scroll.drawsBackground = false
        let sidebarContainer = NSView()
        let settings = NSButton(title: "Settings", target: self, action: #selector(sidebarAction(_:)))
        settings.identifier = NSUserInterfaceItemIdentifier("settings"); settings.bezelStyle = .rounded
        settings.image = NSImage(systemSymbolName: "gearshape", accessibilityDescription: nil); settings.imagePosition = .imageLeading
        sidebarButtons["settings"] = settings
        for view in [scroll, settings] { view.translatesAutoresizingMaskIntoConstraints = false; sidebarContainer.addSubview(view) }
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: sidebarContainer.safeAreaLayoutGuide.topAnchor, constant: 8), scroll.leadingAnchor.constraint(equalTo: sidebarContainer.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: sidebarContainer.trailingAnchor), scroll.bottomAnchor.constraint(equalTo: settings.topAnchor, constant: -12),
            settings.leadingAnchor.constraint(equalTo: sidebarContainer.leadingAnchor, constant: 12), settings.bottomAnchor.constraint(equalTo: sidebarContainer.bottomAnchor, constant: -12)
        ])
        sidebar.view = sidebarContainer
        sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebar)
        sidebarItem.minimumThickness = 180; sidebarItem.maximumThickness = 340
        sidebarItem.allowsFullHeightLayout = true
        sidebarItem.titlebarSeparatorStyle = .none
        sidebarItem.canCollapse = true
        sidebarItem.collapseBehavior = .preferResizingSiblingsWithFixedSplitView
        let detail = NSViewController(); detail.view = NSView()
        // Full-size content lets the sidebar material surround the window controls.
        // Keep WebKit's coordinate space below the toolbar, as before.
        canvas.translatesAutoresizingMaskIntoConstraints = false
        detail.view.addSubview(canvas)
        NSLayoutConstraint.activate([
            canvas.topAnchor.constraint(equalTo: detail.view.safeAreaLayoutGuide.topAnchor),
            canvas.bottomAnchor.constraint(equalTo: detail.view.bottomAnchor),
            canvas.leadingAnchor.constraint(equalTo: detail.view.leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: detail.view.trailingAnchor)
        ])
        split.addSplitViewItem(sidebarItem)
        let detailItem = NSSplitViewItem(viewController: detail)
        detailItem.minimumThickness = 500
        split.addSplitViewItem(detailItem)
        window.contentViewController = split
        split.splitView.setPosition(230, ofDividerAt: 0)
        toolbar = NSToolbar(identifier: "PraxisNativePreviewToolbar")
        toolbar.delegate = self; toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false; toolbar.autosavesConfiguration = false
        chatHeader.align = { [weak self] in self?.alignChatHeader() }
        NotificationCenter.default.addObserver(self, selector: #selector(splitResized(_:)), name: NSSplitView.didResizeSubviewsNotification, object: split.splitView)
        window.titleVisibility = .hidden
        window.toolbar = toolbar; window.toolbarStyle = .unified
    }
    @objc private func splitResized(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in self?.alignChatHeader() }
    }
    func alignChatHeader() {
        guard chatHeader.window != nil, chatHeaderWidth != nil, !chatHidden else { return }
        let detail = split.splitViewItems[1].viewController.view
        let target = detail.convert(.zero, to: nil).x + (previewState["chatWidth"] as? Double ?? 440)
        let leading = chatHeader.convert(.zero, to: nil).x
        let width = max(140, target - leading)
        if abs(chatHeaderWidth.constant - width) > 0.5 { chatHeaderWidth.constant = width }
    }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .sidebarTrackingSeparator, .flexibleSpace] + items.map { NSToolbarItem.Identifier($0) }
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [NSToolbarItem.Identifier("projects"), .toggleSidebar, .sidebarTrackingSeparator, NSToolbarItem.Identifier("chat"), NSToolbarItem.Identifier("branch"), NSToolbarItem.Identifier("home"), NSToolbarItem.Identifier("address"), .flexibleSpace,
         NSToolbarItem.Identifier("device"), NSToolbarItem.Identifier("code"), NSToolbarItem.Identifier("expand"), NSToolbarItem.Identifier("publish")]
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar: Bool) -> NSToolbarItem? {
        let key = identifier.rawValue
        guard items.contains(key) else { return nil }
        let item: NSToolbarItem = ["projects", "branch", "publish"].contains(key) ? NSMenuToolbarItem(itemIdentifier: identifier) : NSToolbarItem(itemIdentifier: identifier)
        item.label = labels[key] ?? key; item.paletteLabel = item.label; item.toolTip = item.label
        item.image = NSImage(systemSymbolName: symbols[key] ?? "circle", accessibilityDescription: item.label)
        if key != "branch" { item.target = self; item.action = #selector(toolbarAction(_:)) }
        if key == "projects", let menuItem = item as? NSMenuToolbarItem {
            menuItem.label = "Projects"; menuItem.toolTip = "Projects"
            menuItem.image = NSImage(systemSymbolName: "folder.badge.plus", accessibilityDescription: "Projects")
            let menu = NSMenu(); menu.autoenablesItems = false
            for (title, action) in [("New Project…", "new-project"), ("Open Project…", "open-project")] {
                let entry = NSMenuItem(title: title, action: #selector(contextAction(_:)), keyEquivalent: "")
                entry.target = self; entry.representedObject = ["event":"menu", "action":action]; menu.addItem(entry)
            }
            menuItem.menu = menu
        } else if key == "chat" {
            chatHeader.translatesAutoresizingMaskIntoConstraints = false
            chatHeaderWidth = chatHeader.widthAnchor.constraint(equalToConstant: 400)
            chatTitle.font = .boldSystemFont(ofSize: NSFont.systemFontSize)
            chatTitle.lineBreakMode = .byTruncatingTail
            chatTitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let newChat = NSButton(image: NSImage(systemSymbolName: "square.and.pencil", accessibilityDescription: "New Chat")!, target: self, action: #selector(sidebarAction(_:)))
            newChat.identifier = NSUserInterfaceItemIdentifier("new-chat"); newChat.bezelStyle = .texturedRounded; newChat.toolTip = "New Chat"
            sidebarButtons["new-chat"] = newChat
            chatOptions.bezelStyle = .texturedRounded; chatOptions.setAccessibilityLabel("Chat options")
            let separator = NSBox(); separator.boxType = .separator
            for view in [chatTitle, newChat, chatOptions, separator] { view.translatesAutoresizingMaskIntoConstraints = false; chatHeader.addSubview(view) }
            NSLayoutConstraint.activate([
                chatHeaderWidth, chatHeader.heightAnchor.constraint(equalToConstant: 32),
                chatTitle.leadingAnchor.constraint(equalTo: chatHeader.leadingAnchor, constant: 4), chatTitle.centerYAnchor.constraint(equalTo: chatHeader.centerYAnchor),
                chatTitle.trailingAnchor.constraint(lessThanOrEqualTo: newChat.leadingAnchor, constant: -8),
                newChat.trailingAnchor.constraint(equalTo: chatOptions.leadingAnchor, constant: -4), newChat.centerYAnchor.constraint(equalTo: chatHeader.centerYAnchor),
                chatOptions.trailingAnchor.constraint(equalTo: separator.leadingAnchor, constant: -12), chatOptions.centerYAnchor.constraint(equalTo: chatHeader.centerYAnchor), chatOptions.widthAnchor.constraint(equalToConstant: 36),
                separator.trailingAnchor.constraint(equalTo: chatHeader.trailingAnchor), separator.widthAnchor.constraint(equalToConstant: 1), separator.topAnchor.constraint(equalTo: chatHeader.topAnchor), separator.bottomAnchor.constraint(equalTo: chatHeader.bottomAnchor)
            ])
            item.view = chatHeader; item.visibilityPriority = .high
        } else if key == "address" {
            address.frame = NSRect(x: 0, y: 0, width: 280, height: 26)
            address.placeholderString = "Preview address"; address.setAccessibilityLabel("Preview address")
            address.font = .systemFont(ofSize: NSFont.smallSystemFontSize); address.lineBreakMode = .byTruncatingMiddle
            address.delegate = self; address.target = self; address.action = #selector(navigateAddress(_:))
            address.translatesAutoresizingMaskIntoConstraints = false
            let preferredWidth = address.widthAnchor.constraint(equalToConstant: 280); preferredWidth.priority = .defaultLow
            NSLayoutConstraint.activate([address.widthAnchor.constraint(greaterThanOrEqualToConstant: 160), address.widthAnchor.constraint(lessThanOrEqualToConstant: 420), address.heightAnchor.constraint(equalToConstant: 26), preferredWidth])
            item.view = address
        } else if key == "publish" {
            publishButton.title = "Publish"; publishButton.bezelStyle = .rounded
            if #available(macOS 26.0, *) { publishButton.bezelStyle = .glass }
            publishButton.bezelColor = .controlAccentColor
            publishButton.target = self; publishButton.action = #selector(publishClicked(_:))
            publishButton.setAccessibilityLabel("Publish")
            publishOptions.bezelStyle = .rounded; publishOptions.setAccessibilityLabel("Publish settings")
            publishOptions.widthAnchor.constraint(equalToConstant: 28).isActive = true
            let group = NSStackView(views: [publishButton, publishOptions]); group.spacing = 2
            item.view = group; item.visibilityPriority = .high
        }
        item.autovalidates = false; toolbarItems[key] = item
        updateToolbar()
        return item
    }
    @objc func navigateAddress(_ sender: Any?) {
        let value = address.stringValue
        window?.makeFirstResponder(nil)
        emit(["event":"shell-action", "action":"address", "value":value])
        address.stringValue = previewState["previewURL"] as? String ?? previewState["previewBase"] as? String ?? ""
    }
    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
            address.stringValue = previewState["previewURL"] as? String ?? previewState["previewBase"] as? String ?? ""
            window?.makeFirstResponder(nil); return true
        }
        return false
    }
    @objc func publishClicked(_ sender: Any?) {
        guard let item = toolbarItems["publish"], item.isEnabled else { return }
        toolbarAction(item)
    }
    @objc func sidebarAction(_ button: NSButton) {
        let action = button.identifier?.rawValue ?? ""
        if action == "new-chat" {
            guard let project = currentProject else { return }
            emit(["event":"shell-action", "action":action, "project":project])
        } else { emit(["event":"menu", "action":action]) }
    }
    @objc func toolbarAction(_ item: NSToolbarItem) {
        emit(["event":"shell-action", "action":item.itemIdentifier.rawValue])
    }
    @objc func previewMenuAction(_ item: NSMenuItem) {
        guard let payload = item.representedObject as? [String: String] else { return }
        if payload["action"] == "new-branch" {
            guard let window = window else { return }
            let project = currentProject
            let alert = NSAlert(); alert.messageText = "New Branch"; alert.addButton(withTitle: "Create"); alert.addButton(withTitle: "Cancel")
            let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24)); input.placeholderString = "Branch name"; alert.accessoryView = input
            alert.beginSheetModal(for: window) { [weak self] result in
                guard result == .alertFirstButtonReturn, !input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, project == self?.currentProject else { return }
                emit(["event":"shell-action", "action":"new-branch", "value":input.stringValue])
            }
            alert.window.makeFirstResponder(input)
        } else { emit(payload) }
    }
    func updateToolbar() {
        sidebarButtons["new-chat"]?.isEnabled = currentProject != nil
        for (key, item) in toolbarItems {
            item.isEnabled = ["projects", "chat"].contains(key) ? true : key == "branch" ? previewState["branch"] is String : ready
            if key == "publish" { item.isEnabled = ready && !(previewState["publishing"] as? Bool ?? false) }
        }
        chatTitle.stringValue = allRows.first(where: { $0.id == selectedID })?.title ?? "Chat"
        chatTitle.toolTip = chatTitle.stringValue
        if chatHeaderWidth != nil {
            if chatHidden { chatHeaderWidth.constant = 100 }
            else { alignChatHeader() }
        }
        chatTitle.isHidden = chatHidden
        let chatMenu = NSMenu(); chatMenu.autoenablesItems = false
        chatMenu.addItem(withTitle: "•••", action: nil, keyEquivalent: "")
        for (title, action) in [("Project Memory…", "memory"), ("Close Chat", "close")] {
            let entry = NSMenuItem(title: title, action: #selector(contextAction(_:)), keyEquivalent: ""); entry.target = self
            entry.representedObject = ["event":"shell-action", "action":action, "id":selectedID ?? "", "project":currentProject ?? ""]
            entry.isEnabled = currentProject != nil; chatMenu.addItem(entry)
        }
        chatOptions.menu = chatMenu
        address.isEnabled = ready
        if address.currentEditor() == nil { address.stringValue = previewState["previewURL"] as? String ?? previewState["previewBase"] as? String ?? "" }
        toolbarItems["device"]?.isEnabled = previewState["deviceEnabled"] as? Bool ?? false
        let mobile = previewState["viewport"] as? String == "mobile"
        toolbarItems["device"]?.label = mobile ? "Switch to Desktop" : "Switch to Mobile"
        toolbarItems["device"]?.toolTip = toolbarItems["device"]?.label
        toolbarItems["device"]?.image = NSImage(systemSymbolName: mobile ? "desktopcomputer" : "iphone", accessibilityDescription: toolbarItems["device"]?.label)
        if let item = toolbarItems["branch"] as? NSMenuToolbarItem {
            item.title = previewState["branch"] as? String ?? "Branch"; item.toolTip = item.title
            let menu = NSMenu(); menu.autoenablesItems = false
            func add(_ title: String, _ action: String, _ value: String = "") {
                let entry = NSMenuItem(title: title, action: #selector(previewMenuAction(_:)), keyEquivalent: ""); entry.target = self
                entry.representedObject = ["event":"shell-action", "action":action, "value":value]
                if action == "branch" { entry.state = value == previewState["branch"] as? String ? .on : .off }
                menu.addItem(entry)
            }
            add("Git Updates…", "git-updates"); menu.addItem(.separator())
            for branch in previewState["branches"] as? [String] ?? [] { add(branch, "branch", branch) }
            menu.addItem(.separator()); add("New Branch…", "new-branch"); item.menu = menu
        }
        if let item = toolbarItems["publish"] as? NSMenuToolbarItem {
            item.title = previewState["publishLabel"] as? String ?? "Publish"; item.label = item.title; item.toolTip = item.title
            let menu = NSMenu(); menu.autoenablesItems = false
            for (title, value) in [("Create PR and merge to main", "merge"), ("Create PR", "pr")] {
                let entry = NSMenuItem(title: title, action: #selector(previewMenuAction(_:)), keyEquivalent: ""); entry.target = self
                entry.representedObject = ["event":"shell-action", "action":"publish-mode", "value":value]
                entry.state = value == previewState["publishMode"] as? String ? .on : .off; entry.isEnabled = item.isEnabled
                menu.addItem(entry)
            }
            item.menu = menu
            publishButton.title = item.title; publishButton.setAccessibilityLabel(item.title); publishButton.isEnabled = item.isEnabled
            publishOptions.menu = menu.copy() as? NSMenu
            publishOptions.insertItem(withTitle: "", at: 0)
            publishOptions.isEnabled = item.isEnabled
            publishOptions.isHidden = item.title == "Connect to GitHub"
        }
        toolbarItems["code"]?.toolTip = previewState["codeOpen"] as? Bool == true ? "Hide Code" : "Show Code"
        toolbarItems["code"]?.label = toolbarItems["code"]?.toolTip ?? "Show Code"
        toolbarItems["expand"]?.toolTip = chatHidden ? "Restore Layout" : "Expand Preview"
        toolbarItems["expand"]?.label = toolbarItems["expand"]?.toolTip ?? "Expand Preview"
        toolbarItems["expand"]?.image = NSImage(systemSymbolName: chatHidden ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right", accessibilityDescription: chatHidden ? "Restore Layout" : "Expand Preview")
    }
    func update(_ state: [String: Any]) {
        applying = true; defer { applying = false }
        let expanded = Set(rows.filter { outline.isItemExpanded($0) }.map(\.id))
        rows = (state["rows"] as? [[String: Any]] ?? []).map(ShellRow.init)
        let nextProject = state["project"] as? String
        if nextProject != currentProject && address.currentEditor() != nil { window?.makeFirstResponder(nil) }
        currentProject = nextProject
        selectedID = state["selected"] as? String
        ready = state["previewReady"] as? Bool ?? false
        selecting = state["selectMode"] as? Bool ?? false
        let expandedPreview = state["chatHidden"] as? Bool ?? false
        if expandedPreview != chatHidden {
            if expandedPreview { sidebarBeforeExpand = sidebarItem.isCollapsed; sidebarItem.isCollapsed = true }
            else { sidebarItem.isCollapsed = sidebarBeforeExpand }
        }
        chatHidden = expandedPreview
        previewState = state
        outline.reloadData()
        for row in rows where expanded.contains(row.id) || !knownProjects.contains(row.id) { outline.expandItem(row) }
        knownProjects = Set(rows.map(\.id))
        outline.deselectAll(nil)
        if let selected = allRows.first(where: { $0.id == selectedID }) {
            let index = outline.row(forItem: selected)
            if index >= 0 { outline.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false) }
        }
        window?.subtitle = ""
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
        let sidebarFrame = sidebar.view.convert(sidebar.view.bounds, to: nil)
        let trafficLight = window?.standardWindowButton(.closeButton)
        let trafficFrame = trafficLight.map { $0.convert($0.bounds, to: nil) } ?? .zero
        return ["sidebarContainsTrafficLights":sidebarFrame.contains(trafficFrame),
         "sidebarTop":sidebarFrame.maxY, "contentTop":window?.contentLayoutRect.maxY ?? 0,
         "detailTop":contentCanvas.convert(contentCanvas.bounds, to: nil).maxY,
         "sidebarListTop":outline.enclosingScrollView.map { $0.convert($0.bounds, to: nil).maxY } ?? 0,
         "rows":allRows.map { ["id":$0.id, "title":$0.title, "kind":$0.kind] }, "selected":selectedID ?? "", "sidebarCollapsed":sidebarItem.isCollapsed,
         "sidebarWidth":sidebar.view.bounds.width, "detailWidth":split.splitViewItems[1].viewController.view.bounds.width,
         "outlineRows":outline.numberOfRows, "outlineWidth":outline.bounds.width,
         "toolbar":toolbar.items.map { $0.itemIdentifier.rawValue }, "branch":previewState["branch"] ?? "", "publishLabel":previewState["publishLabel"] ?? "", "codeOpen":previewState["codeOpen"] ?? false,
         "address":address.stringValue, "viewport":previewState["viewport"] ?? "", "publishPrimary":publishButton.bezelColor == NSColor.controlAccentColor, "sidebarAutohidesScrollers":(outline.enclosingScrollView?.autohidesScrollers ?? false), "sidebarActions":["new-project", "open-project", "settings"], "chatActions":["new-chat", "memory", "close"], "chatHeaderWidth":chatHeader.bounds.width, "chatHeaderTrailing":chatHeader.convert(NSPoint(x: chatHeader.bounds.maxX, y: 0), to: nil).x, "detailLeading":split.splitViewItems[1].viewController.view.convert(.zero, to: nil).x, "chatWidth":previewState["chatWidth"] ?? 0, "enabled":toolbarItems.mapValues { $0.isEnabled }]
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
        if ["new-project", "open-project"].contains(action), let menu = (toolbarItems["projects"] as? NSMenuToolbarItem)?.menu,
           let entry = menu.items.first(where: { ($0.representedObject as? [String: String])?["action"] == action }) { contextAction(entry); return true }
        if action == "address", let value = id { address.stringValue = value; navigateAddress(nil); return true }
        if ["branch", "publish-mode"].contains(action), let value = id,
           let menu = (toolbarItems[action == "branch" ? "branch" : "publish"] as? NSMenuToolbarItem)?.menu,
           let entry = menu.items.first(where: { ($0.representedObject as? [String: String])?["value"] == value && ($0.representedObject as? [String: String])?["action"] == action }), entry.isEnabled {
            previewMenuAction(entry); return true
        }
        if let button = sidebarButtons[action], button.isEnabled { sidebarAction(button); return true }
        guard let item = toolbarItems[action], item.isEnabled else { return false }
        toolbarAction(item); return true
    }
}
