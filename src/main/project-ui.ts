import { dirname, posix } from 'node:path'
import { z } from 'zod'
import { discoverProjectUi, type ProjectUiCatalog } from './project-ui-catalog'

const enabledSessions = new Set<string>()
export function setProjectUiEnabled(key: string, enabled: boolean): void {
  if (enabled) enabledSessions.add(key)
  else enabledSessions.delete(key)
}
export const projectUiEnabled = (key: string): boolean => enabledSessions.has(key)

export function projectUiInstructions(enabled: boolean): string {
  return enabled
    ? `[Praxis UI composition: ON for this turn]\nFor UI generation, call project_ui_catalog, then compose_project_ui with a static json-render spec using the discovered components. Read their source and existing usage to preserve theme, providers, layout and styling conventions. Write the returned TSX in your worktree and integrate it with the requested page using ordinary edit tools. Do not install json-render in the target project. These tools return source, not saved files. Preserve normal application logic; explain unsupported components or frameworks instead of inventing catalog entries. For non-UI requests work normally.\n\n`
    : '[Praxis UI composition: OFF for this turn. Do not use project_ui_catalog or compose_project_ui; use ordinary source editing.]\n\n'
}

const elementSchema = z
  .object({
    type: z.string(),
    props: z.record(z.string(), z.unknown()),
    children: z.array(z.string()).max(100)
  })
  .strict()
const specSchema = z
  .object({ root: z.string(), elements: z.record(z.string(), elementSchema) })
  .strict()

async function buildCatalog(project: ProjectUiCatalog) {
  const { defineCatalog, defineSchema } = await import('@json-render/core')
  const schema = defineSchema((s) => ({
    spec: s.object({
      root: s.string(),
      elements: s.record(
        s.object({
          type: s.ref('catalog.components'),
          props: s.propsOf('catalog.components'),
          children: s.array(s.string())
        })
      )
    }),
    catalog: s.object({ components: s.map({ props: s.zod(), description: s.string() }) })
  }))
  const components: Record<string, { props: z.ZodType; description: string }> = {
    Text: {
      props: z.object({ text: z.string().max(4000) }).strict(),
      description: 'Plain text node, no wrapper or children.'
    }
  }
  for (const component of project.components) {
    if (component.name === 'Text')
      throw new Error('Component name Text is reserved for literal text.')
    components[component.name] = {
      props: z.object(component.props).strict(),
      description: `${component.description}. ${component.childrenRequired ? 'Requires children.' : component.children ? 'Accepts children.' : 'No children.'}`
    }
  }
  return defineCatalog(schema, { components })
}

export async function exportProjectUi(
  project: ProjectUiCatalog,
  input: unknown
): Promise<{ file: string; code: string }> {
  const args = z
    .object({ file: z.string().max(250), spec: specSchema })
    .strict()
    .parse(input)
  if (
    !/^[\w./-]+\.tsx$/.test(args.file) ||
    args.file.startsWith('/') ||
    args.file.split('/').some((p) => p === '..' || p.startsWith('.'))
  )
    throw new Error('Choose a repo-relative .tsx output file outside hidden directories.')
  const keys = Object.keys(args.spec.elements)
  if (keys.length > 100) throw new Error('Use at most 100 elements.')
  const catalog = await buildCatalog(project)
  const validation = catalog.validate(args.spec)
  if (!validation.success)
    throw new Error(`Invalid composition: ${JSON.stringify(validation.error)}`)
  const components = new Map(project.components.map((c) => [c.name, c]))
  const visited = new Set<string>()
  function validate(key: string, depth: number): void {
    if (depth > 25 || visited.has(key))
      throw new Error(
        'Composition must be a tree, without cycles or shared nodes, at most 25 levels deep.'
      )
    const node = args.spec.elements[key]
    if (!node) throw new Error(`Missing element: ${key}`)
    visited.add(key)
    if (node.type === 'Text') {
      z.object({ text: z.string().max(4000) })
        .strict()
        .parse(node.props)
      if (node.children.length) throw new Error('Text cannot contain children.')
    } else {
      const component = components.get(node.type)
      if (!component) throw new Error(`Unknown component: ${node.type}`)
      z.object(component.props).strict().parse(node.props)
      if (component.childrenRequired && !node.children.length)
        throw new Error(`${node.type} requires children.`)
      if (!component.children && node.children.length)
        throw new Error(`${node.type} does not accept children.`)
    }
    for (const child of node.children) validate(child, depth + 1)
  }
  validate(args.spec.root, 0)
  if (visited.size !== keys.length) throw new Error('Remove elements unreachable from the root.')
  const { collectUsedComponents } = await import('@json-render/codegen')
  const used = collectUsedComponents(args.spec)
  const imports = [...used]
    .filter((name) => name !== 'Text')
    .map((name) => {
      const c = components.get(name)
      if (!c) throw new Error(`Unknown component: ${name}`)
      if (c.file === args.file)
        throw new Error('Output cannot replace a component used by this composition.')
      let path = posix.relative(dirname(args.file), c.file).replace(/\.[jt]sx?$/, '')
      if (!path.startsWith('.')) path = `./${path}`
      return `import ${c.exported === 'default' ? name : `{ ${c.exported}${c.exported !== name ? ` as ${name}` : ''} }`} from ${JSON.stringify(path)}`
    })
  function render(key: string, depth: number): string {
    const node = args.spec.elements[key]
    const indent = '  '.repeat(depth)
    if (node.type === 'Text') return `${indent}{${JSON.stringify(node.props.text)}}`
    // JSX expression serialization preserves quotes, braces and HTML entities verbatim.
    const props = Object.entries(node.props)
      .map(([key, value]) => ` ${key}={${JSON.stringify(value)}}`)
      .join('')
    return node.children.length
      ? `${indent}<${node.type}${props}>\n${node.children.map((c) => render(c, depth + 1)).join('\n')}\n${indent}</${node.type}>`
      : `${indent}<${node.type}${props} />`
  }
  const jsx = render(args.spec.root, 3)
  return {
    file: args.file,
    code: `import * as React from 'react'\n${imports.join('\n')}\n\nexport default function GeneratedComposition() {\n  return (\n    <React.Fragment>\n${jsx}\n    </React.Fragment>\n  )\n}\n`
  }
}

/** Read-only tools scoped to the provider's current worktree and explicit turn setting. */
export async function runProjectUiTool(
  root: string,
  key: string,
  action: string,
  args?: unknown
): Promise<unknown> {
  if (!projectUiEnabled(key))
    return { error: 'Use project components is off. Enable it in Settings and send a new message.' }
  try {
    const project = await discoverProjectUi(root)
    if (action === 'project_ui_catalog') {
      const catalog = await buildCatalog(project)
      return {
        prompt: catalog.prompt({
          customRules: [
            'Static compositions only. No actions, state, expressions or dynamic props. Use Text for literal text. Follow each component children constraint.'
          ]
        }),
        components: project.components.map(({ props: _props, ...c }) => c),
        styles: project.styles,
        warnings: project.warnings,
        guidance:
          'Read component implementations and current page usage. Export with compose_project_ui, then write and integrate the returned source using normal edit tools. Keep existing theme providers and styles.'
      }
    }
    if (action !== 'compose_project_ui') throw new Error('Unknown UI composition action.')
    if (!project.components.length) throw new Error(project.warnings.join(' '))
    return { ...(await exportProjectUi(project, args)), saved: false, warnings: project.warnings }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
