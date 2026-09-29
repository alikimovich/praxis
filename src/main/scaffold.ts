import { execFile } from 'child_process'
import { mkdir, readdir, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { promisify } from 'util'
import type { ProjectCreateOptions } from '../shared/api'
import { workflowOwner } from './workflow-owner'

/**
 * Create a new project: either an empty repository for a setup conversation,
 * or a minimal Vite + React + TS app written directly (no network templates, deterministic), then `git init` + first commit
 * and a dependency install (bun if available, else npm). Pure node (no electron)
 * so it's unit-testable against a temp dir.
 */

const execFileP = promisify(execFile)
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface CreateProjectResult {
  ok: boolean
  root?: string
  error?: string
  /**
   * The project was created, but something non-fatal went wrong that the user
   * needs to know about NOW rather than discover later. Today that means the
   * `git init` + first commit didn't work: everything still runs, but trezi's
   * branch and publish flow both need a repository, so publish would otherwise
   * fail much later with a message that never mentions git (see
   * `annotations.ts`'s "isn't the repository root").
   */
  warning?: string
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
  // Patterns are intentionally slash-free (`node_modules`, not `node_modules/`): a
  // trailing-slash pattern is directory-only and won't match the node_modules SYMLINK
  // Trezi stitches into each chat worktree (see worktrees.ts's RUNTIME_DEPS note).
  '.gitignore':
    'node_modules\ndist\ndist-ssr\n.DS_Store\n*.local\n.env\n.env.*\n!.env.example\nnpm-debug.log*\nyarn-error.log*\n',
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
      <p>Fresh project, created with Trezi. Ask the chat to make it yours.</p>
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

/** Starter files for a template (the JS helper's proposal). */
export function starterFiles(root: string, template: ProjectCreateOptions['template'] | undefined): Record<string, string> {
  return template === 'empty'
    ? { '.gitignore': 'node_modules\n.next\n.svelte-kit\ndist\nbuild\n.env\n.env.*\n!.env.example\n.DS_Store\n' }
    : templateFiles(packageName(root))
}

/**
 * Create a project: the starter files and package manager are proposed here, the
 * workflow owner (S13) writes them, makes the first commit and installs, and resumes
 * a failed install on the next attempt instead of refusing a non-empty folder.
 */
export async function createProject(
  root: string,
  opts: { install?: boolean; template?: ProjectCreateOptions['template'] } = {}
): Promise<CreateProjectResult> {
  if (opts.template && !['react', 'empty'].includes(opts.template)) {
    return { ok: false, error: 'Unknown project starter.' }
  }
  const install = opts.template !== 'empty' && opts.install !== false ? ((await hasBun()) ? 'bun' : 'npm') : null
  return workflowOwner().createProject(root, starterFiles(root, opts.template), install)
}

/** The legacy writer (rollback twin of `WorkflowSetup.create`). */
export async function createProjectLegacy(
  root: string,
  files: Record<string, string>,
  install: 'bun' | 'npm' | null
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
  try {
    await mkdir(root, { recursive: true })
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true })
      await writeFile(join(root, file), content, 'utf8')
    }
  } catch (e) {
    return { ok: false, error: `Could not write the project files: ${msg(e)}` }
  }

  // Git first (fast, and the initial commit captures the clean template even if
  // the install below fails). Still non-fatal — the project runs either way — but
  // NOT silent: a swallowed failure is invisible until the user hits Publish, which
  // then reports "this folder isn't the repository root" without mentioning git.
  let warning: string | undefined
  try {
    await execFileP('git', ['init', '-b', 'main'], { cwd: root, timeout: 10000 })
  } catch (e) {
    warning =
      `Project created, but \`git init\` failed: ${msg(e)}. Trezi needs a repository ` +
      `to create work branches and to publish, so run \`git init\` in ${root} before publishing.`
  }
  if (!warning) {
    try {
      await execFileP('git', ['add', '-A'], { cwd: root, timeout: 10000 })
      await execFileP('git', ['commit', '-m', 'Initial commit from Trezi'], {
        cwd: root,
        timeout: 10000
      })
    } catch (e) {
      // The repo exists, so branching and publishing work — only the first commit
      // is missing, and the usual cause is a machine with no git identity set.
      warning =
        `Project created and \`git init\` succeeded, but the first commit failed: ${msg(e)}. ` +
        `If git has no identity here, set one with \`git config --global user.email "you@example.com"\` ` +
        `and \`git config --global user.name "Your Name"\`, then commit.`
    }
  }

  if (install) {
    try {
      await execFileP(install, ['install'], {
        cwd: root,
        timeout: 300000,
        maxBuffer: 16 * 1024 * 1024
      })
    } catch (e) {
      return { ok: false, error: `Project created, but ${install} install failed: ${msg(e)}` }
    }
  }

  return { ok: true, root, ...(warning ? { warning } : {}) }
}
