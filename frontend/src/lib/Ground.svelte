<svelte:options namespace="svg" />

<script module lang="ts">
  /** The SVG viewBox of every Board drawing: the Ground (radius 1) and room for the side labels. */
  export const GROUND_VIEWBOX = '-1.32 -1.12 2.64 2.24'

  /** A pointer's place on the Ground, in Ground units (y grows towards the wicketkeeper). */
  export function groundPoint(svg: SVGSVGElement, event: MouseEvent) {
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: -point.y }
  }
</script>

<script lang="ts">
  import { GROUND } from './field-placement'

  // The Ground under a Field placement or a Wagon wheel: boundary, 30-yard circle,
  // Pitch and side names. It is drawn inside the parent's <svg>.
  let { offOnLeft }: { offOnLeft: boolean } = $props()

  // The picture shows the wicketkeeper at the top, so picture y = -y.
  const pitchTop = -GROUND.strikerY - 0.04
  const pitchHeight = GROUND.strikerY - GROUND.bowlerY + 0.08
</script>

<circle class="boundary" r="1" />
<circle class="ring" r={GROUND.circleRadius} />
<rect class="pitch" x="-0.03" y={pitchTop} width="0.06" height={pitchHeight} />

<text class="side" x="-1.28" y="1.07" text-anchor="start">{offOnLeft ? 'Off side' : 'Leg side'}</text>
<text class="side" x="1.28" y="1.07" text-anchor="end">{offOnLeft ? 'Leg side' : 'Off side'}</text>

<style>
  .boundary {
    fill: var(--paper);
    stroke: var(--rule-strong);
    stroke-width: 0.008;
  }

  .ring {
    fill: none;
    stroke: var(--print);
    stroke-width: 0.006;
    stroke-dasharray: 0.03 0.025;
    opacity: 0.7;
  }

  .pitch {
    fill: var(--rule);
    stroke: var(--rule-strong);
    stroke-width: 0.004;
  }

  .side {
    fill: var(--print);
    font-family: var(--font-display);
    font-size: 0.065px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
