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
  const path = derivePath(doc, { tierId: c.tier, articleTypeId: c.type, viewerRole: null })
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
const dtpCopyed = derivePath(doc, { tierId: 'dtp', articleTypeId: 'shorty', viewerRole: 'copyed' })
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
  const p = derivePath(withNewType, { tierId: tier.id, articleTypeId: 'brandNew', viewerRole: null })
  if (p.selfPublishes || !p.reachableStates.has('readyCopy')) {
    denyFailed = true
    console.log(`✗ default-deny: ${tier.id} did not route a new type through copy edit`)
  }
}
if (!denyFailed) console.log(`✓ ${'default-deny (new type)'.padEnd(24)} all 5 tiers route to copy edit`)
else failed++

console.log()
if (failed) {
  console.log(`${failed} check(s) failed.`)
  process.exit(1)
}
console.log('All checks passed.')
