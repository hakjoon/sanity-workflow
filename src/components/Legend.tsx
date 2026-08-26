import { BADGES, ROLES, ROLE_IDS } from '../data/schema'

/**
 * Static key for the diagram: what each line colour means, what the badges
 * mean, and how the two line styles read.
 */
export function Legend() {
  return (
    <section className="legend" aria-label="Diagram key">
      {ROLE_IDS.map((r) => (
        <span key={r} className={`legend__item role-${r}`}>
          <span className="legend__swatch" />
          <span className="legend__label">{ROLES[r].label}</span>
        </span>
      ))}

      <span className="legend__divider" />

      <span className="legend__item">
        <span className="badge" data-variant="claimable">
          {BADGES.claimable}
        </span>
        open queue — any eligible role can take it
      </span>
      <span className="legend__item">
        <span className="badge" data-variant="claimed">
          {BADGES.claimed}
        </span>
        one owner holds the article
      </span>
      <span className="legend__item">
        <span className="badge" data-variant="tbd">
          {BADGES.tbd}
        </span>
        not decided yet
      </span>

      <span className="legend__divider" />

      <span className="legend__item">
        <span className="legend__swatch legend__swatch--dashed" />
        conditional route
      </span>
      <span className="legend__item">
        <span className="legend__gate" aria-hidden="true">
          ◆
        </span>
        decided by the self-publish matrix
      </span>
    </section>
  )
}
