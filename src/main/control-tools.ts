import { chooseControlsWithJev } from './controls-jev'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { lexLiteral, locateAnchor, validateManifest } from './control-manifest'
import { saveManifest } from './control-panels'

function panelId(file: string, component: string): string {
  const slug =
    component
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'panel'
  const hash = createHash('sha1').update(`${file}:${component}`).digest('hex').slice(0, 6)
  return `${slug}-${hash}`
}

export async function defineAgentControls(
  root: string,
  liveRoot: string,
  raw: unknown,
  notify: (channel: string, payload: unknown) => void,
  options: { key?: string; engine?: string; prompt?: string } = {}
): Promise<unknown> {
  const fail = (error: string): unknown => ({ error })
  if (!raw || typeof raw !== 'object') return fail('manifest is required')
  const input = raw as Record<string, unknown>
  // Main assigns identity; the model never picks ids or timestamps.
  const manifest = validateManifest({
    ...input,
    id: panelId(String(input.file), String(input.component)),
    createdAt: new Date().toISOString()
  })
  if ('error' in manifest) return fail(manifest.error)
  // Anchor check against THIS session's tree (the worktree, where the
  // agent just wrote) — the live tree may not have the constant yet.
  let code: string
  try {
    code = await readFile(join(root, manifest.file), 'utf8')
  } catch {
    return fail(`could not read ${manifest.file} — does the file exist?`)
  }
  for (const param of manifest.params) {
    if (param.apply.strategy !== 'literal') continue
    const loc = locateAnchor(code, param.apply.anchor)
    if ('error' in loc) {
      const why =
        loc.error === 'missing'
          ? 'does not occur in the file'
          : 'occurs more than once (must be unique)'
      return fail(`param '${param.id}': anchor ${why}. Adjust the anchor or the code.`)
    }
    if (!lexLiteral(code, loc.at, param.kind)) {
      return fail(
        `param '${param.id}': no ${param.kind} literal immediately after the anchor. ` +
          'The anchor must end right before the literal value.'
      )
    }
  }
  if (options.engine === 'jev') {
    try { manifest.params = await chooseControlsWithJev(options.key ?? root, options.prompt ?? '', manifest.params) }
    catch (error) { return fail(error instanceof Error ? error.message : String(error)) }
  } else if (options.engine && options.engine !== 'agent') return fail('Unknown control engine.')
  const saved = await saveManifest(liveRoot, manifest)
  if ('error' in saved) return fail(saved.error)
  notify('controls:updated', { root: liveRoot })
  notify('controls:open', {
    root: liveRoot,
    file: manifest.file,
    tab: 'custom',
    ...(manifest.presentation === 'animation' ? { presentation: 'animation' } : {}),
    requestId: randomUUID()
  })

  return {
    registered: manifest.id,
    engine: options.engine ?? 'agent',
    message:
      'Controls registered. Opening requested; newly instrumented source becomes available after the turn lands.'
  }
}

export function openAgentControls(
  root: string,
  raw: unknown,
  notify: (channel: string, payload: unknown) => void
): unknown {
  const args = raw as { source?: unknown; file?: unknown; tab?: unknown }
  const source = typeof args?.source === 'string' ? args.source.trim() : undefined
  const file = typeof args?.file === 'string' ? args.file.trim() : undefined
  if (!source && !file)
    return { error: 'Provide a source stamp (file:line) or a repo-relative file.' }
  if (args.tab !== undefined && !['props', 'styles', 'custom'].includes(String(args.tab)))
    return { error: 'Unknown inspector tab.' }
  notify('controls:open', {
    root,
    source,
    file,
    tab: args.tab ?? 'props',
    requestId: randomUUID()
  })
  return {
    queued: true,
    message:
      'Requested selection and inspector opening in the active project. Ambiguous or unavailable targets require a more specific source stamp.'
  }
}
