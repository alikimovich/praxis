import { spawn } from 'node:child_process'
import { join } from 'node:path'

/**
 * In-app restart for a Bun that the service does not supervise (the `--legacy`
 * rollback launch). Under the Swift launch the host asks the service
 * (`serviceRestart`), which drains before it relaunches. This starts the launcher
 * detached, told to wait for the prior owner to exit, then exits this process.
 */
export function restartThroughLauncher(root: string, project: string | undefined): void {
  const environment = { ...process.env }
  for (const key of ['TREZI_SERVICE_LOCKED', 'TREZI_SERVICE_SUPERVISED', 'TREZI_SERVICE_PID', 'TREZI_SERVICE_EXECUTABLE', 'TREZI_NATIVE_TEST_DIR']) delete environment[key]
  const ownerPID = process.env.TREZI_SERVICE_PID || String(process.pid)
  const next = spawn(process.execPath, [join(root, 'scripts/start-native.mjs'), '--wait-for-owner', ownerPID, ...(project ? ['--project', project] : [])], { cwd: root, detached: true, stdio: 'ignore', env: environment })
  next.on('error', error => { console.error('Could not restart Trezi:', error); process.exit(1) })
  next.once('spawn', () => { next.unref(); process.exit(0) })
}
