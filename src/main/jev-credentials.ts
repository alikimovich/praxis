import type { ProviderStore } from './providers-store'

export class MissingJevCredentialError extends Error {}

/** Main-process only. Never send a custom endpoint's credential to Gateway. */
export function savedJevKey(store: ProviderStore, connectionId?: string): string | undefined {
  const gateways = store.list().filter((connection) => {
    try {
      const url = new URL(connection.baseUrl)
      return (
        connection.preset === 'gateway' &&
        connection.hasKey &&
        url.origin === 'https://ai-gateway.vercel.sh' &&
        !url.username &&
        !url.password
      )
    } catch {
      return false
    }
  })
  const selected = gateways.find((connection) => connection.id === connectionId)
  if (!selected && gateways.length > 1)
    throw new Error(
      'Select a saved Vercel AI Gateway connection for Jev; multiple connections are configured.'
    )
  const connection = selected ?? gateways[0]
  if (!connection) return undefined
  const key = store.secretFor(connection.id)
  if (!key?.trim())
    throw new Error('Reconnect Vercel AI Gateway in Settings so Jev can access its saved key.')
  return key
}

export async function resolveJevKey(connectionId?: string): Promise<string> {
  const override = process.env.JEV_AI_GATEWAY_API_KEY?.trim()
  if (override) return override
  const { resolveSavedJevKey } = await import('./providers')
  const key = resolveSavedJevKey(connectionId) ?? process.env.AI_GATEWAY_API_KEY?.trim()
  if (!key)
    throw new MissingJevCredentialError(
      'Connect Vercel AI Gateway in Settings to use Jev, or set JEV_AI_GATEWAY_API_KEY.'
    )
  return key
}
