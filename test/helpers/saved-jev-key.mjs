/** Put the test's Gateway credential in an isolated OS-encrypted Settings store,
 * then remove both env fallbacks. Plaintext stays inside Electron main. */
export async function useSavedJevKey(electronApp) {
  await electronApp.evaluate(({ app, safeStorage }) => {
    const key = process.env.JEV_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY
    if (!key || !process.env.PRAXIS_USER_DATA) throw new Error('Missing isolated Gateway fixture')
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error('Test requires an OS credential store')
    const fs = process.getBuiltinModule('node:fs')
    const path = process.getBuiltinModule('node:path')
    const dir = path.join(app.getPath('userData'), 'praxis')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'providers.json'), JSON.stringify({ version: 1, connections: [{
      id: 'test-gateway', label: 'Test Gateway', preset: 'gateway',
      baseUrl: 'https://ai-gateway.vercel.sh/v1', wireApi: 'responses', models: [],
      secret: safeStorage.encryptString(key).toString('base64')
    }] }), { mode: 0o600 })
    delete process.env.JEV_AI_GATEWAY_API_KEY
    delete process.env.AI_GATEWAY_API_KEY
  })
}
