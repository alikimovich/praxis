import { useEffect, useState } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { openWithPreviewFreeze, usePreviewFreeze } from '../store'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem,
  DropdownMenuSeparator
} from './ui/dropdown-menu'

type Option = { value: string; label: string }

/** Compact toolbar trigger with full, keyboard-accessible menu labels. */
export function ComposerSelect({
  label, value, options, onValueChange, action, title, disabled, ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange'> & {
  label: string
  value: string
  options: Option[]
  onValueChange: (value: string) => void
  action?: { label: string; onSelect: () => void }
}) {
  const [requested, setRequested] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (disabled) {
      setRequested(false)
      return
    }
    if (!requested) return
    let active = true
    openWithPreviewFreeze(() => { if (active) setOpen(true) })
    return () => {
      active = false
      setOpen(false)
      usePreviewFreeze.getState().setFrozen(false)
    }
  }, [requested, disabled])
  const symbols = Array.from(label)
  const compactLabel = symbols.length > 10 ? `${symbols.slice(0, 10).join('')}...` : label

  return (
    <DropdownMenu modal={false} open={open && !disabled} onOpenChange={setRequested}>
      <DropdownMenuTrigger asChild>
        <button
          {...props}
          type="button"
          disabled={disabled}
          title={title ? `${label} — ${title}` : label}
          data-value={value}
          data-label={label}
          className="composer__picker h-6 min-w-0 shrink truncate rounded-md px-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <span>{compactLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" collisionPadding={8} className="max-w-[min(24rem,calc(100vw-16px))]">
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} data-value={option.value} className="break-words">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {action && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={action.onSelect}>{action.label}</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
