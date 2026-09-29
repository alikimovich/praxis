import type { NativeBridge } from './bridge'

type Wait = (check: () => Promise<boolean>) => Promise<unknown>

/** Empty/setup-card captures have no latest message to reveal. */
export async function revealComposerLatest(host: Pick<NativeBridge, 'request'>, wait: Wait, name: string) {
  let state = await host.request('chatInspect')
  if (state.messageCount === 0) return
  await host.request('composerVerification', { latest: true })
  try {
    await wait(async () => {
      state = await host.request('chatInspect')
      return state.messageCount > 0 && state.bottomPosition > 0 &&
        state.bottomPosition <= state.height - state.composerInset + 2
    })
  } catch (cause) {
    throw new Error(`Composer capture ${name}: latest message did not settle above composer: ${JSON.stringify(state)}`, { cause })
  }
}
