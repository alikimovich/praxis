Vendored build from /Users/panda/dev/content-controls, commit 5fb478d6a2353f214b417d1894e7f19072049af5.
Refresh dist and package metadata together from that project; no sibling checkout is required at runtime.

Praxis keeps only the self-contained recipe/API JavaScript entrypoints and their
transitive type declarations. When refreshing, preserve this native-only subset
and its package exports; do not restore web UI, Motion or React peer dependencies.
