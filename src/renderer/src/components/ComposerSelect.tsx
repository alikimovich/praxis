import type { SelectHTMLAttributes } from "react";

/** Keep native menus and full option names, sizing the trigger from its label. */
export function ComposerSelect({
  label,
  children,
  title,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const symbols = Array.from(label);
  const compactLabel = symbols.length > 10 ? `${symbols.slice(0, 10).join("")}...` : label;

  return (
    <span className="relative flex h-6 min-w-0 shrink items-center rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground focus-within:ring-2 focus-within:ring-ring">
      <span aria-hidden="true" className="truncate">{compactLabel}</span>
      <select
        {...props}
        title={title ? `${label} — ${title}` : label}
        className="composer__picker absolute inset-0 h-full w-full min-w-0 cursor-pointer appearance-none truncate border-0 opacity-0"
      >
        {children}
      </select>
    </span>
  );
}
