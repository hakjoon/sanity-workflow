/**
 * Lens derivation: given a writer tier and an article type, work out which
 * states an article can reach and which transitions it can travel.
 *
 * The interesting rule lives at Grammarly Edit Complete. Whether an article
 * self-publishes from there is decided by the tier × article-type matrix,
 * not by the tier alone — so a MidDTP News brief and a MidDTP Shorty take
 * different paths out of the same state.
 */

import type { AccessLevel, RoleId, Transition, WorkflowDoc } from '../data/schema'

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
  /** True when the selection describes an article nobody writes. */
  noAccess: boolean
  /** True when neither a tier nor a type is selected. */
  unfiltered: boolean
}

/** The state every article starts in. First state in the document. */
export function entryStateId(doc: WorkflowDoc): string | null {
  return doc.states[0]?.id ?? null
}

/** What the tier may do with the type. Anything unlisted is no access. */
export function accessLevel(
  doc: WorkflowDoc,
  tierId: string,
  articleTypeId: string,
): AccessLevel {
  const entry = doc.access[tierId]
  if (!entry) return 'none'
  if (entry.publish.includes(articleTypeId)) return 'publish'
  if (entry.write.includes(articleTypeId)) return 'write'
  return 'none'
}

export function canSelfPublish(
  doc: WorkflowDoc,
  tierId: string | null,
  articleTypeId: string | null,
): boolean {
  if (!tierId || !articleTypeId) return false
  return accessLevel(doc, tierId, articleTypeId) === 'publish'
}

/** Article types a tier can author at all, at either access level. */
export function writableTypes(doc: WorkflowDoc, tierId: string): string[] {
  const entry = doc.access[tierId]
  return entry ? [...entry.publish, ...entry.write] : []
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
  let any = false
  let none = false
  for (const tier of tierIds) {
    for (const type of typeIds) {
      // Combinations the tier has no access to aren't articles that exist,
      // so they can't make either branch live.
      const level = accessLevel(doc, tier, type)
      if (level === 'publish') any = true
      else if (level === 'write') none = true
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
  let tierIds = sel.tierId ? [sel.tierId] : doc.tiers.map((t) => t.id)
  let typeIds = sel.articleTypeId ? [sel.articleTypeId] : doc.articleTypes.map((t) => t.id)
  const unfiltered = !sel.tierId && !sel.articleTypeId

  // Narrow each axis to combinations that actually exist. Picking a type only
  // should show the tiers that write it, not every tier; picking a tier only
  // should ignore types it has no access to.
  if (sel.articleTypeId && !sel.tierId) {
    tierIds = tierIds.filter((t) => accessLevel(doc, t, sel.articleTypeId as string) !== 'none')
  }
  if (sel.tierId && !sel.articleTypeId) {
    typeIds = typeIds.filter((t) => accessLevel(doc, sel.tierId as string, t) !== 'none')
  }

  // A tier that cannot author this type has no path at all.
  const noAccess =
    !!sel.tierId && !!sel.articleTypeId && accessLevel(doc, sel.tierId, sel.articleTypeId) === 'none'
  if (noAccess || tierIds.length === 0 || typeIds.length === 0) {
    return {
      reachableStates: new Set(),
      activeTransitions: new Set(),
      viewerTransitions: new Set(),
      selfPublishes: false,
      reach: { any: false, none: false },
      noAccess: true,
      unfiltered: false,
    }
  }

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
    noAccess: false,
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

  if (path.noAccess) {
    if (tier && type) return `${tier.label} writers have no access to ${type.label} — that article doesn't exist.`
    if (type) return `No tier can write ${type.label} yet — grant write or self-publish access below.`
    return `${tier?.label ?? 'This tier'} has no article types yet — grant access below.`
  }

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
    const entry = doc.access[tier.id]
    const pub = entry?.publish.length ?? 0
    const wr = entry?.write.length ?? 0
    const split =
      wr === 0
        ? `all ${pub} types it writes self-publish, so it never enters review`
        : pub === 0
          ? `none of its ${wr} types self-publish, so everything goes to review`
          : `${pub} of its ${pub + wr} types self-publish, the other ${wr} go to review`
    return `Everywhere a ${tier.label} article can go — ${of}. ${split[0].toUpperCase()}${split.slice(1)}.`
  }

  // Type only — the union across every tier.
  const article = /^[aeiou]/i.test(type?.label ?? '') ? 'An' : 'A'
  const typeId = type?.id ?? ''
  const writers = doc.tiers.filter((t) => accessLevel(doc, t.id, typeId) !== 'none')
  const selfPub = doc.tiers.filter((t) => accessLevel(doc, t.id, typeId) === 'publish')
  const who =
    selfPub.length === 0
      ? 'none of them self-publish it'
      : `${selfPub.map((t) => t.label).join(' and ')} self-publish it`
  return `${article} ${type?.label ?? '—'} — ${of}. Written by ${writers.map((t) => t.label).join(', ')}; ${who}.`
}
