import SwiftUI

struct ChatActivityState: Decodable {
    let label: String
    /// The label with full paths when `label` is collapsed.
    let detail: String?
    let kind: String
    let animated: Bool

}

/// One live status at the tail of the active response, never in past messages.
struct ChatActivity: View {
    let activity: ChatActivityState
    let visible: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var onscreen = false
    private var animating: Bool { visible && onscreen && activity.animated && !reduceMotion }

    var body: some View {
        ZStack(alignment: .leading) {
            TimelineView(.animation(minimumInterval: 1 / 30, paused: !animating)) { timeline in
                let phase = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2) / 2
                Text(activity.label).foregroundStyle(.secondary)
                    .overlay {
                        if animating {
                            Text(activity.label).foregroundStyle(.primary)
                                .mask {
                                    GeometryReader { geometry in
                                        LinearGradient(colors: [.clear, .white, .clear], startPoint: .leading, endPoint: .trailing)
                                            .frame(width: 55)
                                            .offset(x: phase * (geometry.size.width + 110) - 55)
                                    }
                                }
                        }
                    }
            }
            .font(.system(size: 12)).lineLimit(1).truncationMode(.tail).help(activity.detail ?? activity.label)
            .id(activity.label)
            .transition(reduceMotion ? .identity : .asymmetric(
                insertion: .modifier(active: ActivitySwap(offset: 8, blur: 2, opacity: 0), identity: ActivitySwap()),
                removal: .modifier(active: ActivitySwap(offset: -8, blur: 2, opacity: 0), identity: ActivitySwap())))
        }.animation(reduceMotion ? nil : .easeInOut(duration: 0.15), value: activity.label)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(activity.label)
        .onAppear { onscreen = true }
        .onDisappear { onscreen = false }
    }
}

/// A turn's token counter and its tooltip, formatted by `chat-snapshot.ts`.
struct ChatTokens: Decodable { let label: String; let detail: String }

struct TurnFooterPositions: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue()) { _, new in new } }
}
/// Messages whose Copy/Revert row is currently revealed, for inspection.
struct RevealedActions: PreferenceKey {
    static var defaultValue: [String] = []
    static func reduce(value: inout [String], nextValue: () -> [String]) { value += nextValue() }
}

/// The tail of an assistant response. While it runs: the live status, with the
/// turn's counter on its own line below. Once done: the Copy/Revert row and no
/// counter. The latest response keeps the counter line reserved after it
/// completes (`reservesCount`), so completion moves nothing above it (LKM-145).
struct ChatTurnFooter<Actions: View>: View {
    let id: String
    let activity: ChatActivityState?
    let tokens: ChatTokens?
    let reservesCount: Bool
    let visible: Bool
    @ViewBuilder let actions: () -> Actions
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Group {
                if let activity { ChatActivity(activity: activity, visible: visible) } else { actions() }
            }.frame(height: ChatLayout.footerRowHeight, alignment: .leading)
            if activity != nil || reservesCount {
                Group {
                    if activity != nil, let tokens { ChatTokenCount(id: id, tokens: tokens) } else { Color.clear.frame(width: 1) }
                }.frame(height: ChatLayout.footerCountHeight, alignment: .leading)
            }
        }.background(GeometryReader { geometry in
            Color.clear.preference(key: TurnFooterPositions.self, value: [id: geometry.frame(in: .named("chatScroll"))])
        })
    }
}

private struct ChatTokenCount: View {
    let id: String
    let tokens: ChatTokens
    var body: some View {
        Text(tokens.label).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
            .lineLimit(1).fixedSize().help(tokens.detail)
            .accessibilityLabel(tokens.detail)
            .background(GeometryReader { geometry in
                Color.clear.preference(key: TurnFooterPositions.self, value: ["\(id)-tokens": geometry.frame(in: .named("chatScroll"))])
            })
    }
}

private struct ActivitySwap: ViewModifier {
    var offset: CGFloat = 0
    var blur: CGFloat = 0
    var opacity: Double = 1
    func body(content: Content) -> some View {
        content.offset(y: offset).blur(radius: blur).opacity(opacity)
    }
}
