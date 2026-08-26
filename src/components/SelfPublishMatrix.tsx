import { useState } from 'react'
import type { WorkflowDoc } from '../data/schema'
import type { LensSelection } from '../graph/derive'

interface Props {
  doc: WorkflowDoc
  selection: LensSelection
  onUpdate: (fn: (draft: WorkflowDoc) => WorkflowDoc) => void
  onSelect: (tierId: string, articleTypeId: string) => void
}

const slug = (label: string) =>
  label
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^(.)/, (c) => c.toLowerCase())

/**
 * Who may self-publish what.
 *
 * This grid — not the writer tier alone — decides the fork at Grammarly Edit
 * Complete, so editing a cell immediately re-derives the active lens. Sitting
 * it next to the graph is the point: you can watch a path change as you flip
 * a permission.
 *
 * New article types land denied for every tier, matching the "New Type"
 * column in the source permissions table.
 */
export function SelfPublishMatrix({ doc, selection, onUpdate, onSelect }: Props) {
  const [newType, setNewType] = useState('')

  const toggle = (tierId: string, typeId: string) => {
    onUpdate((d) => {
      const current = d.selfPublish[tierId] ?? []
      const next = current.includes(typeId)
        ? current.filter((t) => t !== typeId)
        : [...current, typeId]
      return { ...d, selfPublish: { ...d.selfPublish, [tierId]: next } }
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
    // Deliberately does not touch selfPublish — an absent id reads as denied,
    // which is the default-deny rule.
    onUpdate((d) => ({ ...d, articleTypes: [...d.articleTypes, { id, label }] }))
    setNewType('')
  }

  const removeType = (typeId: string) => {
    onUpdate((d) => ({
      ...d,
      articleTypes: d.articleTypes.filter((t) => t.id !== typeId),
      selfPublish: Object.fromEntries(
        Object.entries(d.selfPublish).map(([tier, types]) => [
          tier,
          types.filter((t) => t !== typeId),
        ]),
      ),
    }))
  }

  return (
    <section className="panel matrix-panel" aria-labelledby="matrix-heading">
      <div className="panel__head">
        <h2 className="panel__title" id="matrix-heading">
          Self-publish matrix
        </h2>
        <p className="panel__sub">
          Which writer tiers may publish which article types straight from Grammarly Edit
          Complete, skipping copy and financial edit. Everything else routes to a copyeditor.
          Click a cell to change it — the diagram re-derives immediately.
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
                  const allowed = (doc.selfPublish[tier.id] ?? []).includes(type.id)
                  return (
                    <td key={type.id}>
                      <button
                        type="button"
                        className="matrix__cell"
                        data-allowed={allowed || undefined}
                        aria-pressed={allowed}
                        aria-label={`${tier.label} self-publish ${type.label}: ${allowed ? 'allowed' : 'not allowed'}`}
                        onClick={() => toggle(tier.id, type.id)}
                        onDoubleClick={() => onSelect(tier.id, type.id)}
                      >
                        {allowed ? '✓' : '✗'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        <span className="matrix__hint">Added denied for every tier. Double-click a cell to view that path.</span>
      </form>
    </section>
  )
}
