import { describe, expect, it } from 'vitest'
import { exampleQuestions, SPORTS } from './sport-focus'

describe('exampleQuestions', () => {
  it('gives three example questions for every sport', () => {
    for (const { value } of SPORTS) expect(exampleQuestions(value)).toHaveLength(3)
  })

  it('keeps the Board example for cricket only', () => {
    expect(exampleQuestions('cricket')).toContain('Set a field for a leg-spinner on a turning pitch')
    for (const { value } of SPORTS.filter((sport) => sport.value !== 'cricket')) {
      expect(exampleQuestions(value).join(' ')).not.toMatch(/field for|over|innings|pitch/i)
    }
  })
})
