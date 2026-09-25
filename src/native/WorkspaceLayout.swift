import AppKit

/// Owns native frames. Transitional web tools report desired insets, never rectangles.
final class WorkspaceLayout {
    weak var host: Host?
    var shellState: [String: Any] = [:]
    var chatState: [String: Any] = [:]
    var panels: [String: Double] = [:]
    var desiredWidth: CGFloat = 440
    var fraction: CGFloat = 1
    var previewVisible = false
    var panelVisible = false
    var panelSize = NSSize(width: 316, height: 300)
    var panelFrame = NSRect.zero
    let device = NSImageView()
    let readout = NSTextField(labelWithString: "")
    private var animation: Timer?
    private var layingOut = false
    private var lastFrame = NSRect.zero
    private var lastLeading: CGFloat = -1
    init(host: Host) {
        self.host = host
        device.image = NSImage(contentsOfFile: host.directory + "/device.png")
        device.imageScaling = .scaleProportionallyUpOrDown
        device.isHidden = true; readout.isHidden = true
        readout.font = .systemFont(ofSize: 11); readout.textColor = .secondaryLabelColor
        host.canvas.addSubview(device, positioned: .below, relativeTo: host.views["preview"])
        host.canvas.addSubview(readout, positioned: .above, relativeTo: host.views["preview"])
    }
    func width() -> CGFloat { min(desiredWidth, max(320, min(760, (host?.canvas.bounds.width ?? 1080) - 624))) }
    func update(_ state: [String: Any]) {
        let wasHidden = shellState["chatHidden"] as? Bool ?? false
        shellState = state
        let hidden = state["chatHidden"] as? Bool ?? false
        if hidden != wasHidden {
            animation?.invalidate()
            let from = fraction, target: CGFloat = hidden ? 0 : 1
            if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { fraction = target }
            else {
                let start = Date.timeIntervalSinceReferenceDate
                animation = Timer.scheduledTimer(withTimeInterval: 1 / 60, repeats: true) { [weak self] timer in
                    guard let self else { timer.invalidate(); return }
                    let progress = min(1, (Date.timeIntervalSinceReferenceDate - start) / 0.24)
                    let eased = 1 - pow(1 - progress, 3)
                    self.fraction = from + (target - from) * eased; self.layout()
                    if progress >= 1 { timer.invalidate(); self.animation = nil }
                }
            }
        }
        layout()
    }
    func resized(_ width: CGFloat) {
        desiredWidth = width
        layout()
        emit(["event":"native-layout-width", "width":Double(width)])
    }
    func nativeChatState() -> [String: Any] {
        guard let host else { return chatState }
        var state = chatState
        let top = min(max(0, panels["layers"] ?? 0), host.canvas.bounds.height * 0.6)
        let full = width(), shown = full * fraction
        let visible = shellState["project"] is String && shown > 60 && host.canvas.bounds.height > 30
        state["visible"] = visible
        state["bounds"] = ["x":0.0, "y":Double(top), "width":Double(full), "height":Double(max(0, host.canvas.bounds.height - top))]
        return state
    }
    func layout() {
        guard let host, !layingOut else { return }
        layingOut = true; defer { layingOut = false }
        let bounds = host.canvas.bounds
        let leading: CGFloat = shellState["project"] is String ? width() * fraction : 0
        host.shell.setChatGeometry(leading)
        let state = nativeChatState()
        host.chat.place(state, composer: host.composer)
        host.chat.isHidden = !(state["visible"] as? Bool ?? false)
        host.composer.isHidden = host.chat.isHidden
        host.chat.model.cat.show(!host.chat.isHidden)
        // Clip the disappearing column while retaining the text and glass layout.
        host.chatColumn.frame = NSRect(x: 0, y: 0, width: leading, height: bounds.height)
        host.chatColumn.isHidden = leading < 1
        var dividerState = state
        dividerState["bounds"] = ["x":0, "y":0, "width":Double(leading), "height":Double(bounds.height)]
        host.chatDivider.update(dividerState)
        host.chatDivider.isHidden = host.chat.isHidden || fraction < 1
        let right = min(max(0, panels["right"] ?? 0), max(0, bounds.width - leading - 120))
        let bottom = min(max(0, panels["bottom"] ?? 0), bounds.height * 0.8)
        let available = NSRect(x: leading, y: 0, width: max(0, bounds.width - leading - right), height: max(0, bounds.height - bottom))
        var page = available
        let mobile = shellState["viewport"] as? String == "mobile"
        device.isHidden = !mobile || !previewVisible
        if mobile {
            let height = min(880, max(120, available.height - 32), max(120, available.width - 32) * 1252 / 606)
            let bezel = NSRect(x: available.midX - height * 606 / 1252 / 2, y: available.midY - height / 2, width: height * 606 / 1252, height: height)
            device.frame = bezel
            page = NSRect(x: bezel.minX + bezel.width * 0.0396, y: bezel.minY + bezel.height * 0.01677, width: bezel.width * (1 - 0.0396 - 0.04125), height: bezel.height * (1 - 0.01677 * 2))
        }
        if let preview = host.views["preview"] {
            preview.autoresizingMask = []; preview.frame = page
            preview.layer?.cornerRadius = mobile ? page.width * 0.12 : 0
            preview.layer?.masksToBounds = mobile
            preview.isHidden = !previewVisible || page.width <= 0 || page.height <= 0
        }
        if let panel = host.views["panel"] {
            panelFrame = NSRect(x: bounds.width - panelSize.width + 18, y: 0, width: panelSize.width, height: min(panelSize.height, available.height))
            panel.frame = panelFrame; panel.isHidden = !panelVisible
        }
        readout.stringValue = "\(Int(page.width.rounded()))px × \(Int(page.height.rounded()))px"
        readout.sizeToFit(); readout.frame.origin = NSPoint(x: max(leading, available.maxX - readout.frame.width - 10), y: 8)
        readout.isHidden = !previewVisible || !host.chatDivider.dragging
        host.previewSurface.needsDisplay = true
        if page != lastFrame || leading != lastLeading {
            lastFrame = page; lastLeading = leading
            emit(["event":"native-layout-frame", "frame":["x":Double(page.minX), "y":Double(page.minY), "width":Double(page.width), "height":Double(page.height), "radius":mobile ? Double(page.width * 0.12) : 0, "leading":Double(leading)]])
        }
    }
    func inspect() -> [String: Any] { ["native":true, "width":Double(width()), "fraction":Double(fraction), "preview":NSStringFromRect(host?.views["preview"]?.frame ?? .zero), "panel":NSStringFromRect(panelFrame)] }
}
