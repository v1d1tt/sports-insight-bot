<script lang="ts">
  import IconPencil from '@tabler/icons-svelte-runes/icons/pencil'
  import IconPlus from '@tabler/icons-svelte-runes/icons/plus'
  import IconTrash from '@tabler/icons-svelte-runes/icons/trash'
  import type { Chat } from './chat-store'
  import type { ChatSession } from './chat-session.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import { SPORTS } from './sport-focus'
  import { sportFocusOf } from './chat-store'

  let {
    session,
    open,
    onpick,
  }: {
    session: ChatSession
    /** Shown as a rail (desktop) or as an open drawer (phone). */
    open: boolean
    /** Called after the Visitor opens or starts a Chat (closes the phone drawer). */
    onpick: () => void
  } = $props()

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

  const sportLabel = (chat: Chat) => {
    const focus = sportFocusOf(chat)
    const sport = SPORTS.find((s) => s.value === focus.sport)?.label ?? 'Cricket'
    return focus.team ? `${sport} · ${focus.team}` : sport
  }

  const dayAndTime = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
</script>

<nav id="chat-rail" class={['rail', open && 'open']} aria-label="Chats">
  <div class="head">
    <h2 class="label">Chats <RollingNumber value={session.chats.length} /></h2>
    <button
      type="button"
      class="btn"
      onclick={() => {
        session.newChat()
        onpick()
      }}
    >
      <IconPlus size={18} stroke={2} aria-hidden="true" />
      New Chat
    </button>
  </div>

  <ul>
    {#each session.chats as chat (chat.id)}
      <li class={[chat.id === session.currentChatId && 'current']}>
        {#if renamingId === chat.id}
          <form class="rename" onsubmit={saveRename}>
            <label>
              <span class="label">New title</span>
              <input
                bind:value={newTitle}
                maxlength="80"
                required
                onkeydown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation() // keep the phone drawer open
                    renamingId = null
                  }
                }}
                {@attach focus}
              />
            </label>
            <span class="rename-actions">
              <button type="submit" class="btn btn-ink">Save</button>
              <button type="button" class="btn" onclick={() => (renamingId = null)}>Cancel</button>
            </span>
          </form>
        {:else}
          <button
            type="button"
            class="title"
            aria-current={chat.id === session.currentChatId ? 'page' : undefined}
            onclick={() => {
              session.openChat(chat.id)
              onpick()
            }}
          >
            {chat.title}
          </button>
          <span class="meta">{sportLabel(chat)} · {dayAndTime.format(chat.updatedAt)}</span>
          <span class="chat-actions">
            <button
              type="button"
              class="icon"
              aria-label={`Rename ${chat.title}`}
              title="Rename"
              onclick={() => startRename(chat)}
            >
              <IconPencil size={16} stroke={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon danger"
              aria-label={`Delete ${chat.title}`}
              title="Delete"
              onclick={() => remove(chat)}
            >
              <IconTrash size={16} stroke={1.75} aria-hidden="true" />
            </button>
          </span>
        {/if}
      </li>
    {:else}
      <li class="empty">
        {session.chatList === 'loading'
          ? 'Loading Chats…'
          : session.chatList === 'failed'
            ? 'This browser does not let the page save Chats.'
            : 'No Chats yet.'}
      </li>
    {/each}
  </ul>
</nav>

<style>
  .rail {
    grid-area: rail;
    display: none;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid var(--rule-strong);
    background: var(--paper);
    animation: rise var(--dur-slow) var(--ease-out) 60ms both;
  }

  @media (min-width: 48rem) {
    .rail.open {
      display: flex;
    }
  }

  /* Phone: a drawer that slides in over the Chat. */
  @media (max-width: 47.99rem) {
    .rail {
      display: flex;
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 20;
      width: min(20rem, 86vw);
      visibility: hidden;
      transform: translateX(-100%);
      transition:
        transform var(--dur-base) var(--ease-out),
        visibility 0s linear var(--dur-base);
      animation: none;
      box-shadow: 0 0 2rem color-mix(in srgb, var(--pencil) 18%, transparent);
    }

    .rail.open {
      visibility: visible;
      transform: none;
      transition: transform var(--dur-slow) var(--ease-out);
    }
  }

  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.875rem 1rem 0.75rem;
    border-bottom: 1px solid var(--rule-strong);
    background: var(--paper);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    display: flex;
    gap: 0.375rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Each Chat is a row of the innings index, with a printed line under it. */
  li {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.25rem;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-bottom: 1px solid var(--rule);
    transition: background-color var(--dur-fast) ease;
  }

  li:hover {
    background: color-mix(in srgb, var(--ink-wash) 55%, transparent);
  }

  li.current {
    background: var(--ink-wash);
  }

  .title {
    grid-column: 1;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: none;
    text-align: start;
    line-height: 1.35;
    font-weight: 500;
    color: var(--pencil);
    overflow-wrap: anywhere;
  }

  /* The whole row opens the Chat; the action buttons sit above this layer. */
  .title::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .title:focus-visible {
    outline: none;
  }

  li:has(.title:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  .current .title {
    color: var(--ink-strong);
    font-weight: 700;
  }

  .meta {
    grid-column: 1;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--pencil-soft);
  }

  .chat-actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
  }

  .icon {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-radius: 2px;
    background: none;
    color: var(--pencil-soft);
    transition:
      color var(--dur-fast) ease,
      background-color var(--dur-fast) ease;
  }

  .icon:hover {
    color: var(--ink);
    background: var(--paper-raised);
  }

  .icon.danger:hover {
    color: var(--red);
  }

  /* On a mouse, the row actions stay quiet until the row is pointed at. */
  @media (hover: hover) {
    .chat-actions {
      opacity: 0.35;
      transition: opacity var(--dur-fast) ease;
    }

    li:hover .chat-actions,
    li:focus-within .chat-actions {
      opacity: 1;
    }
  }

  .rename {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.5rem;
  }

  .rename label {
    display: grid;
    gap: 0.25rem;
  }

  .rename input {
    min-height: 2.5rem;
    padding: 0 0.5rem;
    border: 1px solid var(--ink);
    border-radius: 2px;
    background: var(--paper-raised);
  }

  .rename-actions {
    display: flex;
    gap: 0.5rem;
  }

  .empty {
    display: block;
    color: var(--pencil-soft);
    font-style: italic;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
