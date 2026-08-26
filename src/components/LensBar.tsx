import { ROLES, ROLE_IDS, type RoleId, type WorkflowDoc } from '../data/schema'
import type { DerivedPath, LensSelection } from '../graph/derive'
import { describeLens } from '../graph/derive'

interface Props {
  doc: WorkflowDoc
  selection: LensSelection
  path: DerivedPath
  onChange: (next: LensSelection) => void
}

/**
 * The three lens selectors.
 *
 * Tier and article type together answer "where does this article go".
 * Viewer role answers "which of those moves are mine". They compose, and
 * each clears independently.
 */
export function LensBar({ doc, selection, path, onChange }: Props) {
  const set = (patch: Partial<LensSelection>) => onChange({ ...selection, ...patch })

  return (
    <section className="lens-bar" aria-label="Workflow lens">
      <div className="lens-bar__row">
        <div className="lens-group">
          <label className="lens-group__label" htmlFor="lens-tier">
            Article by
          </label>
          <select
            id="lens-tier"
            className="select"
            value={selection.tierId ?? ''}
            onChange={(e) => set({ tierId: e.target.value || null })}
          >
            <option value="">All tiers</option>
            {doc.tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.headcount !== null ? ` (${t.headcount})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="lens-group">
          <label className="lens-group__label" htmlFor="lens-type">
            Article type
          </label>
          <select
            id="lens-type"
            className="select"
            value={selection.articleTypeId ?? ''}
            onChange={(e) => set({ articleTypeId: e.target.value || null })}
          >
            <option value="">All types</option>
            {doc.articleTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="lens-group">
          <span className="lens-group__label" id="lens-viewer-label">
            Viewing as
          </span>
          <div className="segmented" role="group" aria-labelledby="lens-viewer-label">
            {ROLE_IDS.map((r: RoleId) => (
              <button
                key={r}
                type="button"
                className={`segmented__item role-${r}`}
                aria-pressed={selection.viewerRole === r}
                onClick={() => set({ viewerRole: selection.viewerRole === r ? null : r })}
              >
                {ROLES[r].short}
              </button>
            ))}
          </div>
        </div>

        {(selection.tierId || selection.articleTypeId || selection.viewerRole) && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onChange({ tierId: null, articleTypeId: null, viewerRole: null })}
          >
            Clear lens
          </button>
        )}
      </div>

      <p className="lens-bar__summary" role="status">
        {describeLens(doc, selection, path)}
        {selection.viewerRole && !path.unfiltered && (
          <>
            {' '}
            <strong>
              {path.viewerTransitions.size}{' '}
              {path.viewerTransitions.size === 1 ? 'transition is' : 'transitions are'} yours as{' '}
              {ROLES[selection.viewerRole].short}.
            </strong>
          </>
        )}
      </p>

      {selection.viewerRole === 'hq' && doc.hqOverride && (
        <p className="callout callout--hq">
          <strong>HQ editors can move an article from any state to any other.</strong> Those{' '}
          {doc.states.length * (doc.states.length - 1)} transitions are not drawn — they would
          bury the diagram. Every state is reachable and leavable by HQ.
        </p>
      )}
    </section>
  )
}
