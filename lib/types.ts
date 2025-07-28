export type EdgeName = "HEAD" | "TAIL" | "FORE" | "SPINE"
export type PartType = "BASE" | "LID" | "FRONT" | "BACK" | "LEFT" | "RIGHT"
export type JointRole = "male" | "female"

export interface Globals {
  sheet_w: number
  sheet_h: number
  margin: number
  part_gap: number
  allow_rotation: boolean
  kerf: number
  t: number
}

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

export interface Part {
  uid: string // Unique ID for each part instance
  jobId: string
  bookName: string
  partType: PartType
  w: number // True bounding box width
  h: number // True bounding box height
  outerCutD: string
  innerCutDs: string[]
  scoreDs: string[]
  holes: { cx: number; cy: number; r: number }[]
  contourPoints: Point[] // The exact, normalized points of the outer path
  labelAt: { x: number; y: number }
}

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
