import { defineContentControls } from './content-controls'
import { selectControlCandidates } from './control-selection'

export async function runContentControlTool(
  root: string,
  liveRoot: string,
  key: string,
  raw: unknown,
  notify: (channel: string, payload: unknown) => void,
  connectionId?: string
): Promise<unknown> {
  try {
    const args = raw as {
      action: string
      file?: string
      recipe?: unknown
      engine?: string
      prompt?: string
    }
    const api = await import('@alikimovich/content-controls/api')
    if (args.action === 'catalog')
      return {
        catalog: api.manifest(),
        example: api.recipe('project-editor'),
        guidance:
          'Use RecipePanel recipes. Bind a JSON object consumed by the actual page. Preserve existing content and wire it into the project before defining a panel. No package installation in the target. Set engine:auto and prompt to use Jev when configured, otherwise keep the chat model’s prepared sections. The result reports the actual engine and any fallback. Save writes to source; drafts stay local until Save.'
      }
    if (args.action !== 'define' || !args.file)
      throw new Error('Use catalog or define with file and recipe.')
    const { parseRecipe } = await import('@alikimovich/content-controls/recipe')
    let recipe = parseRecipe(args.recipe)
    const selection = await selectControlCandidates(key, recipe.sections, { ...args, connectionId })
    recipe = { ...recipe, sections: selection.controls }
    const panel = await defineContentControls(root, liveRoot, { file: args.file, recipe })
    notify('content-controls:updated', { root: liveRoot, id: panel.id })
    return {
      registered: panel.id,
      engine: selection.engine,
      ...(selection.fallback ? { fallback: selection.fallback } : {}),
      message:
        'Content editor registered in the preview area. Source is available after the turn lands. Verify the page consumes this JSON and updates on Save.'
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
