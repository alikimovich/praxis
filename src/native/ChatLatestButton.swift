import AppKit

/// Native "Scroll to latest message" button: a round chevron centered over the
/// chat column, `gap` above the composer bubble. It was a SwiftUI Button:
/// acceptance clicks at its exact rendered frame never ran its action (click
/// count 0, hit target the hosting view). AppKit's button runs its own tracking
/// loop over the event queue, like the scroller, so every click path reaches it,
/// and it stays a standard native, accessible control.
final class ChatLatestButton: NSButton {
    static let diameter: CGFloat = 30
    static let gap: CGFloat = 8
    var onPress: () -> Void = {}
    init() {
        super.init(frame: .zero)
        image = NSImage(systemSymbolName: "chevron.down", accessibilityDescription: "Scroll to latest message")?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 12, weight: .semibold))
        imagePosition = .imageOnly
        isBordered = false
        contentTintColor = .secondaryLabelColor
        wantsLayer = true
        let lift = NSShadow()
        lift.shadowColor = .black.withAlphaComponent(0.14); lift.shadowBlurRadius = 4; lift.shadowOffset = NSSize(width: 0, height: -1)
        shadow = lift
        toolTip = "Scroll to latest message"
        setAccessibilityLabel("Scroll to latest message")
        target = self
        action = #selector(press)
        isHidden = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func press() { onPress() }
    override var intrinsicContentSize: NSSize { NSSize(width: Self.diameter, height: Self.diameter) }
    override func draw(_ dirtyRect: NSRect) {
        let circle = NSBezierPath(ovalIn: bounds.insetBy(dx: 0.5, dy: 0.5))
        NSColor.controlBackgroundColor.setFill(); circle.fill()
        if isHighlighted { NSColor.labelColor.withAlphaComponent(0.1).setFill(); circle.fill() }
        NSColor.separatorColor.setStroke(); circle.lineWidth = 1; circle.stroke()
        super.draw(dirtyRect)
    }
    override var focusRingMaskBounds: NSRect { bounds }
    override func drawFocusRingMask() { NSBezierPath(ovalIn: bounds).fill() }
    /// Places the button over `chat` (a sibling in the same superview): centered
    /// on the column, `gap` above a composer `composerHeight` tall. That is inside
    /// the composer clearance, below the reading area. Returns the frame in the
    /// chat's top-left space, or zero while hidden.
    @discardableResult
    func place(over chat: NSView, composerHeight: CGFloat, visible: Bool) -> CGRect {
        isHidden = !visible || chat.isHidden || superview == nil
        guard !isHidden, let superview else { return .zero }
        let size = Self.diameter
        let x = ((chat.bounds.width - size) / 2).rounded()
        let bottomGap = ChatLayout.composerInset + composerHeight + Self.gap
        let top = chat.bounds.height - bottomGap - size
        let local = NSRect(x: x, y: chat.isFlipped ? top : bottomGap, width: size, height: size)
        frame = superview.convert(local, from: chat)
        return NSRect(x: x, y: top, width: size, height: size)
    }
}
