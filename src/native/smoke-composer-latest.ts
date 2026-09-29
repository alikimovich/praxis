import type { NativeBridge } from './bridge'

/** Where the newest message ends, and where the composer begins (same space). */
export interface LatestGeometry { id: string; measured: boolean; maxY: number; composerTop: number }

/**
 * The newest message must end above the composer. An empty conversation has
 * nothing to place. An unmeasured row is not accepted: a lazy row that never
 * published a frame is not on screen.
 */
export function latestAboveComposer(latest: LatestGeometry, tolerance = 1): { ok: boolean; reason: string } {
  if (!latest.id) return { ok: true, reason: 'no messages' }
  if (!latest.measured) return { ok: false, reason: 'latest message has no measured frame' }
  const under = latest.maxY - latest.composerTop
  if (under > tolerance) return { ok: false, reason: `latest message ends ${under.toFixed(1)}pt under the composer` }
  return { ok: true, reason: 'above composer' }
}

type Wait = (check: () => Promise<boolean>) => Promise<unknown>

/**
 * Wait for the pinned conversation to settle above the composer, on the
 * observable itself (never a fixed sleep): after a submit the composer shrinks
 * and the conversation re-pins to the end. Returns the settled geometry.
 */
export async function settleLatestAboveComposer(host: Pick<NativeBridge, 'request'>, wait: Wait, name: string) {
  let latest: LatestGeometry = { id: '', measured: false, maxY: 0, composerTop: 0 }
  let reason = ''
  try {
    await wait(async () => {
      latest = (await host.request('composerVerification')).latest
      const verdict = latestAboveComposer(latest)
      reason = verdict.reason
      return verdict.ok
    })
  } catch (cause) {
    throw new Error(`Composer capture ${name}: ${reason}: ${JSON.stringify(latest)}`, { cause })
  }
  return latest
}
