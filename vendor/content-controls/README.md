# Content controls: native Praxis subset

This vendored distribution exposes only `./recipe` and `./api`, used for content
validation, recipe stores and agent discovery. SwiftUI renders the editors.

The upstream React components, DOM mounting, CSS, Motion dependency and React
peers are omitted. `core.d.ts` and `agent-init.d.ts` support the retained public
types; the JavaScript entrypoints are self-contained.

See PROVENANCE.md for the upstream revision and refresh instructions.
