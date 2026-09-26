import AppKit
import SwiftUI

struct ChatSegment: Decodable { let kind: String; let text: String?; let statuses: [String]?; let island: IslandView? }
struct ChatAttachment: Decodable, Identifiable { let id: String; let kind: String?; let name: String?; let path: String?; let url: String? }
struct ChatSelection: Decodable { let tag: String; let ident: String; let source: String? }
struct ChatMessage: Decodable, Identifiable {
    let id: String; let role: String; let text: String; let segments: [ChatSegment]
    let attachments: [ChatAttachment]?; let selection: ChatSelection?; let revertGroup: String?
}
struct ChatAction: Decodable { let label: String; let action: String; let value: String?; let disabled: Bool? }
struct ChatCard: Decodable, Identifiable { let id: String; let title: String; let detail: String?; let actions: [ChatAction] }
struct ChatQuestionOption: Decodable { let label: String; let description: String? }
struct ChatQuestion: Decodable { let header: String; let question: String; let options: [ChatQuestionOption]; let multiSelect: Bool }
struct ChatQuestionRequest: Decodable, Identifiable { let id: String; let questions: [ChatQuestion] }
struct ChatSnapshot: Decodable {
    let activity: ChatActivityState?; let streamingId: String?
    let chat: String; let messages: [ChatMessage]; let running: Bool; let cards: [ChatCard]
    let questions: [ChatQuestionRequest]; let status: String; let statusDetail: String?
}
final class ChatModel: ObservableObject {
    let cat = CatAnimator()
    @Published var snapshot: ChatSnapshot?
    @Published var revision = 0
    @Published var visible = false
    @Published var composerHeight: CGFloat = 0
    var messageFrames: [String: CGRect] = [:]
    var bottomPosition: CGFloat = 0
    var bottomInset: CGFloat { composerHeight + ChatComposerFade.footerHeight + ChatComposerFade.transitionHeight }
    func islandAction(_ island: IslandView, action: String, values: [String: Any] = [:]) {
        guard let chat = snapshot?.chat else { return }
        emit(["event":"island-action", "chat":chat, "id":island.id, "revision":island.revision,
              "sourceRevision":island.sourceRevision, "operation":UUID().uuidString, "action":action, "values":values])
    }
    func action(_ name: String, id: String? = nil, value: String? = nil, answers: [String: String]? = nil) {
        guard let chat = snapshot?.chat else { return }
        var message: [String: Any] = ["event":"chat-action", "chat":chat, "action":name]
        if let id { message["id"] = id }; if let value { message["value"] = value }
        if let answers { message["answers"] = answers }
        emit(message)
    }
}

/// Native conversation extends behind the composer; AppKit owns both frames.
final class NativeChat: NSHostingView<ChatConversation> {
    let model = ChatModel()
    var lastState: [String: Any] = [:]
    init() { super.init(rootView: ChatConversation(model: model)); isHidden = true; sizingOptions = [] }
    required init(rootView: ChatConversation) { fatalError("init(rootView:) has not been implemented") }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func update(_ state: [String: Any], composer: NativeComposer) {
        lastState = state
        isHidden = !(state["visible"] as? Bool ?? false)
        model.visible = !isHidden
        if let data = try? JSONSerialization.data(withJSONObject: state), let snapshot = try? JSONDecoder().decode(ChatSnapshot.self, from: data) {
            let completed = model.snapshot?.chat == snapshot.chat && model.snapshot?.running == true && !snapshot.running && !(snapshot.messages.last?.text.contains("⚠️") ?? false)
            model.cat.update(running: snapshot.running, questioning: !snapshot.questions.isEmpty || snapshot.cards.contains { $0.actions.contains { $0.action == "permission" } }, completed: completed)
            model.snapshot = snapshot; model.revision += 1
        }
        model.cat.show(!isHidden)
        place(state, composer: composer)
    }
    func place(_ state: [String: Any], composer: NativeComposer) {
        let visible = state["visible"] as? Bool ?? false
        if model.visible != visible { model.visible = visible }
        guard let bounds = state["bounds"] as? [String: Double] else { return }
        let x = bounds["x"] ?? 0, y = bounds["y"] ?? 0, width = bounds["width"] ?? 0, height = bounds["height"] ?? 0
        guard [x,y,width,height].allSatisfy({ $0.isFinite && abs($0) < 100000 }) else { return }
        var input = state["composer"] as? [String: Any] ?? [:]
        let value = input["text"] as? String ?? ""
        let hasContext = !(input["context"] as? String ?? "").isEmpty
        let queueHeight = ComposerQueueHost.height(count: (input["queue"] as? [Any] ?? []).count, paused: input["queuePaused"] as? Bool ?? false)
        let composerHeight = Double(composer.preferredHeight(for: value, width: max(0, width - 20), availableHeight: height, hasContext: hasContext, hasAttachments: !(input["attachments"] as? [Any] ?? []).isEmpty, queueHeight: queueHeight))
        frame = NSRect(x: x, y: y, width: width, height: max(0, height))
        if model.composerHeight != composerHeight { model.composerHeight = composerHeight }
        input["chat"] = state["chat"]; input["visible"] = !isHidden && !(state["chat"] as? String ?? "").isEmpty
        input["bounds"] = ["x":x + 10, "y":y + max(0, height - composerHeight), "width":max(0, width - 20), "height":composerHeight]
        composer.update(input)
    }
    func inspect() -> [String: Any] {
        ["visibleMessageIDs":model.messageFrames.filter { $0.value.maxY > 0 && $0.value.minY < bounds.height - model.bottomInset }.map(\.key), "bottomPosition":model.bottomPosition, "composerInset":model.bottomInset, "height":bounds.height, "catPose":model.cat.pose, "catFrame":model.cat.frame, "catArtwork":!CatArtwork.frames.isEmpty, "frame":NSStringFromRect(frame), "native":true, "visible":!isHidden, "chat":model.snapshot?.chat ?? "", "messageCount":model.snapshot?.messages.count ?? 0,
         "messages":model.snapshot?.messages.map { ["id":$0.id,"role":$0.role,"text":$0.text] } ?? [],
         "activity":model.snapshot?.activity?.label ?? "", "activityKind":model.snapshot?.activity?.kind ?? "", "activityAnimated":model.snapshot?.activity?.animated ?? false,
         "islands":model.snapshot?.messages.flatMap { $0.segments.compactMap { $0.island }.map { ["id":$0.id,"revision":$0.revision,"status":$0.status,"title":$0.title,"blocks":$0.blocks.count,"fields":$0.fields.count] as [String: Any] } } ?? [],
         "cards":model.snapshot?.cards.map(\.id) ?? [], "questionCount":model.snapshot?.questions.count ?? 0]
    }
}
private struct BottomPosition: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
private struct MessagePositions: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue()) { _, new in new } }
}
struct ChatConversation: View {
    @ObservedObject var model: ChatModel
    @State private var follows = true
    @State private var sticky: String?
    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { viewport in
                ScrollViewReader { proxy in
                    let readingHeight = max(1, viewport.size.height - model.bottomInset)
                    let bottomAnchor = UnitPoint(x: 0.5, y: readingHeight / max(1, viewport.size.height))
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 20) {
                            if let snapshot = model.snapshot {
                                if snapshot.messages.isEmpty && snapshot.cards.isEmpty {
                                    Text("Ask for a change, or open a project to preview it on the right.")
                                        .foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 28)
                                }
                                ForEach(snapshot.messages) { message in
                                    NativeMessageRow(message: message, running: snapshot.running && message.id == snapshot.streamingId, activity: message.id == snapshot.streamingId ? snapshot.activity : nil, model: model).id(message.id)
                                        .background(GeometryReader { geometry in Color.clear.preference(key: MessagePositions.self, value: [message.id:geometry.frame(in: .named("chatScroll"))]) })
                                }
                                if let activity = snapshot.activity, !snapshot.messages.contains(where: { $0.id == snapshot.streamingId }) {
                                    ChatActivity(activity: activity, visible: model.visible, cat: model.cat)
                                }
                                ForEach(snapshot.cards) { card in NativeChatCard(card: card, model: model) }
                                ForEach(snapshot.questions) { request in NativeQuestionCard(request: request, model: model) }

                            }
                            // Keep the scroll target in the same lazy layout as the
                            // messages. Composer clearance is padding, never a target.
                            Color.clear.frame(height: 1).id("bottom")
                                .background(GeometryReader { geometry in Color.clear.preference(key: BottomPosition.self, value: geometry.frame(in: .named("chatScroll")).maxY) })
                        }.padding(.horizontal, 18).padding(.top, 18).padding(.bottom, model.bottomInset)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .mask(ChatComposerFade(composerHeight: model.composerHeight))
                    .coordinateSpace(name: "chatScroll")
                    .onPreferenceChange(MessagePositions.self) { positions in
                        model.messageFrames = positions
                        sticky = model.snapshot?.messages.last(where: { $0.role == "user" && (positions[$0.id]?.maxY ?? 1) < 0 })?.id
                    }
                    .overlay(alignment: .top) {
                        if let sticky, let message = model.snapshot?.messages.first(where: { $0.id == sticky }) {
                            Button { follows = false; proxy.scrollTo(sticky, anchor: .top) } label: { Text(message.text).font(.caption).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).padding(8) }.buttonStyle(.plain).background(.regularMaterial).help("Scroll to this request")
                        }
                    }
                    .onPreferenceChange(BottomPosition.self) { bottom in
                        model.bottomPosition = bottom
                        if let event = NSApp.currentEvent, [.scrollWheel, .leftMouseDragged, .keyDown].contains(event.type) { follows = bottom <= readingHeight + 48 }
                    }
                    .onChange(of: model.composerHeight) { _ in if follows { proxy.scrollTo("bottom", anchor: bottomAnchor) } }
                    .onChange(of: model.revision) { _ in if follows { proxy.scrollTo("bottom", anchor: bottomAnchor) } }
                    .onChange(of: model.snapshot?.chat) { _ in follows = true; sticky = nil; proxy.scrollTo("bottom", anchor: bottomAnchor) }
                    .overlay(alignment: .bottomLeading) {
                        Text(model.snapshot?.status ?? "")
                            .font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                            .lineLimit(1).help(model.snapshot?.statusDetail ?? model.snapshot?.status ?? "")
                            .padding(.horizontal, 18).frame(height: ChatComposerFade.footerHeight)
                            .padding(.bottom, model.composerHeight)
                            .allowsHitTesting(false)
                    }
                    .overlay(alignment: .bottomTrailing) {
                        if !follows { Button { follows = true; proxy.scrollTo("bottom", anchor: bottomAnchor) } label: { Image(systemName: "arrow.down") }.help("Scroll to latest message").padding(12).padding(.bottom, model.bottomInset) }
                    }
                }
            }
        }.background(Color.clear)
    }
}
private struct NativeMessageRow: View {
    let message: ChatMessage
    let running: Bool
    let activity: ChatActivityState?
    @ObservedObject var model: ChatModel
    var body: some View {
        HStack(alignment: .top) {
            if message.role == "user" { Spacer(minLength: 30) }
            VStack(alignment: .leading, spacing: 14) {
                if let selection = message.selection { Text(selection.tag + selection.ident).font(.caption.monospaced()).foregroundStyle(.secondary) }
                ForEach(message.attachments ?? []) { attachment in NativeAttachment(attachment: attachment) }
                ForEach(Array(message.segments.enumerated()), id: \.offset) { _, segment in
                    if let island = segment.island { NativeChatIsland(island: island, model: model) }
                    else if segment.kind == "tools" {
                        DisclosureGroup {
                            ForEach(Array((segment.statuses ?? []).enumerated()), id: \.offset) { _, status in Text(status).font(ChatTypography.activity).lineSpacing(3).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                        } label: { Text(segment.statuses?.last ?? "Activity").font(ChatTypography.activity).lineLimit(1).foregroundStyle(.secondary) }
                    } else if let text = segment.text {
                        if message.role == "user" { Text(text).textSelection(.enabled).font(ChatTypography.body).lineSpacing(ChatTypography.lineSpacing).fixedSize(horizontal: false, vertical: true) }
                        else { ChatMarkdown(source: text, streaming: running) }
                    }
                }
                if let activity { ChatActivity(activity: activity, visible: model.visible, cat: model.cat) }
                if !running && message.role == "assistant" {
                    HStack {
                        Button { copyChatText(message.text) } label: { Image(systemName: "doc.on.doc") }.help("Copy response")
                        if message.revertGroup != nil { Button { model.action("revert", id: message.id) } label: { Image(systemName: "arrow.uturn.backward") }.help("Revert this turn's edits") }
                    }.buttonStyle(ChatActionButtonStyle())
                }
            }.padding(message.role == "user" ? 12 : 0)
                .background { if message.role == "user" { RoundedRectangle(cornerRadius: 14).fill(.quaternary) } }
            if message.role == "assistant" { Spacer(minLength: 0) }
        }.frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
    }
}
private struct ChatActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        ChatActionButton(configuration: configuration)
    }
    private struct ChatActionButton: View {
        let configuration: ButtonStyle.Configuration
        @Environment(\.isEnabled) private var enabled
        @State private var hovered = false
        var body: some View {
            configuration.label
                .frame(width: 28, height: 28)
                .foregroundStyle(enabled && (hovered || configuration.isPressed) ? Color.primary : Color.secondary)
                .background(Color.primary.opacity(enabled ? (configuration.isPressed ? 0.16 : hovered ? 0.08 : 0) : 0), in: RoundedRectangle(cornerRadius: 6))
                .contentShape(RoundedRectangle(cornerRadius: 6))
                .onHover { hovered = $0 }
        }
    }
}
private struct NativeAttachment: View {
    let attachment: ChatAttachment
    var body: some View {
        if let raw = attachment.url, raw.hasPrefix("data:image/"), let comma = raw.firstIndex(of: ","),
           let data = Data(base64Encoded: String(raw[raw.index(after: comma)...])), let image = NSImage(data: data) {
            Image(nsImage: image).resizable().scaledToFit().frame(maxWidth: 200, maxHeight: 160).accessibilityLabel("Attached image")
        } else { Label(attachment.name ?? "Attachment", systemImage: "doc").font(.caption).textSelection(.enabled) }
    }
}
private struct NativeChatCard: View {
    let card: ChatCard
    @ObservedObject var model: ChatModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(card.title).font(.headline)
            if let detail = card.detail, !detail.isEmpty { Text(detail).textSelection(.enabled).font(.system(size: 12)) }
            HStack {
                Spacer()
                ForEach(Array(card.actions.enumerated()), id: \.offset) { _, action in
                    Button(action.label) { model.action(action.action, id: card.id, value: action.value) }.disabled(action.disabled ?? false)
                }
            }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
    }
}
