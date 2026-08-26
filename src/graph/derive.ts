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
  /** True when a specific tier and type are chosen and that pair self-publishes. */
  selfPublishes: boolean
  /** Which self-publish outcomes are in play across the selection. */
  reach: SelfPublishReach
  /** True when neither a tier nor a type is selected. */
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

/** Whether self-publish is possible / impossible across a set of combinations. */
export interface SelfPublishReach {
  any: boolean
  none: boolean
}

/**
 * Which self-publish outcomes are reachable across the selected tiers × types.
 *
 * With one tier and one type this is a single yes or no. Leaving either on
 * "all" widens it: MidDTP across all types can self-publish (News brief) and
 * also cannot (Shorty), so both branches out of Grammarly Edit Complete are
 * live and both must show.
 */
function selfPublishReach(
  doc: WorkflowDoc,
  tierIds: string[],
  typeIds: string[],
): SelfPublishReach {
  // A document with no article types can't answer the question either way;
  // treat both branches as possible rather than silently dropping them.
  if (typeIds.length === 0) return { any: true, none: true }

  let any = false
  let none = false
  for (const tier of tierIds) {
    const allowed = doc.selfPublish[tier] ?? []
    for (const type of typeIds) {
      if (allowed.includes(type)) any = true
      else none = true
      if (any && none) return { any, none }
    }
  }
  return { any, none }
}

/**
 * Is this transition available to any of the selected tiers, given which
 * self-publish outcomes are in play?
 *
 * Two independent filters, both must pass:
 *   1. `appliesTo` — at least one selected tier must be listed.
 *   2. `gate`      — the corresponding self-publish outcome must be reachable.
 */
function isTransitionAvailable(
  t: Transition,
  tierIds: Set<string>,
  reach: SelfPublishReach,
): boolean {
  if (!t.appliesTo.some((x) => tierIds.has(x))) return false
  if (t.gate === 'selfPublish' && !reach.any) return false
  if (t.gate === '!selfPublish' && !reach.none) return false
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
  // "All tiers" / "All types" widen the candidate set rather than switching
  // the lens off. Picking MidDTP alone still has to drop the SWUser-only
  // financial-edit branch — otherwise choosing a tier appears to do nothing.
  const tierIds = sel.tierId ? [sel.tierId] : doc.tiers.map((t) => t.id)
  const typeIds = sel.articleTypeId ? [sel.articleTypeId] : doc.articleTypes.map((t) => t.id)
  const unfiltered = !sel.tierId && !sel.articleTypeId

  const reach = selfPublishReach(doc, tierIds, typeIds)
  const tierSet = new Set(tierIds)
  const available = doc.transitions.filter((t) => isTransitionAvailable(t, tierSet, reach))

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
    selfPublishes: canSelfPublish(doc, sel.tierId, sel.articleTypeId),
    reach,
    unfiltered,
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
    return 'Showing every state and transition. Pick a writer tier or an article type to narrow it.'
  }

  const n = path.reachableStates.size
  const of = `${n} of ${doc.states.length} states`
  const tier = doc.tiers.find((t) => t.id === sel.tierId)
  const type = doc.articleTypes.find((t) => t.id === sel.articleTypeId)

  // Both chosen — one definite answer.
  if (tier && type) {
    const verdict = path.selfPublishes
      ? 'self-publishes from Grammarly Edit Complete'
      : 'routes through copy edit'
    const article = /^[aeiou]/i.test(type.label) ? 'An' : 'A'
    return `${article} ${type.label} by a ${tier.label} writer ${verdict} — ${of}.`
  }

  // Tier only — the union across every article type that tier writes.
  if (tier) {
    const allowed = (doc.selfPublish[tier.id] ?? []).length
    const total = doc.articleTypes.length
    const split =
      allowed === 0
        ? 'no type self-publishes, so everything routes through copy edit'
        : allowed === total
          ? 'every type self-publishes'
          : `${allowed} of ${total} types self-publish, the rest route through copy edit`
    return `Everywhere a ${tier.label} article can go — ${of}. Pick a type to narrow further: ${split}.`
  }

  // Type only — the union across every tier.
  const article = /^[aeiou]/i.test(type?.label ?? '') ? 'An' : 'A'
  const canSelf = doc.tiers.filter((t) => (doc.selfPublish[t.id] ?? []).includes(type?.id ?? ''))
  const who =
    canSelf.length === 0
      ? 'no tier can self-publish it'
      : `${canSelf.map((t) => t.label).join(', ')} can self-publish it`
  return `${article} ${type?.label ?? '—'} across all tiers — ${of}. Pick a tier to narrow further: ${who}.`
}
