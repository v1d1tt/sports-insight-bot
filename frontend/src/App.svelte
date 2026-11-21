<script lang="ts">
  import AnalystStatus from './lib/AnalystStatus.svelte'
</script>

<main>
  <h1>Sports Insight Bot</h1>
  <p>A cricket-first sports Analyst. The chat comes in the next slices.</p>
  <AnalystStatus />
</main>

<style>
  main {
    max-width: 40rem;
    margin: 4rem auto;
    padding: 0 1rem;
    font-family: system-ui, sans-serif;
  }
</style>
