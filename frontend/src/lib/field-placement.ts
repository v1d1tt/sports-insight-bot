// The Field placement shape the server sends in a `field_placement` event
// (see docs/PRD.md). The server has already checked it against the Fielding
// restrictions, so the page only draws it. (The browser's own check of the
// same rules comes with dragging, in ticket 06.)

export type Format = 'T20' | 'ODI' | 'Test'
export type Phase = 'powerplay' | 'middle' | 'death'
export type BatterHand = 'right' | 'left'

/** One fielder. The Ground is a circle of radius 1 at (0, 0); see GROUND. */
export type Fielder = { position: string; x: number; y: number }

export type FieldPlacement = {
  format: Format
  phase: Phase
  bowler_type: string
  batter_hand: BatterHand
  fielders: Fielder[]
}

/**
 * The Ground's geometry (the same numbers as backend/app/fielding/restrictions.json).
 * The striker stands at (0, 0.1) facing the bowler at (0, -0.15); y grows
 * towards the wicketkeeper. For a right-handed batter the off side is x < 0.
 */
export const GROUND = { circleRadius: 0.43, strikerY: 0.1, bowlerY: -0.15 } as const

/** A label's place on the drawing, in Ground units, with the picture's y pointing down. */
export type LabelPlace = {
  position: string
  /** The fielder's dot. */
  dotX: number
  dotY: number
  /** The label's anchor point and which side of the dot it sits on. */
  x: number
  y: number
  anchor: 'start' | 'end'
}

const CHAR_WIDTH = 0.028 // label width per character, in Ground units
const LINE_HEIGHT = 0.07
const GAP = 0.035 // between a dot and its label

/**
 * Place each fielder's label beside its dot, on the side away from the
 * middle, and push labels down until no two overlap (slip cordons are tight).
 * The picture shows the wicketkeeper at the top, so picture y = -y.
 */
export function placeLabels(fielders: Fielder[]): LabelPlace[] {
  const placed: { left: number; right: number; top: number; bottom: number }[] = []
  const sorted = [...fielders].sort((a, b) => b.y - a.y) // top of the picture first
  return sorted.map((fielder) => {
    const dotX = fielder.x
    const dotY = -fielder.y
    const anchor = fielder.x < 0 ? 'end' : 'start'
    const width = fielder.position.length * CHAR_WIDTH
    const x = anchor === 'end' ? dotX - GAP : dotX + GAP
    const left = anchor === 'end' ? x - width : x
    let y = dotY
    for (let tries = 0; tries < 8; tries++) {
      const box = { left, right: left + width, top: y - LINE_HEIGHT / 2, bottom: y + LINE_HEIGHT / 2 }
      const hit = placed.find(
        (other) =>
          box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom,
      )
      if (!hit) {
        placed.push(box)
        break
      }
      y = hit.bottom + LINE_HEIGHT / 2
    }
    return { position: fielder.position, dotX, dotY, x, y, anchor }
  })
}

/** How many fielders (not the bowler or wicketkeeper) stand outside the 30-yard circle. */
export function outsideCircle(field: FieldPlacement): number {
  return field.fielders.filter(
    (f) => f.position !== 'bowler' && f.position !== 'wicketkeeper' && Math.hypot(f.x, f.y) > GROUND.circleRadius,
  ).length
}

/** "T20 powerplay · right-arm fast to a left-hander" */
export function describeField(field: FieldPlacement): string {
  const phase = field.format === 'Test' ? '' : ` ${field.phase === 'middle' ? 'middle overs' : field.phase}`
  return `${field.format}${phase} · ${field.bowler_type} to a ${field.batter_hand}-hander`
}
