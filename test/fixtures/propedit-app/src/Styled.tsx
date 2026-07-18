// v10 Styles-tab fixtures: a Tailwind-utility-classed element (the S1
// class-rewrite target) and an inline-styled element (the S2 style-object
// merge target). index.html mirrors both with matching data-dsgn-source stamps.
export function TwCard(): JSX.Element {
  return <div className="p-4 rounded-md">Padded box</div>
}

export function InlineCard(): JSX.Element {
  return <div style={{ padding: '8px' }}>Inline padded</div>
}
