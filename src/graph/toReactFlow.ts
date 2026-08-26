import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { RoleId, WorkflowDoc } from '../data/schema'
import type { DerivedPath, LensSelection } from './derive'
import type { StateNodeData } from '../components/StateNode'
import type { TransitionEdgeData } from '../components/TransitionEdge'

/**
 * Marker colours have to be literal at the SVG level — an SVG <marker> can't
 * inherit the referring path's currentColor, so React Flow needs a concrete
 * value per role. These mirror the --role-* custom properties in theme.css;
 * both ultimately come from the same design-system tokens, read here at
 * runtime so there is still exactly one source of truth.
 */
function roleColor(role: RoleId): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--role-${role}`)
    .trim()
}

export interface LensView {
  nodes: Node<StateNodeData>[]
  edges: Edge<TransitionEdgeData>[]
}

/**
 * Project the workflow document into React Flow nodes and edges, applying
 * the lens as `data-lens` attributes rather than by removing elements.
 *
 * Dimming rather than filtering is deliberate: the states an article *can't*
 * reach are still part of the workflow, and seeing them greyed tells you more
 * than seeing them vanish.
 */
export function toReactFlow(
  doc: WorkflowDoc,
  path: DerivedPath,
  sel: LensSelection,
): LensView {
  const hasViewer = sel.viewerRoles.length > 0
  const hide = sel.hideUnreachable && !path.unfiltered

  // Which highlighted role can act from each state. Keyed by state so the
  // "you can act here" ring is drawn in the acting role's colour — using the
  // state's own accent would imply, say, an FFE can act somewhere only a
  // copyeditor can.
  const actionableStates = new Map<string, RoleId>()
  if (hasViewer) {
    for (const t of doc.transitions) {
      if (path.viewerTransitions.has(t.id) && !actionableStates.has(t.from)) {
        actionableStates.set(t.from, t.role)
      }
    }
  }

  const nodes: Node<StateNodeData>[] = doc.states.map((s) => {
    const reachable = path.reachableStates.has(s.id)
    return {
      id: s.id,
      type: 'stateNode',
      position: s.position,
      data: {
        title: s.title,
        accent: s.accent,
        border: s.border,
        badges: s.badges,
        actors: s.actors,
        actionableRole: actionableStates.get(s.id) ?? null,
      },
      hidden: hide && !reachable,
      className: reachable ? undefined : 'lens-dim',
    }
  })

  const edges: Edge<TransitionEdgeData>[] = doc.transitions.map((t) => {
    const active = path.activeTransitions.has(t.id)
    const actionable = path.viewerTransitions.has(t.id)
    // With a viewer role chosen, transitions other roles perform stay
    // visible but recede — they're context, not the answer to "what can I do".
    // Hiding is tied to reachability only. An active transition another role
    // performs stays visible even when a viewer role is selected — it is part
    // of this article's journey, just not your part of it.
    const lens = !active ? 'lens-dim' : hasViewer && !actionable ? 'lens-mute' : undefined

    return {
      id: t.id,
      source: t.from,
      target: t.to,
      sourceHandle: t.sourceHandle,
      targetHandle: t.targetHandle,
      type: 'transition',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: roleColor(t.role),
      },
      data: {
        role: t.role,
        style: t.style,
        label: t.label,
        actionable,
        gated: Boolean(t.gate),
      },
      hidden: hide && !active,
      className: lens,
    }
  })

  return { nodes, edges }
}
