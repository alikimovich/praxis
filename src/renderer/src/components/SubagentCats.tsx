import { useSpawns } from '../store'
import CatLoader from './CatLoader'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

/** Active children stay beside their parent chat's composer, out of the sidebar. */
export default function SubagentCats({ sessionKey }: { sessionKey: string }): React.JSX.Element | null {
  const agents = useSpawns((s) => s.byKey[sessionKey])
  if (!agents?.length) return null

  // Running work takes priority if additional operations are waiting for a slot.
  const visible = [...agents]
    .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'))
    .slice(0, 6)
  return (
    <TooltipProvider delayDuration={200}>
      <div className="ml-auto flex shrink-0 items-center gap-1 pointer-events-auto" aria-label="Background agents">
        {visible.map((agent) => (
          <Tooltip key={agent.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`${agent.status === 'queued' ? 'Queued' : 'Running'}: ${agent.label}. Cancel agent`}
                onClick={() => void window.api.agent.spawnInterrupt(agent.id)}
              >
                <span aria-hidden="true" className="flex pointer-events-none">
                  <CatLoader running={agent.status === 'running'} small />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-64 break-words">
              <p>{agent.label}</p>
              <p className="mt-1 opacity-70">{agent.status === 'queued' ? 'Queued · ' : ''}Click to cancel</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}
