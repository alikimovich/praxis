// Exercise the same worktree/manifest contract through Codex's local MCP bridge.
process.env.PRAXIS_CONTROLS_PROVIDER = 'codex'
await import('./controls-agent.mjs')
