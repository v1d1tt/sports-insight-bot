import { expect, test } from 'vitest'
import { describeField, type FieldPlacement, outsideCircle, placeLabels } from './field-placement'

const field: FieldPlacement = {
  format: 'T20',
  phase: 'powerplay',
  bowler_type: 'right-arm fast',
  batter_hand: 'right',
  fielders: [
    { position: 'bowler', x: 0.03, y: -0.2 },
    { position: 'wicketkeeper', x: 0, y: 0.28 },
    { position: 'first slip', x: -0.08, y: 0.3 },
    { position: 'second slip', x: -0.15, y: 0.29 },
    { position: 'gully', x: -0.28, y: 0.25 },
    { position: 'point', x: -0.38, y: 0.05 },
    { position: 'cover', x: -0.33, y: -0.2 },
    { position: 'mid-off', x: -0.15, y: -0.38 },
    { position: 'mid-on', x: 0.15, y: -0.38 },
    { position: 'fine leg', x: 0.35, y: 0.75 },
    { position: 'third man', x: -0.4, y: 0.8 },
  ],
}

test('every fielder gets one label, on the side away from the middle', () => {
  const labels = placeLabels(field.fielders)

  expect(labels.map((l) => l.position).sort()).toEqual(field.fielders.map((f) => f.position).sort())
  const thirdMan = labels.find((l) => l.position === 'third man')!
  expect(thirdMan.anchor).toBe('end')
  expect(thirdMan.x).toBeLessThan(-0.4)
  // The picture puts the wicketkeeper at the top: picture y = -y.
  expect(thirdMan.dotY).toBe(-0.8)
})

test('labels of fielders standing close together do not overlap', () => {
  const labels = placeLabels(field.fielders)
  const first = labels.find((l) => l.position === 'first slip')!
  const second = labels.find((l) => l.position === 'second slip')!

  expect(Math.abs(first.y - second.y)).toBeGreaterThanOrEqual(0.07 - 1e-9)
})

test('counts fielders outside the 30-yard circle, not the bowler or wicketkeeper', () => {
  expect(outsideCircle(field)).toBe(2)
})

test('describes the field in words', () => {
  expect(describeField(field)).toBe('T20 powerplay · right-arm fast to a right-hander')
  expect(describeField({ ...field, format: 'Test', batter_hand: 'left' })).toBe(
    'Test · right-arm fast to a left-hander',
  )
})
