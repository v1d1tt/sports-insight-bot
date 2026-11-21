import { prefersReducedMotion } from 'svelte/motion'
import { cubicOut } from 'svelte/easing'

// Svelte transitions run in JavaScript, so the CSS reduced-motion rule in
// app.css does not reach them. Every transition takes its duration from here.

/** `ms`, or 0 when the Visitor asked the system for reduced motion. */
export function duration(ms: number): number {
  return prefersReducedMotion.current ? 0 : ms
}

/** Draws an element from left to right, like a pen along a ruler. */
export function draw(_node: Element, { delay = 0, ms = 520 } = {}) {
  return {
    delay,
    duration: duration(ms),
    easing: cubicOut,
    css: (t: number) => `transform: scaleX(${t}); transform-origin: left;`,
  }
}
