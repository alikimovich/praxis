import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { GitRemoteResult, GitRemoteStatus } from '../../../shared/api'
import { openWithPreviewFreeze, usePreviewFreeze } from '../store'

export default function GitUpdatesDialog({
  root,
  onClose,
  onApplied
}: {
  root: string | null
  onClose: () => void
  onApplied: (root: string, result: GitRemoteResult) => void
}): React.JSX.Element {
  const [shown, setShown] = useState(false)
  const [snapshot, setSnapshot] = useState<GitRemoteStatus | null>(null)
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const accept = useCallback((next: GitRemoteStatus): void => {
    setSnapshot(next)
    setSource((previous) => {
      if (next.branches.some((branch) => branch.ref === previous)) return previous
      if (next.branches.some((branch) => branch.ref === next.upstream)) return next.upstream ?? ''
      const base = next.current?.replace(/^(praxis|dsgn)\//, '')
      return (
        next.branches.find((branch) => branch.branch === base && branch.remote === 'origin')?.ref ??
        ''
      )
    })
  }, [])

  useEffect(() => {
    if (!root) return
    let live = true
    setSnapshot(null)
    setSource('')
    setNotice('')
    setBusy(true)
    openWithPreviewFreeze(() => {
      if (live) setShown(true)
    })
    void window.api.git
      .remoteStatus(root)
      .then((next) => {
        if (live) accept(next)
      })
      .catch((error) => {
        if (live) setNotice(String(error))
      })
      .finally(() => {
        if (live) setBusy(false)
      })
    return () => {
      live = false
      setShown(false)
      usePreviewFreeze.getState().setFrozen(false)
    }
  }, [root, accept])

  const fetchUpdates = async (): Promise<void> => {
    if (!root || busy) return
    setBusy(true)
    setNotice('Fetching remote branches…')
    try {
      accept(await window.api.git.remoteStatus(root, true))
      setNotice('Remote branches are up to date. Your project files have not changed.')
    } catch (error) {
      setNotice(`Could not fetch updates: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const apply = async (action: 'pull' | 'checkout'): Promise<void> => {
    if (!root || !snapshot?.current || !source || busy) return
    setBusy(true)
    setNotice(action === 'pull' ? 'Pulling updates…' : 'Checking out remote branch…')
    try {
      const result = await window.api.git.remoteUpdate(root, {
        action,
        ref: source,
        expectedBranch: snapshot.current
      })
      setNotice(result.message)
      if (result.ok) {
        onApplied(root, result)
        accept(await window.api.git.remoteStatus(root))
      }
    } catch (error) {
      setNotice(String(error))
    } finally {
      setBusy(false)
    }
  }
  const selected = snapshot?.branches.find((branch) => branch.ref === source)
  return (
    <Dialog
      open={!!root && shown}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent aria-busy={busy}>
        <DialogHeader>
          <DialogTitle>Git updates</DialogTitle>
          <DialogDescription>
            Fetch updates from GitHub or another Git remote, then choose what to bring into your
            project.
          </DialogDescription>
        </DialogHeader>
        <p className="break-words text-sm">
          Current branch:{' '}
          <strong>{snapshot ? (snapshot.current ?? 'Detached HEAD') : 'Loading…'}</strong>
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !snapshot?.remotes.length}
          onClick={() => void fetchUpdates()}
        >
          Fetch updates
        </Button>
        {snapshot && !snapshot.remotes.length ? (
          <p>No Git remote is connected. Connect this project to GitHub first.</p>
        ) : null}
        {snapshot?.remotes.length ? (
          <label htmlFor="git-update-source" className="grid gap-2">
            Remote branch
            <select
              id="git-update-source"
              className="w-full rounded-md border bg-background p-2 text-foreground"
              value={source}
              disabled={busy}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="">Choose a branch…</option>
              {snapshot.branches.map((branch) => (
                <option key={branch.ref} value={branch.ref}>
                  {branch.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selected && snapshot?.current ? (
          <p className="break-words text-sm">
            Pull merges {selected.label} into {snapshot.current}, preserving your local commits.
            {snapshot.localBranches.includes(selected.branch)
              ? ` Switch opens your existing local ${selected.branch} branch.`
              : ` Switch creates a local ${selected.branch} branch that tracks ${selected.label}.`}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="max-h-48 overflow-auto break-words text-sm">
            {notice}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !source || !snapshot?.current}
            onClick={() => void apply('checkout')}
          >
            Switch to branch
          </Button>
          <Button
            type="button"
            disabled={busy || !source || !snapshot?.current}
            onClick={() => void apply('pull')}
          >
            Pull updates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
