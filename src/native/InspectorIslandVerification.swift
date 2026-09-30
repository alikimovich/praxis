import AppKit

/// Test-only (ephemeral profile) checks for the floating inspector island: window
/// resizes, a left-edge drag, hit targets around the island and its own scrolling.
extension Host {
    func verifyInspectorIsland(_ c: [String: Any]) -> [String: Any] {
        if let width = c["windowWidth"] as? Double, let height = c["windowHeight"] as? Double {
            let size = NSSize(width: max(window.minSize.width, width), height: max(window.minSize.height, height))
            window.setFrame(NSRect(x: window.frame.minX, y: window.frame.maxY - size.height, width: size.width, height: size.height), display: true)
        }
        if c["prepare"] as? Bool == true { NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil) }
        // The same path as a pointer drag on the island's left edge.
        if let delta = c["drag"] as? Double { nativeLayout.inspectorDivider.changed?(CGFloat(delta)) }
        window.contentView?.superview?.layoutSubtreeIfNeeded(); nativeLayout.layout(); editingInspector.layoutSubtreeIfNeeded()
        let island = editingInspector.frame, divider = nativeLayout.inspectorDivider
        let preview = views["preview"]?.frame ?? .zero, area = nativeLayout.previewArea
        func target(_ point: NSPoint) -> String {
            guard let hit = canvas.hitTest(canvas.convert(point, to: canvas.superview)) else { return "none" }
            if hit.isDescendant(of: editingInspector) { return "inspector" }
            if let page = views["preview"], hit.isDescendant(of: page) { return "preview" }
            return hit === divider ? "divider" : String(describing: type(of: hit))
        }
        var hits: [String: String] = [:]
        if !island.isEmpty {
            hits["inside"] = target(NSPoint(x: island.midX, y: island.midY))
            hits["edge"] = target(NSPoint(x: island.minX, y: island.midY))
            hits["above"] = target(NSPoint(x: island.midX, y: island.minY - NativeEditingInspector.inset / 2))
            // Only where the preview shows beside the island, clear of the chat divider on its leading edge.
            if island.minX - preview.minX >= 40 { hits["left"] = target(NSPoint(x: island.minX - 16, y: island.midY)) }
        }
        var report: [String: Any] = ["visible":!editingInspector.isHidden, "glass":editingInspector.glass, "cornerRadius":Double(NativeEditingInspector.cornerRadius), "inset":Double(NativeEditingInspector.inset),
            "island":rect(island), "preview":rect(preview), "area":rect(area), "canvas":rect(canvas.bounds), "divider":rect(divider.isHidden ? .zero : divider.frame),
            "window":["width":Double(window.frame.width), "height":Double(window.frame.height)], "minWindow":["width":Double(window.minSize.width), "height":Double(window.minSize.height)],
            // Window coordinates: the toolbar and address bar end at contentLayoutRect's top.
            "toolbarGap":Double(window.contentLayoutRect.maxY - editingInspector.convert(editingInspector.bounds, to: nil).maxY),
            "inspectorWidth":Double(nativeLayout.inspectorWidth), "hits":hits]
        if let scroll = firstScrollView(in: editingInspector) {
            let frame = scroll.convert(scroll.bounds, to: canvas), visible = scroll.contentView.bounds.height
            let document = scroll.documentView?.frame.height ?? 0
            var scrolled = 0.0
            if c["scroll"] as? Bool == true, document > visible {
                scroll.contentView.scroll(to: NSPoint(x: 0, y: scroll.documentView?.isFlipped == false ? 0 : document - visible))
                scroll.reflectScrolledClipView(scroll.contentView)
                scrolled = Double(abs(scroll.contentView.bounds.minY - (scroll.documentView?.isFlipped == false ? document - visible : 0)))
            }
            report["scroll"] = ["frame":rect(frame), "visible":Double(visible), "document":Double(document), "scrolled":scrolled]
        }
        return report
    }
    private func rect(_ r: NSRect) -> [String: Double] { ["x":Double(r.minX), "y":Double(r.minY), "width":Double(r.width), "height":Double(r.height)] }
    private func firstScrollView(in view: NSView) -> NSScrollView? {
        for child in view.subviews { if let scroll = child as? NSScrollView { return scroll }; if let found = firstScrollView(in: child) { return found } }
        return nil
    }
    @MainActor func captureInspectorIsland() async throws -> [String: Any] {
        guard let content = window.contentView?.superview else { throw NSError(domain: "InspectorIsland", code: 1, userInfo: [NSLocalizedDescriptionKey: "No window content"]) }
        return try await captureVisibleRegion(window: window, view: content, region: content.bounds, recognize: false)
    }
}
