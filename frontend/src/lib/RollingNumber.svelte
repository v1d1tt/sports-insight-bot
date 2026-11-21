<script lang="ts">
  import { fly } from 'svelte/transition'
  import { duration } from './motion'

  // A number that rolls to its new value, like a plate on a scoreboard.
  let { value }: { value: number } = $props()
</script>

<span class="roll">
  {#key value}
    <span
      class="digit"
      in:fly={{ y: '0.9em', duration: duration(260) }}
      out:fly={{ y: '-0.9em', duration: duration(260) }}
    >
      {value}
    </span>
  {/key}
</span>

<style>
  .roll {
    display: inline-grid;
    overflow: hidden;
    vertical-align: bottom;
  }

  .digit {
    grid-area: 1 / 1;
  }
</style>
