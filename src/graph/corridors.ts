import { Position } from '@xyflow/react'

/**
 * The long leg of a smoothstep edge whose position React Flow picks itself,
 * so every edge in the same situation lands on the same line:
 *
 * - `center`: between opposite handles, the leg sits at the midpoint between
 *   the two ends. Moved by passing an explicit centre.
 * - `offset`: between two handles on the same side, the leg runs `offset`
 *   beyond the further end. Moved by lengthening the offset, so it can only
 *   go further out.
 *
 * `axis` is the coordinate that is constant along the leg.
 */
export interface MidLeg {
  kind: 'center' | 'offset'
  axis: 'x' | 'y'
  at: number
  /** Extent along the other coordinate. */
  from: number
  to: number
  /** Where the leg may move to without folding back over its own ends. */
  min: number
  max: number
}

/** Apart enough that two stacked label chips don't touch. */
export const CORRIDOR_GAP = 26

const DIR: Record<Position, { x: number; y: number }> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
}

/**
 * Mirrors React Flow's `getPoints` for the opposite-handle and same-side
 * cases. Returns null for mixed sides (bottom → left, say), where the bend
 * sits at the handle offset and `lane` already controls it.
 */
export function midLeg(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePosition: Position,
  targetPosition: Position,
  offset: number,
): MidLeg | null {
  const sd = DIR[sourcePosition]
  const td = DIR[targetPosition]
  const sg = { x: sx + sd.x * offset, y: sy + sd.y * offset }
  const tg = { x: tx + td.x * offset, y: ty + td.y * offset }
  const acc = sourcePosition === Position.Left || sourcePosition === Position.Right ? 'x' : 'y'
  const other = acc === 'x' ? 'y' : 'x'

  if (sourcePosition === targetPosition) {
    const out = sd[acc]
    const at = out > 0 ? Math.max(sg[acc], tg[acc]) : Math.min(sg[acc], tg[acc])
    return {
      kind: 'offset',
      axis: acc,
      at,
      from: Math.min(sg[other], tg[other]),
      to: Math.max(sg[other], tg[other]),
      min: out > 0 ? at : -Infinity,
      max: out > 0 ? Infinity : at,
    }
  }
  if (sd[acc] * td[acc] !== -1) return null

  const heading = sg[acc] < tg[acc] ? 1 : -1
  if (sd[acc] === heading) {
    // Running forward: the leg crosses the gap between the ends and must stay inside it.
    return {
      kind: 'center',
      axis: acc,
      at: (sg[acc] + tg[acc]) / 2,
      from: Math.min(sg[other], tg[other]),
      to: Math.max(sg[other], tg[other]),
      min: Math.min(sg[acc], tg[acc]),
      max: Math.max(sg[acc], tg[acc]),
    }
  }
  // Doubling back: the leg runs alongside, and can sit anywhere.
  return {
    kind: 'center',
    axis: other,
    at: (sg[other] + tg[other]) / 2,
    from: Math.min(sg[acc], tg[acc]),
    to: Math.max(sg[acc], tg[acc]),
    min: -Infinity,
    max: Infinity,
  }
}

/**
 * Spread legs that would overlap — same axis, closer than `gap`, and sharing
 * part of their extent — `gap` apart. A group that can move either way
 * spreads evenly around its mean; one whose legs can only move outwards
 * stacks outwards from the innermost. Legs with nothing to collide with keep
 * React Flow's own position.
 */
export function spreadCorridors(legs: Map<string, MidLeg>, gap = CORRIDOR_GAP): Map<string, number> {
  const ids = [...legs.keys()]
  const parent = new Map(ids.map((id) => [id, id]))
  const find = (id: string): string => {
    const p = parent.get(id)!
    if (p === id) return id
    const root = find(p)
    parent.set(id, root)
    return root
  }

  for (let i = 0; i < ids.length; i++) {
    const a = legs.get(ids[i])!
    for (let j = i + 1; j < ids.length; j++) {
      const b = legs.get(ids[j])!
      if (a.axis !== b.axis || Math.abs(a.at - b.at) >= gap) continue
      if (a.from > b.to || b.from > a.to) continue
      parent.set(find(ids[i]), find(ids[j]))
    }
  }

  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const root = find(id)
    groups.set(root, [...(groups.get(root) ?? []), id])
  }

  const out = new Map<string, number>()
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const group = members.map((id) => ({ id, leg: legs.get(id)! }))
    group.sort((p, q) => p.leg.at - q.leg.at || p.leg.from - q.leg.from || p.id.localeCompare(q.id))

    const outward = group.some((m) => m.leg.max === Infinity && m.leg.min !== -Infinity)
    const inward = group.some((m) => m.leg.min === -Infinity && m.leg.max !== Infinity)

    if (outward && !inward) {
      let prev = -Infinity
      for (const m of group) {
        prev = Math.min(m.leg.max, Math.max(m.leg.min, m.leg.at, prev + gap))
        out.set(m.id, prev)
      }
    } else if (inward && !outward) {
      let prev = Infinity
      for (const m of [...group].reverse()) {
        prev = Math.max(m.leg.min, Math.min(m.leg.max, m.leg.at, prev - gap))
        out.set(m.id, prev)
      }
    } else {
      const mean = group.reduce((sum, m) => sum + m.leg.at, 0) / group.length
      group.forEach((m, k) => {
        const want = mean + (k - (group.length - 1) / 2) * gap
        out.set(m.id, Math.min(m.leg.max - 1, Math.max(m.leg.min + 1, want)))
      })
    }
  }
  return out
}

/*
 * Each edge only knows its own geometry, so edges report their leg here and
 * read back the spread position. Recomputed once per microtask, so a drag
 * that moves many edges settles in one pass.
 */
const reported = new Map<string, MidLeg>()
let assigned = new Map<string, number>()
const listeners = new Set<() => void>()
let pending = false

function sameLeg(a: MidLeg | undefined, b: MidLeg | null): boolean {
  if (!a || !b) return !a && !b
  return (
    a.kind === b.kind &&
    a.axis === b.axis &&
    a.at === b.at &&
    a.from === b.from &&
    a.to === b.to &&
    a.min === b.min &&
    a.max === b.max
  )
}

export function reportLeg(id: string, leg: MidLeg | null): void {
  if (sameLeg(reported.get(id), leg)) return
  if (leg) reported.set(id, leg)
  else reported.delete(id)
  if (pending) return
  pending = true
  queueMicrotask(() => {
    pending = false
    assigned = spreadCorridors(reported)
    listeners.forEach((l) => l())
  })
}

export function subscribeCorridors(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function corridorPosition(id: string): number | undefined {
  return assigned.get(id)
}
