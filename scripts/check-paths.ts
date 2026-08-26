/**
 * Correctness check for the lens derivation.
 *
 * Run: npm run check
 *
 * These are the spot-checks from the plan. If the self-publish matrix or the
 * transition gating drifts, this is what catches it.
 */

import seed from '../src/data/workflow.seed.json' with { type: 'json' }
import { parseWorkflow } from '../src/data/schema.ts'
import { derivePath } from '../src/graph/derive.ts'

const parsed = parseWorkflow(seed)
if (!parsed.ok) {
  console.error('Seed failed validation:')
  for (const e of parsed.errors) console.error('  · ' + e)
  process.exit(1)
}
const doc = parsed.doc

interface Case {
  tier: string
  type: string
  states: number
  /** State ids that must NOT be reachable. */
  excludes?: string[]
}

const CASES: Case[] = [
  { tier: 'ultraDTP', type: 'shorty', states: 6, excludes: ['readyCopy', 'inCopy', 'inFinancial'] },
  { tier: 'ultraDTP', type: 'aiAssist', states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'midDTP', type: 'newsBrief', states: 6, excludes: ['readyCopy', 'inCopy', 'inFinancial'] },
  { tier: 'midDTP', type: 'shorty', states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'dtp', type: 'shorty', states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'swUser', type: 'shorty', states: 12 },
  { tier: 'aiAssist', type: 'aiAssist', states: 6, excludes: ['readyCopy', 'inCopy'] },
  { tier: 'aiAssist', type: 'shorty', states: 10, excludes: ['readyFinancial', 'inFinancial'] },
]

let failed = 0

for (const c of CASES) {
  const path = derivePath(doc, { tierId: c.tier, articleTypeId: c.type, viewerRoles: [], hideUnreachable: false })
  const n = path.reachableStates.size
  const problems: string[] = []

  if (n !== c.states) problems.push(`expected ${c.states} states, got ${n}`)
  for (const ex of c.excludes ?? []) {
    if (path.reachableStates.has(ex)) problems.push(`"${ex}" should not be reachable`)
  }

  const label = `${c.tier} + ${c.type}`.padEnd(24)
  if (problems.length) {
    failed++
    console.log(`✗ ${label} ${problems.join('; ')}`)
    console.log(`    reached: ${[...path.reachableStates].join(', ')}`)
  } else {
    console.log(`✓ ${label} ${n} states, self-publish=${path.selfPublishes}`)
  }
}

// Viewer-role check from the plan: DTP + Copyed.
const dtpCopyed = derivePath(doc, { tierId: 'dtp', articleTypeId: 'shorty', viewerRoles: ['copyed'], hideUnreachable: false })
const expected = new Set([
  't-readyCopy-inCopy',
  't-inCopy-scheduled',
  't-inCopy-editsRequired',
  't-editsDone-scheduled-copyed',
])
const got = dtpCopyed.viewerTransitions
const same = got.size === expected.size && [...expected].every((id) => got.has(id))
if (same) {
  console.log(`✓ ${'DTP + viewer=Copyed'.padEnd(24)} 4 actionable transitions`)
} else {
  failed++
  console.log(`✗ ${'DTP + viewer=Copyed'.padEnd(24)} expected ${[...expected].sort().join(', ')}`)
  console.log(`    got: ${[...got].sort().join(', ')}`)
}

// Default-deny: a brand-new article type must route every tier through copy edit.
const withNewType = structuredClone(doc)
withNewType.articleTypes.push({ id: 'brandNew', label: 'Brand New' })
let denyFailed = false
for (const tier of withNewType.tiers) {
  const p = derivePath(withNewType, { tierId: tier.id, articleTypeId: 'brandNew', viewerRoles: [], hideUnreachable: false })
  if (p.selfPublishes || !p.reachableStates.has('readyCopy')) {
    denyFailed = true
    console.log(`✗ default-deny: ${tier.id} did not route a new type through copy edit`)
  }
}
if (!denyFailed) console.log(`✓ ${'default-deny (new type)'.padEnd(24)} all 5 tiers route to copy edit`)
else failed++

// Tier alone, "All types": the union across every type that tier writes.
// This is the case that used to fall through to "show everything".
interface TierCase { tier: string; states: number; excludes?: string[] }
const TIER_ONLY: TierCase[] = [
  { tier: 'midDTP',   states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'ultraDTP', states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'dtp',      states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'aiAssist', states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'swUser',   states: 12 },
]
for (const c of TIER_ONLY) {
  const p = derivePath(doc, { tierId: c.tier, articleTypeId: null, viewerRoles: [], hideUnreachable: false })
  const problems: string[] = []
  if (p.reachableStates.size !== c.states) problems.push(`expected ${c.states} states, got ${p.reachableStates.size}`)
  for (const ex of c.excludes ?? []) {
    if (p.reachableStates.has(ex)) problems.push(`"${ex}" should not be reachable`)
  }
  const label = `${c.tier} + all types`.padEnd(24)
  if (problems.length) { failed++; console.log(`✗ ${label} ${problems.join('; ')}`) }
  else console.log(`✓ ${label} ${p.reachableStates.size} states`)
}

// A tier that self-publishes some types but not others must show BOTH forks
// out of Grammarly Edit Complete when no type is pinned.
const midAll = derivePath(doc, { tierId: 'midDTP', articleTypeId: null, viewerRoles: [], hideUnreachable: false })
const bothForks =
  midAll.activeTransitions.has('t-grammarly-scheduled') &&
  midAll.activeTransitions.has('t-grammarly-readyCopy')
if (bothForks) console.log(`✓ ${'midDTP both forks live'.padEnd(24)} self-publish and copy-edit routes both shown`)
else { failed++; console.log('✗ midDTP + all types: expected both Grammarly forks to be live') }

// SWUser self-publishes nothing, so the self-publish fork must stay dark.
const swAll = derivePath(doc, { tierId: 'swUser', articleTypeId: null, viewerRoles: [], hideUnreachable: false })
if (!swAll.activeTransitions.has('t-grammarly-scheduled')) {
  console.log(`✓ ${'swUser no self-publish'.padEnd(24)} fork correctly dark across all types`)
} else { failed++; console.log('✗ swUser + all types: self-publish fork should not be live') }

// Nothing selected still shows the whole graph.
const nothing = derivePath(doc, { tierId: null, articleTypeId: null, viewerRoles: [], hideUnreachable: false })
if (nothing.reachableStates.size === doc.states.length && nothing.activeTransitions.size === doc.transitions.length) {
  console.log(`✓ ${'no selection'.padEnd(24)} full graph, ${nothing.activeTransitions.size} transitions`)
} else { failed++; console.log(`✗ no selection: expected full graph, got ${nothing.reachableStates.size} states`) }

// Multi-role highlight: writers + copyeds together must equal the union of
// each alone, and must not exceed the active set.
const dtpBase = { tierId: 'dtp', articleTypeId: 'shorty', hideUnreachable: false }
const w = derivePath(doc, { ...dtpBase, viewerRoles: ['writer'] }).viewerTransitions
const c = derivePath(doc, { ...dtpBase, viewerRoles: ['copyed'] }).viewerTransitions
const both = derivePath(doc, { ...dtpBase, viewerRoles: ['writer', 'copyed'] })
const union = new Set([...w, ...c])
const unionOk =
  both.viewerTransitions.size === union.size &&
  [...union].every((id) => both.viewerTransitions.has(id)) &&
  [...both.viewerTransitions].every((id) => both.activeTransitions.has(id))
if (unionOk) {
  console.log(`✓ ${'multi-role writer+copyed'.padEnd(24)} ${w.size} + ${c.size} = ${both.viewerTransitions.size} of ${both.activeTransitions.size} active`)
} else {
  failed++
  console.log(`✗ multi-role writer+copyed: expected union of ${w.size} and ${c.size}, got ${both.viewerTransitions.size}`)
}

// Empty role list means no emphasis at all.
const none = derivePath(doc, { ...dtpBase, viewerRoles: [] })
if (none.viewerTransitions.size === 0) {
  console.log(`✓ ${'no roles selected'.padEnd(24)} nothing emphasised`)
} else {
  failed++
  console.log(`✗ no roles selected: expected 0 emphasised, got ${none.viewerTransitions.size}`)
}

console.log()
if (failed) {
  console.log(`${failed} check(s) failed.`)
  process.exit(1)
}
console.log('All checks passed.')
