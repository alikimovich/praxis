import SwiftUI

struct ChatActivityState: Decodable {
    let label: String
    let kind: String
    let animated: Bool
    var orb: OrbState {
        switch kind {
        case "writing": return .composing
        case "working", "applying": return .working
        default: return .breathing
        }
    }
}

/// One live status at the tail of the active response, never in past messages.
struct ChatActivity: View {
    let activity: ChatActivityState
    let visible: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var onscreen = false
    private var animating: Bool { visible && onscreen && activity.animated && !reduceMotion }

    var body: some View {
        HStack(alignment: .center, spacing: 7) {
            ThinkingOrb(state: activity.orb, size: .px20, paused: !animating)
                .accessibilityHidden(true)
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
            .font(.system(size: 12)).lineLimit(2).help(activity.label)
            .id(activity.label)
            .transition(reduceMotion ? .identity : .asymmetric(
                insertion: .modifier(active: ActivitySwap(offset: 8, blur: 2, opacity: 0), identity: ActivitySwap()),
                removal: .modifier(active: ActivitySwap(offset: -8, blur: 2, opacity: 0), identity: ActivitySwap())))
            }.animation(reduceMotion ? nil : .easeInOut(duration: 0.15), value: activity.label)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(activity.label)
        .onAppear { onscreen = true }
        .onDisappear { onscreen = false }
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
