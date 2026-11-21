<script lang="ts">
  import type { Chat } from './chat-store'
  import type { ChatSession } from './chat-session.svelte'

  let { session }: { session: ChatSession } = $props()

  // At phone width the list is hidden until the Visitor opens it.
  let open = $state(false)
  let renamingId = $state<string | null>(null)
  let newTitle = $state('')

  function startRename(chat: Chat) {
    renamingId = chat.id
    newTitle = chat.title
  }

  async function saveRename(event: SubmitEvent) {
    event.preventDefault()
    if (renamingId) await session.rename(renamingId, newTitle)
    renamingId = null
  }

  async function remove(chat: Chat) {
    if (confirm(`Delete the Chat "${chat.title}"? This cannot be undone.`)) {
      await session.remove(chat.id)
    }
  }

  function focus(input: HTMLInputElement) {
    input.focus()
    input.select()
  }
</script>

<nav class={['chats', open && 'open']} aria-label="Chats">
  <div class="actions">
    <button
      type="button"
      class="toggle"
      aria-expanded={open}
      aria-controls="chat-list"
      onclick={() => (open = !open)}
    >
      Chats ({session.chats.length})
    </button>
    <button
      type="button"
      onclick={() => {
        session.newChat()
        open = false
      }}
    >
      New Chat
    </button>
  </div>

  <ul id="chat-list">
    {#each session.chats as chat (chat.id)}
      <li>
        {#if renamingId === chat.id}
          <form onsubmit={saveRename}>
            <label>
              New title
              <input
                bind:value={newTitle}
                maxlength="80"
                required
                onkeydown={(event) => {
                  if (event.key === 'Escape') renamingId = null
                }}
                {@attach focus}
              />
            </label>
            <button type="submit">Save</button>
            <button type="button" onclick={() => (renamingId = null)}>Cancel</button>
          </form>
        {:else}
          <button
            type="button"
            class="title"
            aria-current={chat.id === session.currentChatId ? 'page' : undefined}
            onclick={() => {
              session.openChat(chat.id)
              open = false
            }}
          >
            {chat.title}
          </button>
          <span class="chat-actions">
            <button type="button" aria-label={`Rename ${chat.title}`} onclick={() => startRename(chat)}>
              Rename
            </button>
            <button type="button" aria-label={`Delete ${chat.title}`} onclick={() => remove(chat)}>
              Delete
            </button>
          </span>
        {/if}
      </li>
    {:else}
      <li class="empty">No Chats yet.</li>
    {/each}
  </ul>
</nav>

<style>
  .chats {
    border-right: 1px solid GrayText;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .toggle {
    display: none;
  }

  ul {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
  }

  li {
    padding: 0.25rem 0;
  }

  .title {
    display: block;
    width: 100%;
    text-align: start;
    overflow-wrap: anywhere;
  }

  .title[aria-current='page'] {
    font-weight: bold;
  }

  .chat-actions {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .empty {
    color: GrayText;
  }

  @media (max-width: 40rem) {
    .chats {
      border-right: none;
      border-bottom: 1px solid GrayText;
    }

    .toggle {
      display: inline-block;
    }

    .chats:not(.open) ul {
      display: none;
    }
  }
</style>
