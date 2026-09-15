import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
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
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
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
