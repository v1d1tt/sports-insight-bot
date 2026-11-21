<script lang="ts">
  import IconMenu from '@tabler/icons-svelte-runes/icons/menu-2'
  import IconPlus from '@tabler/icons-svelte-runes/icons/plus'
  import { MediaQuery } from 'svelte/reactivity'
  import ChatList from './lib/ChatList.svelte'
  import ChatView from './lib/ChatView.svelte'
  import { ChatSession } from './lib/chat-session.svelte'
  import { draw } from './lib/motion'

  const session = new ChatSession()
  session.load()

  // Below 48rem the Chat list is a drawer over the Chat; above, a rail beside it.
  const phone = new MediaQuery('max-width: 47.99rem')
  let railOpen = $state(!phone.current)
  let drawerOpen = $derived(phone.current && railOpen)

  function closeDrawer() {
    if (phone.current) railOpen = false
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && drawerOpen) railOpen = false
  }}
/>

<div class={['app', railOpen && 'rail-open']}>
  <header inert={drawerOpen}>
    <button
      type="button"
      class="btn btn-icon toggle"
      aria-label="Chats"
      aria-expanded={railOpen}
      aria-controls="chat-rail"
      onclick={() => (railOpen = !railOpen)}
    >
      <IconMenu size={20} stroke={1.75} aria-hidden="true" />
    </button>
    <h1>Sports Insight Bot</h1>
    <button
      type="button"
      class="btn btn-icon new-phone"
      aria-label="New Chat"
      onclick={() => session.newChat()}
    >
      <IconPlus size={20} stroke={1.75} aria-hidden="true" />
    </button>
    <!-- The double rule under the title; it is drawn again when the Sport changes. -->
    {#key session.sportFocus.sport}
      <div class="rule" aria-hidden="true" in:draw></div>
    {/key}
  </header>

  <ChatList {session} open={railOpen} onpick={closeDrawer} />

  {#if drawerOpen}
    <button
      type="button"
      class="scrim"
      aria-label="Close the Chat list"
      tabindex="-1"
      onclick={() => (railOpen = false)}
    ></button>
  {/if}

  <ChatView {session} inert={drawerOpen} />
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'header'
      'chat';
    height: 100dvh;
  }

  @media (min-width: 48rem) {
    .app.rail-open {
      grid-template-columns: 17rem minmax(0, 1fr);
      grid-template-areas:
        'header header'
        'rail chat';
    }
  }

  header {
    grid-area: header;
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem 0.875rem;
    animation: rise var(--dur-slow) var(--ease-out) both;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.625rem;
    line-height: 1;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--pencil);
  }

  .toggle {
    color: var(--pencil);
  }

  .new-phone {
    margin-left: auto;
  }

  @media (min-width: 48rem) {
    .new-phone {
      display: none;
    }
  }

  /* A scorebook's heavy double rule: 2px, a gap, then 1px. */
  .rule {
    position: absolute;
    inset: auto 0 0;
    height: 5px;
    border-top: 2px solid var(--ink);
    border-bottom: 1px solid var(--ink);
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 10;
    border: 0;
    background: color-mix(in srgb, var(--pencil) 35%, transparent);
    animation: fade var(--dur-base) ease both;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
