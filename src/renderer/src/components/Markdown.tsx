import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'

// highlight.js has no Svelte/Vue/Astro grammars, so fences tagged with them
// rendered completely unhighlighted. Their templates are close enough to HTML
// that the xml grammar reads well — script/style blocks included.
const rehypePlugins: PluggableList = [
  [rehypeHighlight, { aliases: { xml: ['svelte', 'vue', 'astro'] } }]
]

/** Renders streamed assistant text as GitHub-flavored markdown with code highlighting. */
export default function Markdown({ children }: { children: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
