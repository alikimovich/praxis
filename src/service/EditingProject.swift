import Foundation
import Darwin

/// The other files Trezi keeps in a project's `.trezi/` folder (S15, moved from Bun):
/// the pre-rename sidecar migration, the setup helpers a chat worktree carries, and the
/// Next dependency marker. They run in the repository's lane beside the sidecar commits
/// (`EditingSidecar`), and none of them ever follows a link out of the project: a
/// `.trezi`/`.praxis`/`.dsgn` folder or a helper that is a link is refused.
/// Rollback twins: sidecar-migrate.ts, setup-artifacts.ts, worktree-dependencies.ts's
/// legacy half in editing-model.ts.
enum EditingProject {
    private static func refused(_ message: String) -> RepositoryRefusal { RepositoryRefusal(.invalidRequest, message) }

    // MARK: Legacy sidecar migration

    /// Files of `.dsgn/` that move (copy, then unlink) into `.trezi/`.
    static let dsgnFiles = ["annotations.json", "tokens.json", "control-panels.json"]

    /// Copies `.praxis/` into `.trezi/` and moves `.dsgn/`'s known files. Existing files
    /// win; a differing one is reported (both stay). Exclusive copies make it restartable.
    static func migrate(root: String) throws -> [String] {
        var collisions: [String] = []
        try copyLegacy(from: root + "/.praxis", to: root + "/.trezi", collisions: &collisions)
        if let old = kind(root + "/.dsgn"), old != S_IFDIR { throw refused("Legacy dsgn metadata must be a real directory.") }
        if let current = kind(root + "/.trezi"), current != S_IFDIR { throw refused("Trezi metadata must be a real directory.") }
        for name in dsgnFiles {
            let from = root + "/.dsgn/" + name, to = root + "/.trezi/" + name
            guard let source = kind(from) else { continue }
            guard source == S_IFREG else { throw refused("Invalid legacy metadata: \(from)") }
            if kind(to) != nil { continue }
            try makeDirectory(root + "/.trezi")
            try publishCopy(from: from, to: to)
            guard unlink(from) == 0 else { throw posix() }
        }
        return collisions
    }

    private static func copyLegacy(from: String, to: String, collisions: inout [String]) throws {
        guard let info = kind(from) else { return }
        guard info == S_IFDIR else { throw refused("Legacy metadata must be a real directory: \(from)") }
        if let destination = kind(to), destination != S_IFDIR { throw refused("Metadata must be a real directory: \(to)") }
        try makeDirectory(to)
        for name in try FileManager.default.contentsOfDirectory(atPath: from).sorted() {
            let source = from + "/" + name, target = to + "/" + name
            let entry = kind(source)
            if entry == S_IFDIR { try copyLegacy(from: source, to: target, collisions: &collisions); continue }
            guard entry == S_IFREG else { throw refused("Unsupported legacy metadata entry: \(source)") }
            do { try publishCopy(from: source, to: target) } catch let error as POSIXError where error.code == .EEXIST {
                guard kind(target) == S_IFREG else { throw refused("Invalid metadata destination: \(target)") }
                if try Data(contentsOf: URL(fileURLWithPath: source)) != Data(contentsOf: URL(fileURLWithPath: target)) { collisions.append(source) }
            }
        }
    }

    /// Exclusive temporary copy, then `link`: no partial destination, never replaces one.
    private static func publishCopy(from: String, to: String) throws {
        let temporary = to + ".migration-" + UUID().uuidString.lowercased()
        try create(Data(contentsOf: URL(fileURLWithPath: from)), at: temporary, mode: 0o600)
        defer { unlink(temporary) }
        guard link(temporary, to) == 0 else { throw posix() }
    }

    // MARK: Setup helpers

    static let helpers = ["trezi-source.cjs", "trezi-rn-source.cjs", "trezi-svelte-stamp.mjs",
                          "trezi-next-loader.cjs", "trezi-next.cjs", "trezi-mdx.mjs"]

    /// Copies the executable helpers setup keeps in the live project's `.trezi/` (and the
    /// pre-rename `.praxis/` names) into the worktree, verified byte for byte, and records
    /// their hashes. A helper the project no longer has is removed from the worktree.
    static func syncHelpers(liveRoot: String, worktree: String) throws {
        try sync(liveRoot: liveRoot, worktree: worktree, directory: ".trezi", names: helpers)
        // `name.replace('trezi', 'praxis')`: the first occurrence only.
        let legacy = helpers.map { name -> String in
            guard let range = name.range(of: "trezi") else { return name }
            return name.replacingCharacters(in: range, with: "praxis")
        }
        try sync(liveRoot: liveRoot, worktree: worktree, directory: ".praxis", names: legacy)
    }

    private static func sync(liveRoot: String, worktree: String, directory: String, names: [String]) throws {
        let source = liveRoot + "/" + directory, target = worktree + "/" + directory
        for path in [source, target] {
            if let found = kind(path), found != S_IFDIR { throw refused("Setup helper directory must be a real directory: \(path)") }
        }
        var verified: [(path: String, sha256: String)] = []
        for name in names {
            let from = source + "/" + name, to = target + "/" + name
            guard let found = kind(from) else {
                if unlink(to) != 0, errno != ENOENT { throw posix() }
                continue
            }
            guard found == S_IFREG else { throw refused("Invalid setup helper: \(from)") }
            let content = try Data(contentsOf: URL(fileURLWithPath: from))
            try makeDirectory(target)
            let temporary = to + "." + UUID().uuidString.lowercased() + ".tmp"
            defer { unlink(temporary) }
            try create(content, at: temporary, mode: 0o644)
            guard rename(temporary, to) == 0 else { throw posix() }
            let actual = try Data(contentsOf: URL(fileURLWithPath: to))
            guard actual == content else { throw refused("Setup helper verification failed: \(name)") }
            verified.append((directory + "/" + name, SourcePaths.hash(actual)))
        }
        let record = target + "/setup-helpers.json"
        if unlink(record) != 0, errno != ENOENT { throw posix() }
        guard !verified.isEmpty else { return }
        // Byte-identical to `JSON.stringify({ worktree, helpers }, null, 2)`.
        let quote = { (text: String) in JSValue.string(JSText(text)).serialized().string }
        let entries = verified.map { "    {\n      \"path\": \(quote($0.path)),\n      \"sha256\": \(quote($0.sha256))\n    }" }
        let text = "{\n  \"worktree\": \(quote(worktree)),\n  \"helpers\": [\n" + entries.joined(separator: ",\n") + "\n  ]\n}"
        try create(Data(text.utf8), at: record, mode: 0o644)
    }

    // MARK: Next dependency marker

    static let manifests = ["package.json", "bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]

    /// Hash of the checkout's manifests and lockfile, each name then its bytes (absent: none).
    static func fingerprint(_ checkout: String) -> String {
        var bytes = Data()
        for name in manifests {
            bytes.append(Data(name.utf8))
            bytes.append((try? Data(contentsOf: URL(fileURLWithPath: checkout + "/" + name))) ?? Data())
        }
        return SourcePaths.hash(bytes)
    }

    /// Next/Turbopack cannot follow the shared `node_modules` link outside its root:
    /// removes that link and answers whether the checkout needs its own install (Bun runs
    /// the install through the service, then calls `mark`). No install for a checkout whose
    /// marker still matches, or when the live project has no dependencies to copy from.
    static func dependencyState(liveRoot: String, checkout: String) throws -> Bool {
        let target = checkout + "/node_modules"
        let found = kind(target)
        if found == S_IFLNK {
            guard unlink(target) == 0 else { throw posix() }
        } else if found != nil {
            let marker = try? String(contentsOfFile: checkout + "/.trezi/dependencies.sha256", encoding: .utf8)
            if marker == fingerprint(checkout) { return false }
        }
        return access(liveRoot + "/node_modules", F_OK) == 0
    }

    /// Records the fingerprint the install ran against (`.trezi` must be a plain folder).
    static func mark(checkout: String) throws {
        try makeDirectory(checkout + "/.trezi")
        let marker = checkout + "/.trezi/dependencies.sha256"
        if unlink(marker) != 0, errno != ENOENT { throw posix() }
        try create(Data(fingerprint(checkout).utf8), at: marker, mode: 0o644)
    }

    // MARK: Files

    /// The file type of `path` without following a link, nil when absent.
    private static func kind(_ path: String) -> mode_t? {
        var info = stat()
        return lstat(path, &info) == 0 ? info.st_mode & S_IFMT : nil
    }

    /// A real directory (created when absent); a link or file in its place is refused.
    private static func makeDirectory(_ path: String) throws {
        if let found = kind(path) {
            guard found == S_IFDIR else { throw refused("Metadata must be a real directory: \(path)") }
            return
        }
        try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
        guard kind(path) == S_IFDIR else { throw refused("Metadata must be a real directory: \(path)") }
    }

    /// Exclusive create: never follows or replaces what is already there.
    private static func create(_ data: Data, at path: String, mode: mode_t) throws {
        let fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, mode)
        guard fd >= 0 else { throw posix() }
        var failed: Int32 = 0
        data.withUnsafeBytes { buffer in
            var offset = 0
            while offset < buffer.count {
                let written = Darwin.write(fd, buffer.baseAddress! + offset, buffer.count - offset)
                if written < 0 { if errno == EINTR { continue }; failed = errno; return }
                offset += written
            }
        }
        if failed == 0, fsync(fd) != 0 { failed = errno }
        close(fd)
        if failed != 0 { unlink(path); throw POSIXError(POSIXErrorCode(rawValue: failed) ?? .EIO) }
    }

    private static func posix() -> POSIXError { POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
}
