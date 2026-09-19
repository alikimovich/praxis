#!/usr/bin/env node
// Bounded subprocess runner. See docs/TESTING.md for isolation and reporting.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireRunLock, runCommand, runQueue } from './helpers/test-runner.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TEST_DIR);

// --- Tier membership (derived from package.json `test` and `verify` scripts) ---

// unit = the `bun test/NAME.mjs` group before `electron-vite build` in `test`.
const UNIT = [
  'project-ui',
  'jev-pilot',
  'test-runner',
  'setup-next',
  'code-reveal',
  'message-queue',
  'conversation-handoff',
  'pr-body',
  'feedback-body',
  'publish-message',
  'slash-token',
  'skills-discovery',
  'provider-skills',
  'github-connect',
  'html-source',
  'project-key',
  'project-create',
  'environment-changes',
  'project-icon',
  'devserver-net',
  'xcode',
  'git',
  'git-remote',
  'publish-reconcile',
  'sidecar-migrate',
  'diag-cache',
  'diag-rules',
  'sessions-store',
  'preferred-model',
  'project-memory',
  'project-memory-evaluation',
  'providers-store',
  'model-catalog',
  'codex-retry-cause',
  'codex-stream',
  'praxis-agent-tools',
  'control-target',
  'rail-order',
  'interrupt-escalation',
  'terminal-streams',
  'turn-terminal',
  'chat-title',
  'markdown-color',
  'chat-settings',
  'run-stats',
  'codex-usage',
  'edit-history',
  'worktrees',
  'chat-worktrees',
  'auto-reconciliation',
  'live-commit',
  'file-tree',
  'file-ops',
  'media-types',
  'attachments',
  'rules',
  'tw-classes',
  'tw-styles',
  'token-match',
  'style-tokens',
  'layers-move',
  'layers-labels',
  'measure-distance',
  'sibling-drop',
  'inline-style',
  'css-values',
  'elide-url',
  'control-panels',
  'svelte-instance',
  'docs-links',
  'update',
  'spring',
  'apca',
  'fluid',
  'oklch',
  'shadows',
  'type-metrics',
  'skills-install',
  'praxis-cli',
];

// electron = the `node test/NAME.mjs` group AFTER `electron-vite build` in `test`.
const ELECTRON = [
  'project-ui-settings',
  'native-animation-controls',
  'git-updates',
  'project-setup',
  'cat-animations',
  'startup-intro',
  'browser-mode',
  'remote-indicator',
  'smoke',
  'menu-recents',
  'open-preview',
  'mobile-frame',
  'viewport-per-project',
  'rail',
  'rail-collapse',
  'rail-favicon',
  'chat-hide',
  'editor-search',
  'rail-chat-overflow',
  'rail-chat-status',
  'rail-reorder',
  'project-memory-ui',
  'devserver-multi',
  'static-serve',
  'agent-multi',
  'agent-cap',
  'provider-seam',
  'agent-history',
  'history-ui',
  'chat-render',
  'desktop-surfaces',
  'provider-skills-menu',
  'visual-edit-agent',
  'revert-action',
  'chat-route',
  'composer-draft',
  'restore-reload',
  'preview-location',
  'preview-iframe-navigation',
  'feedback-dialog',
  'connect-dialog',
  'html-text-edit',
  'questions',
  'diagnose-card',
  'select-element',
  'three-d-inspector',
  'measure-alt',
  'comment-mode',
  'spawn-comment',
  'chat-isolation',
  'prop-edit',
  'style-edit',
  'layers-panel',
  'preview-drag',
  'custom-controls',
  'prop-edit-svelte',
  'prop-svelte-self',
  'code-peek',
  'code-drawer',
  'settings-connect',
  'annotations',
  'tokens',
  'tokens-scaffold',
  'ready-gating',
  'text-edit',
  'text-edit-svelte',
  'setup-detect',
  'setup-restart',
  'sim-detect',
  'sim-preflight',
  'sim-frame',
  'sim-control',
];

// live = the tests present in `verify` but not in `test`.
const LIVE = [
  'project-ui-agent',
  'auto-reconciliation-live',
  'next-integration',
  'code-reveal-agent',
  'animation-controls-agent',
  'model-switch-e2e',
  'agent-e2e',
  'codex-e2e',
  'controls-agent',
  'controls-codex',
  'tool-invocation',
  'sim-e2e',
  'style-provenance',
];

// Store-only UI tests: no shared fixture writes, servers, or real provider turns.
// Everything else is exclusive until its fixture/process ownership is audited.
const PARALLEL_ELECTRON = new Set(['remote-indicator', 'smoke', 'composer-draft']);
const TIERS = { unit: UNIT, electron: ELECTRON, live: LIVE };
const selected = new Set();
const options = { jobs: Math.min(4, availableParallelism()), 'electron-jobs': 2,
  'timeout-ms': 600_000, filter: null };
let serial = false;
try {
  for (const arg of process.argv.slice(2)) {
    if (arg === '--serial') serial = true;
    else if (arg === 'all') Object.keys(TIERS).forEach(t => selected.add(t));
    else if (Object.hasOwn(TIERS, arg)) selected.add(arg);
    else {
      const match = /^--(jobs|electron-jobs|timeout-ms|filter)=(.+)$/.exec(arg);
      if (!match) throw new Error(`unknown argument: ${arg}`);
      const [, key, value] = match;
      if (key === 'filter') options.filter = new Set(value.split(','));
      else {
        const n = Number(value);
        if (!Number.isSafeInteger(n) || n < 1 || n > 2_147_483_647) throw new Error(`invalid ${key}: ${value}`);
        options[key] = n;
      }
    }
  }
  if (!selected.size) throw new Error('select at least one tier');
  if (options.filter) {
    const names = [...selected].flatMap(t => TIERS[t]);
    for (const name of options.filter) if (!names.includes(name)) throw new Error(`test not in selected tiers: ${name}`);
  }
} catch (error) {
  console.error(`${error.message}\nusage: node test/run.mjs <unit|electron|live|all> [--serial] [--jobs=4] [--electron-jobs=2] [--timeout-ms=600000] [--filter=name,name]`);
  process.exit(2);
}

const artifacts = join(TEST_DIR, 'artifacts', 'runs');
mkdirSync(artifacts, { recursive: true });
let releaseLock;
try { releaseLock = acquireRunLock(join(artifacts, '.runner-lock')); }
catch (error) { console.error(error.message); process.exit(2); }
process.once('exit', releaseLock);
const logs = mkdtempSync(join(artifacts, 'run-'));
const controller = new AbortController();
let interrupted;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = signal;
  controller.abort();
});
const start = Date.now();
const results = [];
const builds = [];
let built = false;
let buildFailed = false;
const fmt = ms => `${(ms / 1000).toFixed(1)}s`;
console.log(`Test logs: ${logs}`);
for (const [tier, members] of Object.entries(TIERS)) {
  if (!selected.has(tier)) continue;
  const tests = members.filter(name => !options.filter || options.filter.has(name));
  if (!tests.length) continue;
  if (tier !== 'unit' && !built && !buildFailed && !controller.signal.aborted) {
    console.log('Building Electron once…');
    const build = await runCommand({ command: join(ROOT, 'node_modules', '.bin', 'electron-vite'),
      args: ['build'], cwd: ROOT, name: 'build', log: join(logs, 'build.log'),
      timeoutMs: options['timeout-ms'], signal: controller.signal });
    builds.push(build);
    built = build.outcome === 'PASS';
    buildFailed = !built;
    console.log(`Build ${build.outcome} ${fmt(build.duration)} — ${build.log}`);
  }
  const jobs = serial || tier === 'live' ? 1 : tier === 'unit' ? options.jobs : options['electron-jobs'];
  console.log(`\n${tier}: ${tests.length} tests, at most ${jobs} workers`);
  const items = tests.map(name => ({ name, exclusive: tier === 'electron' && !PARALLEL_ELECTRON.has(name) }));
  const tierResults = await runQueue(items, jobs, async ({ name }) => {
    if (tier !== 'unit' && buildFailed) return { name, outcome: 'BLOCKED', duration: 0, note: 'build failed' };
    console.log(`START [${tier}] ${name}`);
    const result = await runCommand({ command: tier === 'unit' ? 'bun' : 'node',
      args: [join(TEST_DIR, `${name}.mjs`)], cwd: ROOT, name,
      log: join(logs, `${tier}-${name}.log`), timeoutMs: options['timeout-ms'], signal: controller.signal });
    console.log(`${result.outcome} [${tier}] ${name} ${fmt(result.duration)}${result.note ? ` — ${result.note}` : ''}`);
    if (!['PASS', 'SKIP'].includes(result.outcome)) console.log(`  Log: ${result.log}`);
    return result;
  }, controller.signal);
  results.push(...tierResults.map(r => ({ tier, ...r })));
}
const duration = Date.now() - start;
const counts = {};
for (const r of results) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
writeFileSync(join(logs, 'summary.json'), JSON.stringify({ duration, counts, builds, results }, null, 2) + '\n');
console.log(`\nSUMMARY: ${Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(', ')}; wall time ${fmt(duration)}`);
console.log(`Report: ${join(logs, 'summary.json')}`);
process.exitCode = interrupted ? (interrupted === 'SIGINT' ? 130 : 143)
  : buildFailed || results.some(r => !['PASS', 'SKIP'].includes(r.outcome)) ? 1 : 0;
