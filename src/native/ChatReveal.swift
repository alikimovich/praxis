import CoreGraphics

/// One test-only island reveal. The revision identifies the request; the
/// island/edge pair identifies the anchor whose measured frame proves it.
struct IslandRevealRequest: Equatable {
    let revision: Int
    let island: String
    let bottom: Bool
    /// Key published through `IslandPositions` by `NativeChatIsland`.
    var position: String { (bottom ? "end-" : "start-") + island }
    /// SwiftUI scroll ID attached to the same anchor.
    var anchor: String { (bottom ? "island-end-" : "island-start-") + island }
}

enum IslandRevealState: Equatable {
    case pending
    case settled(CGRect)
    /// A newer request replaced the viewport target before this one settled.
    case superseded(by: Int)
}

/// Whether the measured anchor reaches the requested edge of the reading area.
func islandRevealReached(_ request: IslandRevealRequest, frame: CGRect, readingHeight: CGFloat, tolerance: CGFloat = 8) -> Bool {
    abs((request.bottom ? frame.maxY : frame.minY) - (request.bottom ? readingHeight : 0)) <= tolerance
}

/// Resolve a reveal only against its own revision and anchor. Once a newer
/// request exists the viewport belongs to that request, so the older one is
/// superseded even if its stale anchor happens to sit at its requested edge.
func islandRevealState(_ request: IslandRevealRequest, currentRevision: Int, appliedRevision: Int,
                       positions: [String: CGRect], readingHeight: CGFloat) -> IslandRevealState {
    if currentRevision != request.revision { return .superseded(by: currentRevision) }
    guard appliedRevision == request.revision, let frame = positions[request.position],
          islandRevealReached(request, frame: frame, readingHeight: readingHeight) else { return .pending }
    return .settled(frame)
}
