import AppKit
import WebKit

/// Agent preview inspection (LKM-138). `preview_evaluate` runs in its own content
/// world with no message handler, so agent code can never post Trezi IPC; a page-world
/// forwarder feeds `preview_console`; snapshots can be cropped to an element; and the
/// page can be laid out at a temporary CSS width for responsive checks.
enum PreviewAgent {
    static let world = WKContentWorld.world(name: "TreziAgent")

    /// Page-world, document-start: forwards console calls and page errors as one string
    /// `trezi:console` event each. It exposes nothing; the TreziPreview world buffers them.
    /// WebKit's `Error.stack` has frames only, so errors are sent as `String(error)` plus the stack.
    static let consoleForwarder = #"""
    (() => {
      const d = document, S = String, E = CustomEvent, max = 2000;
      const text = (v) => { try { return typeof v === 'string' ? v : v instanceof Error ? S(v) + (v.stack ? '\n' + v.stack : '') : (JSON.stringify(v) ?? S(v)); } catch { return S(v); } };
      const send = (level, args) => { try { d.dispatchEvent(new E('trezi:console', { detail: level + '\u0000' + Array.prototype.map.call(args, (v) => text(v).slice(0, max)).join(' ').slice(0, max) })); } catch {} };
      for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = console[level];
        if (typeof original === 'function') console[level] = function (...args) { send(level, args); return original.apply(this, args); };
      }
      addEventListener('error', (e) => {
        const t = e.target;
        send('pageerror', [e instanceof ErrorEvent ? (e.error ? text(e.error) : e.message) + (e.filename ? ' (' + e.filename + ':' + e.lineno + ':' + e.colno + ')' : '') : 'Failed to load ' + ((t && (t.src || t.href)) || 'a resource')]);
      }, true);
      addEventListener('unhandledrejection', (e) => send('pageerror', ['Unhandled rejection: ' + text(e.reason)]));
    })();
    """#

    static func install(_ controller: WKUserContentController) {
        controller.addUserScript(WKUserScript(source: consoleForwarder, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
    }

    /// The world an `evaluate` command runs in: the agent world, the isolated preview world, or the page.
    static func world(for command: [String: Any], preview: WKContentWorld) -> WKContentWorld {
        if command["world"] as? String == "agent" { return world }
        return command["isolated"] as? Bool == true ? preview : .page
    }

    /// A snapshot limited to `rect` (CSS px scaled by the page zoom), clipped to the view.
    static func snapshot(for command: [String: Any], view: WKWebView?) -> WKSnapshotConfiguration? {
        guard let view, let rect = command["rect"] as? [String: Double] else { return nil }
        let zoom = view.pageZoom
        let values = [rect["x"] ?? 0, rect["y"] ?? 0, rect["width"] ?? 0, rect["height"] ?? 0]
        guard values.allSatisfy({ $0.isFinite && abs($0) < 100000 }) else { return nil }
        let height = values[3] * zoom, top = values[1] * zoom
        let requested = NSRect(x: values[0] * zoom, y: view.isFlipped ? top : view.bounds.height - top - height, width: values[2] * zoom, height: height)
        let clipped = requested.intersection(view.bounds)
        guard !clipped.isEmpty else { return nil }
        let config = WKSnapshotConfiguration()
        config.rect = clipped
        return config
    }

    /// `previewViewport {width}`: lay the page out at `width` CSS px (nil restores).
    static func setViewport(_ command: [String: Any], layout: WorkspaceLayout, view: WKWebView?) -> [String: Any] {
        if let width = command["width"] as? Double, width.isFinite { layout.viewportWidth = CGFloat(min(3840, max(240, width))) }
        else { layout.viewportWidth = nil }
        layout.layout()
        var result: [String: Any] = ["zoom": Double(view?.pageZoom ?? 1), "width": NSNull()]
        if let width = layout.viewportWidth { result["width"] = Double(width) }
        return result
    }

    /// The page frame for a requested CSS width: centered, never wider than the area,
    /// zoomed out so the page's `innerWidth` is exactly `width`.
    static func frame(width: CGFloat, in area: NSRect) -> (page: NSRect, zoom: CGFloat) {
        let shown = min(width, area.width)
        let page = NSRect(x: area.midX - shown / 2, y: area.minY, width: shown, height: area.height)
        return (page, width > 0 ? shown / width : 1)
    }
}
