import type { WorkflowNotes } from '../data/schema'

/**
 * The design's two closing cards: what the roles-and-permissions discussion
 * settled, what it didn't, and the routing-list requirement.
 */
export function NotesPanel({ notes }: { notes: WorkflowNotes }) {
  return (
    <div className="notes-grid">
      <section className="panel">
        <h2 className="panel__eyebrow panel__eyebrow--answered">Answered — ours to spec</h2>
        <ul className="notes-list">
          {notes.answered.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>

        <hr className="rule" />

        <h2 className="panel__eyebrow panel__eyebrow--open">Still open</h2>
        <ul className="notes-list">
          {notes.open.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>

        <p className="notes-caveat">{notes.caveat}</p>
      </section>

      <section className="panel panel--ink">
        <h2 className="panel__eyebrow panel__eyebrow--ink">Routing lists</h2>
        <p className="notes-routing">{notes.routing}</p>
      </section>
    </div>
  )
}
