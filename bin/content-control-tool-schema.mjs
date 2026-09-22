import { z } from 'zod'
export const contentControlsShape = {
  action: z.enum(['catalog', 'define']),
  file: z.string().optional().describe('Repo-relative content JSON file consumed by the page'),
  recipe: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Version 1 content-controls recipe; call catalog first for the contract and example'),
  engine: z.enum(['agent', 'jev', 'auto']).optional(),
  prompt: z
    .string()
    .max(4000)
    .optional()
    .describe('Original user request; required for auto/Jev section selection')
}
