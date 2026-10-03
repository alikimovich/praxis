import AppKit
import ImageIO

/// A bounded, horizontally scrolling strip. Decode only when attachment IDs change,
/// not on every draft keystroke or streamed chat update.
final class ComposerAttachments: NSScrollView {
    static let rowHeight: CGFloat = 108
    private let row = NSView()
    private var ids: [String] = []
    private var tiles: [ComposerAttachmentTile] = []
    var remove: ((Int) -> Void)?
    var count: Int { tiles.count }

    init() {
        super.init(frame: .zero)
        drawsBackground = false; borderType = .noBorder
        hasHorizontalScroller = true; autohidesScrollers = true; scrollerStyle = .overlay
        documentView = row
        setAccessibilityLabel("Attached files")
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func update(_ values: [[String: Any]]) {
        let nextIDs = values.map { $0["id"] as? String ?? "" }
        guard ids != nextIDs else { return }
        ids = nextIDs
        tiles.forEach { $0.dismissPreview(); $0.removeFromSuperview() }
        tiles = values.enumerated().map { index, value in
            let tile = ComposerAttachmentTile(value)
            tile.remove = { [weak self] in self?.remove?(index) }
            row.addSubview(tile)
            return tile
        }
        isHidden = tiles.isEmpty; needsLayout = true
        contentView.scroll(to: .zero)
    }
    override func layout() {
        super.layout()
        var x: CGFloat = 0
        for tile in tiles {
            let width: CGFloat = tile.isImage ? 96 : 172
            tile.frame = NSRect(x: x, y: 8, width: width, height: 96)
            x += width + 10
        }
        row.frame = NSRect(x: 0, y: 0, width: max(contentSize.width, x - 10), height: Self.rowHeight)
    }
    func removeAt(_ index: Int) {
        guard tiles.indices.contains(index) else { return }
        tiles[index].removeButton.performClick(nil)
    }
    func inspect() -> [String: Any] {
        ["count":count, "images":tiles.filter { $0.hasThumbnail }.count,
         "height":bounds.height, "documentWidth":row.bounds.width, "viewportWidth":contentSize.width]
    }
}

private final class ComposerAttachmentTile: NSView {
    let isImage: Bool
    let hasThumbnail: Bool
    let removeButton = NSButton()
    var remove: (() -> Void)?
    private let surface = NSView()
    private let previewButton = NSButton()
    private let name: String
    private let imageData: Data?
    private var popover: NSPopover?

    init(_ value: [String: Any]) {
        name = value["name"] as? String ?? "Attachment"
        isImage = (value["type"] as? String ?? "").hasPrefix("image/")
        imageData = isImage ? Data(base64Encoded: value["data"] as? String ?? "") : nil
        let thumbnail = Self.thumbnail(imageData, size: 256)
        hasThumbnail = thumbnail != nil
        super.init(frame: .zero)
        surface.wantsLayer = true
        surface.layer?.cornerRadius = 12; surface.layer?.masksToBounds = true
        surface.layer?.borderWidth = 1
        addSubview(surface)
        if let thumbnail {
            surface.layer?.contents = thumbnail
            surface.layer?.contentsGravity = .resizeAspectFill
            previewButton.title = ""; previewButton.isBordered = false
            previewButton.target = self; previewButton.action = #selector(preview)
            previewButton.setAccessibilityLabel("Preview " + name)
            surface.addSubview(previewButton)
        } else {
            let icon = NSImageView(image: NSImage(systemSymbolName: isImage ? "photo" : "doc", accessibilityDescription: nil)!)
            icon.frame = NSRect(x: 12, y: 50, width: 24, height: 26)
            surface.addSubview(icon)
            let label = NSTextField(wrappingLabelWithString: name)
            label.font = .systemFont(ofSize: 12, weight: .medium); label.textColor = .labelColor
            label.maximumNumberOfLines = 2; label.lineBreakMode = .byTruncatingMiddle
            label.frame = NSRect(x: 12, y: 10, width: isImage ? 68 : 144, height: 32)
            surface.addSubview(label)
        }
        toolTip = name
        removeButton.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: "Remove " + name)
        removeButton.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 9, weight: .bold)
        removeButton.bezelStyle = .circular; removeButton.isBordered = true
        removeButton.title = ""; removeButton.target = self; removeButton.action = #selector(removeClicked)
        removeButton.setAccessibilityLabel("Remove " + name); removeButton.toolTip = "Remove " + name
        addSubview(removeButton)
        updateColors()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func layout() {
        super.layout()
        surface.frame = bounds.insetBy(dx: 2, dy: 2)
        previewButton.frame = surface.bounds
        removeButton.frame = NSRect(x: bounds.width - 26, y: bounds.height - 26, width: 24, height: 24)
    }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); updateColors() }
    private func updateColors() {
        surface.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
        surface.layer?.borderColor = NSColor.separatorColor.cgColor
    }
    @objc private func removeClicked() { dismissPreview(); remove?() }
    func dismissPreview() { popover?.close(); popover = nil }
    @objc private func preview() {
        guard let cgImage = Self.thumbnail(imageData, size: 1600) else { return }
        let scale = min(1, 640 / CGFloat(cgImage.width), 480 / CGFloat(cgImage.height))
        let size = NSSize(width: max(80, CGFloat(cgImage.width) * scale), height: max(80, CGFloat(cgImage.height) * scale))
        let view = NSImageView(frame: NSRect(origin: .zero, size: size))
        view.image = NSImage(cgImage: cgImage, size: .zero); view.imageScaling = .scaleProportionallyUpOrDown
        view.setAccessibilityLabel(name)
        let controller = NSViewController(); controller.view = view
        let panel = NSPopover(); panel.behavior = .transient; panel.contentViewController = controller
        panel.contentSize = size; panel.show(relativeTo: bounds, of: self, preferredEdge: .maxY)
        popover = panel
    }
    private static func thumbnail(_ data: Data?, size: Int) -> CGImage? {
        guard let data, let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: size
        ] as CFDictionary)
    }
}
