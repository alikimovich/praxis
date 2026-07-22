import { FileTree } from '@pierre/trees'
import { useEffect, useRef } from 'react'
import { useCodeDrawer } from '../store'

/**
 * The pop-out editor's left sidebar: a `@pierre/trees` file tree of the project.
 * Clicking a file opens it in the code drawer (shared `useCodeDrawer` store), so
 * Cmd+click navigation and back/forward keep working. The vanilla (non-React)
 * entry is used deliberately — it renders into its own shadow root via Preact and
 * is decoupled from the renderer's React 18, sidestepping the package's React 19
 * peer requirement.
 *
 * The tree keys on plain repo-relative paths; the drawer's source is `path:line`,
 * so we bridge the two by stripping / appending the line suffix.
 */

/** Drop the ":line[:col]" suffix from a drawer source to get its file path. */
function sourceToPath(source: string | null): string | null {
  if (!source) return null
  const m = /^(.*?):\d+(?::\d+)?$/.exec(source)
  return m ? m[1] : source
}

export default function FileTreePanel({ root }: { root: string }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const treeRef = useRef<FileTree | null>(null)
  // Selected paths that are files (not synthesized directories) — the set the
  // tree was built from, used to ignore directory clicks in onSelectionChange.
  const filesRef = useRef<Set<string>>(new Set())
  const source = useCodeDrawer((s) => s.source)

  // Build the tree once per project root.
  useEffect(() => {
    let disposed = false
    let tree: FileTree | null = null

    void window.api.source.tree(root).then((paths) => {
      if (disposed || !hostRef.current) return
      filesRef.current = new Set(paths)
      tree = new FileTree({
        paths,
        // Fully expand small projects; keep large ones tidy (one level deep).
        initialExpansion: paths.length > 300 ? 1 : 'open',
        flattenEmptyDirectories: true,
        search: true,
        onSelectionChange: (selected) => {
          const path = selected[selected.length - 1]
          // Only files open; directory selections and the echo of our own
          // programmatic select (same file already shown) are ignored.
          if (!path || !filesRef.current.has(path)) return
          if (path === sourceToPath(useCodeDrawer.getState().source)) return
          useCodeDrawer.getState().open(`${path}:1`)
        }
      })
      tree.render({ containerWrapper: hostRef.current })
      treeRef.current = tree
      // Reflect whatever file is already open in the drawer.
      const cur = sourceToPath(useCodeDrawer.getState().source)
      if (cur && filesRef.current.has(cur)) {
        tree.getItem(cur)?.select()
        tree.scrollToPath(cur, { focus: false })
      }
    })

    return () => {
      disposed = true
      treeRef.current = null
      tree?.cleanUp()
    }
  }, [root])

  // Mirror drawer → tree selection when the open file changes elsewhere (Cmd+click
  // navigation, back/forward). The onSelectionChange guard above breaks the loop.
  useEffect(() => {
    const tree = treeRef.current
    const path = sourceToPath(source)
    if (!tree || !path || !filesRef.current.has(path)) return
    if (tree.getSelectedPaths().includes(path)) return
    tree.getItem(path)?.select()
    tree.scrollToPath(path, { focus: false })
  }, [source])

  return (
    <div
      ref={hostRef}
      className="filetree h-full w-full overflow-hidden text-[12px]"
      style={
        {
          color: 'var(--foreground)',
          '--trees-fg-override': 'var(--foreground)',
          '--trees-border-color-override': 'var(--border)',
          '--trees-selected-bg-override': 'color-mix(in srgb, var(--foreground) 12%, transparent)'
        } as React.CSSProperties
      }
    />
  )
}
