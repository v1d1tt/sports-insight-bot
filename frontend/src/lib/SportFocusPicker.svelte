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

<!-- The match details at the top of a scorebook page. -->
<fieldset class="focus">
  <legend class="sr-only">Sport focus</legend>
  <label>
    <span class="label">Sport</span>
    <select value={session.sportFocus.sport} onchange={setSport}>
      {#each SPORTS as sport (sport.value)}
        <option value={sport.value}>{sport.label}</option>
      {/each}
    </select>
  </label>
  <label class="team">
    <span class="label">Team (optional)</span>
    <input
      value={session.sportFocus.team}
      maxlength={MAX_TEAM_LENGTH}
      placeholder="India"
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
    align-items: end;
    gap: 0.25rem 1.5rem;
    margin: 0;
    padding: 0.5rem 1rem 0.625rem;
    border: 0;
    border-bottom: 1px solid var(--rule-strong);
    background: var(--paper);
  }

  label {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .team {
    flex: 1 1 10rem;
    max-width: 22rem;
  }

  /* Form fields as written lines: no box, a printed rule underneath. */
  select,
  input {
    min-height: 2.25rem;
    padding: 0 0.25rem;
    border: 0;
    border-bottom: 1px solid var(--rule-strong);
    border-radius: 0;
    background: transparent;
    color: var(--ink);
    font-weight: 600;
    transition: border-color var(--dur-fast) ease;
  }

  input {
    flex: 1;
    min-width: 0;
  }

  select:hover,
  input:hover,
  select:focus-visible,
  input:focus-visible {
    border-bottom-color: var(--ink);
  }

  select:focus-visible,
  input:focus-visible {
    outline-offset: 0;
  }

  select option {
    background: var(--paper-raised);
    color: var(--pencil);
  }

  input::placeholder {
    color: var(--pencil-soft);
    font-weight: 400;
    font-style: italic;
  }

  .hint {
    flex-basis: 100%;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--print);
  }
</style>
