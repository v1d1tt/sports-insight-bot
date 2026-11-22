// The Wagon wheel: a batter's Shots and the run totals by area of the Ground.
// The server counts the same totals again for the prompt (backend/app/wagon_wheel.py).

import { type BatterHand, GROUND } from './field-placement'

export type Runs = 1 | 2 | 3 | 4 | 6
export const RUNS: Runs[] = [1, 2, 3, 4, 6]

/** Where the ball went, in Ground units (see GROUND), and the runs it made. */
export type Shot = { x: number; y: number; runs: Runs }

export type WagonWheel = { batter_hand: BatterHand; shots: Shot[] }

export const EMPTY_WAGON_WHEEL: WagonWheel = { batter_hand: 'right', shots: [] }

// Eight areas, each 45 degrees wide, measured from the striker: from straight
// round to behind the wicket, on each side.
const OFF_AREAS = ['long off', 'cover', 'point', 'third man'] as const
const LEG_AREAS = ['long on', 'midwicket', 'square leg', 'fine leg'] as const
export type Area = (typeof OFF_AREAS)[number] | (typeof LEG_AREAS)[number]
/** Round the Ground: the off side from behind the wicket, then the leg side. */
export const AREAS: Area[] = [...[...OFF_AREAS].reverse(), ...LEG_AREAS]

/** The angle of a point from straight (towards the bowler), in degrees; positive on the leg side. */
export function angleOf(x: number, y: number, hand: BatterHand): number {
  const legX = hand === 'right' ? x : -x
  return (Math.atan2(legX, GROUND.strikerY - y) * 180) / Math.PI
}

export function areaOf(shot: { x: number; y: number }, hand: BatterHand): Area {
  const angle = angleOf(shot.x, shot.y, hand)
  const index = Math.min(3, Math.floor(Math.abs(angle) / 45))
  return angle >= 0 ? LEG_AREAS[index] : OFF_AREAS[index]
}

export type AreaTotal = { area: Area; runs: number; shots: number }

/** Runs and Shots for every area, in the order of AREAS. */
export function totalsByArea(wheel: WagonWheel): AreaTotal[] {
  const totals = AREAS.map((area) => ({ area, runs: 0, shots: 0 }))
  for (const shot of wheel.shots) {
    const total = totals[AREAS.indexOf(areaOf(shot, wheel.batter_hand))]
    total.runs += shot.runs
    total.shots += 1
  }
  return totals
}

export const totalRuns = (wheel: WagonWheel) => wheel.shots.reduce((sum, shot) => sum + shot.runs, 0)

/** "10 runs off 2 Shots" */
export function describeWheel(wheel: WagonWheel): string {
  const runs = totalRuns(wheel)
  const shots = wheel.shots.length
  return `${runs} ${runs === 1 ? 'run' : 'runs'} off ${shots} ${shots === 1 ? 'Shot' : 'Shots'}`
}

/** A point the ball can go to: on the Ground, and not on top of the striker. */
export function onTheGround(x: number, y: number): boolean {
  return Math.hypot(x, y) <= 1 && Math.hypot(x, y - GROUND.strikerY) > 0.05
}

export const addShot = (wheel: WagonWheel, shot: Shot): WagonWheel => ({ ...wheel, shots: [...wheel.shots, shot] })

export const undoShot = (wheel: WagonWheel): WagonWheel => ({ ...wheel, shots: wheel.shots.slice(0, -1) })

export const removeShot = (wheel: WagonWheel, index: number): WagonWheel => ({
  ...wheel,
  shots: wheel.shots.filter((_, i) => i !== index),
})

/** The same Shots for a batter of the other hand: every Shot keeps its area. */
export function mirrorWheel(wheel: WagonWheel): WagonWheel {
  return {
    batter_hand: wheel.batter_hand === 'right' ? 'left' : 'right',
    shots: wheel.shots.map((shot) => ({ ...shot, x: -shot.x })),
  }
}
