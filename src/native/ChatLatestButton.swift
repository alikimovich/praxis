import AppKit

/// Native "Scroll to latest message" button over the conversation's
/// bottom-trailing corner, above the composer clearance. It was a SwiftUI
/// Button: acceptance clicks at its exact rendered frame never ran its action
/// (click count 0, hit target the hosting view). AppKit's button runs its own
/// tracking loop over the event queue, like the scroller, so every click path
/// reaches it, and it stays a standard native, accessible control.
final class ChatLatestButton: NSButton {
    static let margin: CGFloat = 12
    var onPress: () -> Void = {}
    init() {
        super.init(frame: .zero)
        image = NSImage(systemSymbolName: "arrow.down", accessibilityDescription: "Scroll to latest message")
        imagePosition = .imageOnly
        bezelStyle = .rounded
        toolTip = "Scroll to latest message"
        setAccessibilityLabel("Scroll to latest message")
        target = self
        action = #selector(press)
        isHidden = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func press() { onPress() }
    /// Places the button over `chat` (a sibling in the same superview), `margin`
    /// above its composer clearance. Returns the frame in the chat's top-left
    /// space, or zero while hidden.
    @discardableResult
    func place(over chat: NSView, bottomInset: CGFloat, visible: Bool) -> CGRect {
        isHidden = !visible || chat.isHidden || superview == nil
        guard !isHidden, let superview else { return .zero }
        let size = fittingSize
        let x = chat.bounds.maxX - Self.margin - size.width
        let top = chat.bounds.height - bottomInset - Self.margin - size.height
        let local = NSRect(x: x, y: chat.isFlipped ? top : bottomInset + Self.margin, width: size.width, height: size.height)
        frame = superview.convert(local, from: chat)
        return NSRect(x: x, y: top, width: size.width, height: size.height)
    }
}
