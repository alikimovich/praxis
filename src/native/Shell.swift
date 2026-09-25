import AppKit

final class ChatToolbarView: NSView {
    var align: (() -> Void)?
    override func layout() {
        super.layout()
        // Wait for AppKit to place all toolbar items before measuring in window coordinates.
        DispatchQueue.main.async { [weak self] in self?.align?() }
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
    private var rowsSignature = Data()
    var currentProject: String?
    var selectedID: String?
    var applying = false
    var ready = false
    var selecting = false
    var chatHidden = false
    var toolbar: NSToolbar!
    private var toolbarLayout: ToolbarLayout!
    weak var window: NSWindow?
    private var toolbarItems: [String: NSToolbarItem] = [:]
    private let items = [ "chat", "address", "interaction", "select-object", "device", "tools", "code", "layers", "expand", "publish"]
    private let labels = ["select-object":"Select Object", "layers":"Show Layers", "home":"Back to Project", "address":"Preview Address", "device":"Switch to Mobile", "branch":"Branch", "publish":"Publish", "code":"Show Code", "expand":"Expand Preview"]
    private let symbols = ["select-object":"cursorarrow", "layers":"square.3.layers.3d", "home":"house", "device":"iphone", "branch":"arrow.triangle.branch", "publish":"arrow.up.circle", "code":"chevron.left.forwardslash.chevron.right", "expand":"arrow.up.left.and.arrow.down.right"]
    private var sidebarButtons: [String: NSButton] = [:]
    private var previewState: [String: Any] = [:]
    private var sidebarBeforeExpand = false
    private let chatHeader = ChatToolbarView()
    private let chatTitle = NSTextField(labelWithString: "Chat")
    private let chatActions = ChatToolbarActions(frame: .zero)
    private var addressWidth: NSLayoutConstraint?
    private var chatHeaderWidth: NSLayoutConstraint!
    private var previewTextColor = NSColor.labelColor
    private let address = NSTextField()
    private let branchMenu = NSPopUpButton(frame: .zero, pullsDown: true)

    init(window: NSWindow, canvas: NSView) {
        contentCanvas = canvas
        super.init(); self.window = window
        split.splitView.isVertical = true
        split.view.frame = window.contentLayoutRect
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        column.minWidth = 0; column.width = 230; column.resizingMask = .autoresizingMask
        outline.frame = NSRect(x: 0, y: 0, width: 230, height: 600)
        outline.autoresizingMask = [.width]
        outline.addTableColumn(column); outline.outlineTableColumn = column
        outline.headerView = nil; outline.rowSizeStyle = .custom; outline.style = .sourceList
        outline.rowHeight = SidebarRowStyle.height
        outline.columnAutoresizingStyle = .lastColumnOnlyAutoresizingStyle
        outline.indentationPerLevel = 0; outline.allowsEmptySelection = true
        outline.dataSource = self; outline.delegate = self
        outline.setAccessibilityLabel("Projects")
        outline.registerForDraggedTypes([.praxisProject])
        outline.setDraggingSourceOperationMask(.move, forLocal: true)
        let menu = NSMenu(); menu.delegate = self; outline.menu = menu
        let scroll = ProjectScrollView(); scroll.documentView = outline; scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true; scroll.scrollerStyle = .overlay
        scroll.drawsBackground = false
        let sidebarContainer = NSView()
        let projectActions = NSStackView()
        projectActions.orientation = .vertical; projectActions.alignment = .leading; projectActions.spacing = 2
        for (title, symbol, action) in [("Open Project…", "folder", "open-project"), ("New Project…", "plus", "new-project")] {
            let button = SidebarProjectButton(title: title, target: self, action: #selector(sidebarAction(_:)))
            button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
            button.identifier = NSUserInterfaceItemIdentifier(action)
            button.isBordered = false; button.setButtonType(.momentaryChange)
            button.setAccessibilityLabel(title)
            projectActions.addArrangedSubview(button)
            button.widthAnchor.constraint(equalTo: projectActions.widthAnchor).isActive = true
            button.heightAnchor.constraint(equalToConstant: SidebarRowStyle.height).isActive = true
            sidebarButtons[action] = button
        }
        let settings = NSButton(title: "", target: self, action: #selector(sidebarAction(_:)))
        settings.identifier = NSUserInterfaceItemIdentifier("settings"); settings.bezelStyle = .circular
        settings.image = NSImage(systemSymbolName: "gearshape", accessibilityDescription: nil); settings.imagePosition = .imageOnly
        settings.toolTip = "Settings"; settings.setAccessibilityLabel("Settings")
        settings.frame = NSRect(x: 0, y: 0, width: 36, height: 36)
        let settingsSurface: NSView
        if #available(macOS 26.0, *) {
            let glass = NSGlassEffectView(frame: settings.frame)
            glass.cornerRadius = 18
            settings.isBordered = false; settings.autoresizingMask = [.width, .height]
            glass.contentView = settings; settingsSurface = glass
        } else { settingsSurface = settings }
        sidebarButtons["settings"] = settings
        for view in [projectActions, scroll, settingsSurface] { view.translatesAutoresizingMaskIntoConstraints = false; sidebarContainer.addSubview(view) }
        NSLayoutConstraint.activate([
            projectActions.topAnchor.constraint(equalTo: sidebarContainer.safeAreaLayoutGuide.topAnchor, constant: 8),
            projectActions.leadingAnchor.constraint(equalTo: sidebarContainer.leadingAnchor, constant: 10),
            projectActions.trailingAnchor.constraint(equalTo: sidebarContainer.trailingAnchor, constant: -10),
            scroll.topAnchor.constraint(equalTo: projectActions.bottomAnchor, constant: 16), scroll.leadingAnchor.constraint(equalTo: sidebarContainer.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: sidebarContainer.trailingAnchor), scroll.bottomAnchor.constraint(equalTo: settingsSurface.topAnchor, constant: -12),
            settingsSurface.leadingAnchor.constraint(equalTo: sidebarContainer.leadingAnchor, constant: 12), settingsSurface.bottomAnchor.constraint(equalTo: sidebarContainer.bottomAnchor, constant: -12),
            settingsSurface.widthAnchor.constraint(equalToConstant: 36), settingsSurface.heightAnchor.constraint(equalToConstant: 36)
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
        detailItem.allowsFullHeightLayout = true
        split.addSplitViewItem(detailItem)
        window.contentViewController = split
        split.splitView.setPosition(230, ofDividerAt: 0)
        toolbar = NSToolbar(identifier: "PraxisNativePreviewToolbar")
        toolbar.delegate = self; toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false; toolbar.autosavesConfiguration = false
        chatHeader.align = { [weak self] in self?.alignChatHeader() }
        NotificationCenter.default.addObserver(self, selector: #selector(splitResized(_:)), name: NSSplitView.didResizeSubviewsNotification, object: split.splitView)
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.titleVisibility = .hidden
        window.toolbar = toolbar; window.toolbarStyle = .unified
        toolbarLayout = ToolbarLayout(toolbar: toolbar, sidebar: sidebarItem)
    }
    @objc private func splitResized(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in self?.alignChatHeader() }
    }
    func updatePreviewColor(_ color: NSColor) {
        guard let rgb = color.usingColorSpace(.sRGB) else { return }
        func linear(_ value: CGFloat) -> CGFloat { value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4) }
        let luminance = 0.2126 * linear(rgb.redComponent) + 0.7152 * linear(rgb.greenComponent) + 0.0722 * linear(rgb.blueComponent)
        let dark = luminance < 0.179
        previewTextColor = dark ? .white : .black
        let appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        address.superview?.appearance = appearance
        address.textColor = previewTextColor
        if let editor = address.currentEditor() as? NSTextView {
            editor.textColor = previewTextColor; editor.insertionPointColor = previewTextColor
        }
        if let first = branchMenu.menu?.items.first {
            first.attributedTitle = NSAttributedString(string: first.title, attributes: [.foregroundColor:previewTextColor, .font:NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)])
        }
    }
    func setChatGeometry(_ width: CGFloat) { previewState["chatWidth"] = Double(width); alignChatHeader() }
    var previewLeading: CGFloat { CGFloat(previewState["chatWidth"] as? Double ?? 440) }
    func alignChatHeader() {
        guard chatHeader.window != nil, chatHeaderWidth != nil else { return }
        let detail = split.splitViewItems[1].viewController.view
        let target = detail.convert(.zero, to: nil).x + (previewState["chatWidth"] as? Double ?? 440)
        let leading = chatHeader.convert(.zero, to: nil).x
        let width = min(max(100, target - leading), max(100, (window?.frame.width ?? 1320) - leading - 500))
        addressWidth?.constant = min(180, max(80, (window?.frame.width ?? 1320) - leading - width - 400))
        chatTitle.isHidden = currentProject == nil || chatHidden || width < 150
        if abs(chatHeaderWidth.constant - width) > 0.5 { chatHeaderWidth.constant = width }
    }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .sidebarTrackingSeparator, .flexibleSpace, .space] + items.map { NSToolbarItem.Identifier($0) }
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .sidebarTrackingSeparator, NSToolbarItem.Identifier("address"), .flexibleSpace,
         NSToolbarItem.Identifier("interaction"), .space, NSToolbarItem.Identifier("tools"), .space, NSToolbarItem.Identifier("publish")]
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar: Bool) -> NSToolbarItem? {
        let key = identifier.rawValue
        guard items.contains(key) else { return nil }
        if key == "chat", let existing = toolbarItems[key] { return existing }
        if key == "tools" || key == "interaction" {
            let actions = key == "tools" ? ["code", "layers", "expand"] : ["select-object", "device"]
            let children = actions.compactMap {
                self.toolbar(toolbar, itemForItemIdentifier: NSToolbarItem.Identifier($0), willBeInsertedIntoToolbar: willBeInsertedIntoToolbar)
            }
            let group = MomentaryToolbarGroup(identifier: identifier, items: children)
            group.label = key == "tools" ? "Preview Tools" : "Preview Interaction"
            group.isBordered = true; group.visibilityPriority = .high
            return group
        }
        let item: NSToolbarItem = ["branch", "publish"].contains(key) ? NSMenuToolbarItem(itemIdentifier: identifier) : NSToolbarItem(itemIdentifier: identifier)
        item.label = labels[key] ?? key; item.paletteLabel = item.label; item.toolTip = item.label
        item.image = toolbarSymbol(symbols[key] ?? "circle", item.label)
        // Menu-only items let AppKit open the menu from the entire control.
        if !["branch", "chat", "address"].contains(key) { item.target = self; item.action = #selector(toolbarAction(_:)) }
        if key == "chat" {
            chatHeader.translatesAutoresizingMaskIntoConstraints = false
            chatHeaderWidth = chatHeader.widthAnchor.constraint(equalToConstant: 400)
            chatTitle.font = .boldSystemFont(ofSize: NSFont.systemFontSize)
            chatTitle.lineBreakMode = .byTruncatingTail
            chatTitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            chatActions.onNewChat = { [weak self] in
                guard let project = self?.currentProject else { return }
                emit(["event":"shell-action", "action":"new-chat", "project":project])
            }
            for view in [chatTitle, chatActions] { view.translatesAutoresizingMaskIntoConstraints = false; chatHeader.addSubview(view) }
            NSLayoutConstraint.activate([
                chatHeaderWidth, chatHeader.widthAnchor.constraint(greaterThanOrEqualToConstant: 100), chatHeader.heightAnchor.constraint(equalToConstant: 32),
                chatTitle.leadingAnchor.constraint(equalTo: chatHeader.leadingAnchor, constant: 4), chatTitle.centerYAnchor.constraint(equalTo: chatHeader.centerYAnchor),
                chatTitle.trailingAnchor.constraint(lessThanOrEqualTo: chatActions.leadingAnchor, constant: -8),
                chatActions.trailingAnchor.constraint(equalTo: chatHeader.trailingAnchor, constant: -12),
                chatActions.centerYAnchor.constraint(equalTo: chatHeader.centerYAnchor),
                chatActions.widthAnchor.constraint(equalToConstant: 76), chatActions.heightAnchor.constraint(equalToConstant: 36)
            ])
            item.view = chatHeader; item.isBordered = false; item.visibilityPriority = .high
        } else if key == "address" {
            address.placeholderString = "Preview"; address.setAccessibilityLabel("Preview address")
            address.font = .boldSystemFont(ofSize: NSFont.systemFontSize); address.lineBreakMode = .byTruncatingMiddle
            address.isBordered = false; address.drawsBackground = false
            address.delegate = self; address.target = self; address.action = #selector(navigateAddress(_:))
            branchMenu.isBordered = false; branchMenu.font = .systemFont(ofSize: NSFont.smallSystemFontSize)
            branchMenu.setAccessibilityLabel("Branch"); branchMenu.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            branchMenu.cell?.lineBreakMode = .byTruncatingMiddle
            let header = NSStackView(views: [address, branchMenu]); header.orientation = .vertical; header.alignment = .leading; header.spacing = 0
            header.translatesAutoresizingMaskIntoConstraints = false
            address.translatesAutoresizingMaskIntoConstraints = false; branchMenu.translatesAutoresizingMaskIntoConstraints = false
            let width = header.widthAnchor.constraint(equalToConstant: 180); addressWidth = width
            NSLayoutConstraint.activate([header.widthAnchor.constraint(greaterThanOrEqualToConstant: 80), header.widthAnchor.constraint(lessThanOrEqualToConstant: 320), width,
                address.widthAnchor.constraint(equalTo: header.widthAnchor), branchMenu.widthAnchor.constraint(lessThanOrEqualTo: header.widthAnchor)])
            item.view = header; item.isBordered = false
        } else if key == "publish" {
            item.image = nil
            item.isBordered = true; item.visibilityPriority = .high
        }
        item.autovalidates = false; toolbarItems[key] = item
        updateToolbar()
        return item
    }
    @objc func navigateAddress(_ sender: Any?) {
        let value = address.stringValue
        window?.makeFirstResponder(nil)
        emit(["event":"shell-action", "action":"address", "value":value])
        showAddress()
    }
    private var previewAddress: String { previewState["previewURL"] as? String ?? previewState["previewBase"] as? String ?? "" }
    private func showAddress() {
        address.stringValue = previewAddress
        address.toolTip = previewAddress
    }
    func controlTextDidBeginEditing(_ notification: Notification) {
        guard let editor = address.currentEditor() else { return }
        editor.string = previewAddress; editor.selectAll(nil)
    }
    func controlTextDidEndEditing(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            if self?.address.currentEditor() == nil { self?.showAddress() }
        }
    }
    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
            showAddress()
            window?.makeFirstResponder(nil); return true
        }
        return false
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
        defer { for group in toolbar.items.compactMap({ $0 as? MomentaryToolbarGroup }) { group.refresh() } }
        for (key, item) in toolbarItems {
            item.isEnabled = key == "chat" ? true : key == "branch" ? previewState["branch"] is String : ready
            if key == "publish" { item.isEnabled = ready && !(previewState["publishing"] as? Bool ?? false) }
        }
        chatTitle.stringValue = allRows.first(where: { $0.id == selectedID })?.title ?? "Chat"
        chatTitle.toolTip = chatTitle.stringValue
        if chatHeaderWidth != nil {
            alignChatHeader()
        }
        chatTitle.isHidden = currentProject == nil || chatHidden || (chatHeaderWidth?.constant ?? 0) < 150
        let chatMenu = NSMenu(); chatMenu.autoenablesItems = false
        for row in rows.first(where: { $0.project == currentProject })?.children ?? [] {
            let entry = NSMenuItem(title: row.title + (row.running ? " · Working" : ""), action: #selector(contextAction(_:)), keyEquivalent: "")
            entry.target = self; entry.representedObject = ["event":"shell-action", "action":"select", "id":row.id, "project":row.project]
            entry.state = row.id == selectedID ? .on : .off
            entry.image = NSImage(systemSymbolName: row.kind == "history" ? "clock" : "bubble.left", accessibilityDescription: nil)
            chatMenu.addItem(entry)
        }
        if let selectedID, currentProject != nil {
            chatMenu.addItem(.separator())
            let rename = NSMenuItem(title: "Rename current chat…", action: #selector(contextAction(_:)), keyEquivalent: "")
            rename.target = self; rename.representedObject = ["event":"shell-action", "action":"rename-chat", "id":selectedID]; chatMenu.addItem(rename)
            let close = NSMenuItem(title: "Close current chat", action: #selector(contextAction(_:)), keyEquivalent: "")
            close.target = self; close.representedObject = ["event":"shell-action", "action":"close", "id":selectedID]; chatMenu.addItem(close)
        }
        chatActions.historyMenu = chatMenu; chatActions.updateEnabled(project: currentProject != nil, history: currentProject != nil && !chatMenu.items.isEmpty)
        address.isEnabled = ready
        if address.currentEditor() == nil { showAddress() }
        toolbarItems["device"]?.isEnabled = previewState["deviceEnabled"] as? Bool ?? false
        toolbarItems["select-object"]?.label = selecting ? "Stop Selecting" : "Select Object"
        toolbarItems["select-object"]?.toolTip = toolbarItems["select-object"]?.label
        toolbarItems["select-object"]?.image = toolbarSymbol(selecting ? "cursorarrow.rays" : "cursorarrow", toolbarItems["select-object"]?.label)
        let mobile = previewState["viewport"] as? String == "mobile"
        toolbarItems["device"]?.label = mobile ? "Switch to Desktop" : "Switch to Mobile"
        toolbarItems["device"]?.toolTip = toolbarItems["device"]?.label
        toolbarItems["device"]?.image = toolbarSymbol(mobile ? "desktopcomputer" : "iphone", toolbarItems["device"]?.label)
        do {
            let title = previewState["branch"] as? String ?? "Branch"
            branchMenu.toolTip = title; branchMenu.isEnabled = previewState["branch"] is String
            let menu = NSMenu(); menu.autoenablesItems = false
            func add(_ title: String, _ action: String, _ value: String = "") {
                let entry = NSMenuItem(title: title, action: #selector(previewMenuAction(_:)), keyEquivalent: ""); entry.target = self
                entry.representedObject = ["event":"shell-action", "action":action, "value":value]
                if action == "branch" { entry.state = value == previewState["branch"] as? String ? .on : .off }
                menu.addItem(entry)
            }
            add("Git Updates…", "git-updates"); menu.addItem(.separator())
            for branch in previewState["branches"] as? [String] ?? [] { add(branch, "branch", branch) }
            menu.addItem(.separator()); add("New Branch…", "new-branch")
            menu.insertItem(withTitle: title, action: nil, keyEquivalent: "", at: 0)
            menu.items.first?.attributedTitle = NSAttributedString(string: title, attributes: [.foregroundColor:previewTextColor, .font:NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)])
            branchMenu.menu = menu
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

        }
        toolbarItems["code"]?.toolTip = previewState["codeOpen"] as? Bool == true ? "Hide Code" : "Show Code"
        toolbarItems["code"]?.label = toolbarItems["code"]?.toolTip ?? "Show Code"
        toolbarItems["expand"]?.toolTip = chatHidden ? "Restore Layout" : "Expand Preview"
        toolbarItems["expand"]?.label = toolbarItems["expand"]?.toolTip ?? "Expand Preview"
        toolbarItems["expand"]?.image = toolbarSymbol(chatHidden ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right", chatHidden ? "Restore Layout" : "Expand Preview")
    }
    func update(_ state: [String: Any]) {
        applying = true; defer { applying = false }
        let rowData = state["rows"] as? [[String: Any]] ?? []
        let signature = (try? JSONSerialization.data(withJSONObject: rowData, options: [.sortedKeys])) ?? Data()
        let rowsChanged = signature != rowsSignature
        if rowsChanged { rowsSignature = signature; rows = rowData.map(ShellRow.init) }
        let nextProject = state["project"] as? String
        if nextProject != currentProject && address.currentEditor() != nil { window?.makeFirstResponder(nil) }
        let projectChanged = nextProject != currentProject
        currentProject = nextProject
        selectedID = state["selected"] as? String
        ready = state["previewReady"] as? Bool ?? false
        selecting = state["selectMode"] as? Bool ?? false
        let expandedPreview = state["chatHidden"] as? Bool ?? false
        if expandedPreview != chatHidden {
            if expandedPreview { sidebarBeforeExpand = sidebarItem.isCollapsed }
            NSAnimationContext.runAnimationGroup { context in
                context.duration = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 0.24
                context.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0, 0, 1)
                sidebarItem.animator().isCollapsed = expandedPreview || sidebarBeforeExpand
            }
        }
        chatHidden = expandedPreview
        previewState = state
        let chatIndex = toolbar.items.firstIndex { $0.itemIdentifier.rawValue == "chat" }
        let showChat = currentProject != nil && !chatHidden && (state["chatWidth"] as? Double ?? 0) > 60
        if !showChat, let index = chatIndex { toolbar.removeItem(at: index) }
        else if showChat && chatIndex == nil {
            let index = toolbar.items.firstIndex { $0.itemIdentifier.rawValue == "address" } ?? 0
            toolbar.insertItem(withItemIdentifier: NSToolbarItem.Identifier("chat"), at: index)
        }

        if rowsChanged || projectChanged { outline.reloadData() }
        if let selected = rows.first(where: { $0.project == currentProject }) {
            let index = outline.row(forItem: selected)
            if index >= 0 && outline.selectedRow != index { outline.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false) }
        } else if outline.selectedRow >= 0 { outline.deselectAll(nil) }
        window?.subtitle = ""
        updateToolbar()
    }
    var allRows: [ShellRow] { rows.flatMap { [$0] + $0.children } }
    func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int { item == nil ? rows.count : 0 }
    func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any { rows[index] }
    func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool { false }
    func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
        let row = item as! ShellRow
        let cell = ProjectCell(); cell.selected = row.project == currentProject
        let text = NSTextField(labelWithString: row.title + (row.running ? " · Working" : ""))
        text.font = SidebarRowStyle.font
        text.lineBreakMode = .byTruncatingTail
        let symbol = row.kind == "project" ? "folder" : row.kind == "history" ? "clock" : "bubble.left"
        let artwork = row.icon ?? (row.kind == "project" ? ProjectAnimal.image(for: row.project.isEmpty ? row.id : row.project) : NSImage(systemSymbolName: symbol, accessibilityDescription: nil)!)
        let icon = NSImageView(image: artwork)
        icon.imageScaling = .scaleProportionallyDown
        icon.contentTintColor = artwork.isTemplate ? .labelColor : nil
        text.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let more = cell.more
        more.bezelStyle = .inline; more.setAccessibilityLabel("Actions for " + row.title)
        (more.cell as? NSPopUpButtonCell)?.arrowPosition = .noArrow
        let menu = projectMenu(row)
        let trigger = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        trigger.image = NSImage(systemSymbolName: "ellipsis", accessibilityDescription: "Project actions")
        menu.insertItem(trigger, at: 0); more.menu = menu
        more.translatesAutoresizingMaskIntoConstraints = false; cell.addSubview(more)
        cell.addSubview(icon); cell.addSubview(text); cell.textField = text; cell.imageView = icon
        icon.translatesAutoresizingMaskIntoConstraints = false; text.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2), icon.centerYAnchor.constraint(equalTo: cell.centerYAnchor), icon.widthAnchor.constraint(equalToConstant: 16), icon.heightAnchor.constraint(equalToConstant: 16),
            text.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 7), text.trailingAnchor.constraint(equalTo: more.leadingAnchor, constant: -4), text.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            more.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -4), more.centerYAnchor.constraint(equalTo: cell.centerYAnchor), more.widthAnchor.constraint(equalToConstant: 28)
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
        for item in projectMenu(row).items { menu.addItem(item.copy() as! NSMenuItem) }
    }
    private func projectMenu(_ row: ShellRow) -> NSMenu {
        let menu = NSMenu(); menu.autoenablesItems = false
        for (title, action) in [("Project Memory…", "memory"), ("Close Project", "close")] {
            let item = NSMenuItem(title: title, action: #selector(contextAction(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = ["event":"shell-action", "action":action, "id":row.id, "project":row.project]; menu.addItem(item)
        }
        return menu
    }
    @objc func contextAction(_ item: NSMenuItem) { if let payload = item.representedObject as? [String: String] { emit(payload) } }

    // Private pipe-only integration checks exercise actual native controls.
    func inspect() -> [String: Any] {
        split.view.layoutSubtreeIfNeeded()
        let sidebarFrame = sidebar.view.convert(sidebar.view.bounds, to: nil)
        let trafficLight = window?.standardWindowButton(.closeButton)
        let trafficFrame = trafficLight.map { $0.convert($0.bounds, to: nil) } ?? .zero
        return ["sidebarContainsTrafficLights":sidebarFrame.contains(trafficFrame),
         "interactionGroup":(toolbar.items.first(where: { $0.itemIdentifier.rawValue == "interaction" }) as? NSToolbarItemGroup)?.subitems.map { $0.itemIdentifier.rawValue } ?? [], "selectMode":selecting, "projectsMenuOnly":toolbarItems["projects"]?.action == nil,
         "sidebarTop":sidebarFrame.maxY, "contentTop":window?.contentLayoutRect.maxY ?? 0,
         "detailTop":contentCanvas.convert(contentCanvas.bounds, to: nil).maxY,
         "sidebarListTop":outline.enclosingScrollView.map { $0.convert($0.bounds, to: nil).maxY } ?? 0,
         "rows":allRows.map { ["id":$0.id, "title":$0.title, "kind":$0.kind] }, "selected":selectedID ?? "", "sidebarCollapsed":sidebarItem.isCollapsed,
         "sidebarWidth":sidebar.view.bounds.width, "detailWidth":split.splitViewItems[1].viewController.view.bounds.width,
         "projectMoreRightEdges":(0..<outline.numberOfRows).compactMap { index -> CGFloat? in
             guard let cell = outline.view(atColumn: 0, row: index, makeIfNecessary: true) as? ProjectCell, let clip = outline.enclosingScrollView?.contentView else { return nil }
             cell.layoutSubtreeIfNeeded()
             return cell.more.convert(cell.more.bounds, to: clip).maxX
         }, "projectIconCount":rows.filter { $0.icon != nil }.count, "outlineClipWidth":outline.enclosingScrollView?.contentSize.width ?? 0, "outlineRows":outline.numberOfRows, "outlineWidth":outline.bounds.width,
         "toolbar":toolbar.items.map { $0.itemIdentifier.rawValue }, "branch":previewState["branch"] ?? "", "publishLabel":previewState["publishLabel"] ?? "", "codeOpen":previewState["codeOpen"] ?? false,
         "toolbarGroupsMomentary":toolbar.items.compactMap { $0 as? NSToolbarItemGroup }.allSatisfy { ($0 as? MomentaryToolbarGroup)?.hasMomentaryControl == true }, "visibleToolbar":toolbar.visibleItems?.map { $0.itemIdentifier.rawValue } ?? [], "previewHeaderLightText":previewTextColor == .white, "address":previewAddress, "domain":address.stringValue, "viewport":previewState["viewport"] ?? "", "publishStandard":toolbarItems["publish"]?.view == nil, "toolGroup":(toolbar.items.first(where: { $0.itemIdentifier.rawValue == "tools" }) as? NSToolbarItemGroup)?.subitems.map { $0.itemIdentifier.rawValue } ?? [], "sidebarAutohidesScrollers":(outline.enclosingScrollView?.autohidesScrollers ?? false), "sidebarActions":["new-project", "open-project", "settings"], "chatActions":["history", "new-chat"], "historyIDs":chatActions.historyMenu?.items.compactMap { ($0.representedObject as? [String:String])?["id"] } ?? [], "chatTitle":chatTitle.stringValue, "chatTitlePlain":toolbarItems["chat"]?.action == nil, "chatHeaderWidth":chatHeader.bounds.width, "chatHeaderTrailing":chatHeader.convert(NSPoint(x: chatHeader.bounds.maxX, y: 0), to: nil).x, "detailLeading":split.splitViewItems[1].viewController.view.convert(.zero, to: nil).x, "chatWidth":previewState["chatWidth"] ?? 0, "enabled":toolbarItems.mapValues { $0.isEnabled }]
    }
    func perform(_ action: String, id: String?) -> Bool {
        if action == "window-width", let width = Double(id ?? ""), let window, width >= 850 && width <= 2000 { var frame = window.frame; frame.size.width = width; window.setFrame(frame, display: true); return true }
        if action == "sidebar-width", let id, let width = Double(id), (180...340).contains(width) {
            split.splitView.setPosition(width, ofDividerAt: 0); split.view.layoutSubtreeIfNeeded(); return true
        }
        if action == "toggle-sidebar" {
            // No animation in the pipe test: an occluded/locked desktop can pause
            // AppKit animations even though the collapsed state already changed.
            sidebarItem.isCollapsed.toggle(); split.view.layoutSubtreeIfNeeded(); return true
        }
        if action == "new-chat", currentProject != nil { chatActions.onNewChat?(); return true }
        if action == "history-select", let entry = chatActions.historyMenu?.items.first(where: { ($0.representedObject as? [String:String])?["id"] == id }) {
            contextAction(entry); return true
        }
        if action == "select-row", let row = rows.first(where: { $0.id == id }) {
            let index = outline.row(forItem: row)
            guard index >= 0 else { return false }
            outline.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false); return true
        }
        if ["new-project", "open-project"].contains(action), let menu = (toolbarItems["projects"] as? NSMenuToolbarItem)?.menu,
           let entry = menu.items.first(where: { ($0.representedObject as? [String: String])?["action"] == action }) { contextAction(entry); return true }
        if action == "address", let value = id { address.stringValue = value; navigateAddress(nil); return true }
        if ["branch", "publish-mode"].contains(action), let value = id,
           let menu = action == "branch" ? branchMenu.menu : (toolbarItems["publish"] as? NSMenuToolbarItem)?.menu,
           let entry = menu.items.first(where: { ($0.representedObject as? [String: String])?["value"] == value && ($0.representedObject as? [String: String])?["action"] == action }), entry.isEnabled {
            previewMenuAction(entry); return true
        }
        if let button = sidebarButtons[action], button.isEnabled { sidebarAction(button); return true }
        if let group = toolbar.items.compactMap({ $0 as? MomentaryToolbarGroup }).first(where: { $0.subitems.contains { $0.itemIdentifier.rawValue == action } }) { return group.clickSegment(action) }
        guard let item = toolbarItems[action], item.isEnabled else { return false }
        toolbarAction(item); return true
    }
}
