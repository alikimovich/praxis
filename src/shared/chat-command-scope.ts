/** Session arguments accepted by root-scoped browser commands. Desktop/native
 * callers may address any open chat; browser callers must stay in their repo. */
const sessionArguments: Record<string, number> = {
  'agent:send': 2,
  'agent:set-permission-mode': 1,
  'agent:interrupt': 0,
  'agent:resolve-conflict': 0,
  'agent:discard-conflict': 0
}
export function assertChatCommandScope(project: string, channel: string, args: unknown[]) {
  const index = sessionArguments[channel]
  if (index === undefined || args[index] === undefined) return
  const key = args[index]
  if (typeof key !== 'string' || (key !== project && !key.startsWith(`${project}#`))) {
    throw new Error('That chat is outside the opened repository.')
  }
}
