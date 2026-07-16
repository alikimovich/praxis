#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

function detectPackageManager() {
  const check = spawnSync('bun', ['--version'], { stdio: 'ignore' })
  return !check.error && check.status === 0 ? 'bun' : 'npm'
}

function usage() {
  return `Usage: praxis [command]

Commands:
  praxis              Launch Praxis (builds first if needed)
  praxis --update      Pull latest changes, reinstall, and rebuild
  praxis --help        Show this help message
  praxis --version      Print the installed version
`
}

function getElectronPath() {
  try {
    return require('electron')
  } catch {
    console.error(`Praxis isn't installed yet — run: ${detectPackageManager()} install`)
    process.exit(1)
  }
}

function printVersion() {
  const pkgPath = join(repoRoot, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  console.log(`Praxis ${pkg.version}`)
}

function launch() {
  const builtEntry = join(repoRoot, 'out', 'main', 'index.js')

  if (!existsSync(builtEntry)) {
    const buildResult = spawnSync(detectPackageManager(), ['run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
    })
    if (buildResult.status !== 0) {
      console.error('Praxis build failed — see output above.')
      process.exit(buildResult.status ?? 1)
    }
  }

  const electronPath = getElectronPath()

  const child = spawn(electronPath, ['.'], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  console.log('Launching Praxis…')
  process.exit(0)
}

function update() {
  let before
  try {
    before = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
    })
      .toString()
      .trim()
  } catch {
    console.error('Could not determine current git revision.')
    process.exit(1)
  }

  const pm = detectPackageManager()
  const steps = [
    ['git', ['pull', '--ff-only']],
    [pm, ['install']],
    [pm, ['run', 'build']],
  ]

  for (const [cmd, args] of steps) {
    const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit' })
    if (result.status !== 0) {
      console.error(
        `Update failed while running \`${cmd} ${args.join(' ')}\` (exit code ${result.status}).` +
          (cmd === 'git'
            ? ' If you have local changes, commit or stash them and try again.'
            : ''),
      )
      process.exit(result.status ?? 1)
    }
  }

  const after = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
  })
    .toString()
    .trim()

  if (before === after) {
    console.log('Praxis is already up to date.')
  } else {
    console.log(`Updated ${before} → ${after}.`)
  }

  console.log('Run `praxis` to (re)start.')
  process.exit(0)
}

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === undefined) {
    launch()
    return
  }

  if (command === '--update' || command === 'update') {
    // --no-launch is accepted (passed by the in-app updater) and ignored,
    // since update() never auto-launches regardless.
    update()
    return
  }

  if (command === '--help' || command === '-h') {
    console.log(usage())
    process.exit(0)
    return
  }

  if (command === '--version' || command === '-v') {
    printVersion()
    process.exit(0)
    return
  }

  console.error(`Unknown command: ${command}\n`)
  console.error(usage())
  process.exit(1)
}

main()
