import AppKit
import SwiftUI

struct QueuedComposerMessage: Decodable, Identifiable {
    let id: String
    let text: String
    let attachments: Int
    var label: String { text.isEmpty ? "\(attachments) attachment\(attachments == 1 ? "" : "s")" : text }
    var url: URL? {
        guard let url = URL(string: text), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil,
              !text.contains(where: { $0.isWhitespace }) else { return nil }
        return url
    }
}

struct ComposerQueue: View {
    let messages: [QueuedComposerMessage]
    let paused: Bool
    let action: (String, String?) -> Void
    var body: some View {
        VStack(spacing: 0) {
            if paused {
                HStack {
                    Text("Queue paused").foregroundStyle(.secondary)
                    Spacer()
                    Button("Resume") { action("queue-resume", nil) }.buttonStyle(.plain)
                }.font(.system(size: 11)).padding(.horizontal, 12).frame(height: 28)
            }
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(messages) { message in
                        HStack(spacing: 8) {
                            Image(systemName: "text.line.first.and.arrowtriangle.forward")
                                .foregroundStyle(.tertiary).accessibilityHidden(true)
                            if let url = message.url {
                                Image(systemName: "globe").foregroundStyle(.secondary).accessibilityHidden(true)
                                Link(destination: url) {
                                    Text(message.label).lineLimit(1).truncationMode(.middle)
                                        .foregroundStyle(Color(nsColor: .linkColor))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }.buttonStyle(.plain)
                            } else {
                                Text(message.label.replacingOccurrences(of: "\n", with: " "))
                                    .lineLimit(1).truncationMode(.tail).frame(maxWidth: .infinity, alignment: .leading)
                            }
                            if message.attachments > 0 && !message.text.isEmpty {
                                Label("\(message.attachments)", systemImage: "paperclip").font(.system(size: 10)).foregroundStyle(.secondary)
                            }
                            Button { action("queue-remove", message.id) } label: { Image(systemName: "trash") }
                                .buttonStyle(.plain).foregroundStyle(.secondary)
                                .help("Remove queued message").accessibilityLabel("Remove queued message: \(message.label)")
                            Menu {
                                Button("Copy message") { copyChatText(message.text) }.disabled(message.text.isEmpty)
                                Button("Remove from queue") { action("queue-remove", message.id) }
                            } label: { Image(systemName: "ellipsis") }
                                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                                .help("Queued message actions").accessibilityLabel("Queued message actions")
                        }
                        .font(.system(size: 13)).padding(.horizontal, 12).frame(height: 34)
                        .help(message.label)
                    }
                }
            }.scrollIndicators(.automatic)
            // The glass composer overlaps this strip, concealing the lower corners.
            Color.clear.frame(height: 16)
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(Color(nsColor: .separatorColor).opacity(0.45), lineWidth: 0.5) }
    }
}

final class ComposerQueueHost: NSHostingView<AnyView> {
    private var signature = Data()
    var action: ((String, String?) -> Void)?
    private(set) var count = 0
    static func height(count: Int, paused: Bool) -> CGFloat {
        count == 0 ? 0 : CGFloat(min(count, 3) * 34 + (paused ? 28 : 0))
    }
    init() { super.init(rootView: AnyView(EmptyView())); sizingOptions = []; isHidden = true }
    required init(rootView: AnyView) { fatalError("init(rootView:) has not been implemented") }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func update(_ entries: [[String: Any]], paused: Bool) {
        let data = (try? JSONSerialization.data(withJSONObject: ["entries": entries, "paused": paused], options: [.sortedKeys])) ?? Data()
        guard data != signature else { return }
        signature = data
        let items = (try? JSONSerialization.data(withJSONObject: entries)).flatMap { try? JSONDecoder().decode([QueuedComposerMessage].self, from: $0) } ?? []
        count = items.count; isHidden = items.isEmpty
        rootView = items.isEmpty ? AnyView(EmptyView()) : AnyView(ComposerQueue(messages: items, paused: paused) { [weak self] name, id in self?.action?(name, id) })
    }
}
