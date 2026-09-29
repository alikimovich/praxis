import { spawn } from 'node:child_process'
import { app } from '../native/platform'
import { recallSignature, remember, setStatus } from './diag-cache'
import { remoteStatus, updateFromRemote } from './git-remote'
import { connectToGitHub } from './github'
import { publishBranch, publishToPr, shipToMain } from './publish'
import { withPublishLock } from './publish-reconcile'
import { createProjectLegacy } from './scaffold'
import { removeHelpersLegacy, writeHelpersLegacy } from './setup'
import type { WorkflowOwner } from './workflow-owner'

/**
 * The rollback owner for S13 (`TREZI_BACKEND_OWNER=legacy`, and unit tests with no
 * Swift service): the original TS workflows, unchanged in behaviour. It keeps no
 * journal: a publication runs under the in-process publish lock only, and nothing
 * survives a restart except what Git and GitHub hold, which the Swift owner
 * reconciles from when it returns. `workflows()` is therefore always empty.
 */

const locked = async <T extends { ok: boolean; error?: string }>(
  root: string,
  task: () => Promise<T>
): Promise<T> => {
  try {
    return await withPublishLock(root, task)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) } as T
  }
}

/** Runs one update command in the Trezi checkout; rejects with its output, as the controller did. */
function run(
  root: string,
  command: string,
  args: string[],
  progress?: (text: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    const data = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-16000)
      progress?.(output.split('\n').filter(Boolean).slice(-4).join('\n'))
    }
    child.stdout.on('data', data)
    child.stderr.on('data', data)
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve(output) : reject(new Error(output || `Update exited with ${code}`))
    )
  })
}

export interface LegacyWorkflowOptions {
  /** The Bun that installs and builds Trezi (the running one). */
  bun?: string
  /** Where the diagnosis memory lives (the profile). */
  userData?: () => string
}

export function createLegacyWorkflows(options: LegacyWorkflowOptions = {}): WorkflowOwner {
  const userData = options.userData ?? (() => app.getPath('userData'))
  const bun = options.bun ?? process.execPath
  return {
    kind: 'legacy',
    publish: (root, mode, describe) => locked(root, () => shipToMain(root, mode, describe)),
    handoff: (root, title, notes, describe) =>
      locked(root, () => publishToPr(root, title, notes, describe)),
    branchPr: (root, branch, describe) => publishBranch(root, branch, describe),
    connect: (root, options) => connectToGitHub(root, options),
    remoteStatus: (root, fetch) => remoteStatus(root, fetch),
    remoteUpdate: (root, action, busy) => updateFromRemote(root, action, () => busy),
    writeHelpers: (root, files) => writeHelpersLegacy(root, files),
    removeHelpers: (root) => removeHelpersLegacy(root),
    createProject: (root, files, install) => createProjectLegacy(root, files, install),
    async update(root, progress) {
      try {
        const dirty = await run(root, 'git', ['status', '--porcelain'])
        if (dirty.trim())
          return {
            ok: false,
            error:
              'Your Trezi installation has local changes. Commit or stash them before updating.'
          }
        await run(root, 'git', ['pull', '--ff-only'], progress)
        await run(root, bun, ['install', '--frozen-lockfile'], progress)
        await run(root, bun, ['run', 'build:native'], progress)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    recallDiagnosis: (root, signature) => recallSignature(userData(), root, signature),
    rememberDiagnosis: (root, diagnosis) => remember(userData(), root, diagnosis),
    diagnosisStatus: (root, signature, status) => setStatus(userData(), root, signature, status),
    cancel: async () => false,
    workflows: async () => [],
    dismiss: async () => {}
  }
}

export const legacyWorkflows = createLegacyWorkflows()
