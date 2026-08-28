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
  { tier: 'ultraDTP', type: 'aiAssist', states: 0 },   // no access
  { tier: 'midDTP', type: 'newsBrief', states: 6, excludes: ['readyCopy', 'inCopy', 'inFinancial'] },
  { tier: 'midDTP', type: 'shorty', states: 12 },
  { tier: 'dtp', type: 'shorty', states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'swUser', type: 'shorty', states: 12 },
  { tier: 'aiAssist', type: 'aiAssist', states: 6, excludes: ['readyCopy', 'inCopy'] },
  { tier: 'aiAssist', type: 'shorty', states: 12 },
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
  if (!p.noAccess || p.reachableStates.size !== 0) {
    denyFailed = true
    console.log(`✗ default-deny: ${tier.id} has access to a brand-new type`)
  }
}
if (!denyFailed) console.log(`✓ ${'default-deny (new type)'.padEnd(24)} no access for all 5 tiers until granted`)
else failed++

// No-access selections describe an article that doesn't exist.
const noAcc = derivePath(doc, { tierId: 'swUser', articleTypeId: 'aiAssist', viewerRoles: [], hideUnreachable: false })
if (noAcc.noAccess && noAcc.reachableStates.size === 0) console.log(`✓ ${'no-access selection'.padEnd(24)} SWUser + AI-Assist yields no path`)
else { failed++; console.log(`✗ SWUser + AI-Assist should have no path, got ${noAcc.reachableStates.size} states`) }

// Picking a type alone narrows to the tiers that actually write it.
const aiOnly = derivePath(doc, { tierId: null, articleTypeId: 'aiAssist', viewerRoles: [], hideUnreachable: false })
if (aiOnly.reachableStates.size === 6 && !aiOnly.reachableStates.has('inCopy')) {
  console.log(`✓ ${'AI-Assist across tiers'.padEnd(24)} only the AI-assist tier writes it — self-publish path`)
} else { failed++; console.log(`✗ AI-Assist across tiers: expected 6 self-publish states, got ${aiOnly.reachableStates.size}`) }

// Tier alone, "All types": the union across every type that tier writes.
// This is the case that used to fall through to "show everything".
interface TierCase { tier: string; states: number; excludes?: string[] }
const TIER_ONLY: TierCase[] = [
  { tier: 'midDTP',   states: 12 },
  { tier: 'ultraDTP', states: 6, excludes: ['readyCopy', 'inCopy', 'readyFinancial', 'inFinancial'] },
  { tier: 'dtp',      states: 10, excludes: ['readyFinancial', 'inFinancial'] },
  { tier: 'aiAssist', states: 12 },
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

// Editors per article: DTP is the only tier that stops at copy edit.
const REVIEW: Array<[string, string[]]> = [
  ['swUser',   ['inCopy', 'inFinancial']],
  ['dtp',      ['inCopy']],
  ['midDTP',   ['inCopy', 'inFinancial']],
  ['ultraDTP', []],   // every type it writes self-publishes; AI-Assist is no-access
  ['aiAssist', ['inCopy', 'inFinancial']],
]
for (const [tier, expectedStages] of REVIEW) {
  const sample = doc.articleTypes.find((t) => (doc.access[tier]?.write ?? []).includes(t.id))
  if (!sample) {
    const ok = expectedStages.length === 0
    if (ok) console.log(`✓ ${(tier + ' review stages').padEnd(24)} never enters review`)
    else { failed++; console.log(`✗ ${tier}: expected ${expectedStages.join(' → ')} but it writes nothing that needs review`) }
    continue
  }
  const p = derivePath(doc, { tierId: tier, articleTypeId: sample.id, viewerRoles: [], hideUnreachable: false })
  const got = doc.reviewStages.filter((r) => p.reachableStates.has(r.state)).map((r) => r.state)
  const ok = got.length === expectedStages.length && expectedStages.every((x) => got.includes(x))
  const label = `${tier} review stages`.padEnd(24)
  if (ok) console.log(`✓ ${label} ${got.length} editor(s) via ${got.join(' → ')}`)
  else { failed++; console.log(`✗ ${label} expected ${expectedStages.join(' → ')}, got ${got.join(' → ') || 'none'}`) }
}

// Edits Done is optional and only exists on the send-back loop: the only way
// in is from Edits Required. If an edit ever gives it another inbound edge,
// the notes panel stops being true.
const intoEditsDone = doc.transitions.filter((t) => t.to === 'editsDone')
if (intoEditsDone.length === 1 && intoEditsDone[0].from === 'editsRequired') {
  console.log(`✓ ${'Edits Done is send-back only'.padEnd(24)} sole inbound is from Edits Required`)
} else {
  failed++
  console.log(`✗ Edits Done should only be reachable from Edits Required, got: ${intoEditsDone.map((t) => t.from).join(', ') || 'nothing'}`)
}

// And nothing publishes directly out of Edits Required.
const outOfEditsRequired = doc.transitions.filter((t) => t.from === 'editsRequired')
if (outOfEditsRequired.every((t) => t.to === 'editsDone')) {
  console.log(`✓ ${'Edits Required publishes not'.padEnd(24)} only exit is to Edits Done`)
} else {
  failed++
  console.log(`✗ Edits Required should only exit to Edits Done, got: ${outOfEditsRequired.map((t) => t.to).join(', ')}`)
}

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
