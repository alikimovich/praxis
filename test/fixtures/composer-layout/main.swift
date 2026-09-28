import AppKit

// No application, window, run loop or desktop input. These bridge/clipboard
// callbacks are irrelevant to the real composer's synchronous layout path.
func emit(_ value: [String: Any]) {}
func copyChatText(_ value: String) {}

func require(_ condition: Bool, _ message: String) {
    if !condition { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
let composer = NativeComposer(frame: .zero)
let longDraft = Array(repeating: "A long draft line", count: 80).joined(separator: "\n")
let wrappedDraft = String(repeating: "wrap text ", count: 20)
for width: CGFloat in [420, 320, 520] {
    for value in ["", longDraft, wrappedDraft, longDraft, "Short", "", "Line\nLine\n"] {
        composer.perform(["text": value])
        let height = composer.preferredHeight(for: value, width: width, availableHeight: 776, hasContext: false)
        // Supply the viewport normally assigned by Auto Layout, without a window.
        composer.scroll.setFrameSize(NSSize(width: width - 24, height: height - 101))
        composer.layout()
        // The smoke sequence captures the expanded draft before replacing it.
        // Resolve that preceding paint without drawing or creating a window.
        if value == longDraft { composer.text.sizeToFit() }
        let viewport = composer.scroll.contentSize.height
        let document = composer.text.frame.height
        if value == longDraft {
            require(height == 368, "Long draft reaches the cap")
            require(document > viewport + 100, "Capped draft retains scrollable content")
        } else {
            require(height < 368, "Short draft remains below the cap")
            require(document <= viewport + 1, "Replacement draft fits without waiting for paint (width \(width), document \(document), viewport \(viewport))")
            if !value.isEmpty {
                let manager = composer.text.layoutManager!
                let container = composer.text.textContainer!
                manager.ensureLayout(for: container)
                let used = max(manager.usedRect(for: container).maxY, manager.extraLineFragmentRect.maxY)
                require(used + composer.text.textContainerInset.height * 2 <= document + 1, "Document includes all lines and trailing caret")
            }
        }
    }
}
print("Composer layout: capped replacement, wrapping, width changes, empty and trailing newline passed without a window")

// Resolve the actual Auto Layout tree without opening an application/window.
// Borderless popup frames overlap by one point at four-point stack spacing;
// their alignment rectangles remain correctly separated.
for width: CGFloat in [320, 420, 520] {
    composer.setFrameSize(NSSize(width: width, height: 148))
    composer.layoutSubtreeIfNeeded()
    let geometry = composer.verificationLayout()
    require(geometry["alignment"] as? Bool == true, "Ordered control alignment at width \(width): \(geometry)")
    require(geometry["contained"] as? Bool == true, "Input and controls inside bubble")
    require((geometry["bottomInset"] as? CGFloat ?? 0) >= 7, "Bubble extends below controls")
}
let model = composer.pickers["Model"]!
let permission = composer.pickers["Permission mode"]!
let oldFrame = permission.frame
permission.setFrameOrigin(model.frame.origin)
require(composer.verificationLayout()["alignment"] as? Bool == false, "Overlapping alignment rectangles must fail")
permission.frame = oldFrame
let provider = composer.pickers["Provider"]!
let oldProviderFrame = provider.frame
provider.setFrameOrigin(composer.plus.frame.origin)
require(composer.verificationLayout()["alignment"] as? Bool == false, "Attachment/provider overlap must fail")
provider.frame = oldProviderFrame
print("Composer alignment: AppKit insets, all control gaps, containment and rejected overlaps passed without a window")
