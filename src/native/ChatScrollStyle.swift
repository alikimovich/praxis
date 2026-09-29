import AppKit
import SwiftUI

enum ChatLayout {
    /// Named space on the conversation root, filling the NSHostingView.
    static let rootSpace = "chatRoot"
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

extension View {
    /// Reports this view's rendered frame in a named ancestor space, and zero
    /// once it leaves the hierarchy. A PreferenceKey read on an outer view never
    /// arrived from the conversation's overlay, so this is a direct callback.
    func reportsFrame(in space: String, _ report: @escaping (CGRect) -> Void) -> some View {
        onGeometryChange(for: CGRect.self, of: { $0.frame(in: .named(space)) }, action: report)
            .onDisappear { report(.zero) }
    }
}

/// Configure only the conversation's backing NSScrollView. AppKit supplies the
/// fading thumb, hover expansion, dragging and accessibility contrast. Its
/// preferred style retains the legacy scroller when the user selects Always.
/// It also pins a following conversation to its end in AppKit, from settled
/// document/viewport metrics. A SwiftUI fractional anchor computed before a
/// resize stops short once the composer inset changes with the viewport.
///
/// The probe owns "pinned to latest". Only user scroll input (wheel/trackpad,
/// scroller drag, keyboard) detaches it, immediately and before any pending pin
/// runs. It re-attaches when that input comes to rest at the end, or on an
/// explicit attach (latest button, chat switch). Programmatic scrolls (pins,
/// SwiftUI scrollTo, AppKit clamping) never change it, so a pin's own
/// measurement cannot re-pin a reader in history.
struct ChatScrollStyle: NSViewRepresentable {
    var follows: () -> Bool = { false }
    var pinRequest = 0
    var attachRequest = 0
    var onPinnedChange: (Bool) -> Void = { _ in }
    var onLatestButtonChange: (Bool) -> Void = { _ in }
    func makeNSView(context: Context) -> ChatScrollStyleProbe { ChatScrollStyleProbe() }
    func updateNSView(_ view: ChatScrollStyleProbe, context: Context) {
        view.follows = follows
        view.onPinnedChange = onPinnedChange
        view.onLatestButtonChange = onLatestButtonChange
        if view.attachRequest != attachRequest { view.attachRequest = attachRequest; view.attach() }
        if view.pinRequest != pinRequest { view.pinRequest = pinRequest; view.requestPin() }
        view.scheduleConfiguration()
        // `follows` may have changed (reveal); publish outside this view update.
        DispatchQueue.main.async { [weak view] in view?.refreshLatestButton() }
    }
}

final class ChatScrollStyleProbe: NSView {
    /// Delay after the last user scroll input before deciding it rests at the end.
    static let settleDelay: TimeInterval = 0.35
    var follows: () -> Bool = { false }
    var onPinnedChange: (Bool) -> Void = { _ in }
    var onLatestButtonChange: (Bool) -> Void = { _ in }
    /// Scroller style/contrast source; tests may inject their own.
    var environment = ChatSystemEnvironment.shared { didSet { scheduleConfiguration() } }
    var pinRequest = 0
    var attachRequest = 0
    private(set) var pinCount = 0
    private(set) var userScrollCount = 0
    // Input diagnostics: monitor callbacks, wheel events examined, last drop.
    private(set) var monitorCallbackCount = 0
    private(set) var scrollWheelEventCount = 0
    private(set) var lastInputRejection = ""
    private(set) var isPinned = true
    private(set) var showsLatestButton = false
    private(set) weak var configuredScroll: NSScrollView?
    private(set) var configurationCount = 0
    private var layoutObservers: [NSObjectProtocol] = []
    private var inputMonitor: Any?
    private var liveScrolling = false
    private var pinGeneration = 0
    private var settle: DispatchWorkItem?
    private weak var observedDocument: NSView?
    private var documentSize: NSSize?
    private var viewportSize: NSSize?
    override init(frame: NSRect) {
        super.init(frame: frame)
        NotificationCenter.default.addObserver(self, selector: #selector(preferenceChanged),
            name: NSScroller.preferredScrollerStyleDidChangeNotification, object: nil)
        // System changes and test overrides reach the probe the same way.
        NotificationCenter.default.addObserver(self, selector: #selector(environmentChanged(_:)),
            name: ChatSystemEnvironment.didChange, object: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    deinit {
        NotificationCenter.default.removeObserver(self)
        layoutObservers.forEach(NotificationCenter.default.removeObserver)
        if let inputMonitor { NSEvent.removeMonitor(inputMonitor) }
        settle?.cancel()
    }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func viewDidMoveToSuperview() { super.viewDidMoveToSuperview(); scheduleConfiguration() }
    override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); scheduleConfiguration() }
    @objc private func preferenceChanged() { scheduleConfiguration() }
    @objc private func environmentChanged(_ note: Notification) {
        if note.object as AnyObject? === environment { scheduleConfiguration() }
    }
    func scheduleConfiguration() {
        // SwiftUI can attach the representable before attaching its ancestors.
        DispatchQueue.main.async { [weak self] in
            guard let self, let scroll = self.enclosingScrollView else { return }
            Self.configure(scroll, environment: self.environment)
            self.observeLayout(scroll)
            self.configuredScroll = scroll
            self.configurationCount += 1
        }
    }
    private var shouldPin: Bool { isPinned && follows() }
    /// Pin after pending state/layout work, against the metrics current then.
    /// User input in between invalidates it.
    func requestPin() {
        let generation = pinGeneration
        DispatchQueue.main.async { [weak self] in
            guard let self, generation == self.pinGeneration, self.shouldPin,
                  let scroll = self.enclosingScrollView else { return }
            self.pin(scroll)
        }
    }
    /// Explicit "go to latest" from SwiftUI, which already set its own state.
    func attach() {
        settle?.cancel(); settle = nil
        pinGeneration += 1
        isPinned = true
        requestPin()
    }
    /// Any user scroll detaches at once; pending pins are dropped.
    func userScrolled() {
        userScrollCount += 1
        pinGeneration += 1
        setPinned(false)
        settle?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.userScrollSettled() }
        settle = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleDelay, execute: work)
    }
    private func userScrollSettled() {
        settle = nil
        guard !liveScrolling, let scroll = configuredScroll ?? enclosingScrollView else { return }
        if Self.distanceFromEnd(scroll) < 1 { setPinned(true) }
    }
    private func setPinned(_ pinned: Bool) {
        guard isPinned != pinned else { return }
        isPinned = pinned
        onPinnedChange(pinned)
        refreshLatestButton()
    }
    /// The latest button shows only for a detached reader away from the end,
    /// so it appears once they scroll into history and hides when they return.
    static func showsLatestButton(pinned: Bool, follows: Bool, distanceFromEnd: CGFloat) -> Bool {
        (!pinned || !follows) && distanceFromEnd >= 1
    }
    func refreshLatestButton() {
        guard let scroll = configuredScroll ?? enclosingScrollView else { return }
        let shows = Self.showsLatestButton(pinned: isPinned, follows: follows(), distanceFromEnd: Self.distanceFromEnd(scroll))
        guard shows != showsLatestButton else { return }
        showsLatestButton = shows
        onLatestButtonChange(shows)
    }
    /// Wheel/trackpad over the conversation, or scrolling keys while focus is
    /// inside it. Scroller drags and gestures also arrive as live scrolls.
    /// Every drop records why, so a native failure shows where input stopped.
    func handleInput(_ event: NSEvent) {
        func reject(_ reason: String) { lastInputRejection = reason }
        guard let scroll = configuredScroll else { return reject("no conversation scroll view") }
        switch event.type {
        case .scrollWheel:
            scrollWheelEventCount += 1
            guard event.scrollingDeltaY != 0 else { return reject("no vertical delta") }
            if let reason = Self.wheelRejection(eventWindow: event.window, eventWindowNumber: event.windowNumber,
                    chatWindow: scroll.window, chatWindowNumber: scroll.window?.windowNumber ?? 0,
                    pointInScroll: pointInScroll(event, scroll), scrollBounds: scroll.bounds) { return reject(reason) }
        case .keyDown:
            guard let window = scroll.window else { return reject("conversation not in a window") }
            guard event.window === window else { return reject("key event for other window") }
            // Page Up/Down, Home, End, arrows, space.
            guard [116, 121, 115, 119, 126, 125, 49].contains(event.keyCode) else { return reject("not a scrolling key") }
            guard let responder = window.firstResponder as? NSView, responder.isDescendant(of: scroll) else {
                return reject("focus outside conversation")
            }
        default: return
        }
        lastInputRejection = ""
        userScrolled()
    }
    /// A wheel event is ours if it targets the chat window, or has no window
    /// (a pid-posted event) while its pointer is over the conversation.
    /// Events for any other window are never accepted. Returns a reason to drop.
    static func wheelRejection(eventWindow: AnyObject?, eventWindowNumber: Int, chatWindow: AnyObject?,
                               chatWindowNumber: Int, pointInScroll: NSPoint?, scrollBounds: NSRect) -> String? {
        guard let chatWindow else { return "conversation not in a window" }
        if let eventWindow, eventWindow !== chatWindow { return "other window" }
        if eventWindow == nil, eventWindowNumber > 0, eventWindowNumber != chatWindowNumber { return "other window number" }
        guard let pointInScroll else { return "no pointer location" }
        guard scrollBounds.contains(pointInScroll) else {
            return eventWindow == nil ? "nil window: pointer outside conversation" : "pointer outside conversation"
        }
        return nil
    }
    /// Quartz global coordinates (top-left origin) to AppKit screen coordinates.
    static func screenPoint(quartz: CGPoint, primaryScreenHeight: CGFloat) -> NSPoint {
        NSPoint(x: quartz.x, y: primaryScreenHeight - quartz.y)
    }
    private func pointInScroll(_ event: NSEvent, _ scroll: NSScrollView) -> NSPoint? {
        guard let window = scroll.window else { return nil }
        if event.window === window { return scroll.convert(event.locationInWindow, from: nil) }
        guard event.window == nil else { return nil }
        let screen = event.cgEvent.map { Self.screenPoint(quartz: $0.location, primaryScreenHeight: NSScreen.screens.first?.frame.maxY ?? 0) }
            ?? NSEvent.mouseLocation
        return scroll.convert(window.convertPoint(fromScreen: screen), from: nil)
    }
    private func pin(_ scroll: NSScrollView) {
        if Self.pinToEnd(scroll) { pinCount += 1 }
    }
    private func observeLayout(_ scroll: NSScrollView) {
        if inputMonitor == nil {
            inputMonitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .keyDown]) { [weak self] event in
                self?.monitorCallbackCount += 1
                self?.handleInput(event); return event
            }
        }
        if configuredScroll !== scroll || observedDocument !== scroll.documentView {
            layoutObservers.forEach(NotificationCenter.default.removeObserver)
            layoutObservers = []
            observedDocument = scroll.documentView
            documentSize = nil; viewportSize = nil
            layoutObservers.append(NotificationCenter.default.addObserver(forName: NSScrollView.willStartLiveScrollNotification, object: scroll, queue: .main) { [weak self] _ in
                self?.liveScrolling = true; self?.userScrolled()
            })
            layoutObservers.append(NotificationCenter.default.addObserver(forName: NSScrollView.didEndLiveScrollNotification, object: scroll, queue: .main) { [weak self] _ in
                self?.liveScrolling = false; self?.userScrolled()
            })
            for view in [scroll.documentView, scroll.contentView].compactMap({ $0 }) {
                view.postsFrameChangedNotifications = true
                view.postsBoundsChangedNotifications = true
                for name in [NSView.frameDidChangeNotification, NSView.boundsDidChangeNotification] {
                    layoutObservers.append(NotificationCenter.default.addObserver(forName: name, object: view, queue: .main) { [weak self] _ in
                        // Every scroll position/size change can show or hide latest.
                        self?.refreshLatestButton()
                        // Composer state changes precede AppKit's new document
                        // bounds. Retry following only after those bounds settle.
                        guard let self, let scroll = self.configuredScroll,
                              scroll.documentView?.frame.size != self.documentSize || scroll.contentView.bounds.size != self.viewportSize else { return }
                        self.scheduleConfiguration()
                    })
                }
            }
        }
        let document = scroll.documentView?.frame.size ?? .zero
        let viewport = scroll.contentView.bounds.size
        guard document != documentSize || viewport != viewportSize else { return }
        documentSize = document; viewportSize = viewport
        // Never move a reader who scrolled into history.
        if shouldPin { pin(scroll) }
    }
    static func distanceFromEnd(_ scroll: NSScrollView) -> CGFloat {
        guard let document = scroll.documentView else { return 0 }
        let clip = scroll.contentView
        var target = clip.bounds
        target.origin.y = document.isFlipped ? document.frame.maxY : document.frame.minY - target.height
        return abs(clip.constrainBoundsRect(target).minY - clip.bounds.minY)
    }
    /// The document's bottom padding equals the composer clearance, so its end
    /// places the latest row above the composer. Returns whether it moved.
    @discardableResult
    static func pinToEnd(_ scroll: NSScrollView) -> Bool {
        guard let document = scroll.documentView else { return false }
        let clip = scroll.contentView
        var target = clip.bounds
        target.origin.y = document.isFlipped ? document.frame.maxY : document.frame.minY - target.height
        let origin = clip.constrainBoundsRect(target).origin
        guard abs(origin.y - clip.bounds.minY) >= 0.5 else { return false }
        clip.scroll(to: NSPoint(x: clip.bounds.minX, y: origin.y))
        scroll.reflectScrolledClipView(clip)
        return true
    }
    /// Style from the environment (system unless a test overrides it). The
    /// appearance is never set, so AppKit keeps drawing macOS contrast itself.
    static func configure(_ scroll: NSScrollView, environment: ChatSystemEnvironment) {
        configure(scroll, style: environment.scrollerStyle)
    }
    static func configure(_ scroll: NSScrollView, style: NSScroller.Style = ChatSystemEnvironment.shared.scrollerStyle) {
        if scroll.scrollerStyle != style { scroll.scrollerStyle = style }
        // Never hide the user's always-visible scroller or alter content insets.
        let autohides = style == .overlay
        if scroll.autohidesScrollers != autohides { scroll.autohidesScrollers = autohides }
        if scroll.verticalScroller?.controlSize != .small { scroll.verticalScroller?.controlSize = .small }
    }
}
