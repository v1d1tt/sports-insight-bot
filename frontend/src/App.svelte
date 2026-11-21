<script lang="ts">
  import AnalystStatus from './lib/AnalystStatus.svelte'
  import ChatList from './lib/ChatList.svelte'
  import ChatView from './lib/ChatView.svelte'
  import { ChatSession } from './lib/chat-session.svelte'

  const session = new ChatSession()
  session.load()
</script>

<div class="app">
  <header>
    <h1>Sports Insight Bot</h1>
    <AnalystStatus />
  </header>
  <ChatList {session} />
  <ChatView {session} />
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
  }

  .app {
    display: grid;
    grid-template-columns: 16rem 1fr;
    grid-template-rows: auto 1fr;
    height: 100dvh;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
    align-items: baseline;
    padding: 0 1rem;
    border-bottom: 1px solid GrayText;
  }

  h1 {
    font-size: 1.25rem;
  }

  @media (max-width: 40rem) {
    .app {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto 1fr;
    }
  }
</style>
