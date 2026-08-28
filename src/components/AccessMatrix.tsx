import { useState } from 'react'
import type { AccessLevel, WorkflowDoc } from '../data/schema'
import { accessLevel, type LensSelection } from '../graph/derive'
import { EditableLabel } from './EditableLabel'

interface Props {
  doc: WorkflowDoc
  selection: LensSelection
  dirty: boolean
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

function uniqueId(base: string, taken: (id: string) => boolean): string {
  let id = base || 'item'
  if (!taken(id)) return id
  let n = 2
  while (taken(`${id}${n}`)) n++
  return `${id}${n}`
}

/**
 * Who may write what, who may skip review, and who carries which modifier.
 *
 * Three access states per cell rather than two: a group can self-publish a
 * type, write it and send it to review, or have no access at all. That last
 * one matters — "can't self-publish" and "never authors this" produce very
 * different diagrams.
 *
 * Access is stored as publish/write id lists per group, so anything unlisted
 * is no access. New groups and new article types are therefore denied
 * everything until granted.
 */
export function AccessMatrix({ doc, selection, dirty, onUpdate, onSelect }: Props) {
  const [newType, setNewType] = useState('')
  const [newGroup, setNewGroup] = useState('')

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

  // Only the label changes. Ids stay fixed, because access lists, transitions
  // and modifier membership all reference them — renaming an id would orphan
  // every one of those.
  const renameGroup = (tierId: string, label: string) => {
    onUpdate((d) => ({
      ...d,
      tiers: d.tiers.map((t) => (t.id === tierId ? { ...t, label } : t)),
    }))
  }

  const renameType = (typeId: string, label: string) => {
    onUpdate((d) => ({
      ...d,
      articleTypes: d.articleTypes.map((t) => (t.id === typeId ? { ...t, label } : t)),
    }))
  }

  const addType = (e: React.FormEvent) => {
    e.preventDefault()
    const label = newType.trim()
    if (!label) return
    const id = uniqueId(slug(label) || 'type', (x) => doc.articleTypes.some((t) => t.id === x))
    // Touches no access lists — unlisted reads as no access, which is the rule.
    onUpdate((d) => ({ ...d, articleTypes: [...d.articleTypes, { id, label }] }))
    setNewType('')
  }

  const addGroup = (e: React.FormEvent) => {
    e.preventDefault()
    const label = newGroup.trim()
    if (!label) return
    const id = uniqueId(slug(label) || 'group', (x) => doc.tiers.some((t) => t.id === x))
    onUpdate((d) => ({
      ...d,
      tiers: [...d.tiers, { id, label }],
      // Explicit empty entry: the validator requires one per group, and it
      // reads as no access to everything until the row is filled in.
      access: { ...d.access, [id]: { publish: [], write: [] } },
      // Opt the group into every transition. Without this it could be granted
      // an article type and still go nowhere, because appliesTo would not list
      // it. Access and modifiers do the gating; transitions describe the
      // workflow, and a new group follows the standard one until told
      // otherwise. Modifier-gated transitions stay inert until the group is
      // given that modifier.
      transitions: d.transitions.map((t) => ({ ...t, appliesTo: [...t.appliesTo, id] })),
    }))
    setNewGroup('')
  }

  const removeType = (typeId: string) => {
    const label = doc.articleTypes.find((t) => t.id === typeId)?.label ?? typeId
    const withAccess = doc.tiers.filter((t) => accessLevel(doc, t.id, typeId) !== 'none')
    const detail = withAccess.length
      ? `\n\n${withAccess.length} group${withAccess.length === 1 ? '' : 's'} can write it: ${withAccess.map((t) => t.label).join(', ')}. That access is removed too.`
      : ''
    if (!confirm(`Remove the ${label} article type?${detail}`)) return

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

  const removeGroup = (tierId: string) => {
    const label = doc.tiers.find((t) => t.id === tierId)?.label ?? tierId
    const orphaned = doc.transitions.filter(
      (t) => t.appliesTo.length === 1 && t.appliesTo[0] === tierId,
    )
    const warning = orphaned.length
      ? `\n\n${orphaned.length} transition${orphaned.length === 1 ? '' : 's'} apply only to ${label} and will be left with no group, making them dead in every lens.`
      : ''
    if (!confirm(`Remove the ${label} group?${warning}`)) return

    onUpdate((d) => {
      const access = { ...d.access }
      delete access[tierId]
      return {
        ...d,
        tiers: d.tiers.filter((t) => t.id !== tierId),
        access,
        // A group id left dangling in these lists would fail validation on
        // the next import, so clean both up here.
        modifiers: d.modifiers.map((m) => ({
          ...m,
          appliesTo: m.appliesTo.filter((t) => t !== tierId),
        })),
        transitions: d.transitions.map((t) => ({
          ...t,
          appliesTo: t.appliesTo.filter((x) => x !== tierId),
        })),
      }
    })
  }

  return (
    <section className="panel matrix-panel" aria-labelledby="matrix-heading">
      <div className="panel__head">
        <h2 className="panel__title" id="matrix-heading">
          Access matrix
        </h2>
        <p className="panel__sub">
          What each writer group may do with each article type. Click a cell to cycle it — the
          diagram re-derives immediately. Double-click to trace that combination. Group and type
          names are editable in place; renaming keeps every existing rule attached.
        </p>
      </div>

      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col" className="matrix__corner">
                Group
              </th>
              {doc.articleTypes.map((t) => (
                <th
                  key={t.id}
                  scope="col"
                  className="matrix__colhead"
                  data-active={selection.articleTypeId === t.id || undefined}
                >
                  <EditableLabel
                    value={t.label}
                    ariaLabel={`Rename article type ${t.label}`}
                    onCommit={(label) => renameType(t.id, label)}
                  />
                  <button
                    type="button"
                    className="matrix__remove"
                    title={`Remove the ${t.label} article type`}
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
                  <EditableLabel
                    value={tier.label}
                    ariaLabel={`Rename group ${tier.label}`}
                    onCommit={(label) => renameGroup(tier.id, label)}
                  />
                  <button
                    type="button"
                    className="matrix__remove"
                    title={`Remove the ${tier.label} group`}
                    aria-label={`Remove group ${tier.label}`}
                    onClick={() => removeGroup(tier.id)}
                  >
                    ×
                  </button>
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
        no access — that group never authors this type
      </p>

      <div className="matrix__adds">
        <form className="matrix__add" onSubmit={addGroup}>
          <label htmlFor="new-group">New group</label>
          <input
            id="new-group"
            className="input"
            value={newGroup}
            placeholder="e.g. Contractor"
            onChange={(e) => setNewGroup(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!newGroup.trim()}>
            Add
          </button>
        </form>

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
        </form>
      </div>

      <p className="matrix__hint matrix__saved">
        Both start with no access to anything until granted. Matrix edits are part of the workflow
        document — they persist across reloads
        {dirty ? ' (unsaved changes are held locally)' : ''} and are included in{' '}
        <strong>Export JSON</strong> above, alongside the diagram.
      </p>
    </section>
  )
}
