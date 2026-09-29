import AppKit
import SwiftUI

var emitted: [[String: Any]] = []
func emit(_ event: [String: Any]) { emitted.append(event) }
func require(_ condition: Bool, _ message: String) {
    if !condition { fatalError(message) }
}
let app = NSApplication.shared
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: 600), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
window.contentMinSize = NSSize(width: 600, height: 220)
let sheets = NativeSheets(parent: window)
sheets.panel = window
let raw: [String: Any] = ["id":"fixture", "title":"Settings", "detail":"Changes save automatically.", "busy":false, "autosave":true,
    "fields":[
        ["id":"projectUi", "label":"Experimental Gen UI", "kind":"choice", "value":"false", "help":"Generate UI using your project’s existing components and styles. Experimental; supports React and Svelte.", "choices":[["value":"false", "label":"Off"], ["value":"true", "label":"On"]]],
        ["id":"engine", "label":"UI layout method", "kind":"choice", "value":"agent", "visibleWhen":["field":"projectUi", "value":"true"], "help":"Chat model uses your selected chat model to arrange components. Jev uses a separate layout model and requires an AI Gateway API key.", "choices":[["value":"agent", "label":"Chat model"], ["value":"jev", "label":"Jev layout engine"]]]
    ], "actions":[]]
let state = try JSONDecoder().decode(SheetState.self, from: JSONSerialization.data(withJSONObject: raw))
sheets.model.update(state)
// Match production: NSHostingController propagates SwiftUI minimum sizing to NSWindow.
window.contentViewController = NSHostingController(rootView: SheetContent(model: sheets.model))
window.setContentSize(NSSize(width: 600, height: 600))
func settle() {
    for _ in 0..<8 {
        window.contentView?.layoutSubtreeIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.02))
    }
    require(!window.isVisible, "Windowless fixture must never show a window")
}
func ids() throws -> [String] {
    let result = try sheets.verifySettings([:])
    let controls = result["controls"] as! [[String:Any]]
    require(result["foreground"] as? Bool == false, "Hidden window must not qualify as foreground evidence")
    for control in controls {
        require(control["contained"] as? Bool == true, "Picker geometry must remain inside content")
        require(control["hitTarget"] as? Bool == true, "Picker must own its hit target")
        let id = control["id"] as! String
        let field = state.fields.first { $0.id == id }!
        let label = field.choices!.first { $0.value == sheets.model.values[id] }!.label
        require(control["selected"] as? String == label, "Rendered picker label must match bound value")
    }
    return controls.map { $0["id"] as! String }.sorted()
}
settle()
require(window.contentMinSize.width == 540, "NSHostingController must expose the actual SwiftUI 540-point minimum")
for width in [window.contentMinSize.width, 600.0, 800.0] {
    window.setContentSize(NSSize(width: width, height: 600)); settle()
    require(abs(window.contentView!.bounds.width - width) <= 1, "Requested width must reach real content layout")
    require(window.contentMinSize.width == 540, "Minimum must remain stable after resize")
    require(try ids() == ["projectUi"], "Off must have one rendered picker")
    _ = try sheets.verifySettings(["field":"projectUi", "value":"true"]); settle()
    require(try ids() == ["engine", "projectUi"], "On must render engine picker")
    _ = try sheets.verifySettings(["field":"engine", "value":"jev"]); settle()
    _ = try ids()
    require(sheets.model.values["engine"] == "jev", "Native picker target/action must update the real SwiftUI binding")
    _ = try sheets.verifySettings(["field":"projectUi", "value":"false"]); settle()
    require(try ids() == ["projectUi"], "Off must remove native engine picker")
    require(sheets.model.values["engine"] == "jev", "Hidden engine value must survive")
    do {
        _ = try sheets.verifySettings(["field":"engine", "value":"agent"])
        fatalError("Hidden picker must reject interaction")
    } catch {}
    _ = try sheets.verifySettings(["field":"projectUi", "value":"true"]); settle()
    _ = try sheets.verifySettings(["field":"engine", "value":"agent"]); settle()
    _ = try sheets.verifySettings(["field":"projectUi", "value":"false"]); settle()
}
require(emitted.count == 18, "Every native choice must emit exactly one autosave action")
require(emitted.allSatisfy { $0["action"] as? String == "change" }, "Picker must use the autosave path")
print("NATIVE SETTINGS LAYOUT PASS — windowless real picker bindings at 540/600/800 points; hidden controls cannot be invoked; engine preservation and autosave emission")
