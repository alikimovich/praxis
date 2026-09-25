import SwiftUI

/// Shared rhythm for user text and assistant prose, independent of control fonts.
enum ChatTypography {
    static let body = Font.system(size: 13, weight: .regular)
    static let activity = Font.system(size: 11, weight: .regular, design: .monospaced)
    static let lineSpacing: CGFloat = 4
    static let paragraphSpacing: CGFloat = 12
}

/// Block layout stays native; Foundation renders inline Markdown and links.
struct ChatMarkdown: View {
    let source: String
    var streaming = false
    private struct Block: Identifiable {
        let id: Int
        let text: String
        let kind: String
    }
    private var blocks: [Block] {
        var result: [Block] = [], lines: [String] = []
        var fence: String? = nil
        func flush(_ kind: String = "text") {
            if !lines.isEmpty {
                let table = kind == "text" && lines.count >= 2 && lines[0].contains("|") && lines[1].split(separator: "|").allSatisfy { $0.trimmingCharacters(in: .whitespaces).range(of: "^:?-{3,}:?$", options: .regularExpression) != nil }
                result.append(Block(id: result.count, text: lines.joined(separator: "\n"), kind: table ? "table" : kind)); lines = []
            }
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
        VStack(alignment: .leading, spacing: ChatTypography.paragraphSpacing) {
            ForEach(blocks) { block in
                if block.kind == "code" {
                    VStack(alignment: .trailing, spacing: 4) {
                        Button { copyChatText(block.text) } label: { Image(systemName: "doc.on.doc") }.buttonStyle(.borderless).help("Copy code")
                        ScrollView(.horizontal) {
                            Text(highlightChatCode(block.text)).font(.system(size: 12, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }.padding(10).background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                } else if block.kind == "table" {
                    let rows = block.text.components(separatedBy: "\n").enumerated().filter { $0.offset != 1 }.map { tableCells($0.element) }
                    ScrollView(.horizontal) {
                        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                            ForEach(Array(rows.enumerated()), id: \.offset) { rowIndex, row in
                                GridRow { ForEach(Array(row.enumerated()), id: \.offset) { _, cell in Text((try? AttributedString(markdown: cell)) ?? AttributedString(cell)).font(.system(size: 13, weight: rowIndex == 0 ? .semibold : .regular)).textSelection(.enabled).frame(minWidth: 55, alignment: .leading) } }
                                if rowIndex == 0 { Divider().gridCellColumns(rows.map(\.count).max() ?? 1) }
                            }
                        }.padding(10)
                    }.background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                } else {
                    StreamingText(source: block.text, streaming: streaming && block.id == blocks.last?.id)
                        .font(block.kind == "heading" ? .system(size: 16, weight: .semibold) : ChatTypography.body)
                        .lineSpacing(ChatTypography.lineSpacing)
                        .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}
func copyChatText(_ text: String) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string) }

private func tableCells(_ row: String) -> [String] {
    var cells: [String] = [], current = "", escaped = false, code = false
    for char in row {
        if escaped { current.append(char); escaped = false }
        else if char == "\\" { escaped = true }
        else if char == "`" { code.toggle(); current.append(char) }
        else if char == "|" && !code { cells.append(current.trimmingCharacters(in: .whitespaces)); current = "" }
        else { current.append(char) }
    }
    cells.append(current.trimmingCharacters(in: .whitespaces))
    if row.trimmingCharacters(in: .whitespaces).hasPrefix("|") { cells.removeFirst() }
    if row.trimmingCharacters(in: .whitespaces).hasSuffix("|") && !cells.isEmpty { cells.removeLast() }
    return cells
}
func highlightChatCode(_ code: String) -> AttributedString {
    var output = AttributedString(code)
    guard code.utf16.count < 100_000 else { return output }
    let rules: [(String, Color)] = [("\\b(?:const|let|var|func|function|return|class|struct|import|export|from|if|else|async|await|true|false|null|nil|type|interface|public|private)\\b", .purple), ("\\b[0-9]+(?:\\.[0-9]+)?\\b", .blue), ("\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'", .red), ("//[^\\n]*|/\\*[\\s\\S]*?\\*/", .secondary)]
    for (pattern, color) in rules {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
        for match in regex.matches(in: code, range: NSRange(location: 0, length: code.utf16.count)) {
            if let range = Range(match.range, in: code), let start = AttributedString.Index(range.lowerBound, within: output), let end = AttributedString.Index(range.upperBound, within: output) { output[start..<end].foregroundColor = color }
        }
    }
    return output
}
