/**
 * Lens derivation: given a writer tier and an article type, work out which
 * states an article can reach and which transitions it can travel.
 *
 * The interesting rule lives at Grammarly Edit Complete. Whether an article
 * self-publishes from there is decided by the tier × article-type matrix,
 * not by the tier alone — so a MidDTP News brief and a MidDTP Shorty take
 * different paths out of the same state.
 */

import type { RoleId, Transition, WorkflowDoc } from '../data/schema'

export interface LensSelection {
  tierId: string | null
  articleTypeId: string | null
  /**
   * Roles to highlight. Multi-select, so "the whole flow of a DTP article"
   * is expressible as writers + copyeds together rather than one at a time.
   * Empty means no role emphasis — the article's whole path reads evenly.
   */
  viewerRoles: RoleId[]
  /**
   * Remove states this article can never reach, instead of greying them.
   * Off by default: an unreachable state still tells you something. On, the
   * diagram collapses to just this article's journey.
   */
  hideUnreachable: boolean
}

export interface DerivedPath {
  /** State ids reachable from the entry state under this selection. */
  reachableStates: Set<string>
  /** Transition ids traversable under this selection. */
  activeTransitions: Set<string>
  /** Of the active transitions, those the viewer role performs. */
  viewerTransitions: Set<string>
  /** True when the selected tier may self-publish the selected type. */
  selfPublishes: boolean
  /** True when no tier/type is selected — the whole graph is shown. */
  unfiltered: boolean
}

/** The state every article starts in. First state in the document. */
export function entryStateId(doc: WorkflowDoc): string | null {
  return doc.states[0]?.id ?? null
}

export function canSelfPublish(
  doc: WorkflowDoc,
  tierId: string | null,
  articleTypeId: string | null,
): boolean {
  if (!tierId || !articleTypeId) return false
  return (doc.selfPublish[tierId] ?? []).includes(articleTypeId)
}

/**
 * Is this transition available to the given tier/type combination?
 *
 * Two independent filters, both must pass:
 *   1. `appliesTo` — the tier must be listed.
 *   2. `gate`      — the self-publish matrix must agree, when a gate is set.
 */
function isTransitionAvailable(
  t: Transition,
  tierId: string,
  selfPublishes: boolean,
): boolean {
  if (!t.appliesTo.includes(tierId)) return false
  if (t.gate === 'selfPublish' && !selfPublishes) return false
  if (t.gate === '!selfPublish' && selfPublishes) return false
  return true
}

/**
 * Derive the visible subgraph for a lens selection.
 *
 * With no tier or no article type selected, nothing is filtered — the full
 * graph shows. Selecting both narrows to that article's path: available
 * transitions are collected first, then walked breadth-first from the entry
 * state so that states which are only reachable via unavailable transitions
 * drop out. A transition is only "active" if its `from` state is actually
 * reachable — otherwise an unreachable subgraph would still light its edges.
 */
export function derivePath(doc: WorkflowDoc, sel: LensSelection): DerivedPath {
  const selfPublishes = canSelfPublish(doc, sel.tierId, sel.articleTypeId)
  const unfiltered = !sel.tierId || !sel.articleTypeId

  if (unfiltered) {
    const all = new Set(doc.states.map((s) => s.id))
    const allT = new Set(doc.transitions.map((t) => t.id))
    return {
      reachableStates: all,
      activeTransitions: allT,
      viewerTransitions: viewerSubset(doc, allT, sel.viewerRoles),
      selfPublishes,
      unfiltered: true,
    }
  }

  const tierId = sel.tierId as string
  const available = doc.transitions.filter((t) =>
    isTransitionAvailable(t, tierId, selfPublishes),
  )

  const outgoing = new Map<string, Transition[]>()
  for (const t of available) {
    const list = outgoing.get(t.from)
    if (list) list.push(t)
    else outgoing.set(t.from, [t])
  }

  const entry = entryStateId(doc)
  const reachableStates = new Set<string>()
  const activeTransitions = new Set<string>()

  if (entry) {
    const queue = [entry]
    reachableStates.add(entry)
    while (queue.length) {
      const current = queue.shift() as string
      for (const t of outgoing.get(current) ?? []) {
        activeTransitions.add(t.id)
        if (!reachableStates.has(t.to)) {
          reachableStates.add(t.to)
          queue.push(t.to)
        }
      }
    }
  }

  return {
    reachableStates,
    activeTransitions,
    viewerTransitions: viewerSubset(doc, activeTransitions, sel.viewerRoles),
    selfPublishes,
    unfiltered: false,
  }
}

function viewerSubset(
  doc: WorkflowDoc,
  active: Set<string>,
  viewerRoles: RoleId[],
): Set<string> {
  if (viewerRoles.length === 0) return new Set()
  const roles = new Set(viewerRoles)
  const out = new Set<string>()
  for (const t of doc.transitions) {
    if (active.has(t.id) && roles.has(t.role)) out.add(t.id)
  }
  return out
}

/**
 * Human-readable summary of the current lens, shown above the graph.
 */
export function describeLens(doc: WorkflowDoc, sel: LensSelection, path: DerivedPath): string {
  if (path.unfiltered) {
    return 'Showing every state and transition. Pick a writer tier and an article type to trace one article.'
  }
  const tier = doc.tiers.find((t) => t.id === sel.tierId)
  const type = doc.articleTypes.find((t) => t.id === sel.articleTypeId)
  const n = path.reachableStates.size
  const verdict = path.selfPublishes
    ? 'self-publishes from Grammarly Edit Complete'
    : 'routes through copy edit'
  const label = type?.label ?? '—'
  const article = /^[aeiou]/i.test(label) ? 'An' : 'A'
  return `${article} ${label} by a ${tier?.label ?? '—'} writer ${verdict} — ${n} of ${doc.states.length} states.`
}
