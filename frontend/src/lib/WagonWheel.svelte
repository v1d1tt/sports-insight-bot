<script lang="ts">
  import { IconArrowBackUp, IconMessageQuestion, IconX } from '@tabler/icons-svelte-runes'
  import { tick } from 'svelte'
  import { GROUND } from './field-placement'
  import Ground, { GROUND_VIEWBOX, groundPoint } from './Ground.svelte'
  import {
    addShot,
    AREAS,
    areaOf,
    describeWheel,
    mirrorWheel,
    onTheGround,
    removeShot,
    RUNS,
    type Runs,
    totalsByArea,
    undoShot,
    type WagonWheel,
  } from './wagon-wheel'

  let {
    wheel,
    onchange,
    onask,
    askDisabled = false,
  }: {
    wheel: WagonWheel
    /** Called after each finished change (a Shot added or removed, the hand switched), to save it. */
    onchange: (wheel: WagonWheel) => void
    /** Given: shows "Ask the Analyst about this Wagon wheel". */
    onask?: (wheel: WagonWheel) => void
    askDisabled?: boolean
  } = $props()

  // The Wagon wheel as the Visitor has changed it. A new `wheel` from outside resets it.
  let current = $derived(wheel)

  const totals = $derived(totalsByArea(current))
  const best = $derived(Math.max(0, ...totals.map((total) => total.runs)))
  const summary = $derived(describeWheel(current))
  const fours = $derived(current.shots.filter((shot) => shot.runs === 4).length)
  const sixes = $derived(current.shots.filter((shot) => shot.runs === 6).length)
  const offOnLeft = $derived(current.batter_hand === 'right')

  /** Where the Visitor tapped (or aimed), waiting for the runs. */
  let pending = $state<{ x: number; y: number } | null>(null)
  /** The keyboard's aim point, shown while the Ground has keyboard focus. */
  let aim = $state({ x: 0, y: -0.7 })
  let aiming = $state(false)
  /** Said by screen readers after a change. */
  let announcement = $state('')
  let runsPicker = $state<HTMLDivElement>()

  const KEY_STEP = 0.05
  const KEY_STEP_LARGE = 0.15
  const START = { x: 0, y: -GROUND.strikerY } // the striker, in picture units

  const title = (text: string) => text[0].toUpperCase() + text.slice(1)
  const describeShot = (shot: { runs: Runs; x: number; y: number }) =>
    `${shot.runs} to ${areaOf(shot, current.batter_hand)}`

  function commit(next: WagonWheel) {
    current = next
    onchange(next)
  }

  /** Where a line from the striker at `angle` (degrees from straight, + = leg side) meets the boundary. */
  function toBoundary(angle: number, share = 1) {
    const side = offOnLeft ? 1 : -1
    const radians = (angle * Math.PI) / 180
    const dx = side * Math.sin(radians)
    const dy = -Math.cos(radians) // towards the bowler
    const along = GROUND.strikerY * dy
    const t = -along + Math.sqrt(along * along - (GROUND.strikerY ** 2 - 1))
    // Picture units: y = -y.
    return { x: dx * t * share, y: -(GROUND.strikerY + dy * t * share) }
  }

  // The lines between the eight areas, and where each area's runs are written.
  const spokes = $derived([0, 45, 90, 135, 180, -45, -90, -135].map((angle) => toBoundary(angle)))
  const totalPlaces = $derived(
    totals.map((total) => {
      const index = AREAS.indexOf(total.area) // 0-3 off side (third man first), 4-7 leg side
      const angle = index < 4 ? -(157.5 - index * 45) : 22.5 + (index - 4) * 45
      return { ...total, ...toBoundary(angle, 0.82) }
    }),
  )

  function onclick(event: MouseEvent) {
    const point = groundPoint(event.currentTarget as SVGSVGElement, event)
    if (!point || !onTheGround(point.x, point.y)) return
    aiming = false
    pending = point
  }

  async function onkeydown(event: KeyboardEvent) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1], // up the picture = towards the wicketkeeper
      ArrowDown: [0, -1],
    }
    const step = steps[event.key]
    if (step) {
      event.preventDefault()
      aiming = true
      const size = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
      const x = aim.x + step[0] * size
      const y = aim.y + step[1] * size
      const scale = Math.min(1, 0.98 / Math.hypot(x, y)) // stay on the Ground
      aim = { x: x * scale, y: y * scale }
      announcement = `Aiming at ${areaOf(aim, current.batter_hand)}.`
    } else if ((event.key === 'Enter' || event.key === ' ') && onTheGround(aim.x, aim.y)) {
      event.preventDefault()
      pending = { ...aim }
      await tick()
      runsPicker?.querySelector('button')?.focus()
    } else if (event.key === 'Escape') {
      pending = null
    }
  }

  function addRuns(runs: Runs) {
    if (!pending) return
    const round = (n: number) => Math.round(n * 1000) / 1000
    const shot = { x: round(pending.x), y: round(pending.y), runs }
    commit(addShot(current, shot))
    announcement = `${describeShot(shot)} added. ${describeWheel(current)}.`
    pending = null
  }

  function undo() {
    const last = current.shots.at(-1)
    if (!last) return
    commit(undoShot(current))
    announcement = `Removed ${describeShot(last)}.`
  }

  function remove(index: number) {
    const shot = current.shots[index]
    commit(removeShot(current, index))
    announcement = `Removed ${describeShot(shot)}.`
  }

  function setHand(hand: WagonWheel['batter_hand']) {
    if (hand === current.batter_hand) return
    commit(mirrorWheel(current))
    announcement = `Wagon wheel mirrored for a ${hand}-handed batter.`
  }
</script>

<!-- A Wagon wheel, drawn like the scoring chart in a scorebook. -->
<figure class="wheel" aria-label="Wagon wheel">
  <figcaption>
    <span class="label">Wagon wheel</span>
    <span class="summary">{summary}</span>
    <span class="count">{fours} {fours === 1 ? 'four' : 'fours'} · {sixes} {sixes === 1 ? 'six' : 'sixes'}</span>
  </figcaption>

  <div class="controls">
    <div class="hand" role="group" aria-label="Batter hand">
      <span class="label" aria-hidden="true">Batter</span>
      <button type="button" aria-pressed={current.batter_hand === 'right'} onclick={() => setHand('right')}>
        Right-hander
      </button>
      <button type="button" aria-pressed={current.batter_hand === 'left'} onclick={() => setHand('left')}>
        Left-hander
      </button>
    </div>
    <button type="button" class="undo" disabled={current.shots.length === 0} onclick={undo}>
      <IconArrowBackUp size={16} stroke={1.75} aria-hidden="true" />
      Undo last Shot
    </button>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role="application": a custom widget, tap or arrow keys and Enter) -->
  <svg
    viewBox={GROUND_VIEWBOX}
    role="application"
    tabindex="0"
    aria-label="Ground. Tap where the ball went, or aim with the arrow keys and press Enter, then pick the runs."
    {onclick}
    {onkeydown}
    onblur={() => (aiming = false)}
  >
    <Ground {offOnLeft} />

    {#each spokes as spoke, i (i)}
      <line class="spoke" x1={START.x} y1={START.y} x2={spoke.x} y2={spoke.y} />
    {/each}

    {#each totalPlaces as place (place.area)}
      {#if place.runs > 0}
        <text class={['total', place.runs === best && 'best']} x={place.x} y={place.y}>{place.runs}</text>
      {/if}
    {/each}

    <!-- Shots have no id; the drawing only reads them, so the index is a safe key. -->
    {#each current.shots as shot, i (i)}
      <g class={['shot-mark', `r${shot.runs}`]}>
        <line class="shot" pathLength="1" x1={START.x} y1={START.y} x2={shot.x} y2={-shot.y} />
        <circle class="end" cx={shot.x} cy={-shot.y} r="0.018" />
      </g>
    {/each}

    {#if pending}
      <line class="pending" x1={START.x} y1={START.y} x2={pending.x} y2={-pending.y} />
      <circle class="pending-end" cx={pending.x} cy={-pending.y} r="0.035" />
    {:else if aiming}
      <circle class="aim" cx={aim.x} cy={-aim.y} r="0.035" />
    {/if}
  </svg>

  <!-- Always shown, so the Ground never moves under the finger between taps. -->
  <div class="picker" role="group" aria-label="Runs for this Shot" bind:this={runsPicker}>
    <span class="label">{pending ? `Runs to ${areaOf(pending, current.batter_hand)}` : 'Tap where the ball went'}</span>
    {#each RUNS as runs (runs)}
      <button type="button" class="runs" disabled={!pending} onclick={() => addRuns(runs)}>{runs}</button>
    {/each}
    <button type="button" class="cancel" disabled={!pending} onclick={() => (pending = null)}>Cancel</button>
  </div>

  <ul class="areas" aria-label="Runs by area">
    {#each totals as total (total.area)}
      <li class={{ best: total.runs > 0 && total.runs === best }}>
        <span class="area">{title(total.area)}</span>
        <span class="runs-total">{total.runs}</span>
      </li>
    {/each}
  </ul>

  {#if current.shots.length > 0}
    <details class="shots">
      <summary>Shots ({current.shots.length})</summary>
      <ol>
        {#each current.shots as shot, i (i)}
          <li>
            <span>{describeShot(shot)}</span>
            <button type="button" aria-label="Remove Shot {i + 1}: {describeShot(shot)}" onclick={() => remove(i)}>
              <IconX size={14} stroke={2} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ol>
    </details>
  {/if}

  <p class="visually-hidden" aria-live="polite">{announcement}</p>

  {#if onask}
    <div class="ask">
      <button type="button" disabled={askDisabled || current.shots.length === 0} onclick={() => onask(current)}>
        <IconMessageQuestion size={18} stroke={1.75} aria-hidden="true" />
        Ask the Analyst about this Wagon wheel
      </button>
    </div>
  {/if}
</figure>

<style>
  .wheel {
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

  .controls,
  .picker {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 1rem;
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--rule);
  }

  .hand {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  button {
    min-height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--paper);
    color: var(--pencil);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
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

  .undo {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
  }

  /* The runs picker: one big target per run, like the boxes in a scorebook. */
  .picker {
    gap: 0.375rem;
    border-top: 1px solid var(--rule);
  }

  /* The label has its own line, so a longer area name never changes the row's height. */
  .picker .label {
    flex-basis: 100%;
  }

  .cancel {
    margin-left: auto;
  }

  .runs {
    min-width: 2.75rem;
    min-height: 2.75rem;
    border-color: var(--ink);
    color: var(--ink-strong);
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
  }

  .cancel {
    min-height: 2.75rem;
  }


  @media (hover: hover) and (pointer: fine) {
    button:not(:disabled):hover {
      background: var(--ink-wash);
    }
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    font-family: var(--font-body);
    cursor: crosshair;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    outline: none;
  }

  svg:focus-visible {
    box-shadow: inset 0 0 0 2px var(--ink);
  }

  .spoke {
    stroke: var(--rule-strong);
    stroke-width: 0.004;
    stroke-dasharray: 0.02 0.02;
  }

  .total {
    fill: var(--print);
    font-family: var(--font-display);
    font-size: 0.09px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
    paint-order: stroke;
    stroke: var(--paper);
    stroke-width: 0.02px;
  }

  .total.best {
    fill: var(--ink-strong);
    font-size: 0.11px;
  }

  /* Each new Shot is drawn out from the Pitch, like a pen stroke. */
  .shot {
    stroke: var(--print);
    stroke-width: 0.006;
    stroke-linecap: round;
    stroke-dasharray: 1;
    animation: draw var(--dur-slow) var(--ease-out) both;
  }

  .end {
    fill: var(--print);
    animation: show var(--dur-slow) var(--ease-out) both;
  }

  .r4 .shot {
    stroke: var(--ink);
    stroke-width: 0.01;
  }

  .r6 .shot {
    stroke: var(--ink-strong);
    stroke-width: 0.016;
  }

  .r4 .end,
  .r6 .end {
    fill: var(--ink-strong);
  }

  .pending,
  .pending-end,
  .aim {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.008;
  }

  .pending {
    stroke-dasharray: 0.03 0.02;
  }

  .areas {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
    padding: 0.25rem 0.75rem;
    border-top: 1px solid var(--rule);
    list-style: none;
    font-size: 0.8125rem;
  }

  .areas li {
    display: flex;
    flex-direction: column;
    padding: 0.125rem 0;
  }

  .area {
    color: var(--pencil-soft);
  }

  .runs-total {
    color: var(--pencil);
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .areas li.best .runs-total {
    color: var(--ink-strong);
  }

  .shots {
    padding: 0 0.75rem;
    border-top: 1px solid var(--rule);
    font-size: 0.875rem;
    line-height: var(--line);
  }

  summary {
    color: var(--pencil-soft);
    cursor: pointer;
  }

  .shots ol {
    margin: 0 0 0.375rem;
    padding-left: 1.5rem;
  }

  .shots li span {
    display: inline-block;
    min-width: 8rem;
  }

  .shots li button {
    display: inline-grid;
    place-items: center;
    min-width: 2rem;
    margin-left: 0.5rem;
    vertical-align: middle;
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
    border-color: var(--ink);
    background: var(--paper-raised);
    color: var(--ink-strong);
    font-weight: 600;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes show {
    from {
      opacity: 0;
    }
  }
</style>
