import {
  BADGES,
  ROLES,
  ROLE_IDS,
  type BadgeId,
  type RoleId,
  type WorkflowDoc,
} from '../data/schema'

export type Selected =
  | { kind: 'state'; id: string }
  | { kind: 'transition'; id: string }
  | null

interface Props {
  doc: WorkflowDoc
  selected: Selected
  onUpdate: (fn: (draft: WorkflowDoc) => WorkflowDoc) => void
  onClose: () => void
  onDelete: (selected: NonNullable<Selected>) => void
}

/**
 * Edit the selected state or transition.
 *
 * Everything the document model holds is editable here, including the
 * per-tier eligibility that drives the persona lens.
 */
export function Inspector({ doc, selected, onUpdate, onClose, onDelete }: Props) {
  if (!selected) return null

  const state =
    selected.kind === 'state' ? doc.states.find((s) => s.id === selected.id) : undefined
  const transition =
    selected.kind === 'transition'
      ? doc.transitions.find((t) => t.id === selected.id)
      : undefined

  if (!state && !transition) return null

  const patchState = (patch: Partial<typeof state>) =>
    onUpdate((d) => ({
      ...d,
      states: d.states.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)),
    }))

  const patchTransition = (patch: Partial<NonNullable<typeof transition>>) =>
    onUpdate((d) => ({
      ...d,
      transitions: d.transitions.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)),
    }))

  const orphanCount = state
    ? doc.transitions.filter((t) => t.from === state.id || t.to === state.id).length
    : 0

  return (
    <aside className="inspector" aria-label="Inspector">
      <header className="inspector__head">
        <span className="inspector__kind">
          {selected.kind === 'state' ? 'State' : 'Transition'}
        </span>
        <button type="button" className="btn btn--icon" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </header>

      {state && (
        <div className="inspector__body">
          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="input"
              value={state.title}
              onChange={(e) => patchState({ title: e.target.value })}
            />
          </label>

          <label className="field">
            <span className="field__label">Owning role (accent)</span>
            <select
              className="select"
              value={state.accent}
              onChange={(e) => patchState({ accent: e.target.value as RoleId })}
            >
              {ROLE_IDS.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].short}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Border</span>
            <select
              className="select"
              value={state.border}
              onChange={(e) => patchState({ border: e.target.value as 'solid' | 'dashed' })}
            >
              <option value="solid">Solid — standard path</option>
              <option value="dashed">Dashed — conditional</option>
            </select>
          </label>

          <fieldset className="field">
            <legend className="field__label">Badges</legend>
            <div className="checks">
              {(Object.keys(BADGES) as BadgeId[]).map((b) => (
                <label key={b} className="check">
                  <input
                    type="checkbox"
                    checked={state.badges.includes(b)}
                    onChange={(e) =>
                      patchState({
                        badges: e.target.checked
                          ? [...state.badges, b]
                          : state.badges.filter((x) => x !== b),
                      })
                    }
                  />
                  {BADGES[b]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <span className="field__label">Who acts here</span>
            {state.actors.map((a, i) => (
              <div key={i} className="actor-row">
                <select
                  className="select select--sm"
                  value={a.role ?? ''}
                  onChange={(e) =>
                    patchState({
                      actors: state.actors.map((x, j) =>
                        j === i ? { ...x, role: (e.target.value || null) as RoleId | null } : x,
                      ),
                    })
                  }
                >
                  <option value="">—</option>
                  {ROLE_IDS.map((r) => (
                    <option key={r} value={r}>
                      {ROLES[r].short}
                    </option>
                  ))}
                </select>
                <input
                  className="input input--sm"
                  value={a.text}
                  onChange={(e) =>
                    patchState({
                      actors: state.actors.map((x, j) =>
                        j === i ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="Remove actor line"
                  onClick={() =>
                    patchState({ actors: state.actors.filter((_, j) => j !== i) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => patchState({ actors: [...state.actors, { role: null, text: '' }] })}
            >
              + Add actor line
            </button>
          </div>

          <div className="inspector__danger">
            <button type="button" className="btn btn--danger" onClick={() => onDelete(selected)}>
              Delete state
            </button>
            {orphanCount > 0 && (
              <p className="inspector__warn">
                This also deletes {orphanCount} connected{' '}
                {orphanCount === 1 ? 'transition' : 'transitions'}.
              </p>
            )}
          </div>
        </div>
      )}

      {transition && (
        <div className="inspector__body">
          <p className="inspector__route">
            {doc.states.find((s) => s.id === transition.from)?.title} →{' '}
            {doc.states.find((s) => s.id === transition.to)?.title}
          </p>

          <label className="field">
            <span className="field__label">Label</span>
            <input
              className="input"
              value={transition.label}
              onChange={(e) => patchTransition({ label: e.target.value })}
            />
          </label>

          <label className="field">
            <span className="field__label">Performed by</span>
            <select
              className="select"
              value={transition.role}
              onChange={(e) => patchTransition({ role: e.target.value as RoleId })}
            >
              {ROLE_IDS.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].short}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Line style</span>
            <select
              className="select"
              value={transition.style}
              onChange={(e) => patchTransition({ style: e.target.value as 'solid' | 'dashed' })}
            >
              <option value="solid">Solid — standard path</option>
              <option value="dashed">Dashed — conditional</option>
            </select>
          </label>

          <fieldset className="field">
            <legend className="field__label">Available to tiers</legend>
            <div className="checks">
              {doc.tiers.map((tier) => (
                <label key={tier.id} className="check">
                  <input
                    type="checkbox"
                    checked={transition.appliesTo.includes(tier.id)}
                    onChange={(e) =>
                      patchTransition({
                        appliesTo: e.target.checked
                          ? [...transition.appliesTo, tier.id]
                          : transition.appliesTo.filter((x) => x !== tier.id),
                      })
                    }
                  />
                  {tier.label}
                </label>
              ))}
            </div>
            {transition.appliesTo.length === 0 && (
              <p className="inspector__warn">
                No tier can use this transition — it is dead in every lens.
              </p>
            )}
          </fieldset>

          <label className="field">
            <span className="field__label">Self-publish gate</span>
            <select
              className="select"
              value={transition.gate ?? ''}
              onChange={(e) =>
                patchTransition({
                  gate: (e.target.value || undefined) as typeof transition.gate,
                })
              }
            >
              <option value="">None — tier list alone decides</option>
              <option value="selfPublish">Only when the matrix allows self-publish</option>
              <option value="!selfPublish">Only when the matrix does not</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Note</span>
            <textarea
              className="input"
              rows={3}
              value={transition.note ?? ''}
              placeholder="Why this route exists, or what's still unconfirmed"
              onChange={(e) => patchTransition({ note: e.target.value || undefined })}
            />
          </label>

          <div className="inspector__danger">
            <button type="button" className="btn btn--danger" onClick={() => onDelete(selected)}>
              Delete transition
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
