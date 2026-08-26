import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { BADGES, type Actor, type BadgeId, type RoleId } from '../data/schema'

export interface StateNodeData extends Record<string, unknown> {
  title: string
  accent: RoleId
  border: 'solid' | 'dashed'
  badges: BadgeId[]
  actors: Actor[]
  /** The highlighted role that can act from this state, if any. */
  actionableRole: RoleId | null
}

export type StateNodeType = Node<StateNodeData, 'stateNode'>

const HANDLES: Array<{ id: 't' | 'r' | 'b' | 'l'; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
]

/**
 * Join actor fragments with a middot, unless the fragment already ends in its
 * own punctuation. Some lines read "SWUser articles only — " and then hand off
 * to the next role; inserting a middot there would give "only — · FFEs claim".
 */
function separatorAfter(actors: Actor[], i: number): string {
  if (i >= actors.length - 1) return ''
  return /[—·:,-]\s*$/.test(actors[i].text) ? ' ' : ' · '
}

/**
 * A workflow state, styled as the design's card: coloured left rule for the
 * owning role, badge row, title, and the multi-coloured actor line.
 *
 * Four handles per side, each doubled as source and target, so a transition
 * can enter and leave from any edge of the card and the choice round-trips
 * through the JSON document.
 */
export function StateNode({ data, selected }: NodeProps<StateNodeType>) {
  return (
    <div
      className={`state-node role-${data.accent}`}
      data-border={data.border}
      data-selected={selected || undefined}
      data-actionable={data.actionableRole ?? undefined}
    >
      {HANDLES.map((h) => (
        <div key={h.id}>
          <Handle type="target" id={h.id} position={h.position} />
          <Handle type="source" id={h.id} position={h.position} />
        </div>
      ))}

      {data.badges.length > 0 && (
        <div className="state-node__badges">
          {data.badges.map((b) => (
            <span key={b} className="badge" data-variant={b}>
              {BADGES[b]}
            </span>
          ))}
        </div>
      )}

      <div className="state-node__title">{data.title}</div>

      <div className="state-node__actors">
        {data.actors.map((a, i) => (
          <span key={i} className={a.role ? `role-${a.role}` : undefined}>
            {a.text}
            {separatorAfter(data.actors, i)}
          </span>
        ))}
      </div>
    </div>
  )
}
