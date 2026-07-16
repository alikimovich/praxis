import { execFile } from 'child_process'
import { mkdir, readdir, writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { promisify } from 'util'

/**
 * Create a brand-new project from dsgn: a minimal Vite + React + TS app written
 * directly (no network templates, deterministic), then `git init` + first commit
 * and a dependency install (bun if available, else npm). Pure node (no electron)
 * so it's unit-testable against a temp dir.
 */

const execFileP = promisify(execFile)
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface CreateProjectResult {
  ok: boolean
  root?: string
  error?: string
}

/** Folder basename → a valid npm package name. */
export function packageName(root: string): string {
  const name = basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return name || 'my-app'
}

const templateFiles = (name: string): Record<string, string> => ({
  'package.json': `${JSON.stringify(
    {
      name,
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0' },
      devDependencies: {
        '@types/react': '^19.1.0',
        '@types/react-dom': '^19.1.0',
        '@vitejs/plugin-react': '^5.0.0',
        typescript: '^5.8.0',
        vite: '^7.0.0'
      }
    },
    null,
    2
  )}\n`,
  '.gitignore': 'node_modules\ndist\n.DS_Store\n',
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()]
})
`,
  'tsconfig.json': `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        isolatedModules: true,
        skipLibCheck: true
      },
      include: ['src']
    },
    null,
    2
  )}\n`,
  'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
`,
  'src/App.tsx': `export default function App() {
  return (
    <main className="hero">
      <h1>${name}</h1>
      <p>Fresh project, created with Praxis. Ask the chat to make it yours.</p>
    </main>
  )
}
`,
  'src/styles.css': `:root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: #1a1a1a;
  background: #ffffff;
}

body {
  margin: 0;
}

.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.hero p {
  color: #6b6b6b;
}
`
})

async function hasBun(): Promise<boolean> {
  try {
    await execFileP('bun', ['--version'], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

export async function createProject(
  root: string,
  opts: { install?: boolean } = {}
): Promise<CreateProjectResult> {
  // Never scaffold into a folder that already has content.
  try {
    const entries = await readdir(root)
    if (entries.filter((e) => e !== '.DS_Store').length > 0) {
      return { ok: false, error: `${root} already exists and isn't empty.` }
    }
  } catch {
    /* doesn't exist yet — good */
  }

  const name = packageName(root)
  try {
    await mkdir(join(root, 'src'), { recursive: true })
    for (const [file, content] of Object.entries(templateFiles(name))) {
      await writeFile(join(root, file), content, 'utf8')
    }
  } catch (e) {
    return { ok: false, error: `Could not write the project files: ${msg(e)}` }
  }

  // Git first (fast, and the initial commit captures the clean template even if
  // the install below fails); non-fatal — dsgn's branch flow just stays off.
  try {
    await execFileP('git', ['init', '-b', 'main'], { cwd: root, timeout: 10000 })
    await execFileP('git', ['add', '-A'], { cwd: root, timeout: 10000 })
    await execFileP('git', ['commit', '-m', 'Initial commit from Praxis'], {
      cwd: root,
      timeout: 10000
    })
  } catch {
    /* no git or no identity configured — the project still works */
  }

  if (opts.install !== false) {
    const pm = (await hasBun()) ? 'bun' : 'npm'
    try {
      await execFileP(pm, ['install'], {
        cwd: root,
        timeout: 300000,
        maxBuffer: 16 * 1024 * 1024
      })
    } catch (e) {
      return { ok: false, error: `Project created, but ${pm} install failed: ${msg(e)}` }
    }
  }

  return { ok: true, root }
}
