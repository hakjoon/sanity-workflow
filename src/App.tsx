import { useCallback, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'

import { useWorkflowStore } from './data/useWorkflowStore'
import { derivePath, type LensSelection } from './graph/derive'
import { DiagramCanvas } from './components/DiagramCanvas'
import { Inspector, type Selected } from './components/Inspector'
import { EMPTY_LENS, LensBar } from './components/LensBar'
import { Legend } from './components/Legend'
import { NotesPanel } from './components/NotesPanel'
import { ReviewPathPanel } from './components/ReviewPathPanel'
import { SelfPublishMatrix } from './components/SelfPublishMatrix'
import type { WorkflowDoc } from './data/schema'

export default function App() {
  const store = useWorkflowStore()
  const { doc, update } = store

  const [lens, setLens] = useState<LensSelection>(EMPTY_LENS)
  const [selected, setSelected] = useState<Selected>(null)
  const [importErrors, setImportErrors] = useState<string[] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const path = useMemo(() => derivePath(doc, lens), [doc, lens])

  const addState = useCallback(() => {
    const id = `state-${Date.now().toString(36)}`
    update((d: WorkflowDoc) => ({
      ...d,
      states: [
        ...d.states,
        {
          id,
          title: 'New state',
          position: { x: 640, y: 700 },
          accent: 'writer',
          border: 'solid',
          badges: [],
          actors: [],
        },
      ],
    }))
    setSelected({ kind: 'state', id })
  }, [update])

  const deleteSelected = useCallback(
    (sel: NonNullable<Selected>) => {
      update((d) =>
        sel.kind === 'state'
          ? {
              ...d,
              states: d.states.filter((s) => s.id !== sel.id),
              // A transition without both endpoints is invalid, so orphans go too.
              transitions: d.transitions.filter((t) => t.from !== sel.id && t.to !== sel.id),
            }
          : { ...d, transitions: d.transitions.filter((t) => t.id !== sel.id) },
      )
      setSelected(null)
    },
    [update],
  )

  const onImportFile = useCallback(
    async (file: File) => {
      const result = store.importJson(await file.text())
      setImportErrors(result.ok ? null : result.errors)
      if (result.ok) {
        setSelected(null)
        setLens(EMPTY_LENS)
      }
    },
    [store],
  )

  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Sanity · roles &amp; permissions</p>
        <h1 className="page__title">
          Article workflow — states, transitions, and who can move them
        </h1>
        <p className="page__intro">
          Solid lines are the standard path; dashed lines are conditional routes. Line colour
          shows who performs the transition, and badges mark which states sit in an open claim
          queue. Pick a writer tier and an article type to trace one article through the graph —
          the fork at Grammarly Edit Complete is decided by the self-publish matrix below, so the
          same writer's News brief and Shorty take different routes.
        </p>
      </header>

      {store.warning && (
        <div className="callout callout--warn" role="status">
          {store.warning}
          <button type="button" className="btn btn--ghost btn--sm" onClick={store.dismissWarning}>
            Dismiss
          </button>
        </div>
      )}

      {importErrors && (
        <div className="callout callout--error" role="alert">
          <strong>Import rejected.</strong>
          <ul>
            {importErrors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {importErrors.length > 8 && <li>…and {importErrors.length - 8} more.</li>}
          </ul>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImportErrors(null)}>
            Dismiss
          </button>
        </div>
      )}

      <LensBar doc={doc} selection={lens} path={path} onChange={setLens} />
      <Legend />

      <section className="panel panel--flush">
        <div className="toolbar">
          <button type="button" className="btn" onClick={addState}>
            + Add state
          </button>
          <button type="button" className="btn btn--ghost" onClick={store.exportJson}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => fileInput.current?.click()}
          >
            Import JSON
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!store.dirty}
            onClick={() => {
              if (confirm('Discard all local edits and reload the committed seed?')) {
                store.resetToSeed()
                setSelected(null)
              }
            }}
          >
            Reset to seed
          </button>
          <span className="toolbar__hint">
            Drag a node to move it · drag between node edges to add a transition · click to edit
          </span>
          {store.dirty && <span className="toolbar__dirty">Unsaved edits — export to keep</span>}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImportFile(f)
              e.target.value = ''
            }}
          />
        </div>

        <ReactFlowProvider>
          <div className="canvas-wrap">
            <DiagramCanvas
              doc={doc}
              path={path}
              selection={lens}
              selected={selected}
              onUpdate={update}
              onSelect={setSelected}
            />

            <Inspector
              doc={doc}
              selected={selected}
              onUpdate={update}
              onClose={() => setSelected(null)}
              onDelete={deleteSelected}
            />
          </div>
        </ReactFlowProvider>
      </section>

      <ReviewPathPanel
        doc={doc}
        selection={lens}
        onSelect={(tierId, articleTypeId) => setLens((l) => ({ ...l, tierId, articleTypeId }))}
      />

      <SelfPublishMatrix
        doc={doc}
        selection={lens}
        onUpdate={update}
        onSelect={(tierId, articleTypeId) => setLens((l) => ({ ...l, tierId, articleTypeId }))}
      />

      <NotesPanel notes={doc.notes} />
    </div>
  )
}
