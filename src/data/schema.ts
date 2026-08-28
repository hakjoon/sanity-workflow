/**
 * Types for the workflow document, plus a validator used on JSON import.
 *
 * The validator deliberately checks only the things that actually break the
 * app — dangling references, duplicate ids, unknown enum members, an
 * unreadable version. It is not a general-purpose schema library.
 */

export const SCHEMA_VERSION = 2

export type RoleId = 'writer' | 'copyed' | 'ffe' | 'hq' | 'system'

export const ROLE_IDS: RoleId[] = ['writer', 'copyed', 'ffe', 'hq', 'system']

export const ROLES: Record<RoleId, { label: string; short: string }> = {
  writer: { label: 'Writers — SWUser · DTP · MidDTP · UltraDTP · AI-assist', short: 'Writers' },
  copyed: { label: 'Copyeds', short: 'Copyeds' },
  ffe: { label: 'FFEs', short: 'FFEs' },
  hq: { label: 'HQ editors', short: 'HQ' },
  system: { label: 'System (automatic)', short: 'System' },
}

export type BadgeId = 'claimable' | 'claimed' | 'tbd' | 'access' | 'branch'

export const BADGES: Record<BadgeId, string> = {
  claimable: 'Claimable',
  claimed: 'Claimed',
  tbd: 'Claim model TBD',
  access: 'Access TBD',
  branch: 'Branch',
}

/**
 * What a writer tier may do with an article type.
 *
 *   publish — self-publishes it, skipping review entirely
 *   write   — writes it, but it must go through review
 *   none    — no access; that tier never authors this type
 *
 * Stored as two id lists per tier rather than a full grid, so anything
 * unlisted is `none` by construction — new article types are denied to
 * everyone until someone grants them.
 */
export type AccessLevel = 'publish' | 'write' | 'none'

export interface TierAccess {
  publish: string[]
  write: string[]
}

export type HandleId = 't' | 'r' | 'b' | 'l'

/** Gate on the Grammarly fork. Absent means "no gate — applies to all". */
export type Gate = 'selfPublish' | '!selfPublish'

export interface Tier {
  id: string
  label: string
  headcount: number | null
  note?: string
}

export interface ArticleType {
  id: string
  label: string
}

/**
 * A review step an article can pass through, named so the review-path legend
 * can be derived from reachability rather than hardcoding state ids.
 */
export interface ReviewStage {
  id: string
  label: string
  /** Abbreviation used in the compact route column, e.g. "CE". */
  short: string
  /** The state that means this stage happened. */
  state: string
}

export interface Actor {
  /** null renders in muted body colour rather than a role colour. */
  role: RoleId | null
  text: string
}

export interface WorkflowState {
  id: string
  title: string
  position: { x: number; y: number }
  accent: RoleId
  border: 'solid' | 'dashed'
  badges: BadgeId[]
  actors: Actor[]
}

export interface Transition {
  id: string
  from: string
  to: string
  sourceHandle: HandleId
  targetHandle: HandleId
  role: RoleId
  style: 'solid' | 'dashed'
  label: string
  /** Tier ids this transition is available to. */
  appliesTo: string[]
  gate?: Gate
  note?: string
}

export interface WorkflowNotes {
  answered: string[]
  open: string[]
  routing: string
  caveat: string
}

export interface WorkflowDoc {
  version: number
  tiers: Tier[]
  articleTypes: ArticleType[]
  /** tier id -> what that tier may do with each article type. */
  access: Record<string, TierAccess>
  states: WorkflowState[]
  transitions: Transition[]
  reviewStages: ReviewStage[]
  hqOverride: boolean
  notes: WorkflowNotes
}

export type ParseResult =
  | { ok: true; doc: WorkflowDoc }
  | { ok: false; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/**
 * Validate an unknown value as a WorkflowDoc.
 *
 * Returns every problem found rather than throwing on the first, so a bad
 * import surfaces as a readable list instead of one error at a time.
 */
export function parseWorkflow(input: unknown): ParseResult {
  const errors: string[] = []

  if (!isObj(input)) return { ok: false, errors: ['Root value is not an object.'] }

  if (typeof input.version !== 'number') {
    errors.push('Missing or non-numeric "version".')
  } else if (input.version !== SCHEMA_VERSION) {
    errors.push(
      `Version ${input.version} does not match this app's schema version ${SCHEMA_VERSION}.`,
    )
  }

  // ── Tiers ──────────────────────────────────────────────────────────
  const tierIds = new Set<string>()
  if (!Array.isArray(input.tiers) || input.tiers.length === 0) {
    errors.push('"tiers" must be a non-empty array.')
  } else {
    input.tiers.forEach((t, i) => {
      if (!isObj(t) || typeof t.id !== 'string' || typeof t.label !== 'string') {
        errors.push(`tiers[${i}]: needs string "id" and "label".`)
        return
      }
      if (tierIds.has(t.id)) errors.push(`tiers[${i}]: duplicate tier id "${t.id}".`)
      tierIds.add(t.id)
    })
  }

  // ── Article types ──────────────────────────────────────────────────
  const typeIds = new Set<string>()
  if (!Array.isArray(input.articleTypes) || input.articleTypes.length === 0) {
    errors.push('"articleTypes" must be a non-empty array.')
  } else {
    input.articleTypes.forEach((t, i) => {
      if (!isObj(t) || typeof t.id !== 'string' || typeof t.label !== 'string') {
        errors.push(`articleTypes[${i}]: needs string "id" and "label".`)
        return
      }
      if (typeIds.has(t.id)) errors.push(`articleTypes[${i}]: duplicate type id "${t.id}".`)
      typeIds.add(t.id)
    })
  }

  // ── Access matrix ──────────────────────────────────────────────────
  if (!isObj(input.access)) {
    errors.push('"access" must be an object keyed by tier id.')
  } else {
    for (const [tierId, entry] of Object.entries(input.access)) {
      if (!tierIds.has(tierId)) {
        errors.push(`access: "${tierId}" is not a known tier.`)
        continue
      }
      if (!isObj(entry)) {
        errors.push(`access["${tierId}"]: must be an object with "publish" and "write" arrays.`)
        continue
      }
      const seen = new Set<string>()
      for (const level of ['publish', 'write'] as const) {
        const list = entry[level]
        if (!isStrArray(list)) {
          errors.push(`access["${tierId}"].${level}: must be an array of article type ids.`)
          continue
        }
        for (const ty of list) {
          if (!typeIds.has(ty)) {
            errors.push(`access["${tierId}"].${level}: "${ty}" is not a known article type.`)
          }
          if (seen.has(ty)) {
            errors.push(`access["${tierId}"]: "${ty}" appears in both publish and write.`)
          }
          seen.add(ty)
        }
      }
    }
    for (const tierId of tierIds) {
      if (!(tierId in input.access)) {
        errors.push(`access: missing entry for tier "${tierId}".`)
      }
    }
  }

  // ── States ─────────────────────────────────────────────────────────
  const stateIds = new Set<string>()
  if (!Array.isArray(input.states) || input.states.length === 0) {
    errors.push('"states" must be a non-empty array.')
  } else {
    input.states.forEach((s, i) => {
      if (!isObj(s) || typeof s.id !== 'string' || typeof s.title !== 'string') {
        errors.push(`states[${i}]: needs string "id" and "title".`)
        return
      }
      if (stateIds.has(s.id)) errors.push(`states[${i}]: duplicate state id "${s.id}".`)
      stateIds.add(s.id)

      if (!isObj(s.position) || typeof s.position.x !== 'number' || typeof s.position.y !== 'number') {
        errors.push(`states[${i}] ("${s.id}"): "position" needs numeric x and y.`)
      }
      if (typeof s.accent !== 'string' || !ROLE_IDS.includes(s.accent as RoleId)) {
        errors.push(`states[${i}] ("${s.id}"): unknown accent role "${String(s.accent)}".`)
      }
      if (s.border !== 'solid' && s.border !== 'dashed') {
        errors.push(`states[${i}] ("${s.id}"): "border" must be "solid" or "dashed".`)
      }
      if (!Array.isArray(s.badges) || s.badges.some((b) => typeof b !== 'string' || !(b in BADGES))) {
        errors.push(`states[${i}] ("${s.id}"): "badges" contains an unknown badge.`)
      }
      if (!Array.isArray(s.actors)) {
        errors.push(`states[${i}] ("${s.id}"): "actors" must be an array.`)
      }
    })
  }

  // ── Transitions ────────────────────────────────────────────────────
  const transitionIds = new Set<string>()
  if (!Array.isArray(input.transitions)) {
    errors.push('"transitions" must be an array.')
  } else {
    input.transitions.forEach((t, i) => {
      if (!isObj(t) || typeof t.id !== 'string') {
        errors.push(`transitions[${i}]: needs a string "id".`)
        return
      }
      const at = `transitions[${i}] ("${t.id}")`
      if (transitionIds.has(t.id)) errors.push(`${at}: duplicate transition id.`)
      transitionIds.add(t.id)

      if (typeof t.from !== 'string' || !stateIds.has(t.from)) {
        errors.push(`${at}: "from" references unknown state "${String(t.from)}".`)
      }
      if (typeof t.to !== 'string' || !stateIds.has(t.to)) {
        errors.push(`${at}: "to" references unknown state "${String(t.to)}".`)
      }
      if (typeof t.role !== 'string' || !ROLE_IDS.includes(t.role as RoleId)) {
        errors.push(`${at}: unknown role "${String(t.role)}".`)
      }
      if (t.style !== 'solid' && t.style !== 'dashed') {
        errors.push(`${at}: "style" must be "solid" or "dashed".`)
      }
      if (!isStrArray(t.appliesTo)) {
        errors.push(`${at}: "appliesTo" must be an array of tier ids.`)
      } else {
        for (const tier of t.appliesTo) {
          if (!tierIds.has(tier)) errors.push(`${at}: appliesTo references unknown tier "${tier}".`)
        }
      }
      if (t.gate !== undefined && t.gate !== 'selfPublish' && t.gate !== '!selfPublish') {
        errors.push(`${at}: "gate" must be "selfPublish" or "!selfPublish".`)
      }
    })
  }

  // ── Review stages ──────────────────────────────────────────────────
  if (!Array.isArray(input.reviewStages)) {
    errors.push('"reviewStages" must be an array.')
  } else {
    input.reviewStages.forEach((r, i) => {
      if (!isObj(r) || typeof r.id !== 'string' || typeof r.label !== 'string' || typeof r.short !== 'string') {
        errors.push(`reviewStages[${i}]: needs string "id", "label" and "short".`)
        return
      }
      if (typeof r.state !== 'string' || !stateIds.has(r.state)) {
        errors.push(`reviewStages[${i}] ("${r.id}"): "state" references unknown state "${String(r.state)}".`)
      }
    })
  }

  if (typeof input.hqOverride !== 'boolean') errors.push('"hqOverride" must be a boolean.')
  if (!isObj(input.notes)) errors.push('"notes" must be an object.')

  if (errors.length) return { ok: false, errors }
  return { ok: true, doc: input as unknown as WorkflowDoc }
}
