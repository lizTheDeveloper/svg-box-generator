/**
 * @file This is the core logic engine for the book light generator.
 * It orchestrates the entire process from user input to final, placed parts.
 *
 * The main flow is:
 * 1. `generatePlacedParts` is the entry point.
 * 2. It calls `mkParts` to create all the raw geometric `Part` objects for each book job.
 * 3. It then enters a loop:
 *    a. It calls `packer.pack` to attempt to place the remaining parts.
 *    b. It calls `isPartInBounds` to rigorously verify that each placed part's true geometry fits on the sheet.
 *    c. Any parts that fail verification are collected and re-packed onto new sheets in the next loop iteration.
 * 4. This continues until all parts are validly placed.
 */
import type { Globals, BookJob, Part, PlacedPart, Rect, EdgeParams, Point } from "./types"
import { pack } from "./packer"

// --- Main Orchestration ---

/**
 * Performs a rigorous check to ensure a placed part's entire geometry is within the sheet's printable area.
 * It transforms every point of the part's contour and holes into sheet coordinates and checks
 * them against the sheet boundaries defined by the global margin.
 * This is the final source of truth for placement validity.
 * @param p - The `PlacedPart` to verify.
 * @param g - The global settings.
 * @returns `true` if the part is entirely within bounds, `false` otherwise.
 */
function isPartInBounds(p: PlacedPart, g: Globals): boolean {
  const L_BOUND = g.margin - 1e-6
  const T_BOUND = g.margin - 1e-6
  const R_BOUND = g.sheet_w - g.margin + 1e-6
  const B_BOUND = g.sheet_h - g.margin + 1e-6

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const transformAndUpdateBounds = (localPoint: Point) => {
    let sheetX: number, sheetY: number
    if (p.rotated) {
      sheetX = -localPoint.y + p.x + p.h
      sheetY = localPoint.x + p.y
    } else {
      sheetX = localPoint.x + p.x
      sheetY = localPoint.y + p.y
    }
    minX = Math.min(minX, sheetX)
    maxX = Math.max(maxX, sheetX)
    minY = Math.min(minY, sheetY)
    maxY = Math.max(maxY, sheetY)
  }

  p.contourPoints.forEach(transformAndUpdateBounds)

  p.holes.forEach((hole) => {
    transformAndUpdateBounds({ x: hole.cx - hole.r, y: hole.cy - hole.r })
    transformAndUpdateBounds({ x: hole.cx + hole.r, y: hole.cy - hole.r })
    transformAndUpdateBounds({ x: hole.cx + hole.r, y: hole.cy + hole.r })
    transformAndUpdateBounds({ x: hole.cx - hole.r, y: hole.cy + hole.r })
  })

  return minX >= L_BOUND && maxX <= R_BOUND && minY >= T_BOUND && maxY <= B_BOUND
}

/**
 * The main orchestration function.
 * Takes user jobs and global settings, generates all geometric parts, and runs the pack-then-verify loop
 * until all parts are successfully placed on sheets.
 * @param jobs - An array of `BookJob` objects from the user.
 * @param globals - The global settings.
 * @returns A flat array of all `PlacedPart`s, with correct sheet indices and positions.
 */
export function generatePlacedParts(jobs: BookJob[], globals: Globals): PlacedPart[] {
  const allParts: Part[] = jobs.flatMap((job) => mkParts(job, globals))
  const allPartsByUid = new Map(allParts.map((p) => [p.uid, p]))

  const finalPlacedParts: PlacedPart[] = []
  let partsToPack: Part[] = [...allParts]
  let sheetIndexOffset = 0

  while (partsToPack.length > 0) {
    const packedAttempt = pack(partsToPack, globals, sheetIndexOffset)

    const validlyPlaced: PlacedPart[] = []
    const overflowUids = new Set<string>()

    for (const placedPart of packedAttempt) {
      if (placedPart.sheetIndex === -1 || !isPartInBounds(placedPart, globals)) {
        overflowUids.add(placedPart.uid)
      } else {
        validlyPlaced.push(placedPart)
      }
    }

    finalPlacedParts.push(...validlyPlaced)

    if (overflowUids.size > 0 && overflowUids.size === partsToPack.length) {
      // If all remaining parts overflowed, we have an infinite loop.
      const failedPart = allPartsByUid.get(Array.from(overflowUids)[0])!
      throw new Error(
        `Layout failed: Part ${failedPart.partType} (${failedPart.w.toFixed(2)}"x${failedPart.h.toFixed(
          2,
        )}") cannot be placed on a new sheet. Try increasing sheet size or reducing margins.`,
      )
    }

    partsToPack = Array.from(overflowUids).map((uid) => allPartsByUid.get(uid)!)

    sheetIndexOffset = (finalPlacedParts.length > 0 ? Math.max(...finalPlacedParts.map((p) => p.sheetIndex)) : -1) + 1
  }

  const bookColors = getBookColorPalette()
  return finalPlacedParts.map((p) => {
    const bookIndex = jobs.findIndex((j) => j.id === p.jobId)
    return {
      ...p,
      bookColor: bookColors[bookIndex % bookColors.length],
      bookIndex: bookIndex,
    }
  })
}

function getBookColorPalette(): string[] {
  return ["#FF0000", "#E60000", "#CC0000", "#B30000", "#990000", "#800000", "#660000", "#4D0000"]
}

// --- Part Factory ---

/**
 * A factory function that creates all the necessary `Part` objects for a single `BookJob`.
 * @param job - The book job to create parts for.
 * @param g - The global settings.
 * @returns An array of `Part` objects (BASE, LID, FRONT, etc.).
 */
function mkParts(job: BookJob, g: Globals): Part[] {
  const { W_int, D_int, H_wall } = deriveInner(job)

  const baseRaw = makeFingerJointedPanel(
    W_int,
    D_int,
    {
      top: { teeth: true, role: "female" },
      right: { teeth: true, role: "female" },
      bottom: { teeth: true, role: "female" },
      left: { teeth: true, role: "female" },
    },
    {},
    g,
    job,
  )
  let magnetHoles: { cx: number; cy: number; r: number }[] = []
  const rNom = (job.mag_diam + job.mag_clear + g.kerf) / 2
  if (job.mag_count >= 2) {
    magnetHoles.push(
      { cx: job.mag_edge_offset, cy: job.mag_edge_offset, r: rNom },
      { cx: W_int - job.mag_edge_offset, cy: job.mag_edge_offset, r: rNom },
    )
  }
  if (job.mag_count === 4) {
    magnetHoles.push(
      { cx: job.mag_edge_offset, cy: D_int - job.mag_edge_offset, r: rNom },
      { cx: W_int - job.mag_edge_offset, cy: D_int - job.mag_edge_offset, r: rNom },
    )
  }
  magnetHoles = magnetHoles.map((h) => enforceHoleClearances(h, baseRaw.width, baseRaw.height, baseRaw.valleyPts, g.t))
  const finalInnerCuts = [...baseRaw.innerCutDs]
  for (const h of magnetHoles) {
    const r = h.r - g.kerf / 2
    finalInnerCuts.push(`M ${h.cx - r},${h.cy} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 -${2 * r},0`)
  }
  const baseGeom = { ...baseRaw, innerCutDs: finalInnerCuts, magnetHoles: magnetHoles }

  const lidEdges = {
    top: { teeth: true, role: "female" },
    right: { teeth: true, role: "female", reserveStrip: job.tape_reserved_strip },
    bottom: { teeth: true, role: "female" },
    left: { teeth: true, role: "female" },
  }
  const LID = makeFingerJointedPanel(W_int, D_int, lidEdges, {}, g, job)
  if (job.tape_guide) {
    const guideYStart = lidEdges.right.reserveStrip ? lidEdges.right.reserveStrip : 0
    const guideYEnd = D_int - (lidEdges.right.reserveStrip ? lidEdges.right.reserveStrip : 0)
    LID.scoreDs.push(`M ${W_int} ${guideYStart + 0.1} L ${W_int} ${guideYEnd - 0.1}`)
  }

  const frontEdges = {
    top: { teeth: true, role: "male" },
    right: { teeth: true, role: "male" },
    bottom: { teeth: true, role: "male" },
    left: { teeth: true, role: "male" },
  }
  const backEdges = {
    top: { teeth: true, role: "male" },
    right: { teeth: true, role: "male", reserveStrip: job.tape_reserved_strip },
    bottom: { teeth: true, role: "male" },
    left: { teeth: true, role: "male" },
  }
  const leftEdges = {
    top: { teeth: true, role: "male" },
    right: { teeth: true, role: "female" },
    bottom: { teeth: true, role: "male" },
    left: { teeth: true, role: "female" },
  }
  const rightEdges = {
    top: { teeth: true, role: "male" },
    right: { teeth: true, role: "female" },
    bottom: { teeth: true, role: "male" },
    left: { teeth: true, role: "female" },
  }

  const FRONT = makeFingerJointedPanel(W_int, H_wall, frontEdges, {}, g, job)
  const BACK = makeFingerJointedPanel(W_int, H_wall, backEdges, {}, g, job)
  const LEFT = makeFingerJointedPanel(D_int, H_wall, leftEdges, {}, g, job)
  const RIGHT = makeFingerJointedPanel(D_int, H_wall, rightEdges, {}, g, job)

  let partCounter = 0
  function partify(
    ptype: "BASE" | "LID" | "FRONT" | "BACK" | "LEFT" | "RIGHT",
    geom: ReturnType<typeof makeFingerJointedPanel> & { magnetHoles?: { cx: number; cy: number; r: number }[] },
  ): Part {
    return {
      uid: `${job.id}:${ptype}:${partCounter++}`,
      jobId: job.id,
      bookName: job.name,
      partType: ptype,
      w: geom.width,
      h: geom.height,
      outerCutD: geom.outerCutD,
      innerCutDs: geom.innerCutDs,
      scoreDs: geom.scoreDs,
      holes: [...(geom.holes || []), ...(geom.magnetHoles || [])],
      contourPoints: geom.contourPoints,
      labelAt: geom.labelCenter,
    }
  }

  return [
    partify("BASE", baseGeom),
    partify("LID", LID),
    partify("FRONT", FRONT),
    partify("BACK", BACK),
    partify("LEFT", LEFT),
    partify("RIGHT", RIGHT),
  ]
}

function deriveInner(job: BookJob) {
  const W_int = job.W_ext - 2 * job.clear_side
  const D_int = job.D_ext - 2 * job.clear_depth
  const H_wall = job.h_visible + job.raise_gap
  return { W_int, D_int, H_wall }
}

/**
 * Generates the complete geometry for a single finger-jointed panel.
 * This is the heart of the geometry creation, responsible for calculating the path `d` attribute
 * for the outer cut, as well as locating stress-relief holes.
 * @param outerW - The core width of the panel (inside the joints).
 * @param outerH - The core height of the panel (inside the joints).
 * @param edges - An object defining the joint properties for each of the four edges.
 * @param features - Additional features like magnet holes (not implemented at this level).
 * @param g - The global settings.
 * @param job - The parent book job, for parameters like joint clearance.
 * @returns An object containing all geometric data for the panel.
 */
function makeFingerJointedPanel(
  outerW: number,
  outerH: number,
  edges: { top: EdgeParams; right: EdgeParams; bottom: EdgeParams; left: EdgeParams },
  features: { holes?: { cx: number; cy: number; r: number }[]; pads?: Rect[] },
  g: Globals,
  job: BookJob,
) {
  const k = g.kerf / 2
  const contour: (Point & { nx: number; ny: number })[] = []
  const valleyCollector: Point[] = []
  let currentPos: Point = { x: 0, y: 0 }
  if (edges.left.teeth && edges.left.role === "male") currentPos.x = g.t
  if (edges.top.teeth && edges.top.role === "male") currentPos.y = g.t

  currentPos = addEdgePath({
    points: contour,
    currentPos,
    length: outerW,
    edgeParams: edges.top,
    pads: features.pads,
    axis: "x",
    direction: 1,
    normal: { x: 0, y: -1 },
    g,
    job,
    valleyCollector,
  })
  currentPos = addEdgePath({
    points: contour,
    currentPos,
    length: outerH,
    edgeParams: edges.right,
    pads: features.pads,
    axis: "y",
    direction: 1,
    normal: { x: 1, y: 0 },
    g,
    job,
    valleyCollector,
  })
  currentPos = addEdgePath({
    points: contour,
    currentPos,
    length: outerW,
    edgeParams: edges.bottom,
    pads: features.pads,
    axis: "x",
    direction: -1,
    normal: { x: 0, y: 1 },
    g,
    job,
    valleyCollector,
  })
  currentPos = addEdgePath({
    points: contour,
    currentPos,
    length: outerH,
    edgeParams: edges.left,
    pads: features.pads,
    axis: "y",
    direction: -1,
    normal: { x: -1, y: 0 },
    g,
    job,
    valleyCollector,
  })

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY
  const kerfed = contour.map((p) => {
    const x = p.x + k * p.nx,
      y = p.y + k * p.ny
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    return { x, y }
  })
  const width = maxX - minX,
    height = maxY - minY
  const normalizedPoints = kerfed.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  const outerCutD = "M " + normalizedPoints.map((p) => `${p.x.toFixed(4)} ${p.y.toFixed(4)}`).join(" L ") + " Z"

  const RELIEF_R = 0.035
  const normalizedValleys = valleyCollector.map((v) => ({ x: v.x - minX, y: v.y - minY }))
  const reliefHoles = normalizedValleys.map((v) => ({ cx: v.x, cy: v.y, r: RELIEF_R }))
  const innerCutDs: string[] = reliefHoles.map(
    (h) => `M ${h.cx - h.r},${h.cy} a ${h.r},${h.r} 0 1,0 ${2 * h.r},0 a ${h.r},${h.r} 0 1,0 -${2 * h.r},0`,
  )

  return {
    outerCutD,
    innerCutDs,
    scoreDs: [] as string[],
    holes: reliefHoles,
    width,
    height,
    labelCenter: { x: width / 2, y: height / 2 },
    valleyPts: normalizedValleys,
    contourPoints: normalizedPoints,
  }
}

function addEdgePath({
  points,
  currentPos,
  length,
  edgeParams,
  pads,
  axis,
  direction,
  normal,
  g,
  job,
  valleyCollector,
}: {
  points: (Point & { nx: number; ny: number })[]
  currentPos: Point
  length: number
  edgeParams: EdgeParams
  pads?: Rect[]
  axis: "x" | "y"
  direction: 1 | -1
  normal: Point
  g: Globals
  job: BookJob
  valleyCollector: Point[]
}): Point {
  const { teeth, reserveStrip, role } = edgeParams
  const { t, kerf } = g
  const jointClear = job.joint_clear
  if (!teeth) {
    const endPos = { ...currentPos }
    endPos[axis] += length * direction
    points.push({ ...currentPos, nx: normal.x, ny: normal.y })
    return endPos
  }
  const tab_w_nom = Math.max(4 * t, job.tab_w_rule)
  let n = Math.round(length / tab_w_nom)
  if (job.symmetric_ends) {
    if (n % 2 === 0) n++
  } else {
    if (n % 2 !== 0) n++
  }
  if (n < 1) n = 1
  const tab_w = length / n,
    clearance = kerf / 2 + jointClear,
    toothDepth = t,
    p = { ...currentPos }
  points.push({ ...p, nx: normal.x, ny: normal.y })
  for (let i = 0; i < n; i++) {
    const start = i * tab_w,
      end = (i + 1) * tab_w,
      isTab = i % 2 === 0
    const p1 = { ...p }
    p1[axis] += (start + (isTab && role === "male" ? -clearance : clearance)) * direction
    const p2 = { ...p1 }
    p2.x += normal.x * toothDepth
    p2.y += normal.y * toothDepth
    const p3 = { ...p }
    p3[axis] += (end - (isTab && role === "male" ? -clearance : clearance)) * direction
    const p4 = { ...p3 }
    p4.x += normal.x * toothDepth
    p4.y += normal.y * toothDepth
    const p5 = { ...p }
    p5[axis] += end * direction
    const isReserved =
      (reserveStrip && (start < reserveStrip || length - end < reserveStrip)) ||
      (pads &&
        pads.some((pad: Rect) => {
          const padStart = axis === "x" ? pad.x : pad.y
          const padEnd = axis === "x" ? pad.x + pad.w : pad.y + pad.h
          return Math.max(start, padStart) < Math.min(end, padEnd)
        }))
    if (isReserved || (role === "female" && isTab) || (role === "male" && !isTab)) {
      points.push({ ...p5, nx: normal.x, ny: normal.y })
    } else {
      points.push({ ...p1, nx: normal.x, ny: normal.y })
      points.push({ ...p2, nx: normal.x, ny: normal.y })
      points.push({ ...p4, nx: normal.x, ny: normal.y })
      points.push({ ...p3, nx: normal.x, ny: normal.y })
      valleyCollector.push(p1, p3)
    }
  }
  const finalPos = { ...currentPos }
  finalPos[axis] += length * direction
  return finalPos
}

function enforceHoleClearances(
  hole: { cx: number; cy: number; r: number },
  panelW: number,
  panelH: number,
  valleys: Point[],
  t: number,
): { cx: number; cy: number; r: number } {
  const edgeMin = Math.max(3 * t, 0.3),
    valleyMin = Math.max(2 * t, 0.25)
  let { cx, cy, r } = hole
  const dxEdge = Math.min(cx, panelW - cx),
    dyEdge = Math.min(cy, panelH - cy)
  const edgeDist = Math.min(dxEdge, dyEdge) - r
  if (edgeDist < edgeMin) {
    const push = edgeMin - edgeDist + 1e-3
    if (dxEdge < dyEdge) cx += cx < panelW / 2 ? +push : -push
    else cy += cy < panelH / 2 ? +push : -push
  }
  let minValley = Number.POSITIVE_INFINITY
  let best: Point | null = null
  for (const v of valleys) {
    const d = Math.hypot(cx - v.x, cy - v.y)
    if (d < minValley) {
      minValley = d
      best = v
    }
  }
  if (minValley - r < valleyMin) {
    const push = valleyMin - (minValley - r) + 1e-3
    if (best) {
      const d = minValley || 1
      const ux = (cx - best.x) / d
      const uy = (cy - best.y) / d
      cx += ux * push
      cy += uy * push
    }
  }
  cx = Math.max(r, Math.min(panelW - r, cx))
  cy = Math.max(r, Math.min(panelH - r, cy))
  return { cx, cy, r }
}
