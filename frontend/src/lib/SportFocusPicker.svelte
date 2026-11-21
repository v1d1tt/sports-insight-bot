<script lang="ts">
  import type { ChatSession } from './chat-session.svelte'
  import { MAX_TEAM_LENGTH, type Sport, SPORTS } from './sport-focus'

  let { session }: { session: ChatSession } = $props()

  function setSport(event: Event & { currentTarget: HTMLSelectElement }) {
    session.setSportFocus({ ...session.sportFocus, sport: event.currentTarget.value as Sport })
  }

  // Saved when the field loses focus or on Enter, not on every key.
  function setTeam(event: Event & { currentTarget: HTMLInputElement }) {
    const team = event.currentTarget.value.replace(/\s+/g, ' ').trim()
    session.setSportFocus({ ...session.sportFocus, team })
  }
</script>

<fieldset class="focus">
  <legend>Sport focus</legend>
  <label>
    Sport
    <select value={session.sportFocus.sport} onchange={setSport}>
      {#each SPORTS as sport (sport.value)}
        <option value={sport.value}>{sport.label}</option>
      {/each}
    </select>
  </label>
  <label>
    Team (optional)
    <input
      value={session.sportFocus.team}
      maxlength={MAX_TEAM_LENGTH}
      placeholder="For example: India"
      autocomplete="off"
      onchange={setTeam}
    />
  </label>
  {#if session.sportFocus.sport !== 'cricket'}
    <p class="hint">The Analyst gives text answers for this sport.</p>
  {/if}
</fieldset>

<style>
  .focus {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: end;
    margin: 0;
    padding: 0.5rem 1rem;
    border: 0;
    border-bottom: 1px solid GrayText;
  }

  legend {
    float: left;
    font-weight: bold;
    margin-right: 0.5rem;
  }

  label {
    display: flex;
    flex-direction: column;
  }

  select,
  input {
    font: inherit;
  }

  .hint {
    margin: 0;
    color: GrayText;
  }
</style>
