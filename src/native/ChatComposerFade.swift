import SwiftUI

/// Fade scrolling messages into the existing window surface above the floating
/// input. The composer supplies its own native glass; no opaque footer band.
struct ChatComposerFade: View {
    static let footerHeight: CGFloat = 28
    static let transitionHeight: CGFloat = 40
    let composerHeight: CGFloat

    var body: some View {
        GeometryReader { geometry in
            let covered = min(geometry.size.height, composerHeight + Self.footerHeight)
            let fade = min(Self.transitionHeight, max(0, geometry.size.height - covered))
            VStack(spacing: 0) {
                Color.white.frame(height: max(0, geometry.size.height - covered - fade))
                LinearGradient(stops: [
                    .init(color: .white, location: 0),
                    .init(color: .white.opacity(0.85), location: 0.25),
                    .init(color: .white.opacity(0.35), location: 0.65),
                    .init(color: .clear, location: 1)
                ], startPoint: .top, endPoint: .bottom)
                    .frame(height: fade)
                Color.clear.frame(height: covered)
            }
        }
        .accessibilityHidden(true)
    }
}
