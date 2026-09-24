import AppKit
import WebKit

/// Direct presentation is WebKit SPI. Keep it guarded and separate from the
/// untrusted preview bridge; public isInspectable still supports Safari fallback.
enum PreviewInspector {
    static func enable(_ preferences: WKPreferences) {
        if preferences.responds(to: NSSelectorFromString("_setDeveloperExtrasEnabled:")) {
            preferences.setValue(true, forKey: "developerExtrasEnabled")
        }
    }
    static func controller(_ view: WKWebView?) -> NSObject? {
        let selector = NSSelectorFromString("_inspector")
        guard let view, view.responds(to: selector) else { return nil }
        return view.perform(selector)?.takeUnretainedValue() as? NSObject
    }
    @discardableResult static func perform(_ action: String, on view: WKWebView?) -> Bool {
        guard ["show", "showConsole", "close"].contains(action), let inspector = controller(view) else { return false }
        let selector = NSSelectorFromString(action)
        guard inspector.responds(to: selector) else { return false }
        // Keep inspector geometry separate from Praxis's managed preview slot.
        if action != "close", inspector.responds(to: NSSelectorFromString("detach")) {
            inspector.perform(NSSelectorFromString("detach"))
        }
        inspector.perform(selector)
        return true
    }
    static func status(_ view: WKWebView?) -> [String: Any] {
        guard let inspector = controller(view) else { return ["available":false, "visible":false] }
        return ["available":true, "visible":inspector.value(forKey: "isVisible") as? Bool ?? false,
                "inspectable":view?.isInspectable ?? false]
    }
}

extension Host {
    @objc func showPreviewInspector(_ sender: NSMenuItem) {
        if !PreviewInspector.perform(sender.representedObject as? String ?? "show", on: views["preview"]) {
            let alert = NSAlert()
            alert.messageText = "Open Web Inspector from Safari"
            alert.informativeText = "This WebKit version cannot open an inspector directly. In Safari, enable developer features in Settings → Advanced, then use Develop → this Mac → Praxis Native to inspect the preview."
            alert.beginSheetModal(for: window)
        }
    }
}
