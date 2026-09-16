import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { ProviderConnection } from '../../../shared/api'
import {
  LAST_USED_VALUE,
  type PreferredModelState,
  preferredSelectValue,
  readPreferredModelState,
  setFixedPreference,
  setLastUsedMode,
  settingsFromChoice,
  writePreferredModelState
} from '../preferred-model'
import { providerOptions, useProviders } from '../providers-store'
import { openWithPreviewFreeze, usePreviewFreeze } from '../store'
import ProviderForm from './ProviderForm'

/**
 * App settings (Cmd+, from the app menu, or the model picker's "Manage
 * providers…"). "Models & Providers"
 * holds the default-model pick (last-used, or a specific catalog entry) plus
 * the saved `ProviderConnection`s and the add/edit form (ProviderForm) that
 * owns the key-bearing state.
 *
 * The form is MOUNTED only while it's open — leaving it unmounts the component
 * holding the typed API key, which is what guarantees the key never outlives the
 * form. Nothing key-shaped is ever put in the store; main only returns `hasKey`.
 */
export default function SettingsDialog(): React.JSX.Element {
  const open = useProviders((s) => s.settingsOpen)
  const setOpen = useProviders((s) => s.setSettingsOpen)
  const connections = useProviders((s) => s.connections)
  const choices = useProviders((s) => s.choices)
  const providers = useMemo(() => providerOptions(choices), [choices])
  const [preferred, setPreferred] = useState<PreferredModelState>(readPreferredModelState)

  /** null = the list; 'new' = adding; a connection = editing that one. */
  const [editing, setEditing] = useState<ProviderConnection | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The dialog is renderer DOM and the native preview paints ABOVE all DOM —
  // freeze-frame the preview while open and gate rendering on the freeze, exactly
  // like the feedback + connect sheets.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) {
      setShown(false)
      usePreviewFreeze.getState().setFrozen(false)
      // Unmounts ProviderForm → drops any key typed into it.
      setEditing(null)
      setConfirmDelete(null)
      setError(null)
      return
    }
    openWithPreviewFreeze(() => setShown(true))
  }, [open])

  // Every open starts on the list, against a freshly-read set of connections.
  useEffect(() => {
    if (!shown) return
    setEditing(null)
    setConfirmDelete(null)
    setError(null)
    void useProviders.getState().refresh()
    setPreferred(readPreferredModelState())
  }, [shown])

  const onPreferredChange = (value: string): void => {
    const current = readPreferredModelState()
    if (value === LAST_USED_VALUE) {
      const next = setLastUsedMode(current)
      writePreferredModelState(next)
      setPreferred(next)
      return
    }
    const choice = choices.find((c) => c.value === value)
    if (!choice) return
    const next = setFixedPreference(current, settingsFromChoice(choice))
    writePreferredModelState(next)
    setPreferred(next)
  }

  const remove = async (id: string): Promise<void> => {
    setConfirmDelete(null)
    setError(null)
    try {
      await window.api.providers.remove(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t delete that connection.')
    }
    // Refresh either way: the picker must reflect whatever main actually has.
    await useProviders.getState().refresh()
  }

  return (
    <Dialog open={open && shown} onOpenChange={setOpen}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Default model and provider connections for Praxis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Models &amp; Providers</h2>
            <p className="text-[15px] text-muted-foreground">
              {editing ? (editing === 'new' ? 'Add a connection' : `Edit ${editing.label}`)
                : 'Choose how new conversations start.'}
            </p>
          </div>
          <div className="flex flex-col gap-4 text-[15px]">
            {editing ? (
              <ProviderForm
                // Remount (fresh draft, no leftover key) per connection edited.
                key={editing === 'new' ? 'new' : editing.id}
                connection={editing === 'new' ? undefined : editing}
                onDone={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-2 rounded-xl border bg-background/50 p-4">
                  <label htmlFor="preferred-model" className="font-medium">
                    Default model
                  </label>
                  <select
                    id="preferred-model"
                    aria-label="Default model for new chats"
                    className="h-8 w-full rounded-lg border border-input bg-background px-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={preferredSelectValue(preferred)}
                    onChange={(e) => onPreferredChange(e.target.value)}
                  >
                    <option value={LAST_USED_VALUE}>Last used</option>
                    {providers.map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {group.models.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-[15px] leading-snug text-muted-foreground">
                    {preferred.mode === 'fixed'
                      ? 'New chats use this model. Existing chats keep their own.'
                      : 'New chats follow the last model you picked in any chat.'}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <h3 className="font-semibold">Connections</h3>
                  <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
                    Add connection
                  </Button>
                </div>
                {connections.length === 0 ? (
                  <div className="rounded-xl border bg-background/50 p-4">
                    <p className="font-semibold">Claude and Codex are built in</p>
                    <p className="mt-1 text-muted-foreground">
                      Use your subscription, or add another provider with an API key.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {connections.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-col gap-2 rounded-xl border bg-background/50 p-4"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{c.label}</span>
                              <Badge variant="outline">
                                {c.preset === 'gateway' ? 'AI Gateway' : 'Custom'}
                              </Badge>
                            </div>
                            <span className="truncate text-xs text-muted-foreground">
                              {c.baseUrl} · {c.models.length} model
                              {c.models.length === 1 ? '' : 's'} ·{' '}
                              {c.hasKey ? 'key saved' : 'no key'}
                            </span>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setEditing(c)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDelete(c.id)}
                          >
                            Delete
                          </Button>
                        </div>
                        {confirmDelete === c.id && (
                          <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
                            <span className="flex-1 text-xs text-muted-foreground">
                              Delete “{c.label}”? Its stored API key is removed too, and chats using
                              its models fall back to the default.
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Cancel
                            </Button>
                            <Button size="sm" onClick={() => void remove(c.id)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {error && <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
