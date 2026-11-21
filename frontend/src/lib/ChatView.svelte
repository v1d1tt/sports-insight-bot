<script lang="ts">
  import { tick } from 'svelte'
  import type { ChatSession } from './chat-session.svelte'
  import { renderMarkdown } from './markdown'

  let { session }: { session: ChatSession } = $props()

  let text = $state('')
  let log = $state<HTMLDivElement>()

  // Keep the newest words in view while the reply streams, unless the
  // Visitor has scrolled up to read something older.
  $effect.pre(() => {
    if (!log) return
    void session.messages.length
    void session.draft
    void session.reply
    if (log.clientHeight + log.scrollTop > log.scrollHeight - 80) {
      tick().then(() => log?.scrollTo(0, log.scrollHeight))
    }
  })

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!text.trim() || session.busy) return
    const message = text
    text = ''
    await session.send(message)
  }

  // Enter sends; Shift+Enter starts a new line.
  function onkeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const clockTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
</script>

<main class="chat">
  <div class="log" role="log" aria-label="Messages" bind:this={log}>
    {#if session.storeFailed}
      <p role="alert">This browser does not let the page save Chats, so the chat cannot start.</p>
    {:else if session.messages.length === 0 && session.reply.status === 'idle'}
      <p class="hint">
        Ask the Analyst about a match, a tactic or a player. Cricket comes first; other sports
        work too.
      </p>
    {/if}

    {#each session.messages as message (message.id)}
      <article class={['message', message.role]}>
        <p class="who">{message.role === 'visitor' ? 'You' : 'Analyst'}</p>
        {#if message.role === 'analyst'}
          <!-- renderMarkdown() sanitises the HTML (markdown-it + DOMPurify) -->
          <div class="markdown">{@html renderMarkdown(message.text)}</div>
        {:else}
          <p class="plain">{message.text}</p>
        {/if}
      </article>
    {/each}

    {#if session.reply.status === 'thinking'}
      <p class="thinking">Analyst is thinking…</p>
    {/if}

    {#if session.draft}
      <article class="message analyst" aria-busy={session.busy}>
        <p class="who">Analyst</p>
        <div class="markdown">{@html renderMarkdown(session.draft)}</div>
      </article>
    {/if}
  </div>

  {#if session.reply.status === 'failed'}
    <div class="notice" role="alert">
      <p>{session.reply.message}</p>
      {#if session.reply.retryable}
        <button type="button" onclick={() => session.retry()}>Retry</button>
      {/if}
    </div>
  {:else if session.reply.status === 'rate-limited'}
    <p class="notice" role="alert">
      Limit reached: you can send 20 Messages in 10 minutes.
      Please try again after {clockTime(session.reply.retryAt)}.
    </p>
  {/if}

  <form class="composer" onsubmit={submit}>
    <label for="message">Message</label>
    <textarea
      id="message"
      bind:value={text}
      maxlength="2000"
      rows="2"
      placeholder="Ask the Analyst…"
      {onkeydown}
    ></textarea>
    {#if session.busy}
      <button type="button" onclick={() => session.stop()}>Stop</button>
    {:else}
      <button type="submit" disabled={!text.trim() || session.storeFailed}>Send</button>
    {/if}
  </form>
</main>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .log {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1rem;
  }

  .hint,
  .thinking {
    color: GrayText;
  }

  .message {
    max-width: 48rem;
    margin-bottom: 1rem;
  }

  .who {
    margin: 0 0 0.25rem;
    font-weight: bold;
  }

  .plain {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* Wide tables scroll sideways instead of widening the page. */
  .markdown :global(table) {
    display: block;
    overflow-x: auto;
    border-collapse: collapse;
  }

  .markdown :global(th),
  .markdown :global(td) {
    border: 1px solid GrayText;
    padding: 0.25rem 0.5rem;
  }

  .notice {
    margin: 0;
    padding: 0.5rem 1rem;
    border-top: 1px solid GrayText;
  }

  .notice p {
    margin: 0 0 0.5rem;
  }

  .composer {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: end;
    padding: 0.75rem 1rem;
    border-top: 1px solid GrayText;
  }

  .composer label {
    grid-column: 1 / -1;
  }

  textarea {
    font: inherit;
    resize: vertical;
  }
</style>
