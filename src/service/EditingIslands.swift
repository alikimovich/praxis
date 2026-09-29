import Foundation

/// Chat islands (S12, LKM-99): the only writer of `<profile>/chat-islands/<id>.json`
/// (unchanged format: `JSON.stringify(records)`), and the state machine every island
/// decision goes through. Bun keeps the JS helpers: validating a definition, choosing
/// blocks (Jev), resolving and splicing source literals, and the view it renders. It
/// asks here before each step and reports what happened; source writes go to the
/// source owner as hash-bound proposals.
///
/// - A definition is bound to the turn that made it (its `origin`). It waits for that
///   turn's landing; another turn's terminal (a late event, a later turn) never
///   activates it, and a composition is refused if its own turn ended meanwhile.
/// - A command is admitted only for the island's current revision, once it is ready,
///   and one at a time per chat. Within one queued batch the source revision advances
///   through the batch's own writes only (`chain`), so reordered gesture frames still
///   apply while an external edit is refused.
/// - Each island's last write is its Undo group; Undo reverts that group through the
///   source owner.
/// There is no TypeScript twin since LKM-111: test/fixtures/editing-owner/parity-golden.json pins the answers.
struct EditingIslands {
    static let maxRecords = 30
    static let maxFileUnits = 1_000_000

    struct Composition {
        let token: String
        let origin: String?
        let id: String
        let revision: Int
        let turn: Int
        let replacing: Bool
        var ended = false
    }

    struct Running {
        let ticket: String
        let id: String
        let action: String
        let expected: String
    }

    struct Session {
        let chat: String
        let root: String
        let file: URL
        var records: [JSValue]
        var composing: Composition?
        var running: Running?
        /// island id → the source-owner group of its last write.
        var undo: [String: String] = [:]
        /// source revision a queued command saw → the revision the batch's own writes left.
        var chain: [String: String] = [:]
    }

    let directory: URL
    var fault: (@Sendable (String) -> Void)?
    private(set) var sessions: [String: Session] = [:]

    init(profile: String) {
        directory = URL(fileURLWithPath: profile).appendingPathComponent("chat-islands")
    }

    static func fileName(root: String, record: String) -> String {
        SourcePaths.hash(Data((root + "\0" + record).utf8)) + ".json"
    }

    // MARK: Chats

    /// Opens (or keeps) a chat's island history. Missing or damaged history opens empty,
    /// as it always has: it must never prevent a chat from opening.
    mutating func open(chat: String, root: String, record: String) -> [JSValue] {
        let file = directory.appendingPathComponent(Self.fileName(root: root, record: record))
        if let existing = sessions[chat], existing.file == file { return existing.records }
        sessions[chat] = Session(chat: chat, root: root, file: file, records: Self.load(file))
        return sessions[chat]!.records
    }

    mutating func close(chat: String) -> Bool { sessions.removeValue(forKey: chat)?.composing != nil }

    static func load(_ file: URL) -> [JSValue] {
        guard let data = try? Data(contentsOf: file), let parsed = try? JSValue.parse(data, maxDepth: 64),
              String(decoding: data, as: UTF8.self).utf16.count <= maxFileUnits,
              case .array(let stored) = parsed, stored.count <= maxRecords else { return [] }
        return stored.compactMap { raw in
            guard case .object(var fields) = raw, raw["version"] == .number(1), raw["id"]?.text != nil,
                  let revision = integer(raw["revision"]), revision >= 0, let turn = integer(raw["turn"]), turn >= 1 else { return nil }
            // Only a landed island survives a restart as ready; one still waiting lost its turn.
            set(&fields, "status", .string(JSText(raw["status"]?.text?.string == "ready" ? "ready" : "unavailable")))
            if raw["initial"] == nil || raw["initial"] == .null { set(&fields, "initial", .object([])) }
            return .object(fields)
        }
    }

    // MARK: Definitions

    /// Admits a definition for the chat's current turn and reserves its identity.
    mutating func define(chat: String, origin: String?, turn: Int, id: String?, revision: Int?, token: String) throws -> Composition {
        guard var session = sessions[chat] else { throw RepositoryRefusal(.notFound, "This chat is not available for interactive islands yet.") }
        if session.composing != nil || session.running != nil { throw RepositoryRefusal(.busy, "An island operation is already in progress.") }
        let prior = id.flatMap { id in session.records.first { $0["id"]?.text?.string == id } }
        if id != nil, prior == nil || Self.integer(prior?["revision"]) != revision {
            throw RepositoryRefusal(.conflict, "Island revision changed. Read it before updating.")
        }
        let turn = max(1, turn)
        let replacing = prior.flatMap { Self.integer($0["turn"]) } == turn
        if !replacing, session.records.count >= Self.maxRecords { throw RepositoryRefusal(.invalidRequest, "This chat has reached its island limit.") }
        let composition = Composition(token: token, origin: origin,
            id: replacing ? prior!["id"]!.text!.string : UUID().uuidString.lowercased(),
            revision: (replacing ? Self.integer(prior?["revision"]) ?? 0 : 0) + 1, turn: turn, replacing: replacing)
        session.composing = composition
        sessions[chat] = session
        return composition
    }

    /// Persists a composed definition. Refused when the chat closed or its turn ended.
    mutating func commit(chat: String, token: String, definition: [(JSText, JSValue)], engine: String,
                         fallback: JSValue?, initial: JSValue) throws -> [JSValue] {
        guard var session = sessions[chat], let composition = session.composing, composition.token == token, !composition.ended else {
            if sessions[chat]?.composing?.token == token { sessions[chat]?.composing = nil }
            throw RepositoryRefusal(.conflict, "Chat closed or turn finished during composition.")
        }
        var fields: [(JSText, JSValue)] = [(JSText("version"), .number(1)), (JSText("id"), .string(JSText(composition.id))),
            (JSText("revision"), .number(Double(composition.revision))), (JSText("turn"), .number(Double(composition.turn)))]
        fields += definition
        fields += [(JSText("engine"), .string(JSText(engine))), (JSText("status"), .string(JSText("waiting"))), (JSText("initial"), initial)]
        if let fallback { fields.append((JSText("fallback"), fallback)) }
        if let origin = composition.origin { fields.append((JSText("origin"), .string(JSText(origin)))) }
        let record = JSValue.object(fields)
        var next = session.records
        if composition.replacing, let index = next.firstIndex(where: { $0["id"]?.text?.string == composition.id }) { next[index] = record }
        else { next.append(record) }
        session.composing = nil
        sessions[chat] = session
        try save(chat, next)
        return next
    }

    mutating func abort(chat: String, token: String) {
        if sessions[chat]?.composing?.token == token { sessions[chat]?.composing = nil }
    }

    /// A turn's terminal: its waiting definitions become ready (landed) or unavailable.
    /// `turn` nil is a terminal of whatever the chat is doing (Stop, a legacy record).
    /// Answers whether a composition of that turn was cut short.
    mutating func settle(chat: String, turn: String?, successful: Bool) throws -> (records: [JSValue], cancelled: Bool)? {
        guard var session = sessions[chat] else { return nil }
        func ours(_ origin: String?) -> Bool { turn == nil || origin == nil || origin == turn }
        var cancelled = false
        if var composition = session.composing, ours(composition.origin), !composition.ended {
            composition.ended = true; session.composing = composition; cancelled = true
        }
        var changed = false
        let next = session.records.map { record -> JSValue in
            guard record["status"]?.text?.string == "waiting", ours(record["origin"]?.text?.string), case .object(var fields) = record else { return record }
            Self.set(&fields, "status", .string(JSText(successful ? "ready" : "unavailable")))
            changed = true
            return .object(fields)
        }
        sessions[chat] = session
        if changed { try save(chat, next) }
        return (sessions[chat]!.records, cancelled && !successful)
    }

    // MARK: Commands

    /// Admits one command. Answers the source revision it must be computed against,
    /// and for Undo the group to revert, for Reset the initial values.
    mutating func command(chat: String, id: String, revision: Int, action: String, source: String, ticket: String) throws -> (expected: String, group: String?, initial: JSValue?) {
        guard var session = sessions[chat] else { throw RepositoryRefusal(.notFound, "Island is unavailable. Reopen this chat.") }
        if session.running != nil || session.composing != nil { throw RepositoryRefusal(.busy, "Island is unavailable or busy.") }
        guard let record = session.records.first(where: { $0["id"]?.text?.string == id }), Self.integer(record["revision"]) == revision else {
            throw RepositoryRefusal(.conflict, "Island changed. Reload its controls.")
        }
        let expected = session.chain[source] ?? source
        if action == "reload" { return (expected, nil, nil) }
        guard record["status"]?.text?.string == "ready" else { throw RepositoryRefusal(.conflict, "Source has not landed.") }
        var group: String?
        if action == "undo" {
            guard let found = session.undo[id] else { throw RepositoryRefusal(.notFound, "No edit from this island is available to undo.") }
            group = found
        }
        session.running = Running(ticket: ticket, id: id, action: action, expected: expected)
        sessions[chat] = session
        return (expected, group, action == "reset" ? record["initial"] : nil)
    }

    /// The command's outcome. `last` ends the queued batch (its revision chain is dropped).
    mutating func finish(chat: String, ticket: String, ok: Bool, group: String?, revision: String?, last: Bool) throws {
        guard var session = sessions[chat] else { return }
        guard let running = session.running, running.ticket == ticket else { throw RepositoryRefusal(.notFound, "No such island command.") }
        session.running = nil
        if ok {
            if running.action == "undo" { session.undo.removeValue(forKey: running.id); session.chain.removeAll() }
            else if let group, let revision {
                session.undo[running.id] = group
                for (before, after) in session.chain where after == running.expected { session.chain[before] = revision }
                session.chain[running.expected] = revision
                session.chain.removeValue(forKey: revision)
            }
        }
        if last { session.chain.removeAll() }
        sessions[chat] = session
    }

    // MARK: Persistence

    private mutating func save(_ chat: String, _ records: [JSValue]) throws {
        guard let session = sessions[chat] else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            fault?("island.write")
            try SourcePaths.write(JSValue.array(records).utf8(), to: session.file.path)
            fault?("island.written")
        } catch { throw RepositoryRefusal(.ioFailure, "The island could not be saved (\(error)).") }
        sessions[chat]?.records = records
        // Another chat showing the same history (a resumed record) sees the write too.
        for (key, other) in sessions where key != chat && other.file == session.file { sessions[key]?.records = records }
    }

    static func integer(_ value: JSValue?) -> Int? {
        guard case .number(let number)? = value, number.rounded() == number, abs(number) < 1e9 else { return nil }
        return Int(number)
    }

    static func set(_ fields: inout [(JSText, JSValue)], _ key: String, _ value: JSValue) {
        let name = JSText(key)
        if let index = fields.firstIndex(where: { $0.0 == name }) { fields[index].1 = value } else { fields.append((name, value)) }
    }
}
