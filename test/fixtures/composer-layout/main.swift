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
        // Resolve the real viewport through Auto Layout, without a window.
        composer.setFrameSize(NSSize(width: width, height: height))
        composer.layoutSubtreeIfNeeded()
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

// Mirror the native smoke drafts so a desktop timeout cannot hide a fixture
// that no longer exceeds the minimum-height form's available text space.
let growthDraft = Array(repeating: "A line of draft text", count: 9).joined(separator: "\n") + "\n"
let smokeWrappedDraft = String(repeating: "wrap text ", count: 40)
for width: CGFloat in [320, 420, 520] {
    func height(_ value: String) -> CGFloat {
        composer.preferredHeight(for: value, width: width, availableHeight: 776, hasContext: false)
    }
    let compact = height("")
    let grown = height(growthDraft)
    let capped = height(longDraft)
    let wrapped = height(smokeWrappedDraft)
    print("Smoke draft heights at \(width): compact=\(compact), grown=\(grown), capped=\(capped), wrapped=\(wrapped)")
    require(grown > compact + 60, "Smoke multiline fixture grows by more than 60pt")
    require(capped > grown && capped <= 368, "Smoke long fixture grows further to the cap")
    require(wrapped > compact && wrapped < capped, "Smoke wrapped fixture grows but stays below the cap")
    for value in [growthDraft, longDraft, smokeWrappedDraft, ""] {
        composer.perform(["text": value])
        composer.setFrameSize(NSSize(width: width, height: height(value)))
        composer.layoutSubtreeIfNeeded()
        let viewport = composer.scroll.contentSize.height
        let document = composer.text.frame.height
        if value == longDraft {
            require(document > viewport + 100, "Smoke capped draft remains scrollable")
        } else {
            require(document <= viewport + 1, "Smoke uncapped draft fits its actual viewport")
        }
    }
}

// Start fresh and use the bridge update path, including the preceding capped paint.
for style in [NSScroller.Style.overlay, .legacy] {
    for width: Double in [320, 420, 520] {
        let live = NativeComposer(frame: .zero)
        live.scroll.scrollerStyle = style
        live.text.setMarkedText("に", selectedRange: NSRange(location: 1, length: 0), replacementRange: NSRange(location: NSNotFound, length: 0))
        live.text.unmarkText(); live.text.string = ""
        for value in ["", growthDraft, longDraft, smokeWrappedDraft, ""] {
            let height = live.preferredHeight(for: value, width: width, availableHeight: 776, hasContext: false)
            live.update(["visible": true, "text": value, "bounds": ["x": 10.0, "y": 776 - Double(height), "width": width, "height": Double(height)]])
            live.layoutSubtreeIfNeeded()
            if value == longDraft { live.text.sizeToFit() }
            if value != longDraft {
                require(live.text.frame.height <= live.scroll.contentSize.height + 1, "Bridge uncapped document fits (style \(style.rawValue), width \(width), document \(live.text.frame.height), viewport \(live.scroll.contentSize.height))")
            }
        }
    }
}
print("Bridge sizing: overlay/legacy scrollers, IME, capped-to-wrapped replacements and empty reset passed at 320/420/520pt")

// Mirror the foreground matrix (smoke-composer.ts): its multiline draft must
// grow past the minimum form at the normal/narrow chat widths it resizes to.
let matrixMultiline = ["First", "Second", "Third", "Fourth", "Fifth"].map { "\($0) composer line" }.joined(separator: "\n")
for chatWidth: CGFloat in [440, 320] {
    let width = chatWidth - 20  // NativeChat places the composer 10pt from each side
    for available: CGFloat in [500, 766] {
        let compact = composer.preferredHeight(for: "", width: width, availableHeight: available, hasContext: false)
        let multiline = composer.preferredHeight(for: matrixMultiline, width: width, availableHeight: available, hasContext: false)
        require(multiline > compact, "Matrix multiline draft grows the composer at chat width \(chatWidth): \(compact) -> \(multiline)")
        composer.perform(["text": matrixMultiline])
        composer.setFrameSize(NSSize(width: width, height: multiline))
        composer.layoutSubtreeIfNeeded()
        require(composer.text.frame.height <= composer.scroll.contentSize.height + 1, "Matrix multiline draft fits at chat width \(chatWidth)")
        require(composer.verificationLayout()["alignment"] as? Bool == true, "Matrix multiline keeps the shared row at chat width \(chatWidth)")
    }
}
composer.perform(["text": ""])
print("Foreground matrix mirror: five-line draft grows, fits and keeps the row at 440/320pt chat widths")

// Resolve the actual Auto Layout tree without opening an application/window.
// Borderless popup frames overlap by one point at four-point stack spacing;
// their alignment rectangles remain correctly separated.
for width: CGFloat in [240, 320, 420, 520] {
    for value in ["", "First line\nSecond line\n", longDraft] {
        composer.perform(["text": value])
        let height = composer.preferredHeight(for: value, width: width, availableHeight: 776, hasContext: false)
        composer.setFrameSize(NSSize(width: width, height: height))
        composer.layoutSubtreeIfNeeded()
        let geometry = composer.verificationLayout()
        require(geometry["alignment"] as? Bool == true, "Ordered control alignment at width \(width): \(geometry)")
        require(geometry["contained"] as? Bool == true, "Input and controls inside bubble")
        require((geometry["bottomInset"] as? CGFloat ?? 0) >= 7, "Bubble extends below controls")
        require(composer.controls.arrangedSubviews.contains(composer.sendButton), "Send shares the control row")
        require(composer.pickers.values.allSatisfy { !$0.isHidden && $0.frame.width >= 35 }, "Selectors remain usable at narrow widths")
    }
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

let oldSendFrame = composer.sendButton.frame
composer.sendButton.setFrameOrigin(NSPoint(x: oldSendFrame.minX, y: oldSendFrame.minY + 18))
require(composer.verificationLayout()["alignment"] as? Bool == false, "Raised Send must fail row alignment")
composer.sendButton.frame = oldSendFrame
print("Composer alignment: centered bottom row, narrow selectors, containment and rejected overlaps/raised Send passed without a window")
