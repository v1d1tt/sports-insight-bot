<script lang="ts">
  import { describeField, type FieldPlacement, GROUND, outsideCircle, placeLabels } from './field-placement'

  let { field }: { field: FieldPlacement } = $props()

  const labels = $derived(placeLabels(field.fielders))
  const outside = $derived(outsideCircle(field))
  // For a right-handed batter the off side is on the left of the picture.
  const offOnLeft = $derived(field.batter_hand === 'right')
  const summary = $derived(describeField(field))

  // The picture shows the wicketkeeper at the top, so picture y = -y.
  const pitchTop = -GROUND.strikerY - 0.04
  const pitchHeight = GROUND.strikerY - GROUND.bowlerY + 0.08
</script>

<!-- A Field placement, printed like a diagram in the back of a scorebook. -->
<figure class="board" aria-label="Field placement">
  <figcaption>
    <span class="label">Field</span>
    <span class="summary">{summary}</span>
    <span class="count">{outside} outside the 30-yard circle</span>
  </figcaption>

  <svg viewBox="-1.32 -1.12 2.64 2.24" role="img" aria-label="Ground with {field.fielders.length} fielders: {summary}">
    <circle class="boundary" r="1" />
    <circle class="ring" r={GROUND.circleRadius} />
    <rect class="pitch" x="-0.03" y={pitchTop} width="0.06" height={pitchHeight} />

    <text class="side" x="-1.28" y="1.07" text-anchor="start">{offOnLeft ? 'Off side' : 'Leg side'}</text>
    <text class="side" x="1.28" y="1.07" text-anchor="end">{offOnLeft ? 'Leg side' : 'Off side'}</text>

    {#each labels as label, i (label.position)}
      <g class="fielder" style:--i={i}>
        <circle
          class={['dot', (label.position === 'bowler' || label.position === 'wicketkeeper') && 'fixed']}
          cx={label.dotX}
          cy={label.dotY}
          r="0.026"
        />
        {#if Math.abs(label.y - label.dotY) > 0.001}
          <!-- A leader line when the label had to move away from its dot. -->
          <line class="leader" x1={label.dotX} y1={label.dotY} x2={label.x} y2={label.y} />
        {/if}
        <text class="name" x={label.x} y={label.y} text-anchor={label.anchor} dominant-baseline="central">
          {label.position}
        </text>
      </g>
    {/each}
  </svg>
</figure>

<style>
  .board {
    max-width: 30rem;
    margin: var(--line) 0 0;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--paper-raised);
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.75rem;
    padding: 0 0.75rem;
    border-bottom: 1px solid var(--rule);
    line-height: var(--line);
  }

  .summary {
    color: var(--pencil);
    font-weight: 600;
  }

  .count {
    margin-left: auto;
    color: var(--pencil-soft);
    font-size: 0.8125rem;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    font-family: var(--font-body);
  }

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

  .fielder {
    animation: place var(--dur-slow) var(--ease-out) calc(var(--i) * 35ms) both;
  }

  .dot {
    fill: var(--pencil);
  }

  /* The bowler and wicketkeeper do not count for the Fielding restrictions. */
  .dot.fixed {
    fill: var(--paper-raised);
    stroke: var(--pencil);
    stroke-width: 0.01;
  }

  .leader {
    stroke: var(--pencil-soft);
    stroke-width: 0.004;
  }

  .name {
    fill: var(--pencil);
    font-size: 0.056px;
    font-weight: 500;
    paint-order: stroke;
    stroke: var(--paper);
    stroke-width: 0.014px;
  }

  @keyframes place {
    from {
      opacity: 0;
    }
  }
</style>
