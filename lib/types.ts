/**
 * @file This file defines all the core data structures and type definitions used throughout the application.
 * It serves as the single source of truth for the shapes of data like global settings,
 * book specifications, and the geometric parts that are generated and placed.
 */

export type EdgeName = "HEAD" | "TAIL" | "FORE" | "SPINE"
export type PartType = "BASE" | "LID" | "FRONT" | "BACK" | "LEFT" | "RIGHT"
export type JointRole = "male" | "female"

/**
 * Global settings that apply to the entire generation process,
 * including sheet dimensions, material properties, and packing parameters.
 */
export interface Globals {
  sheet_w: number
  sheet_h: number
  margin: number
  part_gap: number
  allow_rotation: boolean
  kerf: number
  t: number
}

/**
 * Defines all the parameters for a single book case job.
 * These are the primary user inputs that control the geometry of a case.
 */
export interface BookJob {
  id: string
  name: string
  H_ext: number
  W_ext: number
  D_ext: number
  clear_side: number
  clear_depth: number
  h_visible: number
  raise_gap: number
  tab_w_rule: number
  joint_clear: number
  symmetric_ends: boolean
  hinge_edge: EdgeName
  tape_reserved_strip: number
  tape_guide: boolean
  mag_count: number
  mag_diam: number
  mag_thick: number
  mag_clear: number
  mag_edge_offset: number
}

/**
 * Represents a single, unplaced geometric part of a book case (e.g., BASE, LID, FRONT).
 * It contains all the geometric data needed for packing and rendering.
 */
export interface Part {
  uid: string // Unique ID for each part instance
  jobId: string
  bookName: string
  partType: PartType
  w: number // True, final bounding box width of the part's geometry.
  h: number // True, final bounding box height of the part's geometry.
  outerCutD: string
  innerCutDs: string[]
  scoreDs: string[]
  holes: { cx: number; cy: number; r: number }[]
  contourPoints: Point[] // The exact, normalized points of the outer path
  labelAt: { x: number; y: number }
}

/**
 * Represents a part that has been assigned a position on a specific sheet by the packing algorithm.
 * It extends the base `Part` with placement information.
 */
export interface PlacedPart extends Part {
  sheetIndex: number
  x: number
  y: number
  rotated: boolean
  bookColor: string
  bookIndex: number
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface EdgeParams {
  teeth: boolean
  reserveStrip?: number
  role: JointRole
}
