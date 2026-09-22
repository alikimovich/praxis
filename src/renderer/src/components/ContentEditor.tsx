import { RecipePanel } from '@alikimovich/content-controls'
import { createRecipeStore } from '@alikimovich/content-controls/recipe'
import { useEffect, useRef, useState } from 'react'
import type { ContentControlDocument, ContentControlPanel } from '../../../shared/api'
import '@alikimovich/content-controls/styles.css'
import './content-editor.css'

function LoadedEditor({
  root,
  document
}: {
  root: string
  document: ContentControlDocument
}): React.JSX.Element {
  const revision = useRef(document.revision)
  const [store] = useState(() =>
    createRecipeStore(document.panel.recipe, document.value, {
      save: async (value) => {
        const saved = await window.api.contentControls.save(
          root,
          document.panel.id,
          revision.current,
          value
        )
        revision.current = saved.revision
      }
    })
  )
  return (
    <RecipePanel
      recipe={document.panel.recipe}
      store={store}
      autoFocus={false}
      saveLabel="Save to source"
    />
  )
}

export default function ContentEditor({
  root,
  panel,
  onRemove
}: {
  root: string
  panel: ContentControlPanel
  onRemove: () => void
}): React.JSX.Element {
  const [document, setDocument] = useState<ContentControlDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload intentionally restarts the source read.
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async (): Promise<void> => {
      try {
        const next = await window.api.contentControls.get(root, panel.id)
        if (!disposed) {
          setDocument(next)
          setError(null)
        }
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : 'Content is not available yet.')
          timer = setTimeout(() => void load(), 1500)
        }
      }
    }
    void load()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [root, panel.id, reload])
  return (
    <section className="praxis-content-editor" aria-label={panel.recipe.title}>
      {document ? (
        <LoadedEditor key={`${reload}:${document.revision}`} root={root} document={document} />
      ) : (
        <p role="status">Waiting for {panel.file} to land…</p>
      )}
      {document && JSON.stringify(document.panel.recipe) !== JSON.stringify(panel.recipe) && (
        <p role="status" className="px-3 py-2 text-sm">
          Chat updated these controls. Reload from source to use the new editor; your draft is still
          here.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => {
            setDocument(null)
            setReload((v) => v + 1)
          }}
        >
          Reload from source (discard draft)
        </button>
        <button type="button" onClick={onRemove}>
          Remove editor
        </button>
      </div>
    </section>
  )
}
