import SwiftUI

/// Keep one native Text layout (selection, wrapping, inline Markdown and links)
/// while only newly arriving words resolve from a subtle blur.
struct StreamingText: View {
    let source: String
    let streaming: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        let attributed = (try? AttributedString(markdown: source, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(source)
        if #available(macOS 15.0, *), streaming && !reduceMotion {
            WordRevealText(attributed: attributed)
        } else { Text(attributed) }
    }
}

@available(macOS 15.0, *)
private struct WordArrival: TextAttribute { let time: Double }

@available(macOS 15.0, *)
private struct WordRevealRenderer: TextRenderer {
    let now: Double
    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            for run in line {
                var copy = context
                if let arrival = run[WordArrival.self] {
                    let progress = min(1, max(0, (now - arrival.time) / 0.35))
                    let eased = 1 - pow(1 - progress, 3)
                    copy.opacity = eased
                    if eased < 1 { copy.addFilter(.blur(radius: 1 - eased)) }
                }
                copy.draw(run)
            }
        }
    }
}

@available(macOS 15.0, *)
private struct WordRevealText: View {
    let attributed: AttributedString
    @State private var arrivals: [Double] = []
    @State private var lastText = ""
    @State private var animating = false

    private var words: [AttributedString] {
        let characters = attributed.characters
        var result: [AttributedString] = []
        var start = characters.startIndex
        for index in characters.indices where characters[index].isWhitespace {
            let end = characters.index(after: index)
            result.append(AttributedString(attributed[start..<end])); start = end
        }
        if start < characters.endIndex { result.append(AttributedString(attributed[start..<characters.endIndex])) }
        return result
    }
    private var text: Text {
        words.enumerated().reduce(Text("")) { result, item in
            let (index, word) = item
            let time = index < arrivals.count ? arrivals[index] : 0
            return result + Text(word).customAttribute(WordArrival(time: time))
        }
    }
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !animating)) { timeline in
            text.textRenderer(WordRevealRenderer(now: timeline.date.timeIntervalSinceReferenceDate))
        }
        .onAppear {
            // Existing content is already readable when scrolling back into view.
            arrivals = Array(repeating: 0, count: words.count)
            lastText = String(attributed.characters)
        }
        .onChange(of: attributed) { _ in
            let next = String(attributed.characters)
            let count = words.count
            if next.hasPrefix(lastText) && count > arrivals.count {
                let now = Date.timeIntervalSinceReferenceDate
                let added = count - arrivals.count
                arrivals += (0..<added).map { now + min(0.24, Double($0) * 0.06) }
                animating = true
            } else if !next.hasPrefix(lastText) || count < arrivals.count {
                // Markdown can reparse an unfinished delimiter: never replay old words.
                arrivals = Array(repeating: 0, count: count)
            }
            lastText = next
        }
        .task(id: arrivals.last) {
            guard animating else { return }
            try? await Task.sleep(nanoseconds: 650_000_000)
            guard !Task.isCancelled else { return }
            animating = false
        }
        .onDisappear { animating = false }
    }
}
