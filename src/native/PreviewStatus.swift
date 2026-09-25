import AppKit
import SwiftUI
final class PreviewStatusModel: ObservableObject {
    @Published var kind = "idle"
    @Published var message = ""
    @Published var project = ""
    @Published var command = ""
    let cat = CatAnimator()
    func action(_ name: String) { emit(["event":"native-preview-action", "action":name, "project":project, "command":command]) }
}
struct PreviewStatusContent: View {
    @ObservedObject var model: PreviewStatusModel
    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor)
            VStack(spacing: 18) {
                NativeCat(animator: model.cat).scaleEffect(1.5).padding(12)
                Text(model.message).multilineTextAlignment(.center).textSelection(.enabled)
                if model.kind == "setup" || model.kind == "error" {
                    TextField("Dev command (optional)", text: $model.command).textFieldStyle(.roundedBorder).frame(maxWidth: 360)
                    HStack {
                        Button(model.command.isEmpty ? "Retry" : "Run") { model.action("run") }
                        if model.kind == "error" { Button("Diagnose…") { model.action("diagnose") }; Button("Activity") { model.action("logs") } }
                    }
                }
            }.padding(30).frame(maxWidth: 520)
        }
    }
}
final class NativePreviewStatus: NSHostingView<PreviewStatusContent> {
    let model = PreviewStatusModel()
    init() { super.init(rootView: PreviewStatusContent(model: model)); sizingOptions = []; isHidden = true }
    required init(rootView: PreviewStatusContent) { fatalError("init(rootView:) has not been implemented") }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func update(_ state: [String: Any]) {
        let status = state["previewStatus"] as? [String: Any] ?? [:]
        let kind = status["kind"] as? String ?? "idle"
        let project = state["project"] as? String ?? ""
        if model.project != project { model.command = "" }
        model.project = project; model.kind = kind
        model.message = kind == "setup" ? "Plan your project in chat, or enter a command to start its preview." : status["message"] as? String ?? status["label"] as? String ?? ""
        isHidden = project.isEmpty || !["busy", "setup", "error"].contains(kind)
        model.cat.update(running: kind == "busy", questioning: false); model.cat.show(!isHidden)
    }
}
