import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { openWithPreviewFreeze, usePreviewFreeze } from '../store'

export default function ModelSwitchDialog({
  open,
  onCancel,
  onConfirm
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) return
    let current = true
    openWithPreviewFreeze(() => {
      if (current) setShown(true)
    })
    return () => {
      current = false
      setShown(false)
      usePreviewFreeze.getState().setFrozen(false)
    }
  }, [open])
  return (
    <Dialog
      open={open && shown}
      onOpenChange={(value) => {
        if (!value) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch model and include this conversation?</DialogTitle>
          <DialogDescription>
            The selected model will receive this chat’s recorded conversation with your next
            message. Adding that history consumes extra input tokens and may increase cost or use
            more of your plan’s allowance. Previous image attachments are not included.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Switch model</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
