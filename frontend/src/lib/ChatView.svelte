<script lang="ts">
  import { tick } from 'svelte'
  import type { ChatSession } from './chat-session.svelte'
  import { ACCEPTED_TYPES, MAX_IMAGES, type MessageImage } from './image-prep'
  import { renderMarkdown } from './markdown'
  import SportFocusPicker from './SportFocusPicker.svelte'

  let { session }: { session: ChatSession } = $props()

  let text = $state('')
  let log = $state<HTMLDivElement>()
  let fileInput = $state<HTMLInputElement>()

  let canSend = $derived(
    (text.trim().length > 0 || session.attachments.length > 0) &&
      !session.preparing &&
      !session.storeFailed,
  )

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
    if (!canSend || session.busy) return
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

  function pickFiles(event: Event & { currentTarget: HTMLInputElement }) {
    session.attach([...(event.currentTarget.files ?? [])])
    event.currentTarget.value = '' // so the same file can be picked again
  }

  // A pasted screenshot arrives as a file; pasted text has none and pastes as usual.
  function onpaste(event: ClipboardEvent) {
    const files = [...(event.clipboardData?.files ?? [])]
    if (files.length === 0) return
    event.preventDefault()
    session.attach(files)
  }

  // The whole chat area takes dropped files.
  function ondragover(event: DragEvent) {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
  }

  function ondrop(event: DragEvent) {
    const files = [...(event.dataTransfer?.files ?? [])]
    if (files.length === 0) return
    event.preventDefault()
    session.attach(files)
  }

  const dataUrl = (image: MessageImage) => `data:${image.mediaType};base64,${image.data}`

  const clockTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
</script>

<main class="chat" {ondragover} {ondrop}>
  <SportFocusPicker {session} />

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
          {#if message.images?.length}
            <div class="images">
              <!-- A sent Message's images never change, so the index is a stable key. -->
              {#each message.images as image, i (i)}
                <img src={dataUrl(image)} alt="Image {i + 1} of {message.images.length} you sent" />
              {/each}
            </div>
          {/if}
          {#if message.text}
            <p class="plain">{message.text}</p>
          {/if}
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
    {#if session.attachments.length > 0}
      <ul class="attachments" aria-label="Attached images">
        {#each session.attachments as attachment, i (attachment.id)}
          <li>
            <img src={dataUrl(attachment.image)} alt="Attached image {i + 1}" />
            <button type="button" onclick={() => session.removeAttachment(attachment.id)}>
              Remove image {i + 1}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <textarea
      id="message"
      bind:value={text}
      maxlength="2000"
      rows="2"
      placeholder="Ask the Analyst… You can also paste or drop images."
      {onkeydown}
      {onpaste}
    ></textarea>
    {#if session.busy}
      <button type="button" onclick={() => session.stop()}>Stop</button>
    {:else}
      <button type="submit" disabled={!canSend}>Send</button>
    {/if}
    <div class="attach">
      <button
        type="button"
        aria-describedby="image-note"
        disabled={session.attachments.length >= MAX_IMAGES || session.preparing}
        onclick={() => fileInput?.click()}
      >
        Attach images
      </button>
      <input
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        hidden
        bind:this={fileInput}
        onchange={pickFiles}
      />
      <p id="image-note" class="note">
        Up to {MAX_IMAGES} images. Images go to the model provider to be read, so do not upload
        personal photos.
      </p>
    </div>
    <p class="status" aria-live="polite">{session.preparing ? 'Preparing images…' : ''}</p>
    {#if session.attachError}
      <p class="attach-error" role="alert">{session.attachError}</p>
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

  .images,
  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .images {
    margin-bottom: 0.25rem;
  }

  .images img {
    max-width: min(12rem, 100%);
    max-height: 12rem;
  }

  .attachments {
    grid-column: 1 / -1;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .attachments li {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .attachments img {
    width: 5rem;
    height: 5rem;
    object-fit: cover;
  }

  .attach,
  .status,
  .attach-error {
    grid-column: 1 / -1;
  }

  .attach {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: center;
  }

  .note,
  .status {
    margin: 0;
    color: GrayText;
  }

  .status:empty {
    display: none;
  }

  .attach-error {
    margin: 0;
  }
</style>
