import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export type ProjectSetup = 'react' | 'next' | 'svelte' | 'custom'

export default function NewProjectDialog({
  open,
  onClose,
  onCreate
}: {
  open: boolean
  onClose: () => void
  onCreate: (setup: ProjectSetup, details: string) => void
}): React.JSX.Element {
  const [setup, setSetup] = useState<ProjectSetup>('custom')
  const [details, setDetails] = useState('')
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How should we start?</DialogTitle>
          <DialogDescription>
            Choose a starter, or work out the environment together in chat.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-3">
          <legend className="sr-only">Project environment</legend>
          {(
            [
              [
                'custom',
                'Talk it through',
                'Start empty. Praxis asks about your project and setup first.'
              ],
              [
                'react',
                'Use the defaults',
                'React, TypeScript, and Vite. Installed and ready to preview.'
              ],
              ['next', 'Next.js', 'Start empty and configure Next.js together in chat.'],
              ['svelte', 'Svelte', 'Start empty and choose Svelte or SvelteKit in chat.']
            ] as const
          ).map(([value, label, description]) => (
            <label key={value} className="flex items-start gap-3 rounded-lg border p-3">
              <input
                type="radio"
                name="project-setup"
                value={value}
                checked={setup === value}
                onChange={() => setSetup(value)}
                className="mt-1"
              />
              <span className="grid gap-1">
                <span>{label}</span>
                <span className="text-sm">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label htmlFor="new-project-details" className="grid gap-2">
          Anything already decided? <span className="sr-only">Optional setup details</span>
          <Textarea
            id="new-project-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="What you're building, package manager, existing tools… (optional)"
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCreate(setup, details.trim())}>Choose folder…</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
