import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTooltips, TOOLTIP_DELAY_MS } from './tooltips'

const tip = () => document.querySelector<HTMLElement>('.tooltip')

describe('installTooltips', () => {
  let remove: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <button id="icon" aria-label="Attach images"><svg></svg></button>
      <button id="tipped" aria-label="Add a Wagon wheel" data-tip="Add a Wagon wheel: tap where each Shot went"></button>
      <button id="text">Send</button>`
    remove = installTooltips(document)
  })

  afterEach(() => {
    remove()
    vi.useRealTimers()
  })

  const hover = (id: string) =>
    document.getElementById(id)!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))

  it('names an icon button shortly after the pointer rests on it', () => {
    hover('icon')
    expect(tip()?.hidden ?? true).toBe(true)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(tip()?.hidden).toBe(false)
    expect(tip()?.textContent).toBe('Attach images')
  })

  it('prefers the longer data-tip text over the accessible name', () => {
    hover('tipped')
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(tip()?.textContent).toBe('Add a Wagon wheel: tap where each Shot went')
  })

  it('shows at once on keyboard focus and hides on Escape', () => {
    document.getElementById('icon')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(tip()?.hidden).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(tip()?.hidden).toBe(true)
  })

  it('hides when the pointer leaves', () => {
    hover('icon')
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    document.getElementById('icon')!.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))
    expect(tip()?.hidden).toBe(true)
  })

  it('adds nothing to a button whose label is already written on it', () => {
    hover('text')
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(tip()?.hidden ?? true).toBe(true)
  })
})
