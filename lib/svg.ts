import type { PlacedPart, Globals } from "./types"

function labelFontSizeFor(w: number, h: number) {
  const s = Math.min(w, h) * 0.1 // 10% of min dimension
  return Math.max(0.1, Math.min(0.2, s)) // clamp 0.10–0.20 in
}

function assertInBounds(p: PlacedPart, g: Globals) {
  const w = p.rotated ? p.h : p.w
  const h = p.rotated ? p.w : p.h
  const r = p.x + w,
    b = p.y + h
  const L = g.margin - 1e-6,
    T = g.margin - 1e-6
  const R = g.sheet_w - g.margin + 1e-6,
    B = g.sheet_h - g.margin + 1e-6
  if (p.x < L || p.y < T || r > R || b > B) {
    throw new Error(`Part out of bounds: ${p.partType} on sheet ${p.sheetIndex}`)
  }
}

export function renderSheetsAsSvgs(placedParts: PlacedPart[], globals: Globals, filePrefix = "sheet"): string[] {
  const sheets: PlacedPart[][] = []
  placedParts.forEach((part) => {
    assertInBounds(part, globals)
    if (!sheets[part.sheetIndex]) {
      sheets[part.sheetIndex] = []
    }
    sheets[part.sheetIndex].push(part)
  })

  return sheets.map((sheetParts) => renderSheet(sheetParts, globals))
}

function renderSheet(parts: PlacedPart[], globals: Globals): string {
  const { sheet_w, sheet_h } = globals

  const OUTER: { [color: string]: string[] } = {}
  const INNER: { [color: string]: string[] } = {} // all holes in BLUE by default
  const SCORE: string[] = []
  const ENGRAVE: string[] = []

  let minX = sheet_w,
    minY = sheet_h,
    maxX = 0,
    maxY = 0

  parts.forEach((p) => {
    const { x, y, w, h, rotated, outerCutD, innerCutDs, scoreDs, bookName, partType, bookColor } = p

    const tx = x,
      ty = y
    const rot = rotated ? 90 : 0
    const bboxW = rotated ? h : w,
      bboxH = rotated ? w : h

    // This transform correctly places the part's top-left corner at (tx, ty) after rotation.
    const finalTransform = rotated ? `translate(${tx + h}, ${ty}) rotate(90)` : `translate(${tx}, ${ty})`

    // OUTER perimeter (book color)
    if (!OUTER[bookColor]) OUTER[bookColor] = []
    OUTER[bookColor].push(`<path d="${outerCutD}" transform="${finalTransform}"/>`)

    // INNER cuts (holes, reliefs) — BLUE step
    const innerColor = "#0000FF"
    const innerGroup = innerCutDs.map((d) => `<path d="${d}" transform="${finalTransform}"/>`).join("\n")
    if (innerGroup) {
      if (!INNER[innerColor]) INNER[innerColor] = []
      INNER[innerColor].push(innerGroup)
    }

    // SCORE
    if (scoreDs?.length) {
      SCORE.push(`<g transform="${finalTransform}">${scoreDs.map((d) => `<path d="${d}"/>`).join("\n")}</g>`)
    }

    // Label at center of the final bounding box, rotated with the part.
    const finalLabelX = tx + bboxW / 2
    const finalLabelY = ty + bboxH / 2
    const fs = labelFontSizeFor(bboxW, bboxH)
    const label = `<text x="${finalLabelX.toFixed(4)}" y="${finalLabelY.toFixed(4)}" font-size="${fs.toFixed(
      3,
    )}" text-anchor="middle" dominant-baseline="middle" fill="#000000" stroke="none" pointer-events="none" transform="${
      rot ? `rotate(${rot} ${finalLabelX.toFixed(4)} ${finalLabelY.toFixed(4)})` : ""
    }">${bookName} ${partType}</text>`
    ENGRAVE.push(label)

    // Update overall bbox
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + bboxW)
    maxY = Math.max(maxY, y + bboxH)
  })

  // Rulers + bounding engrave rect
  ENGRAVE.push(
    `<g stroke="#000000" fill="#000000" font-size="0.1" text-anchor="middle">
     <path d="M ${sheet_w - 1.5} ${sheet_h - 0.5} h 1" stroke-width="0.003" />
     <text x="${sheet_w - 1}" y="${sheet_h - 0.6}">1 in</text>
     <path d="M ${sheet_w - 13} ${sheet_h - 0.25} h 12" stroke-width="0.003" />
     <text x="${sheet_w - 7}" y="${sheet_h - 0.35}">12 in</text>
   </g>`,
  )
  if (parts.length > 0) {
    const bboxMargin = 0.1,
      EPS = 1e-6
    const bboxW = Math.max(EPS, maxX - minX + 2 * bboxMargin)
    const bboxH = Math.max(EPS, maxY - minY + 2 * bboxMargin)
    ENGRAVE.push(
      `<rect x="${minX - bboxMargin}" y="${
        minY - bboxMargin
      }" width="${bboxW}" height="${bboxH}" fill="none" stroke="#000000" stroke-width="0.003"/>`,
    )
  }

  // Emit in the **desired job order**: ENGRAVE → SCORE → INNER → OUTER
  const engraveContent = `<g id="ENGRAVE" stroke="#000000" fill="#000000">${ENGRAVE.join("\n")}</g>`
  const scoreContent = SCORE.length
    ? `<g id="SCORE" stroke="#808080" fill="none" stroke-width="0.003">${SCORE.join("\n")}</g>`
    : ""
  const innerContent = Object.entries(INNER)
    .map(([c, paths]) => `<g id="INNER" stroke="${c}" fill="none" stroke-width="0.003">${paths.join("\n")}</g>`)
    .join("\n")
  const outerContent = Object.entries(OUTER)
    .map(([c, paths]) => `<g id="OUTER_${c}" stroke="${c}" fill="none" stroke-width="0.003">${paths.join("\n")}</g>`)
    .join("\n")

  const metadata = `<metadata>
   <generator>BookLightSVG v1.0</generator>
   <timestamp>${new Date().toISOString()}</timestamp>
   <units>inches</units>
 </metadata>`

  return `<svg width="${sheet_w}in" height="${sheet_h}in" viewBox="0 0 ${sheet_w} ${sheet_h}" xmlns="http://www.w3.org/2000/svg">
   ${metadata}
   ${engraveContent}
   ${scoreContent}
   ${innerContent}
   ${outerContent}
 </svg>`
}
