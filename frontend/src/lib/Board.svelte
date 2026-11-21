<script lang="ts">
  import { IconMessageQuestion } from '@tabler/icons-svelte-runes'
  import type { Attachment } from 'svelte/attachments'
  import { describeField, type FieldPlacement, type Format, GROUND, type Phase, placeLabels } from './field-placement'
  import { checkRestrictions, counts, isOutsideCircle, mirror, moveFielder, outsideLimit } from './fielding'

  let {
    field,
    onchange,
    onask,
    askDisabled = false,
  }: {
    field: FieldPlacement
    /** Given: the Visitor can change the field. Called after each finished change, to save it. */
    onchange?: (field: FieldPlacement) => void
    /** Given: shows "Ask the Analyst about this field". */
    onask?: (field: FieldPlacement) => void
    askDisabled?: boolean
  } = $props()

  // The field as the Visitor has changed it. A new `field` from outside resets it.
  let current = $derived(field)
  const editable = $derived(onchange !== undefined)

  const labels = $derived(placeLabels(current.fielders))
  const violations = $derived(checkRestrictions(current))
  const breaking = $derived(new Set(violations.flatMap((v) => v.fielders)))
  const outside = $derived(current.fielders.filter((f) => counts(f) && isOutsideCircle(f)).length)
  const limit = $derived(outsideLimit(current.format, current.phase))
  // For a right-handed batter the off side is on the left of the picture.
  const offOnLeft = $derived(current.batter_hand === 'right')
  const summary = $derived(describeField(current))

  /** The fielder being dragged, by index. */
  let dragging = $state<number | null>(null)
  /** True while the field mirrors, so the fielders glide across instead of jumping. */
  let gliding = $state(false)
  /** Said by screen readers after a move. */
  let announcement = $state('')

  // The picture shows the wicketkeeper at the top, so picture y = -y.
  const pitchTop = -GROUND.strikerY - 0.04
  const pitchHeight = GROUND.strikerY - GROUND.bowlerY + 0.08
  const KEY_STEP = 0.03
  const KEY_STEP_LARGE = 0.1

  function commit(next: FieldPlacement) {
    current = next
    onchange?.(next)
  }

  function announceMove(from: string, index: number) {
    const fielder = current.fielders[index]
    const where = isOutsideCircle(fielder) ? 'outside' : 'inside'
    const name = fielder.position === from ? from : `${from} is now ${fielder.position}`
    announcement = `${name}, ${where} the 30-yard circle.`
  }

  /** A pointer's place on the Ground, in Ground units (y grows towards the wicketkeeper). */
  function groundPoint(svg: SVGSVGElement, event: PointerEvent) {
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: -point.y }
  }

  let dragStart = ''

  function onpointerdown(event: PointerEvent, index: number) {
    if (!editable || !counts(current.fielders[index]) || event.button !== 0) return
    event.preventDefault()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    gliding = false
    dragging = index
    dragStart = current.fielders[index].position
  }

  function onpointermove(event: PointerEvent, index: number) {
    if (dragging !== index) return
    const svg = (event.currentTarget as SVGElement).ownerSVGElement
    const point = svg && groundPoint(svg, event)
    // While dragging, the fielder takes the name of the nearest Fielding position.
    if (point) current = moveFielder(current, index, point.x, point.y)
  }

  function onpointerup(index: number) {
    if (dragging !== index) return
    dragging = null
    commit(current)
    announceMove(dragStart, index)
  }

  function onkeydown(event: KeyboardEvent, index: number) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1], // up the picture = towards the wicketkeeper
      ArrowDown: [0, -1],
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    gliding = false
    const size = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const fielder = current.fielders[index]
    const from = fielder.position
    commit(moveFielder(current, index, fielder.x + step[0] * size, fielder.y + step[1] * size))
    announceMove(from, index)
  }

  function setHand(hand: FieldPlacement['batter_hand']) {
    if (hand === current.batter_hand) return
    gliding = true
    commit(mirror(current))
    announcement = `Field mirrored for a ${hand}-handed batter.`
  }

  function setFormat(event: Event) {
    commit({ ...current, format: (event.currentTarget as HTMLSelectElement).value as Format })
  }

  function setPhase(event: Event) {
    commit({ ...current, phase: (event.currentTarget as HTMLSelectElement).value as Phase })
  }

  // Touch: stop the page from scrolling while a fielder is dragged. The listener
  // must be non-passive to call preventDefault(), so it is added by hand.
  const holdPageStill: Attachment<SVGSVGElement> = (svg) => {
    const stop = (event: TouchEvent) => {
      if (dragging !== null) event.preventDefault()
    }
    svg.addEventListener('touchmove', stop, { passive: false })
    return () => svg.removeEventListener('touchmove', stop)
  }
</script>

<!-- A Field placement, printed like a diagram in the back of a scorebook. -->
<figure class="board" aria-label="Field placement">
  <figcaption>
    <span class="label">Field</span>
    <span class="summary">{summary}</span>
    <span class="count">{outside} outside the 30-yard circle</span>
  </figcaption>

  {#if editable}
    <div class="controls">
      <label>
        <span class="label">Format</span>
        <select value={current.format} onchange={setFormat}>
          <option value="T20">T20</option>
          <option value="ODI">ODI</option>
          <option value="Test">Test</option>
        </select>
      </label>
      <label>
        <span class="label">Phase</span>
        <select value={current.phase} onchange={setPhase} disabled={current.format === 'Test'}>
          <option value="powerplay">Powerplay</option>
          <option value="middle">Middle overs</option>
          <option value="death">Death overs</option>
        </select>
      </label>
      <div class="hand" role="group" aria-label="Batter hand">
        <span class="label" aria-hidden="true">Batter</span>
        <button type="button" aria-pressed={current.batter_hand === 'right'} onclick={() => setHand('right')}>
          Right-hander
        </button>
        <button type="button" aria-pressed={current.batter_hand === 'left'} onclick={() => setHand('left')}>
          Left-hander
        </button>
      </div>
    </div>
  {/if}

  <svg
    viewBox="-1.32 -1.12 2.64 2.24"
    role="group"
    aria-label="Ground with {current.fielders.length} fielders: {summary}"
    class={{ gliding, editable }}
    {@attach holdPageStill}
  >
    <circle class="boundary" r="1" />
    <circle class="ring" r={GROUND.circleRadius} />
    <rect class="pitch" x="-0.03" y={pitchTop} width="0.06" height={pitchHeight} />

    <text class="side" x="-1.28" y="1.07" text-anchor="start">{offOnLeft ? 'Off side' : 'Leg side'}</text>
    <text class="side" x="1.28" y="1.07" text-anchor="end">{offOnLeft ? 'Leg side' : 'Off side'}</text>

    <!-- Keyed by index: a dragged fielder keeps its element while its name changes. -->
    {#each labels as label (label.index)}
      {@const fielder = current.fielders[label.index]}
      {@const movable = editable && counts(fielder)}
      {@const where = isOutsideCircle(fielder) ? 'outside' : 'inside'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (the role is "button" whenever tabindex is set) -->
      <g
        class={['fielder', movable && 'movable', dragging === label.index && 'dragging']}
        style:--i={label.index}
        style:transform="translate({label.dotX}px, {label.dotY}px)"
        role={movable ? 'button' : undefined}
        tabindex={movable ? 0 : undefined}
        aria-roledescription={movable ? 'movable fielder' : undefined}
        aria-label={movable ? `${fielder.position}, ${where} the 30-yard circle. Drag, or use the arrow keys.` : undefined}
        onpointerdown={(event) => onpointerdown(event, label.index)}
        onpointermove={(event) => onpointermove(event, label.index)}
        onpointerup={() => onpointerup(label.index)}
        onpointercancel={() => onpointerup(label.index)}
        onkeydown={(event) => movable && onkeydown(event, label.index)}
      >
        {#if movable}
          <!-- A bigger, invisible target, so a finger can pick up a fielder. -->
          <circle class="hit" r="0.08" />
          <circle class="focus" r="0.05" />
        {/if}
        <circle
          class={['dot', !counts(fielder) && 'fixed', breaking.has(fielder.position) && 'breaks']}
          r="0.026"
        />
        {#if Math.abs(label.y - label.dotY) > 0.001}
          <!-- A leader line when the label had to move away from its dot. -->
          <line class="leader" x1="0" y1="0" x2={label.x - label.dotX} y2={label.y - label.dotY} />
        {/if}
        <text
          class="name"
          x={label.x - label.dotX}
          y={label.y - label.dotY}
          text-anchor={label.anchor}
          dominant-baseline="central"
        >
          {label.position}
        </text>
      </g>
    {/each}
  </svg>

  {#if editable}
    <div class="rules" role="status">
      {#if violations.length}
        <ul class="warnings">
          {#each violations as violation (violation.code)}
            <li>{violation.message}</li>
          {/each}
        </ul>
      {:else}
        <p class="legal">
          Inside the Fielding restrictions{limit === null ? '' : ` (at most ${limit} outside the 30-yard circle)`}.
        </p>
      {/if}
    </div>
    <p class="visually-hidden" aria-live="polite">{announcement}</p>
  {/if}

  {#if onask}
    <div class="ask">
      <button type="button" disabled={askDisabled} onclick={() => onask(current)}>
        <IconMessageQuestion size={18} stroke={1.75} aria-hidden="true" />
        Ask the Analyst about this field
      </button>
    </div>
  {/if}
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

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--rule);
  }

  .controls label,
  .hand {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  select,
  .hand button {
    min-height: 2rem;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--paper);
    color: var(--pencil);
    font: inherit;
    font-size: 0.875rem;
  }

  select {
    padding: 0 0.25rem;
  }

  select:disabled {
    opacity: 0.5;
  }

  .hand button {
    padding: 0 0.5rem;
    cursor: pointer;
  }

  .hand button + button {
    margin-left: -0.375rem;
    border-left: 0;
  }

  .hand button[aria-pressed='true'] {
    background: var(--ink-wash);
    border-color: var(--ink);
    color: var(--ink-strong);
    font-weight: 600;
  }

  .hand button + button[aria-pressed='true'] {
    border-left: 1px solid var(--ink);
  }

  select:focus-visible,
  .hand button:focus-visible,
  .ask button:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    font-family: var(--font-body);
    user-select: none;
    -webkit-user-select: none;
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

  /* Mirroring glides every fielder across the Pitch; a drag follows the pointer exactly. */
  .gliding .fielder {
    transition: transform var(--dur-base) var(--ease-out);
  }

  .movable {
    cursor: grab;
    touch-action: none;
    outline: none;
  }

  .movable.dragging {
    cursor: grabbing;
  }

  .hit {
    fill: transparent;
  }

  .focus {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.012;
    opacity: 0;
  }

  .movable:focus-visible .focus {
    opacity: 1;
  }

  .dot {
    fill: var(--pencil);
    transform-box: fill-box;
    transform-origin: center;
    transition:
      transform var(--dur-fast) var(--ease-out),
      fill var(--dur-fast) ease;
  }

  /* Picked up: the dot grows a little, so the finger or pointer sees what it holds. */
  .dragging .dot {
    fill: var(--ink);
    transform: scale(1.4);
  }

  @media (hover: hover) and (pointer: fine) {
    .movable:hover .dot {
      fill: var(--ink);
    }
  }

  /* The bowler and wicketkeeper do not count for the Fielding restrictions. */
  .dot.fixed {
    fill: var(--paper-raised);
    stroke: var(--pencil);
    stroke-width: 0.01;
  }

  .dot.breaks {
    fill: var(--red);
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

  .dragging .name {
    fill: var(--ink-strong);
    font-weight: 700;
  }

  .rules {
    padding: 0 0.75rem;
    border-top: 1px solid var(--rule);
    font-size: 0.875rem;
    line-height: var(--line);
  }

  .warnings {
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--red);
    font-weight: 600;
  }

  .warnings li::before {
    content: '✕ ';
  }

  .legal {
    margin: 0;
    color: var(--pencil-soft);
  }

  .ask {
    padding: 0.375rem 0.75rem;
    border-top: 1px solid var(--rule);
  }

  .ask button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 2.25rem;
    padding: 0 0.75rem;
    border: 1px solid var(--ink);
    border-radius: 2px;
    background: var(--paper-raised);
    color: var(--ink-strong);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .ask button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (hover: hover) and (pointer: fine) {
    .ask button:not(:disabled):hover {
      background: var(--ink-wash);
    }
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes place {
    from {
      opacity: 0;
    }
  }
</style>
