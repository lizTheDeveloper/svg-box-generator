/**
 * @file Implements the packing algorithm for arranging parts onto sheets.
 * This uses a version of the MaxRects algorithm (Best Short Side Fit heuristic).
 * It's designed to efficiently place parts while respecting a defined gap between them.
 * The core strategy is to treat each part as if it's larger by the size of the gap,
 * ensuring that the final placements are always valid and never overlap.
 */

import type { Part, PlacedPart, Globals } from "./types"

type FreeRect = { x: number; y: number; w: number; h: number }
type Candidate = { score: number; rot: boolean; x: number; y: number; w: number; h: number; rIndex: number }

const EPS = 1e-6

/**
 * Main packing function. It takes a list of parts and orchestrates the packing process
 * across multiple sheets.
 * @param parts - An array of `Part` objects to be placed.
 * @param globals - The global settings, including sheet dimensions and gaps.
 * @param startSheetIndex - The index to start numbering sheets from.
 * @returns An array of `PlacedPart` objects. Parts that could not be placed are marked with `sheetIndex: -1`.
 */
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

/**
 * Packs as many parts as possible onto a single sheet.
 * @param partsIn - The list of parts to attempt to pack.
 * @param w - The packable width of the sheet.
 * @param h - The packable height of the sheet.
 * @param allowRotation - Whether parts can be rotated 90 degrees.
 * @param gap - The minimum required distance between parts.
 * @returns An object containing the list of `placed` parts and `remaining` parts that didn't fit.
 */
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

/**
 * Finds the best position for a single part within the available free rectangles.
 * It uses the "Best Short Side Fit" (BSSF) heuristic.
 * @param part - The part to place.
 * @param free - A list of available rectangular spaces.
 * @param allowRotation - Whether the part can be rotated.
 * @param gap - The required gap to add to the part's dimensions for collision detection.
 * @returns The best candidate position, or null if the part cannot fit anywhere.
 */
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

/**
 * Splits the free rectangles based on the area consumed by a newly placed part.
 * After a part is placed, this function updates the list of available spaces.
 * @param free - The current list of free rectangles.
 * @param used - The rectangle representing the newly placed part (including its gap).
 * @param sheetW - The total packable width of the sheet.
 * @param sheetH - The total packable height of the sheet.
 * @returns A new, updated list of free rectangles.
 */
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

/**
 * Removes any free rectangles that are fully contained within another free rectangle.
 * This is an optimization to keep the list of free spaces manageable.
 * @param free - The list of free rectangles.
 * @returns A pruned list of free rectangles.
 */
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
