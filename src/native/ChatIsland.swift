import SwiftUI
import AppKit

// The native wire format is deliberately smaller than a general UI interpreter.
enum IslandValue: Decodable, Equatable {
    case number(Double), text(String), toggle(Bool)
    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let bool = try? value.decode(Bool.self) { self = .toggle(bool) }
        else if let number = try? value.decode(Double.self) { self = .number(number) }
        else { self = .text(try value.decode(String.self)) }
    }
    var object: Any { switch self { case .number(let n): return n; case .text(let s): return s; case .toggle(let b): return b } }
    var number: Double { if case .number(let n) = self { return n }; return 0 }
    var text: String { switch self { case .number(let n): return String(format: "%.4g", n); case .text(let s): return s; case .toggle(let b): return b ? "true" : "false" } }
}
struct IslandField: Decodable, Identifiable {
    let id: String; let label: String; let kind: String; let value: IslandValue?
    let min: Double?; let max: Double?; let step: Double?; let unit: String?; let options: [String]?
}
struct IslandBlock: Decodable, Identifiable { let id: String; let title: String; let kind: String; let params: [String] }
struct IslandView: Decodable, Identifiable {
    let id: String; let revision: Int; let title: String; let blocks: [IslandBlock]; let fields: [IslandField]
    let sourceRevision: String; let status: String; let detail: String; let engine: String; let replay: Bool
}
struct NativeChatIsland: View {
    let island: IslandView
    @ObservedObject var model: ChatModel
    @State private var drafts: [String: IslandValue] = [:]
    @State private var dragging = false
    @State private var gesture = UUID().uuidString
    @State private var lastUpdate = Date.distantPast
    private func live(_ values: [String: IslandValue], ended: Bool = false) {
        model.controlInteraction += 1
        drafts.merge(values) { _, next in next }
        guard ended || Date().timeIntervalSince(lastUpdate) >= 0.12 else { return }
        lastUpdate = Date()
        guard let chat = model.snapshot?.chat else { return }
        emit(["event":"island-action", "chat":chat, "id":island.id, "revision":island.revision,
              "sourceRevision":island.sourceRevision, "operation":UUID().uuidString,
              "gesture":gesture, "action":"commit", "values":values.mapValues(\.object)])
        if ended { gesture = UUID().uuidString; lastUpdate = .distantPast }
    }
    private func value(_ field: IslandField) -> IslandValue { drafts[field.id] ?? field.value ?? .text("") }
    private func action(_ name: String, values: [String: IslandValue] = [:]) {
        model.islandAction(island, action: name, values: values.mapValues(\.object))
    }
    private func commit(_ field: IslandField, _ value: IslandValue) { drafts[field.id] = value; action("commit", values: [field.id:value]) }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text(island.title).font(.headline); Spacer(); Text(island.engine == "preparing" ? "Preparing…" : island.engine == "jev" ? "Jev" : "Agent").font(.caption).foregroundStyle(.secondary) }
            if !island.detail.isEmpty { Text(island.detail).font(.caption).fixedSize(horizontal: false, vertical: true) }
            ForEach(island.blocks) { block in
                VStack(alignment: .leading, spacing: 10) {
                    Text(block.title).font(.subheadline.weight(.medium))
                    let fields = block.params.compactMap { id in island.fields.first { $0.id == id } }
                    if block.kind == "point", fields.count == 2 {
                        IslandPoint(x: value(fields[0]).number, y: value(fields[1]).number,
                            xRange: (fields[0].min ?? -1)...(fields[0].max ?? 1), yRange: (fields[1].min ?? -1)...(fields[1].max ?? 1),
                            label: block.title, change: { x, y, ended in
                                dragging = !ended
                                drafts[fields[0].id] = .number(x); drafts[fields[1].id] = .number(y)
                                live([fields[0].id:.number(x), fields[1].id:.number(y)], ended: ended)
                            })
                    }
                    ForEach(fields) { field in
                        if block.kind == "point" {
                            IslandInput(label: field.label, value: value(field).text, numeric: true) { if let n = Double($0), n.isFinite { commit(field, .number(n)) } }
                        } else { fieldView(field) }
                    }
                }.disabled(island.status != "ready")
            }
            HStack {
                Button("Reload") { drafts = [:]; action("reload") }
                Button("Reset") { drafts = [:]; action("reset") }.disabled(island.status != "ready")
                Button("Undo") { drafts = [:]; action("undo") }.disabled(island.status != "ready")
                if island.replay { Button("Replay") { action("replay") }.disabled(island.status != "ready") }
            }.controlSize(.small)
        }.padding(14).background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.separator, lineWidth: 0.5))
            .onChange(of: island.sourceRevision) { _ in if !dragging { drafts = [:] } }
            .onChange(of: island.revision) { _ in drafts = [:] }
    }
    @ViewBuilder private func fieldView(_ field: IslandField) -> some View {
        switch field.kind {
        case "toggle":
            Toggle(field.label, isOn: Binding(get: { value(field) == .toggle(true) }, set: { commit(field, .toggle($0)) })).toggleStyle(.switch).controlSize(.small)
        case "select":
            Picker(field.label, selection: Binding(get: { value(field).text }, set: { commit(field, .text($0)) })) {
                ForEach(field.options ?? [], id: \.self) { Text($0).tag($0) }
            }
        case "bezier":
            IslandBezier(label: field.label, value: value(field).text) { text, ended in
                dragging = !ended
                live([field.id: .text(text)], ended: ended)
            }
        case "number":
            VStack(alignment: .leading, spacing: 4) {
                IslandInput(label: field.label + (field.unit.map { " (\($0))" } ?? ""), value: value(field).text, numeric: true) { if let n = Double($0), n.isFinite { commit(field, .number(n)) } }
                if let lower = field.min, let upper = field.max, lower < upper {
                    Slider(value: Binding(get: { Swift.min(upper, Swift.max(lower, value(field).number)) }, set: { live([field.id: .number($0)]) }), in: lower...upper, step: field.step ?? (upper-lower)/1000, onEditingChanged: { editing in
                        dragging = editing
                        if !editing { live([field.id: value(field)], ended: true) }
                    }).accessibilityLabel(field.label)
                }
            }
        default:
            IslandInput(label: field.label, value: value(field).text, numeric: false) { commit(field, .text($0)) }
        }
    }
}
private struct IslandInput: View {
    let label: String; let value: String; let numeric: Bool; let commit: (String) -> Void
    @State private var draft = ""
    @FocusState private var focused: Bool
    var body: some View {
        HStack {
            Text(label).font(.callout); Spacer(minLength: 8)
            TextField(label, text: $draft).labelsHidden().textFieldStyle(.roundedBorder).frame(maxWidth: numeric ? 90 : 200)
                .focused($focused).onSubmit { if !numeric || Double(draft)?.isFinite == true { commit(draft) } }
                .accessibilityLabel(label)
        }.onAppear { draft = value }.onChange(of: value) { next in if !focused { draft = next } }
            .onChange(of: focused) { next in if !next, draft != value, !numeric || Double(draft)?.isFinite == true { commit(draft) } }
    }
}
private struct IslandPoint: View {
    let x: Double; let y: Double; let xRange: ClosedRange<Double>; let yRange: ClosedRange<Double>
    let label: String; let change: (Double, Double, Bool) -> Void
    var body: some View {
        GeometryReader { geo in
            let width = max(1, geo.size.width - 20), height = max(1, geo.size.height - 20)
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(.background)
                Path { p in p.move(to: CGPoint(x: 10, y: geo.size.height/2)); p.addLine(to: CGPoint(x: geo.size.width-10, y: geo.size.height/2)); p.move(to: CGPoint(x: geo.size.width/2, y: 10)); p.addLine(to: CGPoint(x: geo.size.width/2, y: geo.size.height-10)) }.stroke(.secondary.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [3]))
                Circle().fill(.tint).frame(width: 14, height: 14).position(x: 10 + CGFloat((x-xRange.lowerBound)/(xRange.upperBound-xRange.lowerBound))*width, y: 10 + CGFloat((y-yRange.lowerBound)/(yRange.upperBound-yRange.lowerBound))*height)
            }.contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onChanged { v in update(v.location, width, height, false) }.onEnded { v in update(v.location, width, height, true) })
        }.frame(height: 120).accessibilityLabel(label + ". Use the coordinate fields below for keyboard adjustment.")
    }
    private func update(_ p: CGPoint, _ width: CGFloat, _ height: CGFloat, _ end: Bool) {
        let x = min(1, max(0, (p.x-10)/width)), y = min(1, max(0, (p.y-10)/height))
        change(xRange.lowerBound + x*(xRange.upperBound-xRange.lowerBound), yRange.lowerBound + y*(yRange.upperBound-yRange.lowerBound), end)
    }
}
private struct IslandBezier: View {
    let label: String; let value: String; let commit: (String, Bool) -> Void
    @State private var points: [Double] = [0.25, 0.1, 0.25, 1]
    @State private var dragging = false
    private func load() {
        let regex = try! NSRegularExpression(pattern: "-?\\d*\\.?\\d+")
        let numbers = regex.matches(in: value, range: NSRange(value.startIndex..., in: value)).compactMap { Range($0.range, in: value).flatMap { Double(value[$0]) } }
        if numbers.count == 4 { points = numbers }
    }
    private func save(ended: Bool = true) { commit("cubic-bezier(\(points.map { String(format: "%.4g", $0) }.joined(separator: ", ")))", ended) }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.callout)
            GeometryReader { geo in
                let w = max(1, geo.size.width-24), h = max(1, geo.size.height-24)
                let a = CGPoint(x: 12, y: h+12), b = CGPoint(x: w+12, y: 12)
                let c = CGPoint(x: 12+points[0]*w, y: 12+(1-points[1])*h), d = CGPoint(x: 12+points[2]*w, y: 12+(1-points[3])*h)
                ZStack {
                    RoundedRectangle(cornerRadius: 8).fill(.background)
                    Path { p in p.move(to: a); p.addLine(to: c); p.move(to: b); p.addLine(to: d) }.stroke(.secondary, lineWidth: 1)
                    Path { p in p.move(to: a); p.addCurve(to: b, control1: c, control2: d) }.stroke(.tint, lineWidth: 2)
                    ForEach(0..<2) { i in
                        Circle().fill(.tint).frame(width: 14, height: 14).position(i == 0 ? c : d)
                            .gesture(DragGesture(coordinateSpace: .named("curve-" + label)).onChanged { v in
                                dragging = true; points[i*2] = min(1, max(0, (v.location.x-12)/w)); points[i*2+1] = min(2, max(-1, 1-(v.location.y-12)/h)); save(ended: false)
                            }.onEnded { _ in dragging = false; save() })
                    }
                }.coordinateSpace(name: "curve-" + label)
            }.frame(height: 130)
            HStack {
                Button("Linear") { points = [0,0,1,1]; save() }
                Button("Ease") { points = [0.25,0.1,0.25,1]; save() }
                Button("Ease out") { points = [0,0,0.58,1]; save() }
            }.controlSize(.small)
            IslandInput(label: "Coordinates", value: value, numeric: false) { commit($0, true) }
        }.onAppear(perform: load).onChange(of: value) { _ in if !dragging { load() } }
    }
}
