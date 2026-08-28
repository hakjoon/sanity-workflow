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
export const EMPTY_LENS: LensSelection = {
  tierId: null,
  articleTypeId: null,
  viewerRoles: [],
  modifiers: {},
  hideUnreachable: false,
}

export function LensBar({ doc, selection, path, onChange }: Props) {
  const set = (patch: Partial<LensSelection>) => onChange({ ...selection, ...patch })
  const isActive =
    Boolean(selection.tierId) ||
    Boolean(selection.articleTypeId) ||
    selection.viewerRoles.length > 0 ||
    Object.keys(selection.modifiers).length > 0 ||
    selection.hideUnreachable

  const setModifier = (id: string, value: string) => {
    const next = { ...selection.modifiers }
    if (value === '') delete next[id]
    else next[id] = value === 'on'
    set({ modifiers: next })
  }

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

        {doc.modifiers.map((m) => {
          const pinned = selection.modifiers[m.id]
          const carriers = m.appliesTo
            .map((id) => doc.tiers.find((t) => t.id === id)?.label ?? id)
            .join(', ')
          return (
            <div className="lens-group" key={m.id}>
              <label className="lens-group__label" htmlFor={`lens-mod-${m.id}`}>
                {m.label}
              </label>
              <select
                id={`lens-mod-${m.id}`}
                className="select"
                title={`${m.description} Carried by: ${carriers}.`}
                value={pinned === undefined ? '' : pinned ? 'on' : 'off'}
                onChange={(e) => setModifier(m.id, e.target.value)}
              >
                <option value="">Either</option>
                <option value="on">Is {m.label}</option>
                <option value="off">Not {m.label}</option>
              </select>
            </div>
          )
        })}

        <div className="lens-group">
          <span className="lens-group__label" id="lens-viewer-label">
            Highlight roles
          </span>
          <div className="segmented" role="group" aria-labelledby="lens-viewer-label">
            {ROLE_IDS.map((r: RoleId) => (
              <button
                key={r}
                type="button"
                className={`segmented__item role-${r}`}
                aria-pressed={selection.viewerRoles.includes(r)}
                onClick={() =>
                  set({
                    viewerRoles: selection.viewerRoles.includes(r)
                      ? selection.viewerRoles.filter((x) => x !== r)
                      : [...selection.viewerRoles, r],
                  })
                }
              >
                {ROLES[r].short}
              </button>
            ))}
          </div>
        </div>

        <div className="lens-group lens-group--tight">
          <span className="lens-group__label">Unreachable states</span>
          <label className="check check--inline">
            <input
              type="checkbox"
              checked={selection.hideUnreachable}
              onChange={(e) => set({ hideUnreachable: e.target.checked })}
            />
            Hide instead of dim
          </label>
        </div>

        {isActive && (
          <button type="button" className="btn btn--ghost" onClick={() => onChange(EMPTY_LENS)}>
            Clear lens
          </button>
        )}
      </div>

      <p className="lens-bar__summary" role="status">
        {describeLens(doc, selection, path)}
        {selection.viewerRoles.length > 0 && !path.unfiltered && (
          <>
            {' '}
            <strong>
              {path.viewerTransitions.size} of {path.activeTransitions.size}{' '}
              {path.activeTransitions.size === 1 ? 'transition' : 'transitions'} performed by{' '}
              {selection.viewerRoles.map((r) => ROLES[r].short).join(' + ')}.
            </strong>
          </>
        )}
        {selection.hideUnreachable && !path.unfiltered && (
          <> {doc.states.length - path.reachableStates.size} unreachable states hidden.</>
        )}
      </p>

      {selection.viewerRoles.includes('hq') && doc.hqOverride && (
        <p className="callout callout--hq">
          <strong>HQ editors can move an article from any state to any other.</strong> Those{' '}
          {doc.states.length * (doc.states.length - 1)} transitions are not drawn — they would
          bury the diagram. Every state is reachable and leavable by HQ.
        </p>
      )}
    </section>
  )
}
