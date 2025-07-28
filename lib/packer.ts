import type { Part, PlacedPart, Globals } from "./types"

type FreeRect = { x: number; y: number; w: number; h: number }
type Candidate = { score: number; rot: boolean; x: number; y: number; w: number; h: number; rIndex: number }

const EPS = 1e-6

export function pack(parts: Part[], globals: Globals, startSheetIndex = 0): PlacedPart[] {
  const { sheet_w, sheet_h, margin, part_gap, allow_rotation } = globals
  const packableW = sheet_w - 2 * margin
  const packableH = sheet_h - 2 * margin

  let remaining = [...parts]
  const placedParts: PlacedPart[] = []
  let sheetIndex = startSheetIndex

  while (remaining.length > 0) {
    const { placed, remaining: rem } = packSheet(remaining, packableW, packableH, allow_rotation, part_gap)
    if (placed.length === 0 && remaining.length > 0) {
      for (const p of rem) {
        placedParts.push({ ...p, sheetIndex: -1, x: 0, y: 0, rotated: false, bookColor: "", bookIndex: -1 })
      }
      break
    }
    for (const pl of placed) {
      placedParts.push({
        ...pl.part,
        sheetIndex,
        x: pl.x + margin,
        y: pl.y + margin,
        rotated: pl.rotated,
        bookColor: "",
        bookIndex: -1,
      })
    }
    remaining = rem
    sheetIndex++
  }

  return placedParts
}

function packSheet(partsIn: Part[], w: number, h: number, allowRotation: boolean, gap: number) {
  const placed: { part: Part; x: number; y: number; rotated: boolean }[] = []
  const remaining: Part[] = []

  let free: FreeRect[] = [{ x: 0, y: 0, w, h }]

  const parts = [...partsIn].sort((a, b) => Math.max(b.h, b.w) - Math.max(a.h, a.w))

  for (const part of parts) {
    const cand = chooseMaxRectsPosition(part, free, allowRotation, gap)
    if (!cand) {
      remaining.push(part)
      continue
    }

    placed.push({ part, x: cand.x, y: cand.y, rotated: cand.rot })

    const partW = cand.rot ? part.h : part.w
    const partH = cand.rot ? part.w : part.h

    // The blocked-out rectangle includes the part and its required gap.
    const blockRect = { x: cand.x, y: cand.y, w: partW + gap, h: partH + gap }

    free = splitFreeRects(free, blockRect, w, h)
    free = pruneFreeRects(free)
  }

  return { placed, remaining }
}

function chooseMaxRectsPosition(part: Part, free: FreeRect[], allowRotation: boolean, gap: number): Candidate | null {
  let best: Candidate | null = null
  for (let i = 0; i < free.length; i++) {
    const fr = free[i]
    const tryFit = (pw: number, ph: number, rot: boolean) => {
      // The rectangle to fit includes the part and its surrounding gap.
      const fitW = pw + gap
      const fitH = ph + gap
      if (fitW <= fr.w + EPS && fitH <= fr.h + EPS) {
        const score = Math.min(fr.w - fitW, fr.h - fitH) // Best Short Side Fit
        const c: Candidate = { score, rot, x: fr.x, y: fr.y, w: pw, h: ph, rIndex: i }
        if (!best || c.score < best.score) best = c
      }
    }
    // Use the part's true dimensions for fitting.
    tryFit(part.w, part.h, false)
    if (allowRotation) tryFit(part.h, part.w, true)
  }
  return best
}

function splitFreeRects(free: FreeRect[], used: FreeRect, sheetW: number, sheetH: number): FreeRect[] {
  const out: FreeRect[] = []
  for (const fr of free) {
    if (!overlap(fr, used)) {
      out.push(fr)
      continue
    }

    const ix = Math.max(fr.x, used.x)
    const iy = Math.max(fr.y, used.y)
    const ix2 = Math.min(fr.x + fr.w, used.x + used.w)
    const iy2 = Math.min(fr.y + fr.h, used.y + used.h)
    if (ix2 - ix <= EPS || iy2 - iy <= EPS) {
      out.push(fr)
      continue
    }

    // Above
    if (iy - fr.y > EPS) out.push({ x: fr.x, y: fr.y, w: fr.w, h: iy - fr.y })
    // Below
    if (fr.y + fr.h - iy2 > EPS) out.push({ x: fr.x, y: iy2, w: fr.w, h: fr.y + fr.h - iy2 })
    // Left
    if (ix - fr.x > EPS) out.push({ x: fr.x, y: iy, w: ix - fr.x, h: iy2 - iy })
    // Right
    if (fr.x + fr.w - ix2 > EPS) out.push({ x: ix2, y: iy, w: fr.x + fr.w - ix2, h: iy2 - iy })
  }

  return out
    .map((r) => ({
      x: Math.max(0, r.x),
      y: Math.max(0, r.y),
      w: Math.max(0, Math.min(sheetW, r.x + r.w) - Math.max(0, r.x)),
      h: Math.max(0, Math.min(sheetH, r.y + r.h) - Math.max(0, r.y)),
    }))
    .filter((r) => r.w > EPS && r.h > EPS)
}

function pruneFreeRects(free: FreeRect[]): FreeRect[] {
  const out: FreeRect[] = []
  for (let i = 0; i < free.length; i++) {
    let contained = false
    for (let j = 0; j < free.length; j++) {
      if (i === j) continue
      if (contains(free[j], free[i])) {
        contained = true
        break
      }
    }
    if (!contained) out.push(free[i])
  }
  return out
}

const overlap = (a: FreeRect, b: FreeRect) =>
  !(a.x + a.w <= b.x + EPS || b.x + b.w <= a.x + EPS || a.y + a.h <= b.y + EPS || b.y + b.h <= a.y + EPS)

const contains = (a: FreeRect, b: FreeRect) =>
  a.x <= b.x + EPS && a.y <= b.y + EPS && a.x + a.w >= b.x + b.w - EPS && a.y + a.h >= b.y + b.h - EPS
