import { defineContentControls } from './content-controls'
import { chooseControlsWithJev } from './controls-jev'

export async function runContentControlTool(
  root: string,
  liveRoot: string,
  key: string,
  raw: unknown,
  notify: (channel: string, payload: unknown) => void
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
          'Use RecipePanel recipes. Bind a JSON object consumed by the actual page. Preserve existing content and wire it into the project before defining a panel. No package installation in the target. Set engine:jev and prompt to let Jev select and order prepared sections. Save writes to source; drafts stay local until Save.'
      }
    if (args.action !== 'define' || !args.file)
      throw new Error('Use catalog or define with file and recipe.')
    const { parseRecipe } = await import('@alikimovich/content-controls/recipe')
    let recipe = parseRecipe(args.recipe)
    if (args.engine === 'jev')
      recipe = {
        ...recipe,
        sections: await chooseControlsWithJev(key, args.prompt ?? '', recipe.sections)
      }
    else if (args.engine && args.engine !== 'agent') throw new Error('Unknown control engine.')
    const panel = await defineContentControls(root, liveRoot, { file: args.file, recipe })
    notify('content-controls:updated', { root: liveRoot, id: panel.id })
    return {
      registered: panel.id,
      engine: args.engine ?? 'agent',
      message:
        'Content editor registered in the preview area. Source is available after the turn lands. Verify the page consumes this JSON and updates on Save.'
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
