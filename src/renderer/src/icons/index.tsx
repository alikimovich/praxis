import { forwardRef, type SVGProps } from 'react'
import { iconPaths } from './data'
import './icons.css'

type IconName = keyof typeof iconPaths
type IconProps = SVGProps<SVGSVGElement> & { size?: number; open?: boolean }

function createIcon(name: IconName, family?: 'folder' | 'sidebar', defaultOpen = false) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function PraxisIcon(
    { size = 24, open = defaultOpen, className = '', children, ...props },
    ref
  ) {
    const endpoint =
      family === 'folder'
        ? open
          ? 'FolderOpen'
          : 'Folder'
        : family === 'sidebar'
          ? open
            ? 'PanelLeftOpen'
            : 'PanelLeftClosed'
          : name
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        {...props}
        className={`praxis-icon${family ? ` praxis-icon--${family}` : ''} ${className}`}
        data-icon={name}
        data-state={family ? (open ? 'open' : 'closed') : undefined}
      >
        {iconPaths[endpoint].map((path, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed path slots must retain DOM identity across morph endpoints.
          <path key={i} {...path} />
        ))}
        {children}
      </svg>
    )
  })
  Icon.displayName = name
  return Icon
}

export const ArrowDown = createIcon('ArrowDown')
export const ArrowUp = createIcon('ArrowUp')
export const Brain = createIcon('Brain')
export const Check = createIcon('Check')
export const ChevronDown = createIcon('ChevronDown')
export const ChevronLeft = createIcon('ChevronLeft')
export const ChevronRight = createIcon('ChevronRight')
export const Circle = createIcon('Circle')
export const Code2 = createIcon('Code2')
export const Copy = createIcon('Copy')
export const Ellipsis = createIcon('Ellipsis')
export const FilePlus = createIcon('FilePlus')
export const FileText = createIcon('FileText')
export const Folder = createIcon('Folder', 'folder')
export const FolderOpen = createIcon('FolderOpen', 'folder', true)
export const Layers = createIcon('Layers')
export const Loader2 = createIcon('Loader2')
export const Maximize2 = createIcon('Maximize2')
export const MessageSquare = createIcon('MessageSquare')
export const Minimize2 = createIcon('Minimize2')
export const MonitorSmartphone = createIcon('MonitorSmartphone')
export const MousePointer2 = createIcon('MousePointer2')
export const PanelLeft = createIcon('PanelLeftOpen', 'sidebar', true)
export const Pencil = createIcon('Pencil')
export const Play = createIcon('Play')
export const Plus = createIcon('Plus')
export const Save = createIcon('Save')
export const Search = createIcon('Search')
export const SlidersHorizontal = createIcon('SlidersHorizontal')
export const Sparkles = createIcon('Sparkles')
export const SquareArrowOutUpRight = createIcon('SquareArrowOutUpRight')
export const SquarePen = createIcon('SquarePen')
export const Trash2 = createIcon('Trash2')
export const Undo2 = createIcon('Undo2')
export const X = createIcon('X')
export {
  ArrowDown as ArrowDownIcon,
  Check as CheckIcon,
  ChevronRight as ChevronRightIcon,
  Circle as CircleIcon,
  Search as SearchIcon,
  X as XIcon
}
