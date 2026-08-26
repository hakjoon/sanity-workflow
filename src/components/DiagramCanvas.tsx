import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { WorkflowDoc } from '../data/schema'
import type { DerivedPath, LensSelection } from '../graph/derive'
import { toReactFlow } from '../graph/toReactFlow'
import { StateNode, type StateNodeData } from './StateNode'
import { TransitionEdge } from './TransitionEdge'
import type { Selected } from './Inspector'

const nodeTypes = { stateNode: StateNode }
const edgeTypes = { transition: TransitionEdge }

interface Props {
  doc: WorkflowDoc
  path: DerivedPath
  selection: LensSelection
  selected: Selected
  onUpdate: (fn: (draft: WorkflowDoc) => WorkflowDoc) => void
  onSelect: (selected: Selected) => void
}

export function DiagramCanvas({ doc, path, selection, selected, onUpdate, onSelect }: Props) {
  const { nodes, edges } = useMemo(
    () => toReactFlow(doc, path, selection),
    [doc, path, selection],
  )

  // Node positions live in the document, so drags are written straight back
  // rather than kept in a parallel React Flow state that could drift.
  const dragging = useRef(false)

  const onNodesChange = useCallback(
    (changes: NodeChange<import('@xyflow/react').Node<StateNodeData>>[]) => {
      const positional = changes.filter(
        (c): c is Extract<typeof c, { type: 'position' }> => c.type === 'position',
      )
      if (positional.length === 0) return

      if (positional.some((c) => c.dragging)) dragging.current = true
      const next = applyNodeChanges(changes, nodes)

      onUpdate((d) => ({
        ...d,
        states: d.states.map((s) => {
          const n = next.find((x) => x.id === s.id)
          return n ? { ...s, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } } : s
        }),
      }))
    },
    [nodes, onUpdate],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return
      const id = `t-${c.source}-${c.target}-${Date.now().toString(36)}`
      onUpdate((d) => ({
        ...d,
        transitions: [
          ...d.transitions,
          {
            id,
            from: c.source,
            to: c.target,
            sourceHandle: (c.sourceHandle ?? 'r') as 't' | 'r' | 'b' | 'l',
            targetHandle: (c.targetHandle ?? 'l') as 't' | 'r' | 'b' | 'l',
            role: 'writer' as const,
            style: 'solid' as const,
            label: 'new transition',
            appliesTo: d.tiers.map((t) => t.id),
          },
        ],
      }))
      onSelect({ kind: 'transition', id })
    },
    [onUpdate, onSelect],
  )

  const onSelectionChange = useCallback(
    ({ nodes: sn, edges: se }: OnSelectionChangeParams) => {
      if (sn.length === 1) onSelect({ kind: 'state', id: sn[0].id })
      else if (se.length === 1) onSelect({ kind: 'transition', id: se[0].id })
      else if (sn.length === 0 && se.length === 0) onSelect(null)
    },
    [onSelect],
  )

  // Keep React Flow's selection visuals in step with the inspector.
  const styledNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: selected?.kind === 'state' && selected.id === n.id })),
    [nodes, selected],
  )
  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        selected: selected?.kind === 'transition' && selected.id === e.id,
      })),
    [edges, selected],
  )

  useEffect(() => {
    dragging.current = false
  }, [doc])

  return (
    <div className="canvas">
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={1.6}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
