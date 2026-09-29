import Foundation

/// The editing coordinator (S12, LKM-99). Under the Swift launch the service decides
/// the editing workflows between the preview, the inspectors and the chat:
/// - chat islands: their history files, pending activation bound to the originating
///   turn, command admission, revision chains and per-island Undo (`EditingIslands`);
/// - the project sidecars (`.trezi/control-panels.json`, `content-controls.json`,
///   `annotations.json`, `tokens.json`), committed hash-bound in the repository's
///   lane (`EditingSidecar`);
/// - unsaved content-editor drafts, persisted across restarts (`EditingDrafts`);
/// - deferred preview navigation, released when the requesting turn lands.
/// Bun keeps the JS helpers (manifest/recipe validation, Jev composition, literal
/// resolution and splicing), the isolated WebKit instrumentation, and the inspector
/// views; source writes stay proposals to `SourceOwner`, turns are the
/// `ConversationOwner`'s.
final class EditingOwner: @unchecked Sendable {
    static let service = "editing"

    struct Options {
        var profile: String
        /// The conversation coordinator's view of a chat: known, and the turn in flight.
        var turn: @Sendable (String) -> (known: Bool, turn: String?) = { _ in (false, nil) }
        /// Test hook: named points inside writes (a fixture crashes there).
        var fault: (@Sendable (String) -> Void)?
    }

    private let send: @Sendable (Data) -> Void
    private let repository: RepositoryOwner
    private let turnOf: @Sendable (String) -> (known: Bool, turn: String?)
    private let intake = DispatchQueue(label: "dev.trezi.editing.intake")
    private let lock = NSLock()
    private var closed = false
    private let inflight = DispatchGroup()
    private var islands: EditingIslands
    private var navigation = EditingNavigation()
    let drafts: EditingDrafts

    init(options: Options, repository: RepositoryOwner, send: @escaping @Sendable (Data) -> Void) {
        self.send = send; self.repository = repository; turnOf = options.turn
        islands = EditingIslands(profile: options.profile)
        islands.fault = options.fault
        drafts = EditingDrafts(profile: options.profile)
    }

    // MARK: Requests (from the backend reader thread, in pipe order)

    func submit(_ line: Data) {
        let frame: PipeFrame
        do { frame = try PipeFrame(line, service: Self.service, maxDepth: 64) } catch {
            let code = error as? ServiceContractFailure ?? .invalidRequest
            send(SourceOwner.reply(service: Self.service, id: (try? JSValue.parse(line, maxDepth: 64))?["id"] ?? .null, frame: nil,
                                   result: .failed(RepositoryOwner.fail(code, "Invalid editing request."))))
            return
        }
        lock.lock()
        let refused = closed
        if !refused { inflight.enter() }
        lock.unlock()
        if refused { return answer(frame, .failed(Self.stopping), counted: false) }
        intake.async {
            do {
                if let effect = try self.handle(frame) { return self.lane(frame, effect) }
            } catch { self.answer(frame, .failed(Self.failure(error))) }
        }
    }

    static let reads: Set<String> = ["islands", "contentDrafts", "navigationState"]
    static let methods: [String: (required: Set<String>, optional: Set<String>)] = [
        "islandsOpen": (["chat", "root", "record"], []), "islandsClose": (["chat"], []), "islands": (["chat"], []),
        "islandDefine": (["chat", "turn"], ["origin", "id", "revision"]),
        "islandCommit": (["chat", "token", "definition", "engine", "initial"], ["fallback"]),
        "islandAbort": (["chat", "token"], []), "islandSettle": (["chat", "successful"], ["turn"]),
        "islandCommand": (["chat", "id", "revision", "action", "sourceRevision"], []),
        "islandFinish": (["chat", "ticket", "ok", "last"], ["group", "revision"]),
        "navigate": (["chat", "root", "path"], ["turn"]), "navigation": (["chat", "kind"], ["turn"]),
        "navigationTake": (["chat"], []), "navigationState": ([], []),
        "contentDrafts": (["root"], []), "saveContentDraft": (["root", "panel", "revision", "value"], []),
        "clearContentDraft": (["root", "panel"], []),
        "sidecar": (["root", "name", "expectedHash", "content"], ["leases"]),
    ]
    static let actions: Set<String> = ["commit", "reset", "undo", "reload"]

    /// Decides a request on the intake queue; a sidecar commit answers an effect for the lane.
    private func handle(_ frame: PipeFrame) throws -> (@Sendable () throws -> JSValue)? {
        guard frame.expectedRevision == nil, let rule = Self.methods[frame.method],
              frame.mode == (Self.reads.contains(frame.method) ? "read" : "mutation") else { throw ServiceContractFailure.invalidRequest }
        let body = try Body(frame, required: rule.required, optional: rule.optional)
        let ok = JSValue.object([])
        func result(_ value: JSValue) -> (@Sendable () throws -> JSValue)? { answer(frame, .succeeded(value)); return nil }
        switch frame.method {
        // Islands
        case "islandsOpen":
            // The history file is named from the root as Bun gives it (unchanged from the legacy owner).
            let records = islands.open(chat: try Self.key(body, "chat"), root: try body.path("root"), record: try Self.key(body, "record"))
            return result(Self.object([("records", .array(records))]))
        case "islandsClose":
            return result(Self.object([("composing", .bool(islands.close(chat: try Self.key(body, "chat"))))]))
        case "islands":
            return result(Self.object([("records", .array(islands.sessions[try Self.key(body, "chat")]?.records ?? []))]))
        case "islandDefine":
            let chat = try Self.key(body, "chat")
            let origin = try origin(chat: chat, claimed: body.has("origin") ? try Self.key(body, "origin") : nil)
            let composition = try islands.define(chat: chat, origin: origin, turn: try Self.count(body.value("turn")),
                id: body.has("id") ? try Self.key(body, "id") : nil,
                revision: body.has("revision") ? try Self.count(body.value("revision")) : nil, token: frame.operationID)
            return result(Self.object([("token", .string(JSText(composition.token))), ("id", .string(JSText(composition.id))),
                                       ("revision", .number(Double(composition.revision))), ("turn", .number(Double(composition.turn))),
                                       ("replacing", .bool(composition.replacing))]))
        case "islandCommit":
            guard case .object(let definition)? = body.value("definition"),
                  Set(definition.map { $0.0.string }) == ["manifest", "blocks"], definition.count == 2,
                  case .object? = body.value("initial") else { throw ServiceContractFailure.invalidRequest }
            let engine = try body.string("engine")
            guard engine == "agent" || engine == "jev" else { throw ServiceContractFailure.invalidRequest }
            let fallback = body.value("fallback")
            if let fallback, fallback.text == nil { throw ServiceContractFailure.invalidRequest }
            let records = try islands.commit(chat: try Self.key(body, "chat"), token: try Self.key(body, "token"), definition: definition,
                                             engine: engine, fallback: fallback, initial: body.value("initial")!)
            return result(Self.object([("records", .array(records))]))
        case "islandAbort":
            islands.abort(chat: try Self.key(body, "chat"), token: try Self.key(body, "token"))
            return result(ok)
        case "islandSettle":
            let settled = try islands.settle(chat: try Self.key(body, "chat"), turn: body.has("turn") ? try Self.key(body, "turn") : nil,
                                             successful: try body.bool("successful"))
            guard let settled else { return result(Self.object([("records", .null), ("cancelled", .bool(false))])) }
            return result(Self.object([("records", .array(settled.records)), ("cancelled", .bool(settled.cancelled))]))
        case "islandCommand":
            let action = try body.string("action")
            guard Self.actions.contains(action) else { throw ServiceContractFailure.invalidRequest }
            let admitted = try islands.command(chat: try Self.key(body, "chat"), id: try Self.key(body, "id"),
                revision: try Self.count(body.value("revision")), action: action, source: try Self.key(body, "sourceRevision"), ticket: frame.operationID)
            var fields: [(String, JSValue)] = [("ticket", .string(JSText(frame.operationID))), ("expected", .string(JSText(admitted.expected)))]
            if let group = admitted.group { fields.append(("group", .string(JSText(group)))) }
            if let initial = admitted.initial { fields.append(("initial", initial)) }
            return result(Self.object(fields))
        case "islandFinish":
            try islands.finish(chat: try Self.key(body, "chat"), ticket: try Self.key(body, "ticket"), ok: try body.bool("ok"),
                               group: body.has("group") ? try Self.key(body, "group") : nil,
                               revision: body.has("revision") ? try Self.key(body, "revision") : nil, last: try body.bool("last"))
            return result(ok)

        // Deferred navigation
        case "navigate":
            let chat = try Self.key(body, "chat"), path = try body.string("path")
            guard EditingNavigation.valid(path) else { throw RepositoryRefusal(.invalidRequest, "Invalid preview path.") }
            let turn = try origin(chat: chat, claimed: body.has("turn") ? try Self.key(body, "turn") : nil, strict: false)
            let ready = navigation.request(chat: chat, root: try body.path("root"), path: path, turn: turn)
            return result(Self.object([("ready", .bool(ready))]))
        case "navigation":
            let kind = try body.string("kind")
            guard ["landed", "failed", "begin", "close"].contains(kind) else { throw ServiceContractFailure.invalidRequest }
            let ready = navigation.event(chat: try Self.key(body, "chat"), kind: kind, turn: body.has("turn") ? try Self.key(body, "turn") : nil)
            return result(Self.object([("ready", .bool(ready))]))
        case "navigationTake":
            guard let taken = navigation.take(chat: try Self.key(body, "chat")) else { return result(Self.object([("path", .null)])) }
            return result(Self.object([("root", .string(JSText(taken.root))), ("path", .string(JSText(taken.path)))]))
        case "navigationState":
            let pending = navigation.pending.keys.sorted().map { chat -> JSValue in
                let request = navigation.pending[chat]!
                return Self.object([("chat", .string(JSText(chat))), ("root", .string(JSText(request.root))), ("path", .string(JSText(request.path))),
                                    ("turn", request.turn.map { .string(JSText($0)) } ?? .null), ("awaiting", .bool(request.awaiting))])
            }
            return result(.array(pending))

        // Content drafts
        case "contentDrafts":
            return result(.array(try drafts.list(root: try SourcePaths.root(try body.path("root")))))
        case "saveContentDraft":
            guard case .object? = body.value("value") else { throw ServiceContractFailure.invalidRequest }
            try drafts.save(root: try SourcePaths.root(try body.path("root")), panel: try Self.key(body, "panel"),
                            revision: try SourceOwner.hash(body.value("revision")), value: body.value("value")!,
                            updated: ISO8601DateFormatter().string(from: Date()))
            return result(ok)
        case "clearContentDraft":
            try drafts.clear(root: try SourcePaths.root(try body.path("root")), panel: try Self.key(body, "panel"))
            return result(ok)

        // Controls sidecars
        case "sidecar":
            let name = try body.string("name")
            guard EditingSidecar.names.contains(name) else { throw ServiceContractFailure.invalidRequest }
            let expected: String? = body.value("expectedHash") == .null ? nil : try SourceOwner.hash(body.value("expectedHash"))
            let content = Data(try SourceOwner.content(body.value("content")).utf8)
            guard content.count <= EditingSidecar.maxBytes else { throw RepositoryRefusal(.invalidRequest, "The \(name) store would exceed 1 MB.") }
            let root = try SourcePaths.root(try body.path("root"))
            _ = try body.strings("leases")
            return {
                switch try EditingSidecar.commit(root: root, name: name, expected: expected, content: content) {
                case .conflict: return Self.object([("ok", .bool(false)), ("conflict", .bool(true))])
                case .written(let hash): return Self.object([("ok", .bool(true)), ("hash", .string(JSText(hash)))])
                }
            }
        default: throw ServiceContractFailure.invalidRequest
        }
    }

    /// The turn a definition or navigation belongs to. The conversation coordinator is
    /// the authority: when it knows the chat, its turn in flight wins, and a definition
    /// Bun attributes to any other turn (a finished one, a stale attribution) is refused.
    private func origin(chat: String, claimed: String?, strict: Bool = true) throws -> String? {
        let known = turnOf(chat)
        guard known.known else { return claimed }
        if strict, let claimed, claimed != known.turn {
            throw RepositoryRefusal(.conflict, "This turn has finished; the island was not attached.")
        }
        return known.turn
    }

    /// A sidecar commit runs in the repository's lane (or the lease Bun's chain holds).
    private func lane(_ frame: PipeFrame, _ effect: @escaping @Sendable () throws -> JSValue) {
        guard let root = try? Body(frame, required: ["root", "name", "expectedHash", "content"], optional: ["leases"]),
              let given = try? root.path("root"), let real = try? SourcePaths.root(given), let leases = try? root.strings("leases") else {
            return answer(frame, .failed(RepositoryOwner.fail(.invalidRequest, "Invalid editing request.")))
        }
        let deadline = frame.timeoutMilliseconds.map { DispatchTime.now() + .milliseconds(Int($0)) }
        let scheduled = repository.serialize(root: real, leases: leases) {
            self.lock.lock(); let refused = self.closed; self.lock.unlock()
            if refused { return self.answer(frame, .failed(Self.stopping)) }
            if let deadline, DispatchTime.now() > deadline { return self.answer(frame, .failed(SourceOwner.expired)) }
            do { self.answer(frame, .succeeded(try effect())) } catch { self.answer(frame, .failed(Self.failure(error))) }
        }
        if !scheduled { answer(frame, .failed(Self.stopping)) }
    }

    // MARK: Drain

    func refuse() { lock.lock(); closed = true; lock.unlock() }

    @discardableResult
    func close(timeout: TimeInterval) -> Bool {
        refuse()
        return inflight.wait(timeout: .now() + timeout) == .success
    }

    // MARK: Values

    static func object(_ fields: [(String, JSValue)]) -> JSValue { RepositoryOwner.object(fields) }

    static func key(_ body: Body, _ name: String) throws -> String { try ConversationOwner.key(body, name) }

    static func count(_ value: JSValue?) throws -> Int {
        guard let number = EditingIslands.integer(value), number >= 0 else { throw ServiceContractFailure.invalidRequest }
        return number
    }

    static func failure(_ error: Error) -> ServiceFailure {
        if let code = error as? ServiceContractFailure { return RepositoryOwner.fail(code, "Invalid editing request.") }
        return SourceOwner.failure(error)
    }

    static let stopping = RepositoryOwner.fail(.unavailable, "The service is stopping; nothing was changed.", retryable: true)

    private func answer(_ frame: PipeFrame, _ result: PreferencesOwner.Answer, counted: Bool = true) {
        send(SourceOwner.reply(service: Self.service, id: frame.id, frame: frame, result: result))
        if counted { inflight.leave() }
    }
}
