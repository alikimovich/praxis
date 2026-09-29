import Foundation
import Darwin

@main struct ServiceMain {
    static func main() {
        signal(SIGPIPE, SIG_IGN)
        do {
            if CommandLine.arguments.count > 1, ["--guard", "--guard-backend"].contains(CommandLine.arguments[1]) {
                runProcessGuardian(arguments: Array(CommandLine.arguments.dropFirst(2)), backend: CommandLine.arguments[1] == "--guard-backend")
            }
            if CommandLine.arguments.count > 1, CommandLine.arguments[1] == "--watch-group" {
                runGroupWatchdog(arguments: Array(CommandLine.arguments.dropFirst(2)))
            }
            if CommandLine.arguments.contains("--legacy") { try legacy(); return }
            let bundle = Bundle.main.bundleURL
            let host = bundle.deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("MacOS/TreziHost").path
            let owner = try ServiceRuntime(hostExecutable: host)
            let listener = NSXPCListener.service()
            listener.delegate = owner
            withExtendedLifetime(owner) { listener.resume() }
        } catch {
            fputs("Trezi service startup failed: \(error)\n", stderr)
            exit(1)
        }
    }

    static func legacy() throws {
        let args = CommandLine.arguments
        func option(_ key: String) throws -> String {
            guard let index = args.firstIndex(of: key), index + 1 < args.count else { throw ServiceContractFailure.invalidRequest }
            return args[index + 1]
        }
        let profile = try option("--profile")
        let exclusion = try ProfileExclusion(profile: profile)
        // Rollback never overlaps a project group the Swift owner started: any it
        // left behind after a crash is stopped before the legacy owner starts.
        RuntimeJournal(profile: profile).sweep()
        let supervisor = LegacySupervisor()
        var environment = ProcessInfo.processInfo.environment
        environment["TREZI_USER_DATA"] = profile
        environment["TREZI_SERVICE_LOCKED"] = "1"
        environment["TREZI_SERVICE_PID"] = String(getpid())
        environment["TREZI_SERVICE_EXECUTABLE"] = CommandLine.arguments[0]
        environment.removeValue(forKey: "TREZI_SERVICE_SUPERVISED")
        let tail = args.firstIndex(of: "--").map { Array(args.dropFirst($0 + 1)) } ?? []
        let queue = DispatchQueue(label: "dev.praxis.legacy.shutdown")
        var stopping = false
        func stop(_ code: Int32) {
            guard !stopping else { return }; stopping = true
            supervisor.shutdown()
            exclusion.release()
            if let directory = environment["TREZI_NATIVE_TEST_DIR"] {
                FileManager.default.createFile(atPath: directory + "/service-stopped", contents: Data())
            }
            exit(code)
        }
        let child = try supervisor.start(executable: option("--bun"),
            arguments: [try option("--backend")] + tail, environment: environment,
            profileDescriptor: exclusion.guardDescriptor, guardianExecutable: CommandLine.arguments[0]) { status in
            queue.async { stop(status == 0 ? 0 : 1) }
        }
        var signals: [DispatchSourceSignal] = []
        for sig in [SIGTERM, SIGINT, SIGHUP] {
            signal(sig, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: sig, queue: queue)
            source.setEventHandler { stop(0) }; source.resume(); signals.append(source)
        }
        DispatchQueue.global().async {
            while let bytes = try? child.output.readAvailable(upTo: 65536), !bytes.isEmpty {
                try? FileHandle.standardOutput.write(contentsOf: bytes)
            }
        }
        withExtendedLifetime((exclusion, supervisor, signals)) { dispatchMain() }
    }
}
