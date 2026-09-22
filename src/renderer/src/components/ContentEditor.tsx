import { RecipePanel } from '@alikimovich/content-controls'
import { createRecipeStore } from '@alikimovich/content-controls/recipe'
import { useEffect, useRef, useState } from 'react'
import type { ContentControlDocument, ContentControlPanel } from '../../../shared/api'
import { projectKey } from '../../../shared/projectKey'
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
    let attempts = 0
    let loaded = false
    let loading = false
    const load = async (): Promise<void> => {
      if (disposed || loaded || loading) return
      loading = true
      clearTimeout(timer)
      try {
        const next = await window.api.contentControls.get(root, panel.id)
        if (!disposed) {
          if (next) {
            loaded = true
            setDocument(next)
            setError(null)
          } else if (++attempts < 20) {
            timer = setTimeout(() => void load(), 1500)
          } else {
            setError(
              'The content file is not in the live checkout. Finish or apply the chat changes, then reload. You can remove an unused editor.'
            )
          }
        }
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : 'Content is not available yet.')
        }
      } finally {
        loading = false
      }
    }
    // Landing happens after the provider's done event. Never replace a loaded draft.
    const key = projectKey(root)
    const unsubscribe = window.api.agent.onEvent((event) => {
      if (event.projectKey !== key && !event.projectKey?.startsWith(`${key}#`)) return
      if (
        event.type === 'landing-finished' ||
        event.type === 'spawn-finished' ||
        event.type === 'isolation' ||
        event.type === 'done'
      )
        void load()
    })
    void load()
    return () => {
      disposed = true
      unsubscribe()
      clearTimeout(timer)
    }
  }, [root, panel.id, reload])
  return (
    <section className="praxis-content-editor" aria-label={panel.recipe.title}>
      {document ? (
        <LoadedEditor key={`${reload}:${document.revision}`} root={root} document={document} />
      ) : (
        <p role="status">
          {error ? `Content unavailable: ${panel.file}` : `Waiting for ${panel.file} to land…`}
        </p>
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
