import CoreGraphics
import Foundation

// Pure reveal acknowledgement logic: no application, window or run loop.
func require(_ condition: Bool, _ message: String) {
    if !condition { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
let height: CGFloat = 600
let top = IslandRevealRequest(revision: 1, island: "shadow", bottom: false)
let bottom = IslandRevealRequest(revision: 2, island: "shadow", bottom: true)
require(top.position == "start-shadow" && top.anchor == "island-start-shadow", "Top reveal targets the island title anchor")
require(bottom.position == "end-shadow" && bottom.anchor == "island-end-shadow", "Bottom reveal targets the island end anchor")

// Overlap: the top request is still polling when the bottom request arrives and
// SwiftUI applies revision 2. The stale title frame sits exactly at the top
// edge, which the previous `applied >= revision` check acknowledged.
let staleTopAtEdge: [String: CGRect] = ["start-shadow": CGRect(x: 0, y: 0, width: 300, height: 20),
                                        "end-shadow": CGRect(x: 0, y: height - 1, width: 300, height: 1)]
require(islandRevealState(top, currentRevision: 2, appliedRevision: 2, positions: staleTopAtEdge, readingHeight: height) == .superseded(by: 2),
        "A superseded top reveal is never acknowledged with the newer revision's applied state")
require(islandRevealState(bottom, currentRevision: 2, appliedRevision: 2, positions: staleTopAtEdge, readingHeight: height) == .settled(staleTopAtEdge["end-shadow"]!),
        "The newest reveal settles against its own anchor")

// Superseded before anything was applied, and by a same-edge request.
require(islandRevealState(top, currentRevision: 2, appliedRevision: 0, positions: [:], readingHeight: height) == .superseded(by: 2),
        "Supersession does not wait for the newer request to apply")
let topAgain = IslandRevealRequest(revision: 3, island: "shadow", bottom: false)
require(islandRevealState(top, currentRevision: 3, appliedRevision: 3, positions: staleTopAtEdge, readingHeight: height) == .superseded(by: 3),
        "A same-target newer request still supersedes the older one")
require(islandRevealState(topAgain, currentRevision: 3, appliedRevision: 3, positions: staleTopAtEdge, readingHeight: height) == .settled(staleTopAtEdge["start-shadow"]!),
        "The same-target newest request settles")

// The newest request waits for its own applied revision, not an older one.
require(islandRevealState(bottom, currentRevision: 2, appliedRevision: 1, positions: staleTopAtEdge, readingHeight: height) == .pending,
        "An older applied revision cannot acknowledge a newer request")
// Applied but the measured anchor has not reached the requested edge.
let offEdge: [String: CGRect] = ["end-shadow": CGRect(x: 0, y: height + 100, width: 300, height: 1)]
require(islandRevealState(bottom, currentRevision: 2, appliedRevision: 2, positions: offEdge, readingHeight: height) == .pending,
        "An applied revision still requires measured edge settlement")
require(islandRevealState(bottom, currentRevision: 2, appliedRevision: 2, positions: [:], readingHeight: height) == .pending,
        "A missing anchor frame remains pending")
// Tolerance boundary.
require(islandRevealReached(top, frame: CGRect(x: 0, y: 8, width: 1, height: 1), readingHeight: height), "Top within 8 points")
require(!islandRevealReached(top, frame: CGRect(x: 0, y: -8.5, width: 1, height: 1), readingHeight: height), "Top beyond 8 points")

print("Native chat reveal: overlapping island reveals resolve only against their own revision and anchor.")
