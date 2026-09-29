import AppKit

/// Test-profile thumb drag through AppKit's own routing, shared by the
/// ephemeral `chatAcceptance` command and the composer-layout fixture.
/// NSScroller runs its own tracking loop inside mouseDown and dequeues the
/// drag from the app queue, so the dragged/up events are queued first and the
/// mouseDown is then delivered (production: `window.sendEvent`, which hit-tests
/// to the scroller). Posting the drags afterwards from async code left the
/// tracker without them. The scroll position is never set directly.
enum ScrollerDrag {
    struct Report {
        var hitTarget = "", hitIsScroller = false, style = "", knob = CGRect.zero
        var windowNumber = 0, eventsResolveToWindow = false, windowRouted = false
        var queued = 0, consumedByTracker = 0, leftover = 0
        var scrollBefore: CGFloat = 0, scrollAfter: CGFloat = 0
        var dictionary: [String: Any] {
            ["hitTarget": hitTarget, "hitIsScroller": hitIsScroller, "style": style, "knob": NSStringFromRect(knob),
             "windowNumber": windowNumber, "eventsResolveToWindow": eventsResolveToWindow, "windowRouted": windowRouted,
             "queued": queued, "consumedByTracker": consumedByTracker, "leftover": leftover,
             "scrollBefore": scrollBefore, "scrollAfter": scrollAfter]
        }
    }
    /// Window-targeted mouse events (window-local points; y grows upward).
    static func events(from start: NSPoint, dy: CGFloat, steps: Int, windowNumber: Int,
                       timestamp: TimeInterval = ProcessInfo.processInfo.systemUptime) -> [NSEvent] {
        func event(_ type: NSEvent.EventType, _ point: NSPoint, _ index: Int) -> NSEvent? {
            NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: timestamp + Double(index) * 0.016,
                               windowNumber: windowNumber, context: nil, eventNumber: index, clickCount: 1,
                               pressure: type == .leftMouseUp ? 0 : 1)
        }
        let drags = (1...steps).compactMap { event(.leftMouseDragged, NSPoint(x: start.x, y: start.y + dy * CGFloat($0) / CGFloat(steps)), $0) }
        return [event(.leftMouseDown, start, 0)].compactMap { $0 } + drags
            + [event(.leftMouseUp, NSPoint(x: start.x, y: start.y + dy), steps + 1)].compactMap { $0 }
    }
    /// Drags the knob centre by `dy` window points. `deliverDown` receives the
    /// mouseDown after the rest is queued; leftovers the tracker did not
    /// consume are drained and counted.
    static func perform(scroller: NSScroller, scroll: NSScrollView, window: NSWindow, dy: CGFloat, steps: Int = 8,
                        deliverDown: (NSEvent) -> Void) -> Report {
        var report = Report()
        let knob = scroller.rect(for: .knob)
        let start = scroller.convert(NSPoint(x: knob.midX, y: knob.midY), to: nil)
        report.knob = knob
        report.style = scroll.scrollerStyle == .overlay ? "overlay" : "legacy"
        if let content = window.contentView {
            let hit = content.hitTest(content.superview?.convert(start, from: nil) ?? start)
            report.hitTarget = hit.map { String(describing: type(of: $0)) } ?? "nil"
            report.hitIsScroller = hit.map { $0 === scroller || $0.isDescendant(of: scroller) } ?? false
        }
        let all = events(from: start, dy: dy, steps: steps, windowNumber: window.windowNumber)
        report.windowNumber = window.windowNumber
        report.windowRouted = all.allSatisfy { $0.windowNumber == window.windowNumber }
        report.eventsResolveToWindow = all.allSatisfy { $0.window === window }
        guard let down = all.first else { return report }
        for event in all.dropFirst() { NSApp.postEvent(event, atStart: false) }
        report.queued = all.count - 1
        report.scrollBefore = scroll.contentView.bounds.minY
        deliverDown(down)
        let mask: NSEvent.EventTypeMask = [.leftMouseDown, .leftMouseDragged, .leftMouseUp]
        while NSApp.nextEvent(matching: mask, until: .distantPast, inMode: .default, dequeue: true) != nil { report.leftover += 1 }
        report.consumedByTracker = max(0, report.queued - report.leftover)
        report.scrollAfter = scroll.contentView.bounds.minY
        return report
    }
}
