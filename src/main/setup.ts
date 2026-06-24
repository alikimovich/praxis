import { ipcMain } from 'electron'
import { access, writeFile } from 'fs/promises'
import { join } from 'path'
import type { SetupResult } from '../shared/api'

/**
 * Project setup (the "make this repo dsgn-ready" hybrid). The deterministic part
 * lives here: drop the dev-only source-stamping Babel plugin into the repo. The
 * judgement part (wiring it into the dev config + adding prop types to the
 * components) is handed to the agent by the renderer — see App's accept flow.
 */

const PLUGIN_FILE = 'dsgn-source-plugin.cjs'

// Stamps data-dsgn-source="<relative path>:<line>:<col>" on every JSX element so
// dsgn can map a clicked element back to its source. Dev-only — strip in prod.
const PLUGIN_CONTENT = `// Added by dsgn. Stamps data-dsgn-source on JSX elements so the visual editor
// can map elements to source. DEV ONLY — do not enable in production builds.
module.exports = function dsgnSource({ types: t }) {
  return {
    name: 'dsgn-source',
    visitor: {
      JSXOpeningElement(path, state) {
        const loc = path.node.loc
        if (!loc) return
        const already = path.node.attributes.some(
          (a) => a.name && a.name.name === 'data-dsgn-source'
        )
        if (already) return
        const root = state.file.opts.root || process.cwd()
        const file = (state.file.opts.filename || '').replace(root + '/', '')
        path.node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier('data-dsgn-source'),
            t.stringLiteral(\`\${file}:\${loc.start.line}:\${loc.start.column}\`)
          )
        )
      }
    }
  }
}
`

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function detectFramework(root: string): Promise<SetupResult['framework']> {
  for (const f of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs']) {
    if (await exists(join(root, f))) return 'vite'
  }
  for (const f of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    if (await exists(join(root, f))) return 'next'
  }
  return 'unknown'
}

async function scaffold(root: string): Promise<SetupResult> {
  try {
    const framework = await detectFramework(root)
    const file = join(root, PLUGIN_FILE)
    let written = false
    if (!(await exists(file))) {
      await writeFile(file, PLUGIN_CONTENT, 'utf8')
      written = true
    }
    return { ok: true, framework, pluginFile: PLUGIN_FILE, written }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerSetupIpc(): void {
  ipcMain.handle('setup:scaffold', (_e, root: string) => scaffold(root))
}
