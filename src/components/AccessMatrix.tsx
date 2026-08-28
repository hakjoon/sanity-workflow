import { useState } from 'react'
import type { AccessLevel, WorkflowDoc } from '../data/schema'
import { accessLevel, type LensSelection } from '../graph/derive'

interface Props {
  doc: WorkflowDoc
  selection: LensSelection
  onUpdate: (fn: (draft: WorkflowDoc) => WorkflowDoc) => void
  onSelect: (tierId: string, articleTypeId: string) => void
}

const CELL: Record<AccessLevel, { glyph: string; label: string }> = {
  publish: { glyph: '✓', label: 'self-publishes' },
  write: { glyph: 'W', label: 'writes it, goes through review' },
  none: { glyph: '✗', label: 'no access' },
}

/** Click cycles publish → write → none → publish. */
const NEXT: Record<AccessLevel, AccessLevel> = {
  publish: 'write',
  write: 'none',
  none: 'publish',
}

const slug = (label: string) =>
  label
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^(.)/, (c) => c.toLowerCase())

/**
 * Who may write what, and who may skip review.
 *
 * Three states per cell rather than two: a tier can self-publish a type, write
 * it and send it to review, or have no access at all. That last one matters —
 * "can't self-publish" and "never authors this" produce very different
 * diagrams, and collapsing them hid the difference.
 *
 * Stored as publish/write id lists per tier, so anything unlisted is no
 * access. New article types are therefore denied to everyone until granted.
 */
export function AccessMatrix({ doc, selection, onUpdate, onSelect }: Props) {
  const [newType, setNewType] = useState('')

  const setLevel = (tierId: string, typeId: string, level: AccessLevel) => {
    onUpdate((d) => {
      const entry = d.access[tierId] ?? { publish: [], write: [] }
      const publish = entry.publish.filter((t) => t !== typeId)
      const write = entry.write.filter((t) => t !== typeId)
      if (level === 'publish') publish.push(typeId)
      if (level === 'write') write.push(typeId)
      return { ...d, access: { ...d.access, [tierId]: { publish, write } } }
    })
  }

  const addType = (e: React.FormEvent) => {
    e.preventDefault()
    const label = newType.trim()
    if (!label) return
    let id = slug(label) || 'type'
    if (doc.articleTypes.some((t) => t.id === id)) {
      let n = 2
      while (doc.articleTypes.some((t) => t.id === `${id}${n}`)) n++
      id = `${id}${n}`
    }
    // Touches no access lists — unlisted reads as no access, which is the rule.
    onUpdate((d) => ({ ...d, articleTypes: [...d.articleTypes, { id, label }] }))
    setNewType('')
  }

  const removeType = (typeId: string) => {
    onUpdate((d) => ({
      ...d,
      articleTypes: d.articleTypes.filter((t) => t.id !== typeId),
      access: Object.fromEntries(
        Object.entries(d.access).map(([tier, entry]) => [
          tier,
          {
            publish: entry.publish.filter((t) => t !== typeId),
            write: entry.write.filter((t) => t !== typeId),
          },
        ]),
      ),
    }))
  }

  return (
    <section className="panel matrix-panel" aria-labelledby="matrix-heading">
      <div className="panel__head">
        <h2 className="panel__title" id="matrix-heading">
          Access matrix
        </h2>
        <p className="panel__sub">
          What each writer tier may do with each article type. Click a cell to cycle it — the
          diagram re-derives immediately. Double-click to trace that combination.
        </p>
      </div>

      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col" className="matrix__corner">
                Tier / role
              </th>
              {doc.articleTypes.map((t) => (
                <th
                  key={t.id}
                  scope="col"
                  className="matrix__colhead"
                  data-active={selection.articleTypeId === t.id || undefined}
                >
                  <span>{t.label}</span>
                  <button
                    type="button"
                    className="matrix__remove"
                    title={`Remove ${t.label}`}
                    aria-label={`Remove article type ${t.label}`}
                    onClick={() => removeType(t.id)}
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.tiers.map((tier) => (
              <tr key={tier.id} data-active={selection.tierId === tier.id || undefined}>
                <th scope="row" className="matrix__rowhead">
                  {tier.label}
                  {tier.headcount !== null && (
                    <span className="matrix__count"> ({tier.headcount})</span>
                  )}
                </th>
                {doc.articleTypes.map((type) => {
                  const level = accessLevel(doc, tier.id, type.id)
                  return (
                    <td key={type.id}>
                      <button
                        type="button"
                        className="matrix__cell"
                        data-level={level}
                        aria-label={`${tier.label} / ${type.label}: ${CELL[level].label}. Activate to change.`}
                        title={CELL[level].label}
                        onClick={() => setLevel(tier.id, type.id, NEXT[level])}
                        onDoubleClick={() => onSelect(tier.id, type.id)}
                      >
                        {CELL[level].glyph}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="matrix__key">
        <span className="matrix__cell matrix__cell--inline" data-level="publish">
          ✓
        </span>{' '}
        self-publishes, skips review
        <span className="matrix__keysep">·</span>
        <span className="matrix__cell matrix__cell--inline" data-level="write">
          W
        </span>{' '}
        writes it, goes through review
        <span className="matrix__keysep">·</span>
        <span className="matrix__cell matrix__cell--inline" data-level="none">
          ✗
        </span>{' '}
        no access — that tier never authors this type
      </p>

      <form className="matrix__add" onSubmit={addType}>
        <label htmlFor="new-article-type">New article type</label>
        <input
          id="new-article-type"
          className="input"
          value={newType}
          placeholder="e.g. Podcast recap"
          onChange={(e) => setNewType(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!newType.trim()}>
          Add
        </button>
        <span className="matrix__hint">Added with no access for every tier, until granted.</span>
      </form>
    </section>
  )
}
