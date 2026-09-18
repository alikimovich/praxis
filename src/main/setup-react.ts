export const REACT_HELPER_CONTENT = `// Added by Praxis (.praxis/). Stamps data-praxis-source="path:line:col" on JSX elements
// so Praxis can map a clicked element to its source. Wire into the React Babel
// plugins for DEVELOPMENT ONLY; it also self-disables in production builds.
module.exports = function praxisSource({ types: t }) {
  if (process.env.NODE_ENV === 'production') return { name: 'praxis-source', visitor: {} }
  const path = require('path')
  return {
    name: 'praxis-source',
    visitor: {
      JSXOpeningElement(p, state) {
        const loc = p.node.loc
        if (!loc) return
        if (p.node.attributes.some((a) => a.name && a.name.name === 'data-praxis-source')) return
        const root = state.file.opts.root || process.cwd()
        const file = path.relative(root, state.file.opts.filename || '')
        const where = file + ':' + loc.start.line + ':' + loc.start.column
        // Host stamp: APPEND so the innermost host's own location wins (a forwarded
        // {...props} value is overwritten by this).
        p.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('data-praxis-source'), t.stringLiteral(where)))
        // v8 F3a — component-instance stamp: on COMPONENT tags (Capitalized or a
        // member like Foo.Bar), UNSHIFT (insert first) so a child's {...props}
        // spread overwrites it with the OUTER authored instance — the instance call
        // site wins over the host, letting the inspector edit per-instance props.
        const name = p.node.name
        // A component tag is any non-host (React's own test: host iff /^[a-z]/) — a
        // member like Foo.Bar, or a non-lowercase identifier. Skip Fragment (it
        // rejects unknown props) to avoid a dev-console warning.
        const isHost = name && name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name)
        const isFragment =
          name &&
          ((name.type === 'JSXIdentifier' && name.name === 'Fragment') ||
            (name.type === 'JSXMemberExpression' &&
              name.property &&
              name.property.name === 'Fragment'))
        const isComponent =
          !isHost &&
          !isFragment &&
          name &&
          (name.type === 'JSXMemberExpression' || name.type === 'JSXIdentifier')
        if (isComponent) {
          p.node.attributes.unshift(
            t.jsxAttribute(t.jsxIdentifier('data-praxis-component-source'), t.stringLiteral(where))
          )
        }
      }
    }
  }
}
`
