// The Fielding restrictions in the browser, for the live warnings on the Board.
// The limits come from the one shared data file that the server reads too, and
// this check passes the same shared case table as the Python one (docs/adr/0003).
import restrictions from '../../../backend/app/fielding/restrictions.json'
import type { BatterHand, FieldPlacement, Fielder, Format, Phase } from './field-placement'

export type ViolationCode = 'too_many_outside_circle' | 'too_many_behind_square_leg_side'

/** A broken Fielding restriction: the shared code, a sentence for the Visitor, and who breaks it. */
export type Violation = { code: ViolationCode; message: string; fielders: string[] }

const NOT_COUNTED = new Set(restrictions.not_counted)
const STRIKER_Y = restrictions.striker.y
/** Dragged fielders stay this far inside the boundary rope, so the server accepts the field. */
const MAX_DISTANCE = restrictions.ground_radius - 0.02

const PHASE_NAMES: Record<Phase, string> = { powerplay: 'powerplay', middle: 'middle overs', death: 'death overs' }

/** True when the fielder counts for the Fielding restrictions (not the bowler or wicketkeeper). */
export function counts(fielder: Fielder): boolean {
  return !NOT_COUNTED.has(fielder.position)
}

export function isOutsideCircle(fielder: Fielder): boolean {
  return Math.hypot(fielder.x, fielder.y) > restrictions.circle_radius
}

/** Leg side: x > 0 for a right-handed batter. Behind square: further back than the striker. */
export function isBehindSquareOnLegSide(fielder: Fielder, hand: BatterHand): boolean {
  const legSign = hand === 'right' ? 1 : -1
  return fielder.x * legSign > 0 && fielder.y > STRIKER_Y
}

/** The most fielders allowed outside the 30-yard circle, or null for no limit. */
export function outsideLimit(format: Format, phase: Phase): number | null {
  return restrictions.max_outside_circle[format][phase]
}

/** The Fielding restrictions this Field placement breaks (empty when legal). */
export function checkRestrictions(field: FieldPlacement): Violation[] {
  const counted = field.fielders.filter(counts)
  const violations: Violation[] = []

  const limit = outsideLimit(field.format, field.phase)
  const outside = counted.filter(isOutsideCircle).map((f) => f.position)
  if (limit !== null && outside.length > limit) {
    violations.push({
      code: 'too_many_outside_circle',
      message:
        `${outside.length} fielders are outside the 30-yard circle; ` +
        `the ${field.format} ${PHASE_NAMES[field.phase]} allows at most ${limit}.`,
      fielders: outside,
    })
  }

  const legLimit = restrictions.max_behind_square_leg_side
  const behind = counted.filter((f) => isBehindSquareOnLegSide(f, field.batter_hand)).map((f) => f.position)
  if (behind.length > legLimit) {
    violations.push({
      code: 'too_many_behind_square_leg_side',
      message: `${behind.length} fielders are behind square on the leg side; at most ${legLimit} are allowed.`,
      fielders: behind,
    })
  }
  return violations
}

/** The same Field placement for the other Batter hand: every fielder mirrored across the line of the Pitch. */
export function mirror(field: FieldPlacement): FieldPlacement {
  return {
    ...field,
    batter_hand: field.batter_hand === 'right' ? 'left' : 'right',
    // `|| 0` keeps a fielder on the line at 0, not -0.
    fielders: field.fielders.map((f) => ({ ...f, x: -f.x || 0 })),
  }
}

const SPOTS = Object.entries(restrictions.standard_spots_right_hander).filter(([name]) => !NOT_COUNTED.has(name))

/**
 * The Fielding position whose standard spot is closest to (x, y), skipping
 * names in `taken`. The standard spots are for a right-hander; a left-hander's
 * are the mirror image.
 */
export function nearestPosition(x: number, y: number, hand: BatterHand, taken: Set<string> = new Set()): string {
  const sign = hand === 'right' ? 1 : -1
  let best = ''
  let bestDistance = Infinity
  for (const [name, spot] of SPOTS) {
    if (taken.has(name)) continue
    const distance = Math.hypot(sign * spot.x - x, spot.y - y)
    if (distance < bestDistance) {
      best = name
      bestDistance = distance
    }
  }
  return best
}

/**
 * Move one fielder to (x, y), kept inside the Ground. A fielder who counts for
 * the restrictions takes the name of the nearest free Fielding position.
 * Returns a new Field placement; the old one is not changed.
 */
export function moveFielder(field: FieldPlacement, index: number, x: number, y: number): FieldPlacement {
  const distance = Math.hypot(x, y)
  const scale = distance > MAX_DISTANCE ? MAX_DISTANCE / distance : 1
  const nx = round(x * scale)
  const ny = round(y * scale)
  const fielder = field.fielders[index]
  const taken = new Set(field.fielders.filter((_, i) => i !== index).map((f) => f.position))
  const position = counts(fielder) ? nearestPosition(nx, ny, field.batter_hand, taken) : fielder.position
  return {
    ...field,
    fielders: field.fielders.map((f, i) => (i === index ? { position, x: nx, y: ny } : f)),
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000
