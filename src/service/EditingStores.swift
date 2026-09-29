import Foundation
import Darwin

/// The controls sidecars (S12): `.trezi/control-panels.json` and
/// `.trezi/content-controls.json` in a user's repository. Bun validates manifests and
/// recipes and renders the next store text; the service commits it only if the file
/// still holds the bytes Bun read (`expectedHash`, nil for "absent"), in the
/// repository's lane. The agent can never write these (its sandbox denies `.trezi/`),
/// and no other Trezi path writes them.
enum EditingSidecar {
    static let names: Set<String> = ["control-panels.json", "content-controls.json"]
    static let maxBytes = 1024 * 1024

    enum Outcome { case written(String), conflict }

    static func commit(root: String, name: String, expected: String?, content: Data) throws -> Outcome {
        let refused = RepositoryRefusal(.unauthorized, "The .trezi folder is not a plain folder inside the project.")
        let directory = root + "/.trezi", path = directory + "/" + name
        var info = stat()
        if lstat(directory, &info) == 0 {
            guard (info.st_mode & S_IFMT) == S_IFDIR else { throw refused }
        } else {
            guard errno == ENOENT, mkdir(directory, 0o755) == 0 || errno == EEXIST,
                  lstat(directory, &info) == 0, (info.st_mode & S_IFMT) == S_IFDIR else { throw refused }
        }
        guard let real = RepositoryPaths.realpath(directory), real == directory else { throw refused }
        var current: Data?
        if lstat(path, &info) == 0 {
            guard (info.st_mode & S_IFMT) == S_IFREG else { throw refused }
            guard info.st_size <= maxBytes, let data = try SourcePaths.read(path) else {
                throw RepositoryRefusal(.invalidRequest, "The \(name) store is too large; it was left untouched.")
            }
            current = data
        }
        guard current.map(SourcePaths.hash) == expected else { return .conflict }
        try SourcePaths.write(content, to: path)
        return .written(SourcePaths.hash(content))
    }
}

/// Unsaved content-editor drafts (S12): `<profile>/service/editing/content-drafts/
/// <root>.json`, one per resolved project root. A draft keeps the document revision
/// it was edited against, so after a restart Bun reopens it as a conflict (never
/// saved over newer content) when the document changed in the meantime. Only the
/// editor's own save, reload or removal clears one. A damaged file is refused.
final class EditingDrafts: @unchecked Sendable {
    static let maxDrafts = 20
    static let maxBytes = 512 * 1024

    let directory: URL
    private let lock = NSLock()

    init(profile: String) {
        directory = URL(fileURLWithPath: profile).appendingPathComponent("service/editing/content-drafts")
    }

    private func url(_ root: String) -> URL { directory.appendingPathComponent(SourcePaths.hash(Data(root.utf8)) + ".json") }

    private func load(_ root: String) throws -> [JSValue] {
        guard let data = try? Data(contentsOf: url(root)) else { return [] }
        guard let file = try? JSValue.parse(data, maxDepth: 128), file["root"]?.text?.string == root,
              case .array(let drafts)? = file["drafts"] else {
            throw RepositoryRefusal(.recoveryRequired, "The saved content drafts for this project are unreadable; they were left untouched.")
        }
        return drafts
    }

    func list(root: String) throws -> [JSValue] {
        lock.lock(); defer { lock.unlock() }
        return try load(root)
    }

    func save(root: String, panel: String, revision: String, value: JSValue, updated: String) throws {
        lock.lock(); defer { lock.unlock() }
        var drafts = try load(root).filter { $0["panel"]?.text?.string != panel }
        let draft = RepositoryOwner.object([("panel", .string(JSText(panel))), ("revision", .string(JSText(revision))),
                                            ("value", value), ("updated", .string(JSText(updated)))])
        guard draft.utf8().count <= Self.maxBytes else { throw RepositoryRefusal(.invalidRequest, "The draft exceeds 512 KB.") }
        drafts.append(draft)
        guard drafts.count <= Self.maxDrafts else { throw RepositoryRefusal(.invalidRequest, "Too many unsaved content drafts in this project.") }
        try store(root, drafts)
    }

    func clear(root: String, panel: String) throws {
        lock.lock(); defer { lock.unlock() }
        let drafts = try load(root)
        let next = drafts.filter { $0["panel"]?.text?.string != panel }
        guard next.count != drafts.count else { return }
        if next.isEmpty { try? FileManager.default.removeItem(at: url(root)); return }
        try store(root, next)
    }

    private func store(_ root: String, _ drafts: [JSValue]) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try SourcePaths.write(RepositoryOwner.object([("root", .string(JSText(root))), ("drafts", .array(drafts))]).utf8(), to: url(root).path)
    }
}

/// Deferred preview navigation (S12): an agent's `open_preview` request waits for the
/// turn that made it to land, then opens once in that chat's project. A failed or
/// parked turn, a newer user turn and closing or leaving the chat drop it. Bun performs
/// the load (it knows the project's server) after `take` hands the path over.
struct EditingNavigation {
    struct Pending { let root: String; let path: String; let turn: String?; var awaiting: Bool }
    private(set) var pending: [String: Pending] = [:]

    /// `previewPath` in src/shared/preview-navigation.ts: project-root paths only.
    static func valid(_ path: String) -> Bool {
        path.hasPrefix("/") && !path.hasPrefix("//") && path.utf16.count <= 8192 && !path.utf16.contains { $0 <= 0x20 || $0 == 0x5C }
    }

    mutating func request(chat: String, root: String, path: String, turn: String?) -> Bool {
        pending[chat] = Pending(root: root, path: path, turn: turn, awaiting: turn != nil)
        return turn == nil
    }

    /// kind: landed | failed | begin | close. Answers whether a request is ready to open.
    mutating func event(chat: String, kind: String, turn: String?) -> Bool {
        guard var request = pending[chat] else { return false }
        switch kind {
        case "landed": if request.turn == nil || request.turn == turn { request.awaiting = false }
        case "failed": if turn == nil || request.turn == nil || request.turn == turn { pending[chat] = nil; return false }
        case "begin": if turn != request.turn { pending[chat] = nil; return false }
        default: pending[chat] = nil; return false
        }
        pending[chat] = request
        return !request.awaiting
    }

    mutating func take(chat: String) -> Pending? {
        guard let request = pending[chat], !request.awaiting else { return nil }
        pending[chat] = nil
        return request
    }
}
