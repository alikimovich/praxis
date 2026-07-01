import type { PermissionRequest } from '../../../shared/api'
import { Button } from '@/components/ui/button'

interface Props {
  requests: PermissionRequest[]
  onRespond: (id: string, behavior: 'allow' | 'deny') => void
}

/**
 * Approve/deny cards for tool calls the agent wants to make. Shown above the
 * composer while the SDK awaits a decision (in Ask / Accept-edits modes). In
 * Auto mode the SDK never asks, so no cards appear. shadcn Buttons; Tailwind
 * amber alert surface. Class hooks (`.perm*`) preserved for the test harness.
 */
export default function PermissionCards({ requests, onRespond }: Props): React.JSX.Element | null {
  if (requests.length === 0) return null
  return (
    <div className="perms flex flex-col gap-1.5">
      {requests.map((req) => (
        <div
          key={req.id}
          className="perm flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/30"
          role="alertdialog"
          aria-label={req.title}
        >
          <div className="perm__body">
            <div className="perm__title text-[13px] font-semibold text-amber-950 dark:text-amber-100">
              {req.title}
            </div>
            {req.detail && (
              <div className="perm__detail mt-0.5 truncate font-mono text-[11.5px] text-amber-700 dark:text-amber-300/90">
                {req.detail}
              </div>
            )}
          </div>
          <div className="perm__actions flex justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="perm__deny"
              onClick={() => onRespond(req.id, 'deny')}
            >
              Deny
            </Button>
            <Button size="sm" className="perm__allow" onClick={() => onRespond(req.id, 'allow')}>
              Allow{req.displayName ? ` ${req.displayName}` : ''}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
