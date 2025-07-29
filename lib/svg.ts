/**
 * @file This file contains all logic for rendering the final SVG output.
 * It takes the array of placed parts and converts them into SVG strings,
 * organizing the output into layers that are friendly for laser cutters like Glowforge.
 */

import type { PlacedPart, Globals } from "./types"

/**
 * Renders a list of placed parts into an array of SVG strings, one for each sheet.
 * @param placedParts - The array of all parts that have been successfully placed.
 * @param globals - The global settings, used for SVG dimensions.
 * @param filePrefix - A prefix for sheet identification (not currently used in SVG content).
 * @returns An array of strings, where each string is a complete SVG document for one sheet.
 */
function renderSheetsAsSvgs(placedParts: PlacedPart[], globals: Globals, filePrefix = "sheet"): string[] {
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

/**
 * Renders a single sheet's worth of parts into a single SVG string.
 * It groups SVG path elements by their intended laser cutter operation (color)
 * to ensure a correct cutting order: ENGRAVE (Black) -> SCORE (Gray) -> INNER CUTS (Blue) -> OUTER CUTS (Book-specific colors).
 * @param parts - The parts to render on this sheet.
 * @param globals - The global settings for sheet size.
 * @returns A string containing the full SVG markup for the sheet.
 */
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

    // Label at center of the final bounding box, converted to vector paths
    const finalLabelX = tx + bboxW / 2
    const finalLabelY = ty + bboxH / 2
    const fs = labelFontSizeFor(bboxW, bboxH)
    const labelText = `${bookName} ${partType}`

    // Convert text to vector paths
    const labelPaths = textToVectorPaths(labelText, finalLabelX, finalLabelY, fs, rot)
    ENGRAVE.push(...labelPaths)

    // Update overall bbox
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + bboxW)
    maxY = Math.max(maxY, y + bboxH)
  })

  // Rulers + bounding engrave rect (also converted to vectors)
  const rulerPaths = createRulerVectorPaths(sheet_w, sheet_h)
  ENGRAVE.push(...rulerPaths)

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
  const engraveContent = `<g id="ENGRAVE" stroke="#000000" fill="none" stroke-width="0.003">${ENGRAVE.join("\n")}</g>`
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

/**
 * Converts text to vector paths using a clean, readable stroke-based font.
 * This ensures the text will import properly into design software like Illustrator.
 * @param text - The text to convert
 * @param x - Center X position
 * @param y - Center Y position
 * @param fontSize - Font size in inches
 * @param rotation - Rotation angle in degrees
 * @returns Array of SVG path strings
 */
function textToVectorPaths(text: string, x: number, y: number, fontSize: number, rotation = 0): string[] {
  const paths: string[] = []
  const charWidth = fontSize * 0.7 // Character width relative to font size
  const charSpacing = fontSize * 0.15 // Space between characters

  // Calculate total text width for centering
  const totalWidth = text.length * charWidth + (text.length - 1) * charSpacing
  const startX = -totalWidth / 2

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const charX = startX + i * (charWidth + charSpacing)
    const charPath = getCharacterPath(char, charX, -fontSize * 0.5, fontSize)

    if (charPath) {
      const transform =
        rotation !== 0 ? `translate(${x}, ${y}) rotate(${rotation}) translate(0, 0)` : `translate(${x}, ${y})`
      paths.push(
        `<path d="${charPath}" transform="${transform}" stroke="#000000" fill="none" stroke-width="${fontSize * 0.04}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
    }
  }

  return paths
}

/**
 * Creates vector paths for ruler markings instead of text elements.
 * @param sheetW - Sheet width
 * @param sheetH - Sheet height
 * @returns Array of SVG path strings for rulers
 */
function createRulerVectorPaths(sheetW: number, sheetH: number): string[] {
  const paths: string[] = []

  // 1 inch ruler line
  paths.push(`<path d="M ${sheetW - 1.5} ${sheetH - 0.5} h 1" stroke="#000000" stroke-width="0.003" fill="none"/>`)

  // "1 in" text as vector
  const oneInchPaths = textToVectorPaths("1 in", sheetW - 1, sheetH - 0.6, 0.08)
  paths.push(...oneInchPaths)

  // 12 inch ruler line
  paths.push(`<path d="M ${sheetW - 13} ${sheetH - 0.25} h 12" stroke="#000000" stroke-width="0.003" fill="none"/>`)

  // "12 in" text as vector
  const twelveInchPaths = textToVectorPaths("12 in", sheetW - 7, sheetH - 0.35, 0.08)
  paths.push(...twelveInchPaths)

  return paths
}

/**
 * Returns the SVG path data for a single character using a clean, readable stroke font.
 * This creates simple, clear letterforms that will engrave well and be easy to read.
 * @param char - The character to render
 * @param x - X offset for the character
 * @param y - Y offset for the character (baseline)
 * @param size - Font size
 * @returns SVG path data string or null if character not supported
 */
function getCharacterPath(char: string, x: number, y: number, size: number): string | null {
  const w = size * 0.6 // Character width
  const h = size * 0.8 // Character height
  const baseline = y + h // Bottom of character

  // Simple stroke-based font paths
  const paths: { [key: string]: string } = {
    A: `M ${x + w * 0.1} ${baseline} L ${x + w * 0.5} ${y} L ${x + w * 0.9} ${baseline} M ${x + w * 0.25} ${y + h * 0.6} L ${x + w * 0.75} ${y + h * 0.6}`,
    B: `M ${x} ${y} L ${x} ${baseline} M ${x} ${y} L ${x + w * 0.6} ${y} Q ${x + w * 0.8} ${y} ${x + w * 0.8} ${y + h * 0.2} Q ${x + w * 0.8} ${y + h * 0.4} ${x + w * 0.6} ${y + h * 0.4} L ${x} ${y + h * 0.4} M ${x + w * 0.6} ${y + h * 0.4} Q ${x + w * 0.8} ${y + h * 0.4} ${x + w * 0.8} ${y + h * 0.6} Q ${x + w * 0.8} ${baseline} ${x + w * 0.6} ${baseline} L ${x} ${baseline}`,
    C: `M ${x + w * 0.8} ${y + h * 0.2} Q ${x + w * 0.6} ${y} ${x + w * 0.4} ${y} Q ${x + w * 0.2} ${y} ${x + w * 0.1} ${y + h * 0.2} L ${x + w * 0.1} ${y + h * 0.6} Q ${x + w * 0.1} ${baseline} ${x + w * 0.4} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.8} ${y + h * 0.6}`,
    D: `M ${x} ${y} L ${x} ${baseline} M ${x} ${y} L ${x + w * 0.5} ${y} Q ${x + w * 0.8} ${y} ${x + w * 0.8} ${y + h * 0.4} Q ${x + w * 0.8} ${baseline} ${x + w * 0.5} ${baseline} L ${x} ${baseline}`,
    E: `M ${x} ${y} L ${x} ${baseline} L ${x + w * 0.7} ${baseline} M ${x} ${y + h * 0.4} L ${x + w * 0.6} ${y + h * 0.4} M ${x} ${y} L ${x + w * 0.7} ${y}`,
    F: `M ${x} ${y} L ${x} ${baseline} M ${x} ${y + h * 0.4} L ${x + w * 0.6} ${y + h * 0.4} M ${x} ${y} L ${x + w * 0.7} ${y}`,
    G: `M ${x + w * 0.8} ${y + h * 0.2} Q ${x + w * 0.6} ${y} ${x + w * 0.4} ${y} Q ${x + w * 0.2} ${y} ${x + w * 0.1} ${y + h * 0.2} L ${x + w * 0.1} ${y + h * 0.6} Q ${x + w * 0.1} ${baseline} ${x + w * 0.4} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.8} ${y + h * 0.6} L ${x + w * 0.8} ${y + h * 0.4} L ${x + w * 0.5} ${y + h * 0.4}`,
    H: `M ${x} ${y} L ${x} ${baseline} M ${x + w * 0.7} ${y} L ${x + w * 0.7} ${baseline} M ${x} ${y + h * 0.4} L ${x + w * 0.7} ${y + h * 0.4}`,
    I: `M ${x + w * 0.35} ${y} L ${x + w * 0.35} ${baseline} M ${x + w * 0.1} ${y} L ${x + w * 0.6} ${y} M ${x + w * 0.1} ${baseline} L ${x + w * 0.6} ${baseline}`,
    J: `M ${x + w * 0.6} ${y} L ${x + w * 0.6} ${y + h * 0.6} Q ${x + w * 0.6} ${baseline} ${x + w * 0.4} ${baseline} Q ${x + w * 0.2} ${baseline} ${x + w * 0.1} ${y + h * 0.6}`,
    K: `M ${x} ${y} L ${x} ${baseline} M ${x} ${y + h * 0.4} L ${x + w * 0.7} ${y} M ${x} ${y + h * 0.4} L ${x + w * 0.7} ${baseline}`,
    L: `M ${x} ${y} L ${x} ${baseline} L ${x + w * 0.7} ${baseline}`,
    M: `M ${x} ${baseline} L ${x} ${y} L ${x + w * 0.35} ${y + h * 0.3} L ${x + w * 0.7} ${y} L ${x + w * 0.7} ${baseline}`,
    N: `M ${x} ${baseline} L ${x} ${y} L ${x + w * 0.7} ${baseline} L ${x + w * 0.7} ${y}`,
    O: `M ${x + w * 0.35} ${y} Q ${x + w * 0.1} ${y} ${x + w * 0.1} ${y + h * 0.4} Q ${x + w * 0.1} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.6} ${y + h * 0.4} Q ${x + w * 0.6} ${y} ${x + w * 0.35} ${y}`,
    P: `M ${x} ${baseline} L ${x} ${y} L ${x + w * 0.5} ${y} Q ${x + w * 0.7} ${y} ${x + w * 0.7} ${y + h * 0.2} Q ${x + w * 0.7} ${y + h * 0.4} ${x + w * 0.5} ${y + h * 0.4} L ${x} ${y + h * 0.4}`,
    Q: `M ${x + w * 0.35} ${y} Q ${x + w * 0.1} ${y} ${x + w * 0.1} ${y + h * 0.4} Q ${x + w * 0.1} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.6} ${y + h * 0.4} Q ${x + w * 0.6} ${y} ${x + w * 0.35} ${y} M ${x + w * 0.45} ${y + h * 0.5} L ${x + w * 0.65} ${baseline}`,
    R: `M ${x} ${baseline} L ${x} ${y} L ${x + w * 0.5} ${y} Q ${x + w * 0.7} ${y} ${x + w * 0.7} ${y + h * 0.2} Q ${x + w * 0.7} ${y + h * 0.4} ${x + w * 0.5} ${y + h * 0.4} L ${x} ${y + h * 0.4} M ${x + w * 0.4} ${y + h * 0.4} L ${x + w * 0.7} ${baseline}`,
    S: `M ${x + w * 0.1} ${y + h * 0.6} Q ${x + w * 0.1} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.6} ${y + h * 0.6} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.35} ${y + h * 0.4} Q ${x + w * 0.1} ${y + h * 0.4} ${x + w * 0.1} ${y + h * 0.2} Q ${x + w * 0.1} ${y} ${x + w * 0.35} ${y} Q ${x + w * 0.6} ${y} ${x + w * 0.6} ${y + h * 0.2}`,
    T: `M ${x} ${y} L ${x + w * 0.7} ${y} M ${x + w * 0.35} ${y} L ${x + w * 0.35} ${baseline}`,
    U: `M ${x} ${y} L ${x} ${y + h * 0.6} Q ${x} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.7} ${baseline} ${x + w * 0.7} ${y + h * 0.6} L ${x + w * 0.7} ${y}`,
    V: `M ${x} ${y} L ${x + w * 0.35} ${baseline} L ${x + w * 0.7} ${y}`,
    W: `M ${x} ${y} L ${x + w * 0.15} ${baseline} L ${x + w * 0.35} ${y + h * 0.5} L ${x + w * 0.55} ${baseline} L ${x + w * 0.7} ${y}`,
    X: `M ${x} ${y} L ${x + w * 0.7} ${baseline} M ${x + w * 0.7} ${y} L ${x} ${baseline}`,
    Y: `M ${x} ${y} L ${x + w * 0.35} ${y + h * 0.4} L ${x + w * 0.7} ${y} M ${x + w * 0.35} ${y + h * 0.4} L ${x + w * 0.35} ${baseline}`,
    Z: `M ${x} ${y} L ${x + w * 0.7} ${y} L ${x} ${baseline} L ${x + w * 0.7} ${baseline}`,
    "0": `M ${x + w * 0.35} ${y} Q ${x + w * 0.1} ${y} ${x + w * 0.1} ${y + h * 0.4} Q ${x + w * 0.1} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.6} ${y + h * 0.4} Q ${x + w * 0.6} ${y} ${x + w * 0.35} ${y}`,
    "1": `M ${x + w * 0.2} ${y + h * 0.2} L ${x + w * 0.35} ${y} L ${x + w * 0.35} ${baseline} M ${x + w * 0.1} ${baseline} L ${x + w * 0.6} ${baseline}`,
    "2": `M ${x + w * 0.1} ${y + h * 0.2} Q ${x + w * 0.1} ${y} ${x + w * 0.35} ${y} Q ${x + w * 0.6} ${y} ${x + w * 0.6} ${y + h * 0.2} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.1} ${baseline} L ${x + w * 0.6} ${baseline}`,
    "3": `M ${x + w * 0.1} ${y + h * 0.2} Q ${x + w * 0.1} ${y} ${x + w * 0.35} ${y} Q ${x + w * 0.6} ${y} ${x + w * 0.6} ${y + h * 0.2} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.4} ${y + h * 0.4} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.6} ${y + h * 0.6} Q ${x + w * 0.6} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.1} ${baseline} ${x + w * 0.1} ${y + h * 0.6}`,
    "4": `M ${x} ${y} L ${x} ${y + h * 0.5} L ${x + w * 0.6} ${y + h * 0.5} M ${x + w * 0.45} ${y} L ${x + w * 0.45} ${baseline}`,
    "5": `M ${x + w * 0.6} ${y} L ${x + w * 0.1} ${y} L ${x + w * 0.1} ${y + h * 0.4} Q ${x + w * 0.1} ${y + h * 0.3} ${x + w * 0.35} ${y + h * 0.3} Q ${x + w * 0.6} ${y + h * 0.3} ${x + w * 0.6} ${y + h * 0.6} Q ${x + w * 0.6} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.1} ${baseline} ${x + w * 0.1} ${y + h * 0.6}`,
    "6": `M ${x + w * 0.5} ${y} Q ${x + w * 0.2} ${y} ${x + w * 0.1} ${y + h * 0.3} L ${x + w * 0.1} ${y + h * 0.6} Q ${x + w * 0.1} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.6} ${y + h * 0.6} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.35} ${y + h * 0.4} Q ${x + w * 0.1} ${y + h * 0.4} ${x + w * 0.1} ${y + h * 0.6}`,
    "7": `M ${x + w * 0.1} ${y} L ${x + w * 0.6} ${y} L ${x + w * 0.2} ${baseline}`,
    "8": `M ${x + w * 0.35} ${y} Q ${x + w * 0.1} ${y} ${x + w * 0.1} ${y + h * 0.2} Q ${x + w * 0.1} ${y + h * 0.4} ${x + w * 0.35} ${y + h * 0.4} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.6} ${y + h * 0.2} Q ${x + w * 0.6} ${y} ${x + w * 0.35} ${y} M ${x + w * 0.35} ${y + h * 0.4} Q ${x + w * 0.1} ${y + h * 0.4} ${x + w * 0.1} ${y + h * 0.6} Q ${x + w * 0.1} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.6} ${baseline} ${x + w * 0.6} ${y + h * 0.6} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.35} ${y + h * 0.4}`,
    "9": `M ${x + w * 0.35} ${y} Q ${x + w * 0.6} ${y} ${x + w * 0.6} ${y + h * 0.2} Q ${x + w * 0.6} ${y + h * 0.4} ${x + w * 0.35} ${y + h * 0.4} Q ${x + w * 0.1} ${y + h * 0.4} ${x + w * 0.1} ${y + h * 0.2} Q ${x + w * 0.1} ${y} ${x + w * 0.35} ${y} M ${x + w * 0.6} ${y + h * 0.4} L ${x + w * 0.6} ${y + h * 0.6} Q ${x + w * 0.6} ${baseline} ${x + w * 0.35} ${baseline} Q ${x + w * 0.2} ${baseline} ${x + w * 0.1} ${y + h * 0.7}`,
    " ": "", // Space character - no path
    "-": `M ${x + w * 0.1} ${y + h * 0.4} L ${x + w * 0.6} ${y + h * 0.4}`,
    _: `M ${x} ${baseline} L ${x + w * 0.7} ${baseline}`,
  }

  const path = paths[char.toUpperCase()]
  return path || null
}

function labelFontSizeFor(w: number, h: number) {
  const s = Math.min(w, h) * 0.1 // 10% of min dimension
  return Math.max(0.08, Math.min(0.15, s)) // clamp 0.08–0.15 in for better readability
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

export { renderSheetsAsSvgs }
