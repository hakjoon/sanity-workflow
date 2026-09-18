import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import type { RoleId } from '../data/schema'

export interface TransitionEdgeData extends Record<string, unknown> {
  role: RoleId
  style: 'solid' | 'dashed'
  label: string
  /** Gated by the self-publish matrix rather than by tier alone. */
  gated: boolean
  /** Parallel track, to keep two routes sharing a corridor off each other. */
  lane: number
  /** Nudge along the node's edge, to keep both ends off a handle's centre. */
  sourceShift: number
  targetShift: number
  /**
   * Lens state, mirrored from the edge's className. EdgeLabelRenderer portals
   * labels into their own layer outside the edge <g>, so the class on the edge
   * never reaches them — without this the labels stay crisp over a dimmed
   * diagram and read as the most prominent thing on screen.
   */
  lens: 'dim' | 'mute' | null
}

export type TransitionEdgeType = Edge<TransitionEdgeData, 'transition'>

/** React Flow's own default offset, kept as the lane-0 route. */
const LANE_BASE = 20
/** Enough to read as two lines with a label chip between them. */
const LANE_GAP = 22

/**
 * Slide an endpoint along the node's edge. A top or bottom handle runs
 * horizontally, a left or right one vertically, so which coordinate the shift
 * applies to follows from the side the handle is on.
 */
function slide(x: number, y: number, side: Position, by: number): [number, number] {
  if (!by) return [x, y]
  return side === Position.Top || side === Position.Bottom ? [x + by, y] : [x, y + by]
}

/**
 * Orthogonal transition edge.
 *
 * `borderRadius: 0` turns React Flow's smoothstep into hard 90° corners,
 * matching the design's hand-drawn routes. The label is rendered as HTML
 * rather than SVG <text> so it can carry a solid background chip — the
 * equivalent of the design's paint-order stroke halo, which has no HTML
 * analogue but reads the same way where a label crosses a line.
 */
export function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<TransitionEdgeType>) {
  const [sx, sy] = slide(sourceX, sourceY, sourcePosition, data?.sourceShift ?? 0)
  const [tx, ty] = slide(targetX, targetY, targetPosition, data?.targetShift ?? 0)

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
    // How far the route runs straight out of the handle before it turns, so a
    // lane shifts the long leg clear of anything sharing the same corridor.
    offset: LANE_BASE + (data?.lane ?? 0) * LANE_GAP,
  })

  const role = data?.role ?? 'system'

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={`transition-edge role-${role}`}
        style={{
          stroke: 'var(--role)',
          strokeWidth: 2,
          strokeDasharray: data?.style === 'dashed' ? '5 4' : undefined,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label role-${role}`}
            data-gated={data.gated || undefined}
            data-lens={data.lens ?? undefined}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.gated && <span className="edge-label__gate" aria-hidden="true">◆</span>}
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
