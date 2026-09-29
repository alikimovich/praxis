import { projectKey } from '../shared/projectKey'
import { repositoryOwner } from './repository-owner'

/**
 * One live checkout has one git index and one HEAD, even when many Trezi chats have
 * private worktrees. All operations that snapshot or mutate that live checkout must
 * therefore pass through one repository-scoped queue. Per-chat queues are not enough:
 * two different chats can otherwise both stage/commit through the same live index.
 *
 * Under the Swift launch the queue is the service's repository lane (S07): one FIFO
 * per repository common directory, shared by the live checkout and all its worktrees,
 * and the same lane the service's own Git effects run in. The promise queue below is
 * the `TREZI_BACKEND_OWNER=legacy` owner.
 */

const tails = new Map<string, Promise<void>>()

export function enqueueRepoWrite<T>(repoRoot: string, operation: () => Promise<T>): Promise<T> {
  const owner = repositoryOwner()
  if (owner) return owner.withLease(repoRoot, operation)
  const key = projectKey(repoRoot)
  const previous = tails.get(key) ?? Promise.resolve()
  const run = previous.catch(() => {}).then(operation)
  const tail = run.then(
    () => undefined,
    () => undefined
  )
  tails.set(key, tail)
  void tail.finally(() => {
    if (tails.get(key) === tail) tails.delete(key)
  })
  return run
}

/** Test/app re-initialization seam. Never interrupts an operation already running. */
export function resetRepoWriteQueues(): void {
  tails.clear()
}
