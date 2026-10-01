// The real provider helper entry (`provider-helper-entry.ts`) with stand-in Claude CLIs:
// the first argument is the "bundled" one, the second the "installed" one. Unlike
// tools-helper.mjs nothing is probed here: the adapter probes (or takes the owner's
// cached choice) as in the app. Used by test/provider-cold-start.mjs.
const [bundled, installed] = process.argv.slice(2)
const { setClaudeCandidates } = await import('../../src/main/backends/claude-login.ts')
setClaudeCandidates({ bundled, installed: [installed] })
await import('../../src/main/backends/provider-helper-entry.ts')
