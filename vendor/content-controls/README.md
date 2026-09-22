# Content controls

Small React components for content editors that an agent surfaces when needed.
Built with TypeScript and Motion. Next.js playground included. Early 0.1 API.
Storybook provides the visual component catalog; recipes standardize agent-generated panels.

An agent composes the controls for a task; the user edits through them; a host
binding decides how to save. No agent SDK or DialKit integration is required.

## Run locally

```sh
bun install
bunx playwright install chromium
bun run check
bun run storybook
```

Open http://127.0.0.1:6006 for the catalog. Start at **Overview**, then explore
**Recipes**, **Layout**, and **Controls**. Stories include editable props, Docs,
validation/disabled/loading states, collections, and narrow panels. Source changes
hot-reload here; use Storybook as the primary component development surface.

Run `bun run dev` for the full Next.js playground:

Open http://127.0.0.1:4317 and choose **Edit content**. Edit the headline, add/remove
projects, move them, change fields, undo/reset, and save. This demo saves only to
browser localStorage. Source-file persistence is the next milestone.

The package builds before the demo starts. After editing library source, rerun
`bun run build`; Next.js watches changes to the playground itself.
The repo pins Bun 1.4.2 as a development tool, so scripts use it without changing
your global installation. Bun 1.3.13 failed loading Next.js 16.3.4's server runtime;
1.4.2 passed the production build. The playground aliases package imports to `dist`
so it exercises the compiled library and declarations rather than bypassing them.

## Agent discovery

After installing the built package in a consumer project, run from that project:

```sh
bun ./node_modules/@alikimovich/content-controls/bin/content-controls.ts init
```

This adds or refreshes a small managed block in `AGENTS.md`, teaching agents the
CLI discovery and recipe workflow. Add `--dry-run` to inspect the exact change.
Existing instructions outside the block and package scripts are preserved.
Restart an existing agent session to load the new instructions. In this library
checkout, use `bun run controls init`. See [setup details](docs/AGENT-API.md#setup).

```sh
bun run controls search "edit projects" --json
bun run controls recipe get project-editor --json
bun run controls manifest --json
bun run controls doctor --json
```

The CLI and `./api` expose the same versioned catalog, recipes, validation, and
stable errors. See [the agent API](docs/AGENT-API.md). Discovery and diagnostics are
read-only; `init` writes only its managed instruction block; MCP and live-host mounting remain follow-up work.

## Use in React or Next.js

For predictable agent-generated editors, use `RecipePanel` + `createRecipeStore`
with a validated JSON recipe. The shared renderer owns layout and spacing. See
[the recipe contract and CLI](docs/RECIPES.md) and the included
[project recipe](examples/projects.recipe.json). The example below shows lower-level
composition for intentionally custom tools.

Import the stylesheet once (in an App Router layout, for example). Compose the
interactive editor in a client component. Own the store above the panel so drafts
survive closing it. Create one store per editor/document, never a server singleton.

```tsx
'use client';

import { useState } from 'react';
import { createStore, Panel, TextField, useContentStore } from '@alikimovich/content-controls';
import '@alikimovich/content-controls/styles.css';

export function Editor({ save }: { save: (value: { title: string }) => Promise<void> }) {
  const [store] = useState(() => createStore({ title: 'My work' }, {
    validate: value => value.title.trim() ? [] : ['Add a title.'],
    save,
  }));
  const { value } = useContentStore(store);
  return <Panel title="Page content" store={store}>
    <TextField label="Title" value={value.title}
      onChange={title => store.update(value => ({ ...value, title }))} />
  </Panel>;
}
```

Pass a stable save handler at store creation. Its promise must resolve only when
the host has persisted the submitted document. A rejected promise shows an error
and keeps the draft. Edits during a save remain dirty against the submitted version.

## Components and entry points

| Export | Purpose |
| --- | --- |
| `Panel` | Nonmodal, animated editor; status, validation, save failure, undo/reset |
| `RecipePanel` | Canonical rendering of versioned panel recipes |
| `TextField` | Controlled text input or multiline textarea |
| `NumberField` | Numeric input; invalid intermediate text stays outside content |
| `ToggleField`, `SelectField` | Native checkbox and select with labels |
| `Action` | Native button with optional primary styling |
| `Collection` | Stable-ID items, custom fields, add/remove, accessible move buttons |
| `createStore` | Drafts, validation, bounded undo, reset, asynchronous save |
| `useContentStore` | React subscription with automatic cleanup |
| `bind`, `updateItem`, `moveItem` | Optional typed binding and collection helpers |
| `./core` | State/helpers with no React, Motion, DOM, or Next.js dependency |
| `./react` | React store hook without the component/Motion imports |
| `./api` | Versioned catalog, deterministic search, recipe lookup, validation, diagnostics |
| `./recipe` | Parser, content validation, and recipe-enforcing store factory |
| `./mount` | `mountControls(container, reactNode)` for non-React hosts |
| `./styles.css` | Opt-in styles; override `--cc-background`, `--cc-foreground`, `--cc-border` |

Fields use `value`/`onChange`; they also accept `description`, `error`, and `disabled`.
`Collection` takes `value`, `onChange`, `itemLabel`, `create`, and a render function
`(item, update) => ReactNode` as children. IDs must be unique and stable. See
[the project editor](demo/app/editor.tsx) for a complete composition.

`Panel` accepts `open`, `onClose`, and `saveLabel`. Escape inside the panel closes
it; focus returns to the opener. The page remains interactive. The host supplies
positioning; the library does not inject a global overlay or a keyboard shortcut.
Motion animates the panel and collection movement, respecting reduced-motion settings.

## How this works with Svelte

React owns only an empty editor container. Svelte continues to render the website.
An editor module authored in TSX exports a normal JavaScript function:

```tsx
import { mountControls } from '@alikimovich/content-controls/mount';

export function mountEditor(container: HTMLElement) {
  return mountControls(container, <YourReactEditor />);
}
```

Call this from Svelte `onMount`, and return `() => editor.unmount()` for cleanup.
Subscribe the Svelte preview to the same store (unsubscribe on cleanup), or connect
both sides through a local file adapter. Keep the dynamic import behind a dev-only
condition such as `import.meta.env.DEV`. A Svelte bundler must also compile the TSX
editor module with the React JSX runtime, or consume its prebuilt JavaScript.

Next.js is not embedded in Svelte; only the React editor runtime is. A plain HTML
mount/unmount interaction test proves this boundary. A real Svelte-site integration
is planned, not yet shipped.

## Boundaries

- React and React DOM are peer dependencies; Motion is the single direct runtime
  dependency (with its own transitive dependencies). Next.js is playground-only.
- Content is finite, acyclic JSON with plain objects/arrays; no dates/functions.
  Snapshots are isolated copies. Preserve unknown fields in updates with object spread.
- `subscribe` notifies on changes, not immediately. Read `getSnapshot()` for initial
  state. Validation callbacks and subscribers should be pure and not throw.
- Undo records document changes up to `historyLimit` (default 100); no redo or
  typing coalescing yet. Reset restores the most recently saved baseline and is undoable.
- The validation CLI is read-only. No site-content writes, auth, uploads, rich text, automatic schema inference, or publishing
  service yet. The package is on GitHub, not published to the npm registry.
- The default text palette was checked with APCA: dark text on white at 16/400,
  and white primary-button text on dark at 16/600 pass. Custom themes need new checks.

## Development

[Build plan](docs/PLAN.md) · [Agent workflow and sources](docs/DEVELOPMENT.md) ·
[Recipe contract](docs/RECIPES.md) · [Repository instructions](AGENTS.md).
CI runs the same `bun run check` as local work.
The repository includes task and PR templates for focused, reviewable changes.

No open-source license has been selected; package metadata is `UNLICENSED`.
