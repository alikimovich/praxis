import type { ControlsOpenRequest, LayerNode } from '../../../shared/api'

/** Prefer exact stamps. A file match is safe only for one outermost rendered object. */
export function controlTarget(nodes: LayerNode[], request: ControlsOpenRequest): LayerNode | null {
  const matches = nodes.filter((node) =>
    request.source
      ? node.source === request.source || node.componentSource === request.source
      : [node.source, node.componentSource].some(
          (s) => s?.replace(/:\d+(?::\d+)?$/, '') === request.file
        )
  )
  const roots = matches.filter(
    (node) =>
      !matches.some(
        (other) =>
          other !== node &&
          other.path.length < node.path.length &&
          other.path.every((n, i) => node.path[i] === n)
      )
  )
  return roots.length === 1 ? roots[0] : null
}
