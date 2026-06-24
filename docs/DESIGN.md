# DESIGN.md — the dsgn convention for editable repos

This spec describes how a repo opts into dsgn's **design-system-aware editing**
(v2). It lives here as the canonical reference; in practice each editable repo
adopts the convention (a stamping plugin in dev, and — later — a `DESIGN.md` of
its own describing its components/tokens).

The goal: when someone clicks an element in the live preview, dsgn knows **which
source location** owns it, so the agent edits the right file instead of guessing
from a CSS selector.

## 1. Source stamping — `data-dsgn-source`

dsgn's select overlay (the preload injected into the preview `WebContentsView`)
reads a single attribute off the clicked element, walking up to the nearest
ancestor that has it:

```html
<h1 data-dsgn-source="src/components/Hero.tsx:7">Welcome</h1>
```

- **Value format:** `repo-relative/path:line` (column optional: `path:line:col`).
- **Resolution:** nearest-ancestor wins, so a click on a deep text node still
  resolves to the component that rendered it.
- **Fallback:** if no stamp is found, dsgn falls back to a best-effort CSS
  selector path — still useful, just less precise. Nothing breaks; stamping is
  purely additive.

This attribute is **dev-only**. Never ship it to production — strip it from
production builds (the reference plugin below only runs when
`NODE_ENV !== 'production'`).

## 2. Reference: stamp it with a Vite + Babel plugin

For a React + Vite repo, add a tiny Babel plugin that stamps every JSX element
with its source location. Drop this at `dsgn-source-plugin.cjs`:

```js
// Stamps data-dsgn-source="<relative path>:<line>" on JSX elements (dev only).
module.exports = function dsgnSource({ types: t }) {
  return {
    name: 'dsgn-source',
    visitor: {
      JSXOpeningElement(path, state) {
        const loc = path.node.loc
        if (!loc) return
        const already = path.node.attributes.some(
          (a) => a.name && a.name.name === 'data-dsgn-source'
        )
        if (already) return
        const root = state.file.opts.root || process.cwd()
        const file = (state.file.opts.filename || '').replace(root + '/', '')
        // Include the column so dsgn can disambiguate multiple elements written
        // on the same source line (e.g. a <Badge/> inside an <li> on one line).
        path.node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier('data-dsgn-source'),
            t.stringLiteral(`${file}:${loc.start.line}:${loc.start.column}`)
          )
        )
      }
    }
  }
}
```

Wire it into `vite.config.ts` so it only runs in dev:

```ts
import react from '@vitejs/plugin-react'

const dev = process.env.NODE_ENV !== 'production'

export default defineConfig({
  plugins: [
    react({ babel: { plugins: dev ? ['./dsgn-source-plugin.cjs'] : [] } })
  ]
})
```

(Other frameworks: any transform that can see JSX/template source locations
works — the only contract dsgn cares about is the `data-dsgn-source` attribute
on the rendered DOM.)

## 3. What dsgn captures on select

On click, the overlay sends the chat panel a `SelectedElement`
(`src/shared/api.ts`):

| field | meaning |
| --- | --- |
| `tag`, `id`, `classes` | element identity |
| `selector` | best-effort short CSS path (fallback locator) |
| `source` | the `data-dsgn-source` stamp, or `null` |
| `text` | trimmed text content (≤120 chars) |
| `rect` | bounding box in the preview |
| `styles` | a curated set of computed styles (color, font-size, padding, …) |

The inspector surfaces this, and "Ask dsgn to change this…" seeds the composer
with a reference the agent can act on — anchored to `source` when present.

## 4. Prop editing (built)

Selecting an element and choosing **Edit props** turns "edit the file" into
"edit the prop":

- dsgn parses the source file at the `data-dsgn-source` line and runs
  **`react-docgen`** on it to derive the component's prop schema (types, enums,
  required, descriptions), merged with the element's current attribute values.
- The inspector renders typed controls. Edits apply the **hybrid** way: a simple
  literal (string / number / boolean / enum) is written straight into the source
  (instant hot-reload); anything non-literal is handed to the chat agent.

The schema resolves whether the component is defined in the same file or
**imported** from another (dsgn follows the relative import to the definition).
Still ahead: design-token manifests (below).

### Future — token manifests

A per-repo manifest (forking open-design's 9-section schema, extended with
prop/token tables) would let the editor surface design tokens and richer prop
metadata beyond what `react-docgen` infers.
