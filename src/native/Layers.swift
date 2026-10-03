import AppKit

final class LayerItem: NSObject {
    var value: [String: Any]
    var children: [LayerItem] = []
    init(_ value: [String: Any]) { self.value = value }
    var path: [Int] { value["path"] as? [Int] ?? [] }
}
final class LayerOutline: NSOutlineView {
    var hovered: ((Int) -> Void)?
    override func updateTrackingAreas() { for area in trackingAreas { removeTrackingArea(area) }; super.updateTrackingAreas(); addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)) }
    override func mouseMoved(with event: NSEvent) { hovered?(row(at: convert(event.locationInWindow, from: nil))) }
    override func mouseExited(with event: NSEvent) { hovered?(-1) }
}
final class NativeLayers: NSView, NSOutlineViewDataSource, NSOutlineViewDelegate {
    let tree = LayerOutline(), status = NSTextField(labelWithString: "Layers"), scroll = NSScrollView()
    var root = "", roots: [LayerItem] = [], nodes: [LayerItem] = [], dragged: LayerItem?
    var signature = "", updating = false
    init() {
        super.init(frame: .zero); wantsLayer = true; layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor; isHidden = true
        let close = NSButton(image: NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close Layers")!, target: self, action: #selector(closeLayers)); close.isBordered = false
        let refresh = NSButton(image: NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "Refresh Layers")!, target: self, action: #selector(refreshLayers)); refresh.isBordered = false
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("layer")); tree.addTableColumn(column); tree.outlineTableColumn = column; tree.headerView = nil; tree.rowHeight = 24; tree.indentationPerLevel = 12; tree.dataSource = self; tree.delegate = self
        tree.registerForDraggedTypes([.string]); tree.setDraggingSourceOperationMask(.move, forLocal: true)
        tree.hovered = { [weak self] row in guard let self else { return }; self.send("hover", (row >= 0 ? self.tree.item(atRow: row) as? LayerItem : nil).map { ["path":$0.path] } ?? [:]) }
        scroll.documentView = tree; scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true
        status.font = .systemFont(ofSize: 11, weight: .medium); status.lineBreakMode = .byTruncatingTail
        for view in [status, close, refresh, scroll] { view.translatesAutoresizingMaskIntoConstraints = false; addSubview(view) }
        NSLayoutConstraint.activate([
            status.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10), status.topAnchor.constraint(equalTo: topAnchor, constant: 8), status.trailingAnchor.constraint(equalTo: refresh.leadingAnchor, constant: -8),
            close.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8), close.centerYAnchor.constraint(equalTo: status.centerYAnchor), refresh.trailingAnchor.constraint(equalTo: close.leadingAnchor, constant: -8), refresh.centerYAnchor.constraint(equalTo: close.centerYAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor), scroll.trailingAnchor.constraint(equalTo: trailingAnchor), scroll.topAnchor.constraint(equalTo: status.bottomAnchor, constant: 8), scroll.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }
    required init?(coder: NSCoder) { fatalError() }
    func send(_ action: String, _ data: [String: Any] = [:]) { emit(data.merging(["event":"layers-action", "root":root, "action":action]) { _, new in new }) }
    @objc func closeLayers() { send("close") }
    @objc func refreshLayers() { send("refresh") }
    func update(_ state: [String: Any]) {
        root = state["root"] as? String ?? ""; isHidden = state["visible"] as? Bool != true || root.isEmpty
        let error = state["error"] as? String ?? ""
        status.stringValue = error.isEmpty ? "Layers · \(state["total"] as? Int ?? 0)\(state["truncated"] as? Bool == true ? " (truncated)" : "")" : error; status.toolTip = status.stringValue
        let values = state["nodes"] as? [[String: Any]] ?? []
        let signature = String(data: (try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])) ?? Data(), encoding: .utf8) ?? ""
        guard signature != self.signature else { return }; self.signature = signature
        let expanded = Set(nodes.filter { tree.isItemExpanded($0) }.map { $0.path.description })
        nodes = values.map(LayerItem.init); roots = []
        let lookup = Dictionary(nodes.map { ($0.path.description, $0) }, uniquingKeysWith: { first, _ in first })
        for node in nodes { if let parent = lookup[(node.value["parentPath"] as? [Int] ?? []).description], parent !== node { parent.children.append(node) } else { roots.append(node) } }
        updating = true; tree.reloadData()
        for node in nodes where expanded.contains(node.path.description) || node.path.count <= 2 { tree.expandItem(node) }
        updating = false
    }
    func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int { (item as? LayerItem)?.children.count ?? roots.count }
    func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any { ((item as? LayerItem)?.children ?? roots)[index] }
    func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool { !(item as! LayerItem).children.isEmpty }
    func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
        let node = item as! LayerItem, tag = node.value["tag"] as? String ?? "element", id = node.value["id"] as? String ?? "", text = node.value["text"] as? String ?? ""
        let label = NSTextField(labelWithString: tag + (id.isEmpty ? "" : "#" + id) + (text.isEmpty ? "" : " · " + String(text.prefix(60)))); label.font = .systemFont(ofSize: 11); label.lineBreakMode = .byTruncatingTail; label.toolTip = node.value["source"] as? String; return label
    }
    func outlineViewSelectionDidChange(_ notification: Notification) { if !updating, let node = tree.item(atRow: tree.selectedRow) as? LayerItem { send("select", ["path":node.path]) } }
    func outlineView(_ outlineView: NSOutlineView, pasteboardWriterForItem item: Any) -> NSPasteboardWriting? { dragged = item as? LayerItem; let pasteboard = NSPasteboardItem(); pasteboard.setString(dragged?.path.description ?? "", forType: .string); return pasteboard }
    func outlineView(_ outlineView: NSOutlineView, validateDrop info: NSDraggingInfo, proposedItem item: Any?, proposedChildIndex index: Int) -> NSDragOperation { guard info.draggingSource as? NSOutlineView === tree, dragged?.value["source"] is String else { return [] }; return .move }
    func outlineView(_ outlineView: NSOutlineView, acceptDrop info: NSDraggingInfo, item: Any?, childIndex index: Int) -> Bool {
        guard let dragged else { return false }
        var target = item as? LayerItem, position = "inside"
        if index >= 0 { let siblings = target?.children ?? roots; if index < siblings.count { target = siblings[index]; position = "before" } else { target = siblings.last; position = "after" } }
        guard let target, target !== dragged, target.value["source"] is String else { return false }
        send("move", ["path":dragged.path, "target":target.path, "position":position]); self.dragged = nil; return true
    }
}
