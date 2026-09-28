import AppKit
import SwiftUI

enum ChatLayout {
    static let composerInset: CGFloat = 10
    static let statusHeight: CGFloat = 28
    static func composerFrame(in bounds: CGRect, height: CGFloat) -> CGRect {
        CGRect(x: bounds.minX + composerInset,
               y: bounds.minY + max(0, bounds.height - composerInset - height),
               width: max(0, bounds.width - 2 * composerInset), height: height)
    }
    // Match NativeComposer.update's bridge schema even for in-process calls.
    // Swift does not dynamically cast a CGFloat dictionary to Double.
    static func composerBounds(in bounds: CGRect, height: CGFloat) -> [String: Double] {
        let frame = composerFrame(in: bounds, height: height)
        return ["x": Double(frame.minX), "y": Double(frame.minY),
                "width": Double(frame.width), "height": Double(frame.height)]
    }
    static func bottomInset(composerHeight: CGFloat) -> CGFloat {
        composerHeight + composerInset + statusHeight + 40
    }
}

/// Configure only the conversation's backing NSScrollView. AppKit supplies the
/// fading thumb, hover expansion, dragging and accessibility contrast. Its
/// preferred style retains the legacy scroller when the user selects Always.
struct ChatScrollStyle: NSViewRepresentable {
    func makeNSView(context: Context) -> ChatScrollStyleProbe { ChatScrollStyleProbe() }
    func updateNSView(_ view: ChatScrollStyleProbe, context: Context) { view.scheduleConfiguration() }
}

final class ChatScrollStyleProbe: NSView {
    override init(frame: NSRect) {
        super.init(frame: frame)
        NotificationCenter.default.addObserver(self, selector: #selector(preferenceChanged),
            name: NSScroller.preferredScrollerStyleDidChangeNotification, object: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    deinit { NotificationCenter.default.removeObserver(self) }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func viewDidMoveToSuperview() { super.viewDidMoveToSuperview(); scheduleConfiguration() }
    override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); scheduleConfiguration() }
    @objc private func preferenceChanged() { scheduleConfiguration() }
    func scheduleConfiguration() {
        // SwiftUI can attach the representable before attaching its ancestors.
        DispatchQueue.main.async { [weak self] in
            guard let scroll = self?.enclosingScrollView else { return }
            Self.configure(scroll)
        }
    }
    static func configure(_ scroll: NSScrollView, style: NSScroller.Style = NSScroller.preferredScrollerStyle) {
        if scroll.scrollerStyle != style { scroll.scrollerStyle = style }
        // Never hide the user's always-visible scroller or alter content insets.
        let autohides = style == .overlay
        if scroll.autohidesScrollers != autohides { scroll.autohidesScrollers = autohides }
        if scroll.verticalScroller?.controlSize != .small { scroll.verticalScroller?.controlSize = .small }
    }
}
