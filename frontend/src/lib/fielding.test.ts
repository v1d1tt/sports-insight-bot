// Seam 2: the Fielding restrictions in the browser, run against the same
// shared case table as the Python check (backend/tests/test_fielding.py), so
// the live warnings and the server can never disagree (docs/adr/0003).
import { describe, expect, test } from 'vitest'
import cases from '../../../backend/tests/fielding_cases.json'
import type { FieldPlacement } from './field-placement'
import { checkRestrictions, mirror, moveFielder, nearestPosition } from './fielding'

type Case = { name: string; field: FieldPlacement; violations: string[] }

describe('the shared Fielding restriction cases', () => {
  test.each((cases.cases as Case[]).map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const codes = checkRestrictions(c.field).map((violation) => violation.code)

    expect(codes.sort()).toEqual([...c.violations].sort())
  })
})

const legal = (cases.cases[0] as Case).field
const tooManyOutside = (cases.cases[3] as Case).field // T20 powerplay, 3 outside

test('a warning names the rule in glossary words and the fielders that break it', () => {
  const [violation] = checkRestrictions(tooManyOutside)

  expect(violation.message).toBe(
    '3 fielders are outside the 30-yard circle; the T20 powerplay allows at most 2.',
  )
  expect(violation.fielders.sort()).toEqual(['deep cover', 'fine leg', 'third man'])
})

test('mirroring flips every fielder across the line of the Pitch and switches the Batter hand', () => {
  const mirrored = mirror(legal)

  expect(mirrored.batter_hand).toBe('left')
  expect(mirrored.fielders).toEqual(legal.fielders.map((f) => ({ ...f, x: f.x === 0 ? 0 : -f.x })))
  expect(mirror(mirrored)).toEqual(legal)
  // The mirrored left-hander's field is legal too (shared case 2 says so).
  expect(checkRestrictions(mirrored)).toEqual([])
})

describe('nearestPosition', () => {
  test('names the closest standard spot', () => {
    expect(nearestPosition(-0.9, 0.12, 'right')).toBe('deep point')
    expect(nearestPosition(0.3, -0.88, 'right')).toBe('long on')
  })

  test("uses the mirrored spots for a left-hander", () => {
    expect(nearestPosition(-0.9, 0.12, 'left')).toBe('deep square leg')
  })

  test('skips names that other fielders already have', () => {
    expect(nearestPosition(-0.9, 0.12, 'right', new Set(['deep point']))).not.toBe('deep point')
  })

  test('never names the bowler or the wicketkeeper', () => {
    expect(nearestPosition(0, 0.3, 'right')).not.toBe('wicketkeeper')
    expect(nearestPosition(0.04, -0.22, 'right')).not.toBe('bowler')
  })
})

describe('moveFielder', () => {
  const thirdMan = legal.fielders.findIndex((f) => f.position === 'third man')

  test('moves the fielder and renames them to the nearest free Fielding position', () => {
    const moved = moveFielder(legal, thirdMan, -0.2, 0.35)

    expect(moved.fielders[thirdMan]).toEqual({ position: 'short third man', x: -0.2, y: 0.35 })
    expect(legal.fielders[thirdMan].position).toBe('third man') // the old field is not changed
  })

  test('keeps the fielder inside the Ground', () => {
    const moved = moveFielder(legal, thirdMan, -3, 0)
    const { x, y } = moved.fielders[thirdMan]

    expect(Math.hypot(x, y)).toBeLessThanOrEqual(1)
    expect(x).toBeLessThan(-0.9)
  })

  test('moving a fielder outside the circle in a T20 powerplay breaks the limit', () => {
    const point = legal.fielders.findIndex((f) => f.position === 'point')

    const moved = moveFielder(legal, point, -0.9, 0.1)

    expect(moved.fielders[point].position).toBe('deep point')
    expect(checkRestrictions(moved).map((v) => v.code)).toEqual(['too_many_outside_circle'])
  })
})
