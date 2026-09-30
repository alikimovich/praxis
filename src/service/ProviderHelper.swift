import Foundation
import Darwin

/// How the service starts provider helpers: a fixed command chosen when the service
/// launched (never by a request), and the provider ids it can host.
struct ProviderHelperCommand: Sendable {
    var executable: String
    var arguments: [String]
    var providers: Set<String>

    /// The built-in seats' helper command: the bundled `provider-helper.cjs` next to the
    /// backend, run by the same (app-bundled) Bun. Every built-in Claude, Codex and Gemini
    /// session runs in a helper (LKM-111, after the live parity run); only a v10
    /// connection stays in Bun, so its key never crosses into another process. Nil when
    /// the build has no helper entry: helper sessions are then refused, never run in Bun.
    static func builtIn(backend: String, bun: String) -> ProviderHelperCommand? {
        let entry = URL(fileURLWithPath: backend).deletingLastPathComponent().appendingPathComponent("provider-helper.cjs").path
        guard access(entry, R_OK) == 0 else { return nil }
        return ProviderHelperCommand(executable: bun, arguments: [entry], providers: ["claude", "codex", "gemini", "fake"])
    }
}

/// One provider helper process (S10). What it can reach is decided here, not assumed
/// from the pipe:
///
/// - **Descriptors.** Only stdin, stdout and stderr, each its own pipe
///   (`POSIX_SPAWN_CLOEXEC_DEFAULT`): no Bun pipe, no XPC connection, no profile lock,
///   no listening socket of the service's.
/// - **Environment.** Rebuilt from an allowlist: the basics a CLI needs (HOME, PATH,
///   locale, temp, proxy and CA) plus the user settings of its own provider
///   (`providerVariables`: e.g. `ANTHROPIC_*` and `CLAUDE_CONFIG_DIR` for Claude,
///   `OPENAI_*` and `CODEX_HOME` for Codex). A parent Claude Code or Codex session's
///   runtime variables are not on it (LKM-124). Every `TREZI_*` variable (the profile path,
///   the service pid, the agent tool socket and its token) and other providers'
///   credentials are left out. Credentials stay in their own stores (the Keychain,
///   `~/.claude`, `~/.codex`). The one secret the owner passes is the Claude
///   subscription token saved in Settings (LKM-119): `CLAUDE_CODE_OAUTH_TOKEN`, to
///   Claude helpers only (`helperEnvironment` in `ProviderLaunch.swift`).
/// - **Process group.** Its own group with a watchdog (`--watch-group`) and an entry
///   in the runtime journal, so descendants are stopped with it, on a service crash too.
/// - **Output.** Line frames of at most `maxLine` bytes; a longer one is a violation
///   and the owner stops the helper. Its stderr is kept only as a bounded tail for
///   the exit message.
///
/// Every frame it writes is then checked by `ProviderOwner` against the session's grant.
final class ProviderHelperProcess: @unchecked Sendable {
    let pid: pid_t
    let identity: GroupIdentity?
    private let input: Int32
    private let writer = DispatchQueue(label: "dev.trezi.provider.helper-writer")
    private let lock = NSLock()
    private var stderrTail = Data()
    private var inputClosed = false
    private let exited = DispatchSemaphore(value: 0)
    private var status: Int32?

    private init(pid: pid_t, input: Int32) {
        self.pid = pid; self.input = input; identity = GroupIdentity.of(pid)
    }

    static let baseVariables: Set<String> = ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "NODE_ENV",
        // Proxy and CA settings, which every provider CLI honours.
        "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "no_proxy", "all_proxy",
        "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"]
    /// Per provider, what a user sets on purpose: exact names, then prefixes. A whole
    /// `CLAUDE_*`/`CODEX_*` prefix is not allowed (LKM-124): a Trezi started from a Claude
    /// Code or Codex session inherits that session's runtime variables, and
    /// `CLAUDE_CODE_SIMPLE` alone makes every Claude CLI skip its login (bare mode).
    static let providerVariables: [String: (names: Set<String>, prefixes: [String])] = [
        "claude": (["CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
                    "CLAUDE_CODE_USE_FOUNDRY", "CLAUDE_CODE_SKIP_BEDROCK_AUTH", "CLAUDE_CODE_SKIP_VERTEX_AUTH",
                    "CLAUDE_CODE_SKIP_FOUNDRY_AUTH", "CLAUDE_CODE_MAX_OUTPUT_TOKENS", "CLAUDE_CODE_API_KEY_HELPER_TTL_MS",
                    "CLAUDE_CODE_CLIENT_CERT", "CLAUDE_CODE_CLIENT_KEY", "CLAUDE_CODE_CLIENT_KEY_PASSPHRASE",
                    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "AWS_REGION", "AWS_PROFILE", "CLOUD_ML_REGION"],
                   ["ANTHROPIC_", "VERTEX_REGION_"]),
        "codex": (["CODEX_HOME", "CODEX_API_KEY", "CODEX_CA_CERTIFICATE"], ["OPENAI_"]),
        "gemini": ([], ["GEMINI_", "GOOGLE_"]),
        // The fake provider of the test harness.
        "fake": ([], ["FAKE_PROVIDER_"]),
    ]
    /// The names a provider's CLI or a parent session of it uses. Those not allowed
    /// above are dropped, and Check login lists them by name.
    static let providerFamilies: [String: [String]] = ["claude": ["CLAUDE", "ANTHROPIC_"], "codex": ["CODEX", "OPENAI_"]]

    static func allowed(_ key: String, provider: String) -> Bool {
        if baseVariables.contains(key) { return true }
        guard let allow = providerVariables[provider] else { return false }
        return allow.names.contains(key) || allow.prefixes.contains(where: { key.hasPrefix($0) })
    }

    /// The provider's variables in `base`, by name only: those a helper gets and those it does not.
    static func variableNames(base: [String: String], provider: String) -> (inherited: [String], dropped: [String]) {
        let family = providerFamilies[provider] ?? []
        let names = base.keys.filter { key in family.contains(where: { key.hasPrefix($0) }) }.sorted()
        return (names.filter { allowed($0, provider: provider) }, names.filter { !allowed($0, provider: provider) })
    }

    /// The helper's environment: the allowlist above, nothing else. USER, LOGNAME and
    /// HOME come from the account database when the launch environment lacks them: the
    /// Claude CLI names its Keychain item after $USER and reports "Not logged in"
    /// without it (LKM-119).
    static func environment(base: [String: String], provider: String) -> [String: String] {
        var out: [String: String] = [:]
        for (key, value) in base where allowed(key, provider: provider) { out[key] = value }
        if let account = getpwuid(getuid()) {
            let name = String(cString: account.pointee.pw_name), home = String(cString: account.pointee.pw_dir)
            if out["USER"]?.isEmpty ?? true { out["USER"] = name }
            if out["LOGNAME"]?.isEmpty ?? true { out["LOGNAME"] = name }
            if out["HOME"]?.isEmpty ?? true { out["HOME"] = home }
        }
        if out["PATH"]?.isEmpty ?? true { out["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin" }
        out["TREZI_PROVIDER_HELPER"] = "1"
        return out
    }

    /// `onFrame` gets each complete line; `onOversize` a line longer than `maxLine`
    /// (reading stops); `onExit` the wait status and stderr tail once the group is empty.
    static func launch(_ command: ProviderHelperCommand, directory: String, environment: [String: String], watchdog: String?,
                       maxLine: Int, onFrame: @escaping @Sendable (Data) -> Void, onOversize: @escaping @Sendable () -> Void,
                       onExit: @escaping @Sendable (Int32, String) -> Void) throws -> ProviderHelperProcess {
        guard let executable = ManagedProcess.resolve(command.executable, path: environment["PATH"]) else {
            throw ManagedProcessError.notFound(command.executable)
        }
        var stdin: [Int32] = [0, 0], stdout: [Int32] = [0, 0], stderr: [Int32] = [0, 0]
        guard pipe(&stdin) == 0 else { throw ManagedProcessError.spawn("input pipe", errno) }
        guard pipe(&stdout) == 0 else { close(stdin[0]); close(stdin[1]); throw ManagedProcessError.spawn("output pipe", errno) }
        guard pipe(&stderr) == 0 else {
            for fd in stdin + stdout { close(fd) }
            throw ManagedProcessError.spawn("error pipe", errno)
        }
        // The child's ends above 2 so the dup2 actions cannot collide; the service keeps its ends close-on-exec.
        let childIn = fcntl(stdin[0], F_DUPFD_CLOEXEC, 20), childOut = fcntl(stdout[1], F_DUPFD_CLOEXEC, 20), childErr = fcntl(stderr[1], F_DUPFD_CLOEXEC, 20)
        close(stdin[0]); close(stdout[1]); close(stderr[1])
        for fd in [stdin[1], stdout[0], stderr[0]] { _ = fcntl(fd, F_SETFD, FD_CLOEXEC) }
        // A helper that stops reading must not stall the service's writer forever: writes are
        // queued on the helper's own writer queue, and a dead reader surfaces as EPIPE.
        signal(SIGPIPE, SIG_IGN)
        let pid: pid_t
        do {
            pid = try ManagedProcess.spawn(executable, [command.executable] + command.arguments, environment: environment,
                                           directory: directory, actions: [.dup(childIn, 0), .dup(childOut, 1), .dup(childErr, 2)], newGroup: true)
        } catch {
            for fd in [childIn, childOut, childErr, stdin[1], stdout[0], stderr[0]] { close(fd) }
            throw error
        }
        close(childIn); close(childOut); close(childErr)
        let helper = ProviderHelperProcess(pid: pid, input: stdin[1])
        var watchdogPID: pid_t = 0, lifetimeWriter: Int32 = -1
        if let service = watchdog {
            var lifetime: [Int32] = [0, 0]
            if pipe(&lifetime) == 0 {
                lifetimeWriter = lifetime[1]
                _ = fcntl(lifetimeWriter, F_SETFD, FD_CLOEXEC)
                let readEnd = fcntl(lifetime[0], F_DUPFD_CLOEXEC, 20)
                close(lifetime[0])
                watchdogPID = (try? ManagedProcess.spawn(service, [service, "--watch-group", String(pid)], environment: [:], directory: nil,
                                                         actions: [.null(0), .null(1), .inherit(2), .dup(readEnd, 3)], newGroup: true)) ?? 0
                close(readEnd)
            }
        }
        let reader = stdout[0], errors = stderr[0], lifetime = lifetimeWriter, guardian = watchdogPID
        Thread.detachNewThread {
            var pending = Data(), buffer = [UInt8](repeating: 0, count: 64 * 1024), oversized = false
            while true {
                let count = read(reader, &buffer, buffer.count)
                if count < 0 && errno == EINTR { continue }
                if count <= 0 { break }
                if oversized { continue } // drained and discarded until the owner stops it
                pending.append(contentsOf: buffer[..<count])
                while let end = pending.firstIndex(of: 10) {
                    let line = pending[pending.startIndex..<end]
                    pending.removeSubrange(pending.startIndex...end)
                    if line.count > maxLine { oversized = true; break }
                    if !line.isEmpty { onFrame(Data(line)) }
                }
                if !oversized && pending.count > maxLine { oversized = true }
                if oversized { pending = Data(); onOversize() }
            }
            close(reader)
        }
        Thread.detachNewThread {
            var buffer = [UInt8](repeating: 0, count: 16 * 1024)
            while true {
                let count = read(errors, &buffer, buffer.count)
                if count < 0 && errno == EINTR { continue }
                if count <= 0 { break }
                helper.keepStderr(Data(buffer[..<count]))
            }
            close(errors)
        }
        Thread.detachNewThread {
            var info = siginfo_t()
            // Observe the exit without reaping: the zombie keeps the pgid reserved.
            while waitid(P_PID, id_t(pid), &info, WEXITED | WNOWAIT) != 0 && errno == EINTR {}
            ProcessGroup.terminate(pid, grace: 0.5)
            if guardian > 0 {
                kill(guardian, SIGKILL)
                var ignored: Int32 = 0
                while waitpid(guardian, &ignored, 0) < 0 && errno == EINTR {}
            }
            if lifetime >= 0 { close(lifetime) }
            var raw: Int32 = 0
            while waitpid(pid, &raw, 0) < 0 && errno == EINTR {}
            helper.closeInput()
            helper.lock.lock(); helper.status = raw; let tail = String(decoding: helper.stderrTail, as: UTF8.self); helper.lock.unlock()
            onExit(raw, tail)
            helper.exited.signal()
        }
        return helper
    }

    private func keepStderr(_ data: Data) {
        lock.lock()
        stderrTail.append(data)
        if stderrTail.count > 4096 { stderrTail.removeFirst(stderrTail.count - 4096) }
        lock.unlock()
    }

    /// One frame (a newline is appended). Queued; a write to an exited helper is dropped.
    func write(_ frame: Data) {
        writer.async {
            self.lock.lock(); let closed = self.inputClosed; self.lock.unlock()
            guard !closed else { return }
            var line = frame; line.append(10)
            line.withUnsafeBytes { buffer in
                var offset = 0
                while offset < buffer.count {
                    let written = Darwin.write(self.input, buffer.baseAddress! + offset, buffer.count - offset)
                    if written < 0 && errno == EINTR { continue }
                    if written <= 0 { return }
                    offset += written
                }
            }
        }
    }

    /// EOF on the helper's stdin: a well-behaved helper shuts down.
    func closeInput() {
        writer.async {
            self.lock.lock(); let first = !self.inputClosed; self.inputClosed = true; self.lock.unlock()
            if first { close(self.input) }
        }
    }

    /// TERM the whole group, `grace`, then KILL; returns once reaped (bounded).
    func stop(grace: TimeInterval) {
        lock.lock(); let done = status != nil; lock.unlock()
        if !done { ProcessGroup.terminate(pid, grace: grace) }
        _ = exited.wait(timeout: .now() + grace + 3)
        exited.signal() // let a later stop() pass too
    }
}
