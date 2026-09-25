import AppKit
import SwiftUI

struct SheetChoice: Decodable, Identifiable { let value: String; let label: String; var id: String { value } }
struct SheetField: Decodable, Identifiable { let id: String; let label: String; let kind: String; let value: String; let choices: [SheetChoice]? }
struct SheetAction: Decodable, Identifiable { let id: String; let label: String; let primary: Bool? }
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
        emit(["event":"sheet-action", "id":state.id, "action":action, "values":values])
    }
}
struct SheetContent: View {
    @ObservedObject var model: SheetModel
    func binding(_ field: SheetField) -> Binding<String> {
        Binding(get: { model.values[field.id] ?? field.value }, set: { model.values[field.id] = $0 })
    }
    func selected(_ field: SheetField) -> Set<String> { Set((model.values[field.id] ?? field.value).components(separatedBy: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ","))).filter { !$0.isEmpty }) }
    var body: some View {
        if let state = model.state {
            VStack(alignment: .leading, spacing: 16) {
                Text(state.title).font(.title2.bold())
                if !state.detail.isEmpty { Text(state.detail).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(state.fields) { field in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(field.label).font(.headline)
                                if field.kind == "readonly" {
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
                    }.padding(2).disabled(state.busy)
                }.frame(maxHeight: state.fields.contains { $0.kind == "multiline" || $0.kind == "multichoice" || $0.kind == "readonly" } ? 360 : 180)
                if let message = state.message, !message.isEmpty {
                    Text(message).foregroundStyle(.secondary).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                }
                HStack {
                    if state.busy { ProgressView().controlSize(.small) }
                    Spacer()
                    ForEach(state.actions) { action in
                        if action.primary == true {
                            Button(action.label) { model.perform(action.id) }.keyboardShortcut(.defaultAction).disabled(state.busy)
                        } else {
                            Button(action.label) { model.perform(action.id) }.disabled(state.busy && action.id != "cancel")
                        }
                    }
                }
            }.padding(24).frame(width: 540, height: state.fields.contains { $0.kind == "multiline" || $0.kind == "multichoice" || $0.kind == "readonly" } ? 520 : 400).background(Color(nsColor: .windowBackgroundColor))
                .onExitCommand { model.perform("cancel") }
        }
    }
}
final class NativeSheets: NSObject {
    let model = SheetModel()
    weak var parent: NSWindow?
    var panel: NSPanel?
    init(parent: NSWindow) { self.parent = parent }
    func update(_ raw: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: raw), let state = try? JSONDecoder().decode(SheetState.self, from: data) else { return }
        model.update(state)
        if panel == nil {
            let sheet = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 590, height: 440), styleMask: [.titled], backing: .buffered, defer: false)
            sheet.isReleasedWhenClosed = false; sheet.animationBehavior = .none
            sheet.contentViewController = NSHostingController(rootView: SheetContent(model: model))
            panel = sheet
            parent?.beginSheet(sheet)
        }
        panel?.title = state.title
    }
    func close(_ id: String) {
        guard model.state?.id == id else { return }
        if let panel { parent?.endSheet(panel); panel.orderOut(nil) }
        panel = nil; model.state = nil; model.values = [:]; model.filters = [:]
        parent?.makeKeyAndOrderFront(nil)
    }
    func inspect() -> [String: Any] { ["visible":panel != nil, "id":model.state?.id ?? "", "title":model.state?.title ?? "", "busy":model.state?.busy ?? false, "fields":model.state?.fields.map(\.id) ?? []] }
}
