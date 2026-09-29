import AppKit

// Test-only entrypoints are gated by the ephemeral profile in Host.swift.
// Drive the actual SwiftUI-backed AppKit picker; never assign SheetModel.values.
extension NativeSheets {
    private func renderedPickers(in view: NSView) -> [NSPopUpButton] {
        (view as? NSPopUpButton).map { [$0] } ?? view.subviews.flatMap { renderedPickers(in: $0) }
    }

    func verifySettings(_ command: [String: Any]) throws -> [String: Any] {
        func failure(_ message: String) -> NSError {
            NSError(domain: "SettingsVerification", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
        guard let panel, let content = panel.contentView, model.state?.title == "Settings" else {
            throw failure("Settings window is not open")
        }
        if command["prepare"] as? Bool == true {
            if let width = command["width"] as? Double {
                guard width >= panel.contentMinSize.width, width <= 1000 else { throw failure("Invalid Settings test width") }
                panel.setContentSize(NSSize(width: width, height: 600))
                panel.center()
            }
            NSApp.activate(ignoringOtherApps: true)
            panel.makeKeyAndOrderFront(nil)
        }
        content.layoutSubtreeIfNeeded()
        content.displayIfNeeded()
        let fields = model.state!.fields.filter { $0.kind == "choice" }
        let popups = renderedPickers(in: content).filter { !$0.isHiddenOrHasHiddenAncestor }
        func picker(_ field: SheetField) -> NSPopUpButton? {
            // Match the complete option list, not subview order or private class names.
            popups.first { $0.itemTitles == (field.choices ?? []).map(\.label) }
        }
        if let fieldID = command["field"] as? String, let value = command["value"] as? String {
            guard let field = fields.first(where: { $0.id == fieldID }),
                  let popup = picker(field), popup.isEnabled,
                  let index = field.choices?.firstIndex(where: { $0.value == value }),
                  let item = popup.item(at: index), item.isEnabled,
                  let action = item.action else { throw failure("Rendered Settings picker/choice unavailable: \(fieldID)") }
            // SwiftUI's popup owns menu-item actions, not a popup-level action.
            guard NSApp.sendAction(action, to: item.target, from: item) else { throw failure("Settings picker menu action was not dispatched") }
        }
        let controls: [[String: Any]] = fields.compactMap { field in
            guard let popup = picker(field) else { return nil }
            let rect = popup.convert(popup.bounds, to: content)
            let point = NSPoint(x: rect.midX, y: rect.midY)
            let hit = content.hitTest(content.convert(point, to: content.superview))
            return ["id": field.id, "selected": popup.titleOfSelectedItem ?? "", "enabled": popup.isEnabled,
                    "contained": !rect.isEmpty && content.bounds.contains(rect) && popup.visibleRect.contains(popup.bounds),
                    "hitTarget": hit === popup || (hit?.isDescendant(of: popup) ?? false),
                    "frame": NSStringFromRect(rect)]
        }
        return ["foreground": panel.isVisible && panel.isKeyWindow && NSApp.isActive,
                "width": content.bounds.width, "height": content.bounds.height,
                "minimumWidth": panel.contentMinSize.width, "controls": controls,
                "values": model.values, "id": model.state!.id]
    }
}
