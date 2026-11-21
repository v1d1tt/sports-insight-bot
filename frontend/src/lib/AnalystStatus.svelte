<script lang="ts">
  type Health = { status: 'ok'; model: string }

  async function checkHealth(): Promise<Health> {
    const response = await fetch('/api/health')
    if (!response.ok) {
      throw new Error(`Health check failed with HTTP ${response.status}`)
    }
    return await response.json()
  }

  const health = checkHealth()
</script>

<p role="status">
  {#await health}
    Checking the Analyst…
  {:then { model }}
    <strong>Analyst online</strong>
    <code>{model}</code>
  {:catch}
    <strong>Analyst offline</strong>
    The server did not answer. Please try again later.
  {/await}
</p>
