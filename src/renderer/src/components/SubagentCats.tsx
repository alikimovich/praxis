import { useCallback, useState } from 'react'
import { useSpawns } from '../store'
import CatLoader from './CatLoader'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

/** Active children stay beside their parent chat's composer, out of the sidebar. */
export default function SubagentCats({ sessionKey }: { sessionKey: string }): React.JSX.Element | null {
  const agents = useSpawns((s) => s.byKey[sessionKey])
  const [boundary, setBoundary] = useState<Element | null>(null)
  const bindBoundary = useCallback((node: HTMLDivElement | null) => {
    setBoundary(node?.closest('.chat') ?? null)
  }, [])
  if (!agents?.length) return null

  // Running work takes priority if additional operations are waiting for a slot.
  const visible = [...agents]
    .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'))
    .slice(0, 6)
  return (
    <TooltipProvider delayDuration={200}>
      <div ref={bindBoundary} className="ml-auto flex shrink-0 self-end items-end gap-1 pointer-events-auto" aria-label="Background agents">
        {visible.map((agent) => (
          <Tooltip key={agent.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex size-6 items-end justify-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`${agent.status === 'queued' ? 'Queued' : 'Running'}: ${agent.label}. Cancel agent`}
                onClick={() => void window.api.agent.spawnInterrupt(agent.id)}
              >
                <span aria-hidden="true" className="flex pointer-events-none">
                  <CatLoader running={agent.status === 'running'} small appear />
                </span>
              </button>
            </TooltipTrigger>
            {/* Native preview paints above renderer portals; constrain to the chat pane. */}
            <TooltipContent
              side="top"
              align="end"
              sideOffset={6}
              collisionBoundary={boundary}
              collisionPadding={8}
              className="max-w-[min(16rem,var(--radix-tooltip-content-available-width))] break-words"
            >
              <p>{agent.label}</p>
              <p className="mt-1 opacity-70">{agent.status === 'queued' ? 'Queued · ' : ''}Click to cancel</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}
