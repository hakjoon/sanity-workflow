/**
 * Correctness checks for the lens derivation.
 *
 * Run: npm run check
 *
 * These assert the *rules*, derived from whatever the seed currently says —
 * not a memorised snapshot of it. The seed is edited in the app and exported
 * back, so hardcoded per-group state counts went stale the first time someone
 * renamed a group and re-granted a few cells. Anything here should still hold
 * after you rearrange the matrix.
 */

import seed from '../src/data/workflow.seed.json' with { type: 'json' }
import { parseWorkflow } from '../src/data/schema.ts'
import { accessLevel, derivePath } from '../src/graph/derive.ts'

const parsed = parseWorkflow(seed)
if (!parsed.ok) {
  console.error('Seed failed validation:')
  for (const e of parsed.errors) console.error('  · ' + e)
  process.exit(1)
}
const doc = parsed.doc

let failed = 0
const ok = (label: string, detail: string) => console.log(`✓ ${label.padEnd(30)} ${detail}`)
const bad = (label: string, detail: string) => {
  failed++
  console.log(`✗ ${label.padEnd(30)} ${detail}`)
}

const NONE = { viewerRoles: [] as never[], modifiers: {}, hideUnreachable: false }
const STANDARD = { ...NONE, modifiers: { oneEditor: false } }
const reviewStates = doc.reviewStages.map((r) => r.state)
const [firstStage, secondStage] = reviewStates

// ── Every group × type combination obeys its access level ─────────────
{
  let problems = 0
  let checked = 0
  for (const tier of doc.tiers) {
    for (const type of doc.articleTypes) {
      checked++
      const level = accessLevel(doc, tier.id, type.id)
      const p = derivePath(doc, { ...STANDARD, tierId: tier.id, articleTypeId: type.id })
      const where = `${tier.label} × ${type.label}`

      if (level === 'none') {
        if (!p.noAccess || p.reachableStates.size > 0) {
          problems++
          console.log(`    ${where}: no access should yield no path, got ${p.reachableStates.size} states`)
        }
      } else if (level === 'publish') {
        if (reviewStates.some((s) => p.reachableStates.has(s))) {
          problems++
          console.log(`    ${where}: self-published but reaches a review state`)
        }
      } else if (!p.reachableStates.has(firstStage)) {
        problems++
        console.log(`    ${where}: writable but never reaches ${firstStage}`)
      }
    }
  }
  if (problems) bad('access governs every path', `${problems} of ${checked} combinations wrong`)
  else ok('access governs every path', `${checked} group × type combinations`)
}

// ── A group's own summary matches its access row ──────────────────────
for (const tier of doc.tiers) {
  const entry = doc.access[tier.id]
  const p = derivePath(doc, { ...STANDARD, tierId: tier.id, articleTypeId: null })
  const stages = doc.reviewStages.filter((r) => p.reachableStates.has(r.state)).map((r) => r.short)
  const label = `${tier.label} summary`

  if (entry.publish.length === 0 && entry.write.length === 0) {
    if (p.noAccess) ok(label, 'no access to anything — no path')
    else bad(label, `writes nothing but produced ${p.reachableStates.size} states`)
  } else if (entry.write.length === 0) {
    if (stages.length === 0) ok(label, `self-publishes all ${entry.publish.length}, never reviewed`)
    else bad(label, `self-publishes everything but reaches ${stages.join(' → ')}`)
  } else if (stages.length === 2) {
    ok(label, `${entry.write.length} type(s) reviewed via ${stages.join(' → ')}`)
  } else {
    bad(label, `writes ${entry.write.length} type(s) but review is ${stages.join(' → ') || 'none'}`)
  }
}

// ── Modifiers stop review one stage early, for the groups that carry them ──
for (const m of doc.modifiers) {
  for (const tier of doc.tiers) {
    const entry = doc.access[tier.id]
    const sample = doc.articleTypes.find((t) => entry.write.includes(t.id))
    const carries = m.appliesTo.includes(tier.id)
    const label = `${tier.label} + ${m.label}`

    if (!carries) {
      const p = derivePath(doc, {
        ...NONE,
        tierId: tier.id,
        articleTypeId: sample?.id ?? null,
        modifiers: { [m.id]: true },
      })
      if (p.noAccess) ok(label, "can't carry it — correctly impossible")
      else bad(label, `cannot carry ${m.label} but produced ${p.reachableStates.size} states`)
      continue
    }
    if (!sample) {
      ok(label, 'nothing it writes needs review — no effect')
      continue
    }
    const base = { ...NONE, tierId: tier.id, articleTypeId: sample.id }
    const plain = derivePath(doc, { ...base, modifiers: { [m.id]: false } })
    const modded = derivePath(doc, { ...base, modifiers: { [m.id]: true } })
    const a = doc.reviewStages.filter((r) => plain.reachableStates.has(r.state)).length
    const b = doc.reviewStages.filter((r) => modded.reachableStates.has(r.state)).length
    if (a === 2 && b === 1 && !modded.reachableStates.has(secondStage)) {
      ok(label, `${a} editors normally, ${b} as ${m.label}`)
    } else {
      bad(label, `expected 2 then 1 editor, got ${a} then ${b}`)
    }
  }

  // Unpinned means either, so both review depths stay live.
  const carrier = doc.tiers.find(
    (t) => m.appliesTo.includes(t.id) && doc.access[t.id].write.length > 0,
  )
  const sample = carrier && doc.articleTypes.find((t) => doc.access[carrier.id].write.includes(t.id))
  if (carrier && sample) {
    const either = derivePath(doc, { ...NONE, tierId: carrier.id, articleTypeId: sample.id })
    const on = doc.transitions.filter((t) => t.whenModifier?.id === m.id && t.whenModifier.is)
    const off = doc.transitions.filter((t) => t.whenModifier?.id === m.id && !t.whenModifier.is)
    const live = (list: typeof on) => list.some((t) => either.activeTransitions.has(t.id))
    if (live(on) && live(off)) ok(`${m.label} unpinned`, 'both review depths shown')
    else bad(`${m.label} unpinned`, 'expected both review depths live')
  }
}

// ── Structural invariants, independent of the access data ─────────────

// Nothing selected shows the whole graph.
{
  const all = derivePath(doc, { ...NONE, tierId: null, articleTypeId: null })
  if (
    all.reachableStates.size === doc.states.length &&
    all.activeTransitions.size === doc.transitions.length
  ) {
    ok('no selection', `full graph — ${doc.states.length} states, ${doc.transitions.length} transitions`)
  } else {
    bad('no selection', `expected the full graph, got ${all.reachableStates.size} states`)
  }
}

// A brand-new article type is denied to everyone until granted.
{
  const withType = structuredClone(doc)
  withType.articleTypes.push({ id: '__new', label: 'Brand New' })
  const leaked = withType.tiers.filter(
    (t) => !derivePath(withType, { ...STANDARD, tierId: t.id, articleTypeId: '__new' }).noAccess,
  )
  if (leaked.length === 0) ok('default-deny (new type)', `no access for all ${doc.tiers.length} groups`)
  else bad('default-deny (new type)', `${leaked.map((t) => t.label).join(', ')} already have access`)
}

// A brand-new group is inert, and routes as soon as it is granted a type.
{
  const withGroup = structuredClone(doc)
  withGroup.tiers.push({ id: '__grp', label: 'New Group' })
  withGroup.access.__grp = { publish: [], write: [] }
  // Same as the Add group button: opt into every transition, gated by access.
  withGroup.transitions = withGroup.transitions.map((t) => ({
    ...t,
    appliesTo: [...t.appliesTo, '__grp'],
  }))

  const inert = withGroup.articleTypes.every(
    (ty) => derivePath(withGroup, { ...STANDARD, tierId: '__grp', articleTypeId: ty.id }).noAccess,
  )
  const carriesNothing = !withGroup.modifiers.some((m) => m.appliesTo.includes('__grp'))
  if (inert && carriesNothing) ok('new group is inert', 'no access, carries no modifier')
  else bad('new group is inert', 'a fresh group already has access or a modifier')

  const granted = structuredClone(withGroup)
  const someType = granted.articleTypes[0]
  granted.access.__grp = { publish: [], write: [someType.id] }
  const gp = derivePath(granted, { ...STANDARD, tierId: '__grp', articleTypeId: someType.id })
  const stages = granted.reviewStages
    .filter((r) => gp.reachableStates.has(r.state))
    .map((r) => r.short)
  if (!gp.noAccess && stages.length === 2) {
    ok('granted group routes', `write access sends it ${stages.join(' → ')}`)
  } else {
    bad('granted group routes', `expected two review stages, got ${stages.join(' → ') || 'none'}`)
  }
}

// Edits Done sits on the send-back loop only.
{
  const inbound = doc.transitions.filter((t) => t.to === 'editsDone')
  if (inbound.length === 1 && inbound[0].from === 'editsRequired') {
    ok('Edits Done is send-back only', 'sole inbound is from Edits Required')
  } else {
    bad('Edits Done is send-back only', `inbound from: ${inbound.map((t) => t.from).join(', ') || 'nothing'}`)
  }
  const outbound = doc.transitions.filter((t) => t.from === 'editsRequired')
  if (outbound.every((t) => t.to === 'editsDone')) {
    ok('Edits Required publishes not', 'only exit is to Edits Done')
  } else {
    bad('Edits Required publishes not', `also exits to: ${outbound.map((t) => t.to).join(', ')}`)
  }
}

// Highlighting several roles is the union of highlighting each alone.
{
  const tier = doc.tiers.find((t) => doc.access[t.id].write.length > 0)
  const type = tier && doc.articleTypes.find((t) => doc.access[tier.id].write.includes(t.id))
  if (tier && type) {
    const base = { ...STANDARD, tierId: tier.id, articleTypeId: type.id }
    const w = derivePath(doc, { ...base, viewerRoles: ['writer'] }).viewerTransitions
    const c = derivePath(doc, { ...base, viewerRoles: ['copyed'] }).viewerTransitions
    const both = derivePath(doc, { ...base, viewerRoles: ['writer', 'copyed'] })
    const union = new Set([...w, ...c])
    const same =
      both.viewerTransitions.size === union.size &&
      [...union].every((id) => both.viewerTransitions.has(id)) &&
      [...both.viewerTransitions].every((id) => both.activeTransitions.has(id))
    if (same) ok('multi-role is a union', `${w.size} + ${c.size} = ${both.viewerTransitions.size}`)
    else bad('multi-role is a union', `expected ${union.size}, got ${both.viewerTransitions.size}`)

    const none = derivePath(doc, { ...base, viewerRoles: [] })
    if (none.viewerTransitions.size === 0) ok('no roles selected', 'nothing emphasised')
    else bad('no roles selected', `expected 0, got ${none.viewerTransitions.size}`)
  }
}

console.log()
if (failed) {
  console.log(`${failed} check(s) failed.`)
  process.exit(1)
}
console.log('All checks passed.')
