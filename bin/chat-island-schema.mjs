import { z } from 'zod'
import { defineControlsShape } from './control-tool-schema.mjs'
export const chatIslandShape = {
  action: z.enum(['catalog', 'define', 'read']),
  id: z.string().optional().describe('Existing island id when updating or reading'),
  revision: z.number().int().optional().describe('Expected island revision when updating'),
  prompt: z.string().max(4000).optional().describe('User request for Jev composition'),
  engine: z.enum(['auto', 'jev', 'agent']).optional(),
  manifest: defineControlsShape.manifest.optional().describe('Literal bindings only, in one source file. Expose clean constants consumed by the project.'),
  blocks: z.array(z.object({
    id: z.string(), title: z.string().max(80), kind: z.enum(['group', 'point']),
    params: z.array(z.string()).min(1).max(12)
  })).min(1).max(12).optional().describe('Prepared groups; point requires exactly two bounded number bindings for x/y. Jev selects and orders whole blocks; compound blocks retain all bindings.')
}
export const chatIslandDescription = 'Generate an interactive native island INSIDE this chat. Call catalog first for control-purpose, binding, replay and verification rules. Inspect/instrument values consumed by the real effect, then define literal bindings and meaningful groups. Jev selects/ orders blocks. Supports numbers, toggles, text, color, select, Bezier and 2D points (light position). Read current values before revising an island. Source becomes editable after successful landing. No model calls on control gestures.'
