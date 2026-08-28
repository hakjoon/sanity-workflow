import { useMemo } from 'react'
import type { WorkflowDoc } from '../data/schema'
import { derivePath, type LensSelection } from '../graph/derive'

interface Props {
  doc: WorkflowDoc
  selection: LensSelection
  onSelect: (tierId: string, articleTypeId: string | null) => void
}

interface TierRow {
  id: string
  label: string
  headcount: number | null
  selfPublishCount: number
  typeCount: number
  /** A type this tier cannot self-publish, used to derive the review route. */
  sampleReviewType: string | null
  /** Review stage shorts this tier passes through when it can't self-publish. */
  route: string[]
  minEditors: number
  maxEditors: number
}

/**
 * How many editors touch an article, by writer tier.
 *
 * Derived rather than written down: for each tier we take an article type it
 * cannot self-publish, walk the graph, and see which review stages that
 * article actually reaches. Edit a transition's tier list and this table
 * follows, so it can't drift from the diagram the way a hand-maintained
 * legend would.
 */
function buildRows(doc: WorkflowDoc): TierRow[] {
  return doc.tiers.map((tier) => {
    const allowed = doc.selfPublish[tier.id] ?? []
    const sample = doc.articleTypes.find((t) => !allowed.includes(t.id)) ?? null

    let route: string[] = []
    if (sample) {
      const path = derivePath(doc, {
        tierId: tier.id,
        articleTypeId: sample.id,
        viewerRoles: [],
        hideUnreachable: false,
      })
      route = doc.reviewStages
        .filter((stage) => path.reachableStates.has(stage.state))
        .map((stage) => stage.short)
    }

    const alwaysSelfPublishes = allowed.length === doc.articleTypes.length
    return {
      id: tier.id,
      label: tier.label,
      headcount: tier.headcount,
      selfPublishCount: allowed.length,
      typeCount: doc.articleTypes.length,
      sampleReviewType: sample?.id ?? null,
      route,
      minEditors: allowed.length > 0 ? 0 : route.length,
      maxEditors: alwaysSelfPublishes ? 0 : route.length,
    }
  })
}

function editorsLabel(row: TierRow): string {
  if (row.minEditors === row.maxEditors) return String(row.maxEditors)
  return `${row.minEditors} or ${row.maxEditors}`
}

export function ReviewPathPanel({ doc, selection, onSelect }: Props) {
  const rows = useMemo(() => buildRows(doc), [doc])

  return (
    <section className="panel" aria-labelledby="review-path-heading">
      <div className="panel__head">
        <h2 className="panel__title" id="review-path-heading">
          Editors per article, by tier
        </h2>
        <p className="panel__sub">
          How many editors touch an article before it publishes. Anything the self-publish matrix
          allows skips review entirely; everything else goes to a copyeditor, and every tier except
          DTP continues to a financial editor. Click a row to trace that tier.
        </p>
      </div>

      <table className="review-table">
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Writers</th>
            <th scope="col">Self-publishes</th>
            <th scope="col">Otherwise</th>
            <th scope="col">Editors</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-active={selection.tierId === row.id || undefined}
              onClick={() => onSelect(row.id, null)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(row.id, null)
                }
              }}
            >
              <th scope="row">{row.label}</th>
              <td className="tabular-nums">{row.headcount ?? '—'}</td>
              <td>
                {row.selfPublishCount === 0 ? (
                  <span className="review-table__none">nothing</span>
                ) : row.selfPublishCount === row.typeCount ? (
                  'every type'
                ) : (
                  `${row.selfPublishCount} of ${row.typeCount} types`
                )}
              </td>
              <td>
                {row.route.length === 0 ? (
                  <span className="review-table__none">never enters review</span>
                ) : (
                  row.route.map((short, i) => (
                    <span key={short}>
                      {i > 0 && <span className="review-table__arrow"> → </span>}
                      <span className={short === 'CE' ? 'role-copyed' : 'role-ffe'}>{short}</span>
                    </span>
                  ))
                )}
              </td>
              <td className="tabular-nums review-table__count">{editorsLabel(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="review-table__key">
        {doc.reviewStages.map((s, i) => (
          <span key={s.id}>
            {i > 0 && ' · '}
            <strong className={s.short === 'CE' ? 'role-copyed' : 'role-ffe'}>{s.short}</strong>{' '}
            {s.label}
          </span>
        ))}
        {' · '}HQ editors can move an article anywhere and are not counted here.
      </p>
    </section>
  )
}
