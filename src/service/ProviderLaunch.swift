import Foundation
import Darwin

/// Starting provider helpers, and what LKM-119 added around a seat's login:
/// - the first-event deadline: a helper turn that produces nothing (no delta, status,
///   usage, record, approval or tool call) within `firstEventTimeout` is ended with a
///   visible error and its helper stopped, so a wedged SDK or a CLI waiting on a login
///   never leaves the chat on "Thinking…";
/// - the Claude subscription token (`claude setup-token`) saved in Settings: encrypted
///   with the Keychain helper like a connection key, and put into a Claude helper's
///   environment as `CLAUDE_CODE_OAUTH_TOKEN` (never another helper's, never a reply,
///   never an error text);
/// - "Check provider login": a helper started exactly like a chat's (same allowlisted
///   environment, token, cwd) that reports the provider CLI's auth status and exits;
///   the owner adds which provider variables were passed and dropped (LKM-124).
extension ProviderOwner {
    static let seatTokenVariable = "CLAUDE_CODE_OAUTH_TOKEN"

    func launchHelper(_ session: Session, _ command: ProviderHelperCommand, open: Data, token: String?) {
        guard let frame = session.opening, sessions[session.id] === session else { return }
        let helper: ProviderHelperProcess
        do {
            helper = try ProviderHelperProcess.launch(command, directory: session.root,
                environment: helperEnvironment(session.provider, token: token), watchdog: options.watchdog,
                maxLine: options.maxLine,
                onFrame: { [weak self] data in
                    guard let owner = self else { return }
                    owner.queue.async { owner.helperFrame(session, data) }
                },
                onOversize: { [weak self] in
                    guard let owner = self else { return }
                    owner.queue.async { owner.violation(session, "a frame larger than the limit") }
                },
                onExit: { [weak self] status, tail in
                    guard let owner = self else { return }
                    owner.queue.async { owner.exited(session, status: status, tail: tail) }
                })
        } catch {
            session.opening = nil
            sessions[session.id] = nil
            answer(frame, .failed(PreferencesOwner.fail(.unavailable, "The provider helper could not start: \(error).")))
            persist()
            return
        }
        if let identity = helper.identity { options.journal?.add(identity) }
        session.helper = helper
        helper.write(open)
        queue.asyncAfter(deadline: .now() + options.readyTimeout) {
            guard let opening = session.opening, self.sessions[session.id] === session else { return }
            session.opening = nil
            self.sessions[session.id] = nil
            self.answer(opening, .failed(PreferencesOwner.fail(.deadlineExceeded, "The provider helper did not start in time.")))
            self.end(session, reason: "did not start")
            self.persist()
        }
    }

    func helperEnvironment(_ provider: String, token: String?) -> [String: String] {
        var environment = ProviderHelperProcess.environment(base: options.environment, provider: provider)
        if let token, !token.isEmpty, provider == "claude" { environment[Self.seatTokenVariable] = token }
        return environment
    }

    /// The saved token, decrypted off the owner queue (a Keychain call can wait on an
    /// unlock prompt), then `next` on the queue. nil: none saved, or it cannot be read.
    func withSeatToken(_ provider: String, _ next: @escaping (String?) -> Void) {
        guard data.hasSeatToken(provider) else { return next(nil) }
        work.async {
            let token = self.data.seatToken(provider)
            self.queue.async { next(token) }
        }
    }

    // MARK: First event

    static func noResponse(_ provider: String) -> String {
        switch provider {
        case "claude": return "Claude did not respond — check login (claude auth status) and retry"
        case "codex": return "Codex did not respond — check login (codex login status) and retry"
        default: return "The provider did not respond — check its login and retry"
        }
    }

    func armFirstEvent(_ session: Session) {
        session.heard = false
        session.silence += 1
        let token = session.silence
        queue.asyncAfter(deadline: .now() + options.firstEventTimeout) { self.silent(session, token) }
    }

    func silent(_ session: Session, _ token: Int) {
        guard session.silence == token, !session.heard, session.turnOpen, session.phase == .running,
              sessions[session.id] === session else { return }
        finishTurn(session, Self.noResponse(session.provider), code: "no-response")
        session.phase = .stopped
        wake(session, escalate: true)
        stop(session)
        persist()
    }

    // MARK: Login requests

    func handleLogin(_ frame: PipeFrame, _ body: ProviderBody) throws -> JSValue? {
        switch frame.method {
        case "seatTokenSave":
            let provider = try body.string("provider", max: 32), token = try body.string("token", max: 8192, empty: true)
            guard ProviderData.seatProviders.contains(provider) else { throw ServiceContractFailure.invalidRequest }
            dataWrites.async {
                self.settle(frame) { Self.object([("hasToken", .bool(try self.data.saveSeatToken(provider, token)))]) }
            }
            return nil
        case "seatTokenStatus":
            return Self.object(ProviderData.seatProviders.sorted().map { ($0, Self.object([("hasToken", .bool(data.hasSeatToken($0)))])) })
        default:
            let provider = try body.string("provider", max: 32), root = try body.path("root")
            guard let command = options.helper else { throw ProviderRefusal(.unavailable, "Provider helpers are not available in this service.") }
            guard command.providers.contains(provider) else { throw ProviderRefusal(.unauthorized, "This service does not host the \(provider) provider.") }
            withSeatToken(provider) { token in self.diagnose(frame, command, provider: provider, root: root, token: token) }
            return nil
        }
    }

    private final class Diagnosis: @unchecked Sendable {
        var answered = false
        var helper: ProviderHelperProcess?
    }

    /// One helper, one `diagnose` frame, one `diagnosis` answer (or an error), then stopped.
    func diagnose(_ frame: PipeFrame, _ command: ProviderHelperCommand, provider: String, root: String, token: String?) {
        let state = Diagnosis()
        let finish: (PreferencesOwner.Answer) -> Void = { result in
            guard !state.answered else { return }
            state.answered = true
            self.answer(frame, result)
            if let helper = state.helper {
                helper.closeInput()
                self.work.async { helper.stop(grace: 0.5) }
            }
        }
        let helper: ProviderHelperProcess
        do {
            helper = try ProviderHelperProcess.launch(command, directory: root, environment: helperEnvironment(provider, token: token),
                watchdog: options.watchdog, maxLine: options.maxLine,
                onFrame: { [weak self] data in
                    guard let owner = self else { return }
                    owner.queue.async {
                        guard let value = try? JSValue.parse(data, maxDepth: 16), value["type"]?.text?.string == "diagnosis" else { return }
                        guard let report = Self.loginReport(value["report"], provider: provider, token: token) else {
                            return finish(.failed(PreferencesOwner.fail(.providerFailure, "The provider helper sent a malformed login report.")))
                        }
                        finish(.succeeded(Self.object([("report", owner.variableReport(report, provider: provider))])))
                    }
                },
                onOversize: { [weak self] in
                    self?.queue.async { finish(.failed(PreferencesOwner.fail(.providerFailure, "The provider helper sent a malformed login report."))) }
                },
                onExit: { [weak self] status, _ in
                    guard let owner = self else { return }
                    owner.queue.async {
                        if let identity = state.helper?.identity { owner.options.journal?.remove(identity.pgid) }
                        let code = ProcessGroup.exitCode(status).map { "status \($0)" } ?? "signal \(status & 0x7f)"
                        finish(.failed(PreferencesOwner.fail(.unavailable, "The provider helper exited before it reported its login (\(code)).")))
                    }
                })
        } catch {
            return finish(.failed(PreferencesOwner.fail(.unavailable, "The provider helper could not start: \(error).")))
        }
        state.helper = helper
        if let identity = helper.identity { options.journal?.add(identity) }
        helper.write(Self.object([("type", .string(JSText("diagnose"))), ("provider", .string(JSText(provider))),
                                  ("root", .string(JSText(root)))]).utf8())
        queue.asyncAfter(deadline: .now() + options.readyTimeout + 15) {
            finish(.failed(PreferencesOwner.fail(.deadlineExceeded, "The provider helper did not report its login in time.")))
        }
    }

    /// A helper's login report: known fields only, bounded, and never the token itself.
    static func loginReport(_ value: JSValue?, provider: String, token: String?) -> JSValue? {
        guard case .object(let fields)? = value, fields.count <= 8, value?["detail"]?.text != nil else { return nil }
        var out: [(String, JSValue)] = [("provider", .string(JSText(provider)))]
        for (name, field) in fields {
            let key = name.string
            switch key {
            case "provider": continue
            case "loggedIn":
                guard field == .null || field == .bool(true) || field == .bool(false) else { return nil }
            case "token":
                guard field == .bool(true) || field == .bool(false) else { return nil }
            case "source":
                guard let source = field.text?.string, source == "bundled" || source == "installed" else { return nil }
            case "executable", "authMethod", "detail":
                guard let text = field.text, text.count <= 4096, !text.contains(0) else { return nil }
                if let token, !token.isEmpty, text.string.contains(token) { return nil }
            default: return nil
            }
            out.append((key, field))
        }
        return object(out)
    }

    /// The report plus which of the provider's variables Trezi's environment had: those
    /// the helper got and those it dropped, by name only, never a value (LKM-124).
    func variableReport(_ report: JSValue, provider: String) -> JSValue {
        guard case .object(var fields) = report, ProviderHelperProcess.providerFamilies[provider] != nil else { return report }
        let names = ProviderHelperProcess.variableNames(base: options.environment, provider: provider)
        let list = { (names: [String]) in names.isEmpty ? "none" : names.prefix(40).joined(separator: ", ") }
        var lines = ["Passed to the helper from Trezi’s environment: \(list(names.inherited))",
                     "Dropped (a parent session’s or not a user setting): \(list(names.dropped))"]
        let bare = names.dropped.contains("CLAUDE_CODE_SIMPLE")
        if bare {
            lines.append("CLAUDE_CODE_SIMPLE was set where Trezi started. It makes the Claude CLI skip its login (bare mode), so Trezi drops it.")
        }
        let strings = { (names: [String]) in JSValue.array(names.prefix(40).map { .string(JSText($0)) }) }
        for index in fields.indices where fields[index].0.string == "detail" {
            fields[index].1 = .string(JSText((fields[index].1.text?.string ?? "") + "\n" + lines.joined(separator: "\n")))
        }
        fields.append((JSText("inherited"), strings(names.inherited)))
        fields.append((JSText("dropped"), strings(names.dropped)))
        if bare { fields.append((JSText("bare"), .bool(true))) }
        return .object(fields)
    }
}

/// The built-in seats' subscription tokens, `<profile>/trezi/seat-tokens.json`
/// (`{"version":1,"tokens":{"claude":"<base64 ciphertext>"}}`, mode 0600).
extension ProviderData {
    static let seatProviders: Set<String> = ["claude"]
    static let badSeatToken = "That does not look like a token from claude setup-token: paste the single line it printed."

    var seatTokensFile: String { directory + "/seat-tokens.json" }

    func seatTokens() -> [(JSText, JSValue)] {
        guard let data = FileManager.default.contents(atPath: seatTokensFile), data.count <= 64 * 1024,
              let parsed = try? JSValue.parse(data), case .object(let tokens)? = parsed["tokens"] else { return [] }
        return tokens.filter { Self.seatProviders.contains($0.0.string) && Self.truthy($0.1) && $0.1.text != nil }
    }

    func hasSeatToken(_ provider: String) -> Bool { seatTokens().contains { $0.0.string == provider } }

    /// Saves (or, for an empty token, removes) a seat's token; answers whether one is saved.
    func saveSeatToken(_ provider: String, _ raw: String) throws -> Bool {
        let token = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        var tokens = seatTokens().filter { $0.0.string != provider }
        if !token.isEmpty {
            guard token.utf8.count <= 4096, token.utf8.allSatisfy({ (0x21...0x7E).contains($0) }) else {
                throw ProviderRefusal(.invalidRequest, Self.badSeatToken)
            }
            guard let crypto = tools.crypto, !crypto.isEmpty else { throw ProviderRefusal(.unavailable, Self.noKeyring) }
            guard let result = try? PlatformTool.run(crypto[0], Array(crypto.dropFirst()) + ["--crypto", "encrypt"],
                                                     environment: tools.environment, timeout: 30, input: Data(token.utf8)),
                  result.ok else { throw ProviderRefusal(.unavailable, Self.keychain) }
            tokens.append((JSText(provider), .string(JSText(result.stdout.base64EncodedString()))))
        }
        try prepareDirectory()
        let body = JSValue.object([(JSText("version"), .number(1)), (JSText("tokens"), .object(tokens))])
        try Self.replace(seatTokensFile, Data(JSValue.pretty(body).utf8), mode: 0o600)
        return !token.isEmpty
    }

    /// The plaintext token, or nil (none, or it cannot be decrypted here).
    func seatToken(_ provider: String) -> String? {
        guard let blob = seatTokens().first(where: { $0.0.string == provider })?.1.text, let crypto = tools.crypto, !crypto.isEmpty,
              let result = try? PlatformTool.run(crypto[0], Array(crypto.dropFirst()) + ["--crypto", "decrypt"],
                                                 environment: tools.environment, timeout: 30, input: Self.base64(blob.string)),
              result.ok else { return nil }
        let token = String(decoding: result.stdout, as: UTF8.self)
        return token.isEmpty ? nil : token
    }
}
