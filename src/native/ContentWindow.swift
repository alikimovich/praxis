import AppKit

final class NativeContentWindow: NSObject, NSWindowDelegate {
    let window: NSWindow
    let editor = NativeEditingInspector()
    init(id: String) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 430, height: 660), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        super.init(); window.isReleasedWhenClosed = false; window.delegate = self; window.contentView = editor; window.center()
        editor.model.channel = "content-action"; editor.model.documentID = id
    }
    func update(_ state: [String: Any]) {
        editor.update(state); window.title = state["title"] as? String ?? "Content"
        if state["visible"] as? Bool == true { if !window.isVisible { window.makeKeyAndOrderFront(nil) } } else { window.orderOut(nil) }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { editor.model.send("close"); return false }
}
