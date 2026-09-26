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

// Backend logic checks run independently of the native desktop.
const UNIT = [
  "native-boundary",
  "praxis-agent-tools",
  "codex-mcp",
  "native-shutdown",
  "native-preview-recovery",
  "native-workspace",
  "native-workspace-controller",
  "native-preferences",
  "native-support",
  "native-sheets",
  "native-settings",
  "native-chat-controller",
  "chat-islands",
  "native-context",
  "native-updates",
  "native-content",
  "native-inspector",
  "native-layers",
  "native-editor",
  "native-shell-controller",
  "native-git",
  "native-support-sheets",
  "native-cat-assets",
  "content-controls",
  "project-ui",
  "project-ui-jev",
  "jev-pilot",
  "test-runner",
  "setup-next",
  "code-reveal",
  "conversation-handoff",
  "pr-body",
  "feedback-body",
  "publish-message",
  "publish-description",
  "slash-token",
  "skills-discovery",
  "provider-skills",
  "github-connect",
  "html-source",
  "project-key",
  "project-create",
  "environment-changes",
  "project-icon",
  "devserver-net",
  "xcode",
  "git",
  "git-remote",
  "publish-reconcile",
  "sidecar-migrate",
  "diag-cache",
  "diag-rules",
  "sessions-store",
  "preferred-model",
  "project-memory",
  "project-memory-evaluation",
  "providers-store",
  "model-catalog",
  "codex-retry-cause",
  "codex-stream",
  "interrupt-escalation",
  "turn-terminal",
  "chat-title",
  "chat-settings",
  "background-model",
  "run-stats",
  "codex-usage",
  "edit-history",
  "worktrees",
  "chat-worktrees",
  "auto-reconciliation",
  "live-commit",
  "file-tree",
  "file-ops",
  "media-types",
  "attachments",
  "rules",
  "tw-classes",
  "tw-styles",
  "token-match",
  "style-tokens",
  "layers-move",
  "layers-labels",
  "measure-distance",
  "sibling-drop",
  "inline-style",
  "css-values",
  "control-panels",
  "svelte-instance",
  "docs-links",
  "update",
  "spring",
  "apca",
  "fluid",
  "oklch",
  "shadows",
  "type-metrics",
  "skills-install",
  "praxis-cli"
];

const NATIVE = ['native-runtime', 'native-next-hmr'];
const LIVE = ['native-runtime-live'];
const TIERS = { unit: UNIT, native: NATIVE, live: LIVE };
const selected = new Set();
const options = { jobs: Math.min(4, availableParallelism()),
  'timeout-ms': 600_000, filter: null };
let serial = false;
try {
  for (const arg of process.argv.slice(2)) {
    if (arg === '--serial') serial = true;
    else if (arg === 'all') Object.keys(TIERS).forEach(t => selected.add(t));
    else if (Object.hasOwn(TIERS, arg)) selected.add(arg);
    else {
      const match = /^--(jobs|timeout-ms|filter)=(.+)$/.exec(arg);
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
  console.error(`${error.message}\nusage: node test/run.mjs <unit|native|live|all> [--serial] [--jobs=4] [--timeout-ms=600000] [--filter=name,name]`);
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
const fmt = ms => `${(ms / 1000).toFixed(1)}s`;
console.log(`Test logs: ${logs}`);
for (const [tier, members] of Object.entries(TIERS)) {
  if (!selected.has(tier)) continue;
  const tests = members.filter(name => !options.filter || options.filter.has(name));
  if (!tests.length) continue;
  const jobs = serial || tier !== 'unit' ? 1 : options.jobs;
  console.log(`\n${tier}: ${tests.length} tests, at most ${jobs} workers`);
  const items = tests.map(name => ({ name, exclusive: tier !== 'unit' }));
  const tierResults = await runQueue(items, jobs, async ({ name }) => {
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
  : results.some(r => !['PASS', 'SKIP'].includes(r.outcome)) ? 1 : 0;
