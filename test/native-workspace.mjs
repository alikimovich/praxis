import { spawnSync } from 'node:child_process'
const result = spawnSync('bun', ['test', new URL('./native-workspace.test.ts', import.meta.url).pathname], { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
