import AppKit
import SwiftUI

struct InspectorToken: Decodable, Identifiable { let id: String; let label: String }
struct InspectorField: Decodable, Identifiable {
    let id: String, label: String, group: String, kind: String, value: String
    let disabled: Bool?, detail: String?, options: [String]?, min: Double?, max: Double?, step: Double?, unit: String?, tokens: [InspectorToken]?, reset: Bool?
}
struct InspectorAction: Decodable, Identifiable { let id: String; let label: String }
struct InspectorState: Decodable { let root: String; let generation: Int; let visible: Bool; let title: String; let tab: String; let fields: [InspectorField]; let actions: [InspectorAction]; let error: String; let busy: Bool }
final class InspectorModel: ObservableObject {
    var channel = "inspector-action"
    var documentID: String?
    @Published var state: InspectorState?
    func send(_ action: String, field: String? = nil, value: String? = nil) {
        guard let state else { return }
        var message: [String: Any] = ["event":channel, "root":state.root, "generation":state.generation, "action":action]
        if let documentID { message["documentID"] = documentID }
        if let field { message["field"] = field }; if let value { message["value"] = value }; emit(message)
    }
}
struct InspectorFieldView: View {
    let field: InspectorField
    @ObservedObject var model: InspectorModel
    @State var value: String = ""
    @FocusState var focused: Bool
    func apply() { model.send("apply", field: field.id, value: value) }
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(field.label).font(.system(size: 11, weight: .medium))
                Spacer()
                if let unit = field.unit, !unit.isEmpty { Text(unit).foregroundStyle(.secondary).font(.caption) }
                if let tokens = field.tokens, !tokens.isEmpty {
                    Menu { ForEach(tokens) { token in Button(token.label) { model.send("token", field: field.id, value: token.id) } } } label: { Image(systemName: "swatchpalette") }.menuStyle(.borderlessButton).fixedSize().help("Choose design token")
                }
                if field.reset == true { Button { model.send("reset", field: field.id) } label: { Image(systemName: "arrow.counterclockwise") }.buttonStyle(.plain).help("Reset to default") }
            }
            if field.kind == "action" { Button(field.label) { model.send(field.value) } }
            else if field.kind == "multiline" { TextEditor(text: $value).font(.system(size: 12)).frame(minHeight: 80).focused($focused).accessibilityLabel(field.label) }
            else if field.kind == "readonly" { Text(field.value).textSelection(.enabled).font(.system(size: 11)).foregroundStyle(.secondary) }
            else if field.kind == "toggle" {
                Toggle(field.label, isOn: Binding(get: { value == "true" }, set: { value = String($0); apply() })).labelsHidden().toggleStyle(.checkbox)
            } else if field.kind == "select" {
                Picker(field.label, selection: Binding(get: { value }, set: { value = $0; apply() })) {
                    if !(field.options ?? []).contains(value) { Text(value.isEmpty ? "Default" : value).tag(value) }
                    ForEach(field.options ?? [], id: \.self) { Text($0).tag($0) }
                }.labelsHidden()
            } else {
                HStack {
                    TextField(field.label, text: $value).textFieldStyle(.roundedBorder).focused($focused).onSubmit { apply() }
                    if field.kind == "color" {
                        ColorPicker("Color", selection: Binding(get: { Color(nsColor: editorColor(value)) }, set: { color in let c = NSColor(color).usingColorSpace(.deviceRGB) ?? .black; value = String(format: "rgba(%d, %d, %d, %.3f)", Int(c.redComponent * 255), Int(c.greenComponent * 255), Int(c.blueComponent * 255), c.alphaComponent); model.send("preview", field: field.id, value: value) })).labelsHidden()
                    }
                    Button { apply() } label: { Image(systemName: "checkmark") }.buttonStyle(.borderless).accessibilityLabel("Apply " + field.label).help("Apply value")
                }
                if field.kind == "number", let minimum = field.min, let maximum = field.max, maximum > minimum, let number = Double(value) {
                    Slider(value: Binding(get: { Swift.min(maximum, Swift.max(minimum, Double(value) ?? number)) }, set: { value = String($0); model.send("preview", field: field.id, value: value) }), in: minimum...maximum, step: field.step ?? 1, onEditingChanged: { editing in if !editing { apply() } }).accessibilityLabel(field.label)
                }
                if field.kind == "bezier" { NativeBezier(value: $value, preview: { model.send("preview", field: field.id, value: value) }, commit: apply).frame(height: 110) }
            }
            if let detail = field.detail, !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary).textSelection(.enabled) }
        }.disabled(field.disabled == true || model.state?.busy == true)
            .onAppear { value = field.value }
            .onChange(of: value) { next in if model.state?.tab == "content" && next != field.value { model.send("draft", field: field.id, value: next) } }
            .onChange(of: field.value) { next in if !focused { value = next } }
    }
}
private func editorColor(_ value: String) -> NSColor {
    if value.hasPrefix("#") { var raw = String(value.dropFirst()); if raw.count == 3 { raw = raw.map { "\($0)\($0)" }.joined() }; if let n = UInt64(raw, radix: 16), raw.count == 6 { return NSColor(red: Double((n >> 16) & 255) / 255, green: Double((n >> 8) & 255) / 255, blue: Double(n & 255) / 255, alpha: 1) } }
    if let regex = try? NSRegularExpression(pattern: "[0-9]+(?:\\.[0-9]+)?") { let text = value as NSString; let numbers = regex.matches(in: value, range: NSRange(location: 0, length: text.length)).compactMap { Double(text.substring(with: $0.range)) }; if numbers.count >= 3 { return NSColor(red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255, alpha: numbers.count > 3 ? numbers[3] : 1) } }
    return .black
}
struct NativeBezier: View {
    @Binding var value: String
    let preview: () -> Void, commit: () -> Void
    var points: [Double] {
        let presets: [String: [Double]] = ["linear":[0,0,1,1], "ease":[0.25,0.1,0.25,1], "ease-in":[0.42,0,1,1], "ease-out":[0,0,0.58,1], "ease-in-out":[0.42,0,0.58,1]]
        if let preset = presets[value] { return preset }
        let stripped = value.replacingOccurrences(of: "cubic-bezier(", with: "").replacingOccurrences(of: ")", with: "")
        let values = stripped.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }; return values.count == 4 ? values : [0.25,0.1,0.25,1]
    }
    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size, p = points
            let start = CGPoint(x: 12, y: size.height - 12), end = CGPoint(x: size.width - 12, y: 12)
            let one = CGPoint(x: 12 + p[0] * (size.width - 24), y: size.height - 12 - p[1] * (size.height - 24)), two = CGPoint(x: 12 + p[2] * (size.width - 24), y: size.height - 12 - p[3] * (size.height - 24))
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.04))
                Path { path in path.move(to: start); path.addLine(to: one); path.move(to: end); path.addLine(to: two) }.stroke(Color.secondary.opacity(0.4), lineWidth: 1)
                Path { path in path.move(to: start); path.addCurve(to: end, control1: one, control2: two) }.stroke(Color.accentColor, lineWidth: 2)
                ForEach(0..<2) { index in
                    Circle().fill(Color.accentColor).frame(width: 12, height: 12).position(index == 0 ? one : two)
                        .gesture(DragGesture(coordinateSpace: .named("curve")).onChanged { drag in var next = points; next[index * 2] = min(1, max(0, (drag.location.x - 12) / (size.width - 24))); next[index * 2 + 1] = min(2, max(-1, (size.height - 12 - drag.location.y) / (size.height - 24))); value = "cubic-bezier(" + next.map { String(format: "%.3f", $0) }.joined(separator: ", ") + ")"; preview() }.onEnded { _ in commit() })
                        .accessibilityLabel("Control point \(index + 1); edit coordinates in the field above")
                }
            }.coordinateSpace(name: "curve")
        }
    }
}
struct EditingInspectorContent: View {
    @ObservedObject var model: InspectorModel
    var body: some View {
        if let state = model.state {
            VStack(alignment: .leading, spacing: 10) {
                HStack { Text(state.title).font(.headline).lineLimit(1); Spacer(); Menu { ForEach(state.actions) { action in Button(action.label) { model.send(action.id) } } } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).fixedSize(); Button { model.send("close") } label: { Image(systemName: "xmark") }.buttonStyle(.plain) }
                if state.tab != "content" { Picker("Inspector section", selection: Binding(get: { state.tab }, set: { model.send("tab", value: $0) })) { Text("Props").tag("props"); Text("Styles").tag("styles"); Text("Custom").tag("custom") }.pickerStyle(.segmented).labelsHidden() }
                if state.busy { ProgressView().controlSize(.small) }
                if !state.error.isEmpty { Text(state.error).foregroundStyle(.red).font(.caption).textSelection(.enabled) }
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(state.fields.enumerated()), id: \.element.id) { index, field in
                            if index == 0 || field.group != state.fields[index - 1].group { if !field.group.isEmpty { Text(field.group.capitalized).font(.headline).padding(.top, 5) } }
                            InspectorFieldView(field: field, model: model)
                        }
                    }.id("\(state.root):\(state.generation)").padding(2)
                }
            }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(nsColor: .windowBackgroundColor))
        }
    }
}
final class NativeEditingInspector: NSHostingView<EditingInspectorContent> {
    let model = InspectorModel()
    init() { super.init(rootView: EditingInspectorContent(model: model)); sizingOptions = []; isHidden = true }
    required init(rootView: EditingInspectorContent) { fatalError() }
    required init?(coder: NSCoder) { fatalError() }
    func update(_ value: [String: Any]) { guard let data = try? JSONSerialization.data(withJSONObject: value), let state = try? JSONDecoder().decode(InspectorState.self, from: data) else { return }; model.state = state; isHidden = !state.visible }
}
