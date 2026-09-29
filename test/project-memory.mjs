import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createProjectMemoryInjection,
  createProjectMemoryStore,
  createProjectMemoryUpdateQueue,
  MAX_PROJECT_MEMORY_CHARS,
  memoryFileId,
  projectMemoryRules,
  projectMemoryUpdate
} from '../src/main/project-memory.ts'

const base = mkdtempSync(join(tmpdir(), 'trezi-project-memory-'))
const ok = (condition, message) => {
  if (!condition) throw new Error(message)
}
const rejects = async (promise, pattern, message) => {
  try {
    await promise
  } catch (error) {
    ok(pattern.test(error.message), `${message}: ${error.message}`)
    return
  }
  throw new Error(`${message}: did not reject`)
}

try {
  let clock = 1790000000000
  const store = createProjectMemoryStore(base, () => ++clock)
  const a = '/tmp/project-a'
  const b = '/tmp/project-b'
  const fileA = join(base, 'project-memories', `${memoryFileId(a)}.json`)
  ok((await store.get(a)).content === '', 'new projects start with empty memory')
  ok((await store.get(a)).digest === 'absent', 'an absent file is the absent version')

  const saved = await store.save(a, '  # Decisions\n\n- Use trezi/master.  ')
  ok(saved.content === '# Decisions\n\n- Use trezi/master.', 'save trims outer whitespace')
  ok(saved.updatedAt === clock, 'save stamps the injected clock')
  ok(readFileSync(fileA, 'utf8') === JSON.stringify({ content: saved.content, updatedAt: clock }), 'the unchanged file format')
  ok((await store.get(a)).content === saved.content, 'memory survives a new read')
  ok((await store.get(a)).digest === saved.digest, 'a read reports the version just saved')
  ok((await store.get(b)).content === '', 'projects remain isolated')
  ok((await store.get(`${a}/`)).digest === saved.digest, 'a trailing slash is the same project')

  const unchanged = readFileSync(fileA)
  ok((await store.save(a, saved.content)).updatedAt === saved.updatedAt, 'an unchanged save writes nothing')
  ok(readFileSync(fileA).equals(unchanged), 'an unchanged save leaves the bytes alone')

  const oversized = await store.save(a, 'x'.repeat(MAX_PROJECT_MEMORY_CHARS + 50))
  ok(oversized.content.length === MAX_PROJECT_MEMORY_CHARS, 'memory is context-bounded')

  const rules = projectMemoryRules('Keep the rail calm.')
  ok(rules.join('\n').includes('<project-memory>'), 'memory is clearly delimited')
  ok(rules.join('\n').includes('Keep the rail calm.'), 'rules carry saved content')
  ok(projectMemoryRules('').length === 0, 'empty memory injects no noise')
  ok(
    projectMemoryUpdate('Use detached worktrees.', 'Fix the card.').endsWith('Fix the card.'),
    'one-time updates preserve the user prompt'
  )
  ok(
    projectMemoryUpdate('', 'Continue.').includes('memory is now empty'),
    'clearing memory explicitly supersedes an older live-context snapshot'
  )

  // A proposal commits only on the version it was evaluated against.
  const evaluated = await store.save(a, '- Keep existing')
  await store.save(a, '- Manual wins')
  ok((await store.propose(a, evaluated, '- Generated')) === null, 'a stale proposal is refused')
  ok((await store.get(a)).content === '- Manual wins', 'the manual save survives a stale proposal')
  await rejects(store.propose(a, await store.get(a), '   '), /cannot erase/, 'a proposal can never erase memory')

  const updates = createProjectMemoryUpdateQueue(store)
  await store.save(a, '- Keep existing')
  let releaseFirst
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const first = updates.enqueue(a, async (current) => {
    await firstGate
    return `${current}\n- Learned from chat one`
  })
  const second = updates.enqueue(a, async (current) => `${current}\n- Learned from chat two`)
  releaseFirst()
  await Promise.all([first, second])
  const merged = (await store.get(a)).content
  ok(
    merged.includes('chat one') && merged.includes('chat two'),
    'peer-chat evaluations serialize and merge against the latest memory'
  )

  let releaseEvaluation
  const evaluationGate = new Promise((resolve) => {
    releaseEvaluation = resolve
  })
  let markEvaluationStarted
  const evaluationStarted = new Promise((resolve) => {
    markEvaluationStarted = resolve
  })
  let evaluations = 0
  const guarded = updates.enqueue(a, async (current) => {
    evaluations += 1
    if (evaluations === 1) {
      markEvaluationStarted()
      await evaluationGate
    }
    return `${current}\n- Automatically learned`
  })
  // A user save during the model call is authoritative and forces one re-evaluation.
  await evaluationStarted
  await store.save(a, `${(await store.get(a)).content}\n- Manually edited`)
  releaseEvaluation()
  await guarded
  const afterManual = (await store.get(a)).content
  ok(afterManual.includes('Manually edited'), 'automatic updates preserve concurrent edits')
  ok(afterManual.includes('Automatically learned'), 'the re-evaluation merges on top of the manual edit')
  ok(evaluations === 2, 'a concurrent edit re-evaluates once against current memory')

  // Evaluation is best effort: a failing evaluator changes nothing and never throws.
  const beforeFailure = readFileSync(fileA)
  await updates.enqueue(a, async () => {
    throw new Error('model unavailable')
  })
  ok(readFileSync(fileA).equals(beforeFailure), 'a failed evaluation is a no-op')

  // A damaged file is never read as empty or replaced by either path.
  for (const content of ['{"content":', '[]', 'null', '{"content":1,"updatedAt":2}', '{"content":"x"}']) {
    writeFileSync(fileA, content)
    await rejects(store.get(a), /not a valid saved memory/, `damaged ${content} refuses reads`)
    await rejects(store.save(a, 'Overwrite'), /not a valid saved memory/, `damaged ${content} refuses saves`)
    await updates.enqueue(a, async () => '- Generated')
    ok(readFileSync(fileA, 'utf8') === content, `damaged ${content} is left untouched`)
  }
  rmSync(fileA)
  ok((await store.save(a, 'Restored')).content === 'Restored', 'removing the damaged file lets saves resume')

  // Injection: a live session receives changed memory once, on its next turn.
  {
    const c = '/tmp/project-c'
    let broken = false
    const injection = createProjectMemoryInjection(() => ({
      ...store,
      get: async (root) => {
        if (broken) throw new Error('owner unavailable')
        return store.get(root)
      }
    }))
    await store.save(c, '- Initial')
    ok((await injection.context(c, 's1')) === '- Initial', 'a new session carries memory in its instructions')
    ok((await injection.prompt(c, 's1', 'Hi')) === 'Hi', 'unchanged memory is not repeated')
    await store.save(c, '- Edited')
    const updated = await injection.prompt(c, 's1', 'Next')
    ok(updated.includes('- Edited') && updated.endsWith('Next'), 'an edit is injected on the next turn')
    ok((await injection.prompt(c, 's1', 'Again')) === 'Again', '… exactly once')
    ok((await injection.context(c, 's2')) === '- Edited', 'peer sessions are tracked separately')
    broken = true
    ok((await injection.context(c, 's3')) === '', 'unreadable memory never fails a new chat')
    ok((await injection.prompt(c, 's1', 'Down')) === 'Down', 'or a turn')
    broken = false
    ok((await injection.prompt(c, 's3', 'Back')).includes('- Edited'), 'memory arrives once it can be read')
    await store.save(c, '')
    ok((await injection.prompt(c, 's2', 'Cleared')).includes('memory is now empty'), 'clearing memory is announced')
    injection.forget('s1')
    ok((await injection.prompt(c, 's1', 'Fresh')).includes('memory is now empty'), 'a forgotten session is re-informed')
  }

  // Memory lives outside the repository: nothing is written under a project root.
  const repo = join(base, 'repo')
  mkdirSync(repo)
  await store.save(repo, 'Private decision')
  ok(!existsSync(join(repo, '.trezi')), 'no project sidecar is written')

  console.log('PROJECT-MEMORY OK — durable, isolated, bounded, prompt-safe; stale proposals refused; damaged files preserved')
} finally {
  rmSync(base, { recursive: true, force: true })
}
