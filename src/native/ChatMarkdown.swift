import SwiftUI

/// Block layout stays native; Foundation renders inline Markdown and links.
struct ChatMarkdown: View {
    let source: String
    private struct Block: Identifiable {
        let id: Int
        let text: String
        let kind: String
    }
    private var blocks: [Block] {
        var result: [Block] = [], lines: [String] = []
        var fence: String? = nil
        func flush(_ kind: String = "text") {
            if !lines.isEmpty { result.append(Block(id: result.count, text: lines.joined(separator: "\n"), kind: kind)); lines = [] }
        }
        for line in source.components(separatedBy: "\n") {
            if line.hasPrefix("```") || line.hasPrefix("~~~") {
                if fence != nil { flush("code"); fence = nil }
                else { flush(); fence = String(line.prefix(3)) }
            } else if fence != nil { lines.append(line) }
            else if line.isEmpty { flush() }
            else if line.hasPrefix("#") {
                flush(); result.append(Block(id: result.count, text: line.trimmingCharacters(in: CharacterSet(charactersIn: "# ")), kind: "heading"))
            } else { lines.append(line) }
        }
        flush(fence == nil ? "text" : "code")
        return result
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(blocks) { block in
                if block.kind == "code" {
                    VStack(alignment: .trailing, spacing: 4) {
                        Button { copyChatText(block.text) } label: { Image(systemName: "doc.on.doc") }.buttonStyle(.borderless).help("Copy code")
                        ScrollView(.horizontal) {
                            Text(block.text).font(.system(size: 12, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }.padding(10).background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                } else {
                    Text((try? AttributedString(markdown: block.text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(block.text))
                        .font(block.kind == "heading" ? .system(size: 16, weight: .semibold) : .system(size: 14))
                        .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}
func copyChatText(_ text: String) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string) }
