<script lang="ts">
  import IconAlertTriangle from '@tabler/icons-svelte-runes/icons/alert-triangle'
  import IconRefresh from '@tabler/icons-svelte-runes/icons/refresh'
  import { tick } from 'svelte'
  import { fly } from 'svelte/transition'
  import type { ChatSession } from './chat-session.svelte'
  import Composer from './Composer.svelte'
  import type { MessageImage } from './image-prep'
  import { renderMarkdown } from './markdown'
  import { duration } from './motion'
  import SportFocusPicker from './SportFocusPicker.svelte'

  let { session, inert = false }: { session: ChatSession; inert?: boolean } = $props()

  let text = $state('')
  let log = $state<HTMLDivElement>()

  // Starting points for an empty Chat; a click puts one in the Message box to edit.
  const SUGGESTIONS = [
    'Set a field for a leg-spinner on a turning pitch',
    'Who should bowl the 19th over when defending 12?',
    'How do you build an innings on a slow pitch?',
  ]

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

  async function suggest(suggestion: string) {
    text = suggestion
    await tick()
    document.getElementById('message')?.focus()
  }

  const dataUrl = (image: MessageImage) => `data:${image.mediaType};base64,${image.data}`

  const clockTime = (date: Date | number) =>
    new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
</script>

<main class="chat" {inert} {ondragover} {ondrop}>
  <SportFocusPicker {session} />

  <div class="log" role="log" aria-label="Messages" bind:this={log}>
    {#if session.storeFailed}
      <p class="problem" role="alert">
        This browser does not let the page save Chats, so the chat cannot start.
      </p>
    {:else if session.messages.length === 0 && session.reply.status === 'idle'}
      <div class="opening">
        <p class="lead">Ask about a match, a field or a player.</p>
        <p class="hint">
          Cricket comes first; other sports work too. Attach a screenshot and the Analyst reads it.
        </p>
        <ul class="suggestions" aria-label="Example questions">
          {#each SUGGESTIONS as suggestion (suggestion)}
            <li>
              <button type="button" onclick={() => suggest(suggestion)}>{suggestion}</button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#each session.messages as message (message.id)}
      <article class={['entry', message.role]} in:fly={{ y: 8, duration: duration(240) }}>
        <p class="who">
          <span class="label">{message.role === 'visitor' ? 'You' : 'Analyst'}</span>
          <time datetime={new Date(message.createdAt).toISOString()}>
            {clockTime(message.createdAt)}
          </time>
        </p>
        <div class="body">
          {#if message.role === 'analyst'}
            <!-- renderMarkdown() sanitises the HTML (markdown-it + DOMPurify) -->
            <div class="markdown">{@html renderMarkdown(message.text)}</div>
          {:else}
            {#if message.images?.length}
              <div class="images">
                <!-- A sent Message's images never change, so the index is a stable key. -->
                {#each message.images as image, i (i)}
                  <img
                    src={dataUrl(image)}
                    alt="Image {i + 1} of {message.images.length} you sent"
                  />
                {/each}
              </div>
            {/if}
            {#if message.text}
              <p class="plain">{message.text}</p>
            {/if}
          {/if}
        </div>
      </article>
    {/each}

    {#if session.reply.status === 'thinking'}
      <div class="entry analyst thinking" in:fly={{ y: 8, duration: duration(240) }}>
        <p class="who"><span class="label">Analyst</span></p>
        <!-- While the Analyst thinks, dot balls are pencilled into an over. -->
        <p class="body">
          <span class="over" aria-hidden="true">
            {#each [0, 1, 2, 3, 4, 5] as ball (ball)}
              <span class="ball" style:--ball={ball}></span>
            {/each}
          </span>
          Analyst is thinking…
        </p>
      </div>
    {/if}

    {#if session.draft}
      <article class="entry analyst" aria-busy={session.busy}>
        <p class="who"><span class="label">Analyst</span></p>
        <div class="body">
          <div class={['markdown', session.busy && 'writing']}>
            {@html renderMarkdown(session.draft)}
          </div>
        </div>
      </article>
    {/if}
  </div>

  {#if session.reply.status === 'failed'}
    <div class="notice wicket" role="alert" in:fly={{ y: 6, duration: duration(200) }}>
      <IconAlertTriangle size={20} stroke={1.75} aria-hidden="true" />
      <p>{session.reply.message}</p>
      {#if session.reply.retryable}
        <button type="button" class="btn" onclick={() => session.retry()}>
          <IconRefresh size={18} stroke={1.75} aria-hidden="true" />
          Retry
        </button>
      {/if}
    </div>
  {:else if session.reply.status === 'rate-limited'}
    <div class="notice" role="alert" in:fly={{ y: 6, duration: duration(200) }}>
      <IconAlertTriangle size={20} stroke={1.75} aria-hidden="true" />
      <p>
        Limit reached: you can send 20 Messages in 10 minutes.
        Please try again after {clockTime(session.reply.retryAt)}.
      </p>
    </div>
  {/if}

  <Composer {session} bind:text />
</main>

<style>
  .chat {
    grid-area: chat;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    animation: rise var(--dur-slow) var(--ease-out) 120ms both;
  }

  /* The ruled scorebook page. The ruling scrolls with the writing. */
  .log {
    flex: 1;
    overflow-y: auto;
    padding: var(--line) 1rem calc(2 * var(--line));
    background-image: linear-gradient(
      to bottom,
      transparent calc(var(--line) - 1px),
      var(--rule) calc(var(--line) - 1px)
    );
    background-size: 100% var(--line);
    background-attachment: local;
  }

  /* On wider screens a printed margin rule splits the name column from the writing. */
  @media (min-width: 40rem) {
    .log {
      background-image:
        linear-gradient(
          to right,
          transparent calc(1rem + var(--margin) - 4px),
          var(--rule-strong) calc(1rem + var(--margin) - 4px),
          var(--rule-strong) calc(1rem + var(--margin) - 3px),
          transparent calc(1rem + var(--margin) - 3px),
          transparent calc(1rem + var(--margin) - 1px),
          var(--rule-strong) calc(1rem + var(--margin) - 1px),
          var(--rule-strong) calc(1rem + var(--margin)),
          transparent calc(1rem + var(--margin))
        ),
        linear-gradient(
          to bottom,
          transparent calc(var(--line) - 1px),
          var(--rule) calc(var(--line) - 1px)
        );
      background-size:
        100% 100%,
        100% var(--line);
    }
  }

  .entry {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    margin-bottom: var(--line);
  }

  @media (min-width: 40rem) {
    .entry {
      grid-template-columns: var(--margin) minmax(0, 46rem);
    }
  }

  .who {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    margin: 0;
    line-height: var(--line);
  }

  @media (min-width: 40rem) {
    .who {
      flex-direction: column;
      gap: 0;
      padding-right: 0.75rem;
    }

    /* Zero height, so every entry stays a whole number of ruled lines. */
    .who time {
      height: 0;
      margin-top: -0.375rem;
    }
  }

  .who time {
    font-size: 0.6875rem;
    line-height: 1.2;
    color: var(--pencil-soft);
  }

  .visitor .who .label {
    color: var(--ink);
  }

  .body {
    min-width: 0;
    margin: 0;
  }

  @media (min-width: 40rem) {
    .body {
      padding-left: 1rem;
    }
  }

  /* The Visitor writes in ballpoint blue, the Analyst in pencil. */
  .visitor .plain {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--ink);
    font-weight: 500;
  }

  .images {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.25rem 0 0.5rem;
  }

  .images img {
    max-width: min(14rem, 100%);
    max-height: 12rem;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--paper-raised);
  }

  .markdown {
    overflow-wrap: anywhere;
  }

  .markdown :global {
    & > :first-child {
      margin-top: 0;
    }

    & > :last-child {
      margin-bottom: 0;
    }

    p,
    ul,
    ol,
    table,
    pre,
    blockquote {
      margin: 0 0 var(--line);
    }

    ul,
    ol {
      padding-left: 1.25rem;
    }

    h1,
    h2,
    h3,
    h4 {
      margin: var(--line) 0 0;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1.25rem;
      line-height: var(--line);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    strong {
      font-weight: 700;
      color: var(--pencil);
    }

    code {
      font-size: 0.875em;
      padding: 0.0625rem 0.25rem;
      background: var(--ink-wash);
      border-radius: 2px;
    }

    pre {
      overflow-x: auto;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--rule-strong);
      background: var(--paper-raised);
    }

    pre code {
      padding: 0;
      background: none;
    }

    blockquote {
      padding-left: 0.75rem;
      border-left: 1px solid var(--rule-strong);
      color: var(--pencil-soft);
    }

    /* Tables look like a scorecard; wide ones scroll sideways instead of widening the page. */
    table {
      display: block;
      max-width: 100%;
      overflow-x: auto;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }

    /* Cells keep whole words; a table too wide for the screen scrolls instead. */
    th,
    td {
      overflow-wrap: normal;
      background: var(--paper-raised);
      padding: 0.25rem 0.75rem;
      border: 1px solid var(--rule-strong);
      text-align: left;
      line-height: 1.5;
    }

    th {
      font-family: var(--font-display);
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--print);
    }
  }

  /* While the reply streams, a pencil tip follows the last word. */
  .writing > :global(:last-child::after) {
    content: '';
    display: inline-block;
    width: 2px;
    height: 1.05em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: var(--pencil);
    animation: blink 0.9s steps(1) infinite;
  }

  .thinking .body {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--pencil-soft);
    font-style: italic;
  }

  .over {
    display: inline-flex;
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }

  .ball {
    position: relative;
    width: 1.125rem;
    height: 1.125rem;
  }

  .ball + .ball {
    border-left: 1px solid var(--rule);
  }

  .ball::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 4px;
    height: 4px;
    margin: -2px 0 0 -2px;
    border-radius: 50%;
    background: var(--pencil);
    animation: dot 2.4s steps(1) calc(var(--ball) * 0.3s) infinite both;
  }

  .opening {
    max-width: 40rem;
  }

  @media (min-width: 40rem) {
    .opening {
      margin-left: calc(var(--margin) + 1rem);
    }
  }

  /* Two ruled lines per line of the title; paper behind it so no rule crosses the letters. */
  .lead {
    width: fit-content;
    margin: 0;
    padding-right: 0.25rem;
    background: var(--paper);
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(2.5rem, 6vw, 3rem);
    line-height: calc(2 * var(--line));
    letter-spacing: 0.01em;
    text-transform: uppercase;
    text-wrap: balance;
    color: var(--pencil);
  }

  .hint {
    margin: 0 0 var(--line);
    color: var(--pencil-soft);
  }

  .suggestions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .suggestions button {
    padding: 0.375rem 0.75rem;
    border: 1px dashed var(--rule-strong);
    border-radius: 2px;
    background: var(--paper-raised);
    color: var(--ink);
    text-align: start;
    line-height: 1.4;
    transition:
      border-color var(--dur-fast) ease,
      background-color var(--dur-fast) ease,
      transform var(--dur-fast) var(--ease-out);
  }

  .suggestions button:hover {
    border-style: solid;
    border-color: var(--ink);
    background: var(--ink-wash);
  }

  .suggestions button:active {
    transform: translateY(1px);
  }

  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.625rem 1rem;
    border-top: 1px solid var(--rule-strong);
    background: var(--ink-wash);
    color: var(--ink-strong);
  }

  .notice p {
    flex: 1 1 14rem;
    margin: 0;
    line-height: 1.45;
  }

  .notice.wicket {
    background: var(--red-wash);
    color: var(--red);
  }

  .problem {
    color: var(--red);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @keyframes dot {
    0% {
      opacity: 0;
    }
    8% {
      opacity: 1;
    }
    85% {
      opacity: 0;
    }
  }
</style>
