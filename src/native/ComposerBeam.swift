import AppKit
import SwiftUI

/// Native interpretation of libraries.dev/beam: a rotating highlight, colored
/// edge and soft bloom. No shader bundle or additional rendering surface needed.
struct ComposerBeam: View {
    let radius: CGFloat
    let started: Date
    let once: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { timeline in
            let elapsed = max(0, timeline.date.timeIntervalSince(started))
            let progress = elapsed / 3
            let fade = once ? min(1, elapsed / 0.3) * min(1, max(0, (3 - elapsed) / 0.6)) : min(1, elapsed / 0.25)
            let angle = reduceMotion ? 45 : progress * 360
            let gradient = AngularGradient(stops: [
                .init(color: .clear, location: 0),
                .init(color: .clear, location: 0.40),
                .init(color: Color(red: 0.35, green: 0.30, blue: 1).opacity(0.15), location: 0.48),
                .init(color: Color(red: 0.65, green: 0.32, blue: 1), location: 0.64),
                .init(color: Color(red: 0.26, green: 0.55, blue: 1), location: 0.78),
                .init(color: Color(red: 0.32, green: 0.90, blue: 1), location: 0.88),
                .init(color: colorScheme == .dark ? .white : Color(red: 0.30, green: 0.48, blue: 1), location: 0.93),
                .init(color: .clear, location: 1)
            ], center: .center, startAngle: .degrees(angle), endAngle: .degrees(angle + 360))
            let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
            ZStack {
                shape.stroke(gradient, lineWidth: 5).blur(radius: 5).opacity(0.55)
                shape.stroke(gradient, lineWidth: 2.5).blur(radius: 1.5).opacity(0.6)
                shape.stroke(gradient, lineWidth: 1.2)
            }
            .padding(8)
            .opacity(reduceMotion ? (once ? 0.5 : 0.75) : fade)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The overlay never intercepts input, and removes its timeline entirely at rest.
final class ComposerBeamHost: NSHostingView<AnyView> {
    private(set) var active = false
    private var expiry: DispatchWorkItem?
    init() {
        super.init(rootView: AnyView(EmptyView()))
        sizingOptions = []
        setAccessibilityElement(false)
    }
    required init(rootView: AnyView) { fatalError("init(rootView:) has not been implemented") }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    func show(_ visible: Bool, radius: CGFloat, once: Bool = false) {
        guard visible != active else { return }
        expiry?.cancel(); expiry = nil
        active = visible
        rootView = visible ? AnyView(ComposerBeam(radius: radius, started: Date(), once: once)) : AnyView(EmptyView())
        if visible && once {
            let work = DispatchWorkItem { [weak self] in self?.show(false, radius: radius) }
            expiry = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
        }
    }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil { show(false, radius: 0) }
    }
    deinit { expiry?.cancel() }
}
