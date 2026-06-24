import type { PermissionRequest } from '../../../shared/api'

interface Props {
  requests: PermissionRequest[]
  onRespond: (id: string, behavior: 'allow' | 'deny') => void
}

/**
 * Approve/deny cards for tool calls the agent wants to make. Shown above the
 * composer while the SDK awaits a decision (in Ask / Accept-edits modes). In
 * Auto mode the SDK never asks, so no cards appear.
 */
export default function PermissionCards({ requests, onRespond }: Props): React.JSX.Element | null {
  if (requests.length === 0) return null
  return (
    <div className="perms">
      {requests.map((req) => (
        <div key={req.id} className="perm" role="alertdialog" aria-label={req.title}>
          <div className="perm__body">
            <div className="perm__title">{req.title}</div>
            {req.detail && <div className="perm__detail">{req.detail}</div>}
          </div>
          <div className="perm__actions">
            <button className="perm__deny" onClick={() => onRespond(req.id, 'deny')}>
              Deny
            </button>
            <button className="perm__allow" onClick={() => onRespond(req.id, 'allow')}>
              Allow{req.displayName ? ` ${req.displayName}` : ''}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
