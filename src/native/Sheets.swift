import AppKit
import SwiftUI

struct SheetChoice: Decodable, Identifiable { let value: String; let label: String; var id: String { value } }
struct SheetField: Decodable, Identifiable { let id: String; let label: String; let kind: String; let value: String; let choices: [SheetChoice]? }
struct SheetAction: Decodable, Identifiable { let id: String; let label: String; let primary: Bool?; let destructive: Bool? }
struct SheetState: Decodable { let id: String; let title: String; let detail: String; let fields: [SheetField]; let actions: [SheetAction]; let busy: Bool; let message: String? }
final class SheetModel: ObservableObject {
    @Published var state: SheetState?
    @Published var filters: [String: String] = [:]
    @Published var values: [String: String] = [:]
    func update(_ next: SheetState) {
        if state?.id != next.id {
            filters = [:]
            values = Dictionary(uniqueKeysWithValues: next.fields.map { ($0.id, $0.value) })
        }
        state = next
    }
    func perform(_ action: String) {
        guard let state, !state.busy || action == "cancel" else { return }
        if action == "cancel" && state.actions.isEmpty { return }
        emit(["event":"sheet-action", "id":state.id, "action":action, "values":values])
    }
}
struct SheetContent: View {
    @ObservedObject var model: SheetModel
    func binding(_ field: SheetField) -> Binding<String> {
        Binding(get: { model.values[field.id] ?? field.value }, set: { model.values[field.id] = $0 })
    }
    func selected(_ field: SheetField) -> Set<String> { Set((model.values[field.id] ?? field.value).components(separatedBy: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ","))).filter { !$0.isEmpty }) }
    @ViewBuilder func button(_ action: SheetAction, busy: Bool) -> some View {
        if action.primary == true && action.destructive != true {
            Button(action.label) { model.perform(action.id) }.keyboardShortcut(.defaultAction).disabled(busy)
        } else {
            Button(action.label, role: action.destructive == true ? .destructive : nil) { model.perform(action.id) }
                .disabled(busy && action.id != "cancel")
        }
    }
    var body: some View {
        if let state = model.state {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if !state.detail.isEmpty { Text(state.detail).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                        ForEach(state.fields) { field in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(field.label).font(.headline)
                                if field.kind == "image", let data = Data(base64Encoded: field.value.components(separatedBy: ",").last ?? ""), let image = NSImage(data: data) {
                                    Image(nsImage: image).resizable().scaledToFit().frame(maxHeight: 160)
                                } else if field.kind == "readonly" {
                                    Text(field.value).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                                } else if field.kind == "multiline" {
                                    TextEditor(text: binding(field)).font(.system(size: 13, design: .monospaced)).frame(minHeight: 220).accessibilityLabel(field.label)
                                } else if field.kind == "choice" {
                                    Picker(field.label, selection: binding(field)) {
                                        ForEach(field.choices ?? []) { choice in Text(choice.label).tag(choice.value) }
                                    }.labelsHidden().accessibilityLabel(field.label)
                                } else if field.kind == "multichoice" {
                                    TextField("Filter models", text: Binding(get: { model.filters[field.id] ?? "" }, set: { model.filters[field.id] = $0 })).textFieldStyle(.roundedBorder)
                                    VStack(alignment: .leading) {
                                        ForEach((field.choices ?? []).filter { (model.filters[field.id] ?? "").isEmpty || $0.label.localizedCaseInsensitiveContains(model.filters[field.id] ?? "") }) { choice in
                                            Toggle(choice.label, isOn: Binding(get: { selected(field).contains(choice.value) }, set: { enabled in
                                                var values = selected(field)
                                                if enabled { values.insert(choice.value) } else { values.remove(choice.value) }
                                                model.values[field.id] = values.sorted().joined(separator: "\n")
                                            })).toggleStyle(.checkbox)
                                        }
                                    }
                                } else if field.kind == "secure" {
                                    SecureField(field.label, text: binding(field)).textFieldStyle(.roundedBorder)
                                } else {
                                    TextField(field.label, text: binding(field)).textFieldStyle(.roundedBorder)
                                }
                            }
                        }
                        if let message = state.message, !message.isEmpty {
                            Text(message).foregroundStyle(.secondary).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(24).disabled(state.busy)
                }
                Divider()
                HStack(spacing: 12) {
                    ForEach(state.actions.filter { $0.id != "cancel" && $0.primary != true }) { button($0, busy: state.busy) }
                    if state.busy { ProgressView().controlSize(.small).accessibilityLabel("Working") }
                    Spacer(minLength: 24)
                    ForEach(state.actions.filter { $0.id == "cancel" }) { button($0, busy: state.busy) }
                    ForEach(state.actions.filter { $0.id != "cancel" && $0.primary == true }) { button($0, busy: state.busy) }
                }.padding(20)
            }.frame(minWidth: 540, minHeight: 200).background(Color(nsColor: .windowBackgroundColor))
                .onExitCommand { model.perform("cancel") }
        }
    }
}
final class NativeSheets: NSObject, NSWindowDelegate {
    let model = SheetModel()
    weak var parent: NSWindow?
    var panel: NSWindow?
    init(parent: NSWindow) { self.parent = parent }
    func update(_ raw: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: raw), let state = try? JSONDecoder().decode(SheetState.self, from: data) else { return }
        model.update(state)
        if panel == nil {
            let large = state.fields.contains { ["multiline", "multichoice", "readonly", "image"].contains($0.kind) }
            let height = large ? 560 : min(500, max(220, 160 + state.fields.count * 76))
            let sheet = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: height), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            sheet.isReleasedWhenClosed = false; sheet.animationBehavior = .none
            sheet.delegate = self; sheet.tabbingMode = .disallowed
            sheet.contentMinSize = NSSize(width: 600, height: 220)
            sheet.collectionBehavior = [.fullScreenAuxiliary]
            sheet.contentViewController = NSHostingController(rootView: SheetContent(model: model))
            sheet.setContentSize(NSSize(width: 600, height: height))
            panel = sheet
            if let parent {
                sheet.setFrameOrigin(NSPoint(x: parent.frame.midX - sheet.frame.width / 2, y: parent.frame.midY - sheet.frame.height / 2))
            } else { sheet.center() }
            sheet.makeKeyAndOrderFront(nil)
        }
        panel?.title = state.title
        panel?.standardWindowButton(.closeButton)?.isEnabled = !state.actions.isEmpty
    }
    func close(_ id: String) {
        guard model.state?.id == id else { return }
        panel?.close()
        panel = nil; model.state = nil; model.values = [:]; model.filters = [:]
        parent?.makeKeyAndOrderFront(nil)
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard sender.attachedSheet == nil else { return false }
        model.perform("cancel")
        return false // Bun owns dismissal, including stale-action and busy-operation guards.
    }
    func inspect() -> [String: Any] { ["visible":panel?.isVisible ?? false, "attached":panel?.sheetParent != nil, "closable":panel?.styleMask.contains(.closable) ?? false, "resizable":panel?.styleMask.contains(.resizable) ?? false, "id":model.state?.id ?? "", "title":model.state?.title ?? "", "busy":model.state?.busy ?? false, "fields":model.state?.fields.map(\.id) ?? []] }
}
