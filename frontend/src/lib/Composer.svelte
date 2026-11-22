<script lang="ts">
  import IconAperture from '@tabler/icons-svelte-runes/icons/aperture'
  import IconArrowUp from '@tabler/icons-svelte-runes/icons/arrow-up'
  import IconMicrophone from '@tabler/icons-svelte-runes/icons/microphone'
  import IconPhoto from '@tabler/icons-svelte-runes/icons/photo'
  import IconPlayerStop from '@tabler/icons-svelte-runes/icons/player-stop'
  import IconX from '@tabler/icons-svelte-runes/icons/x'
  import { scale } from 'svelte/transition'
  import type { ChatSession } from './chat-session.svelte'
  import { ACCEPTED_TYPES, MAX_IMAGES, type MessageImage } from './image-prep'
  import { duration } from './motion'
  import RollingNumber from './RollingNumber.svelte'
  import { VoiceInput } from './voice-input.svelte'

  let {
    session,
    text = $bindable(''),
  }: { session: ChatSession; text?: string } = $props()

  let fileInput = $state<HTMLInputElement>()
  const voice = new VoiceInput()

  let canSend = $derived(
    (text.trim().length > 0 || session.attachments.length > 0) &&
      !session.preparing &&
      !session.storeFailed,
  )

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!canSend || session.busy) return
    voice.cancel() // late words must not refill the box after the send
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

  // The transcript is added after what the Visitor already typed, for editing.
  function toggleVoice() {
    if (voice.listening) {
      voice.stop()
      return
    }
    const before = text.trim() ? `${text.trimEnd()} ` : ''
    voice.start((transcript) => {
      text = (before + transcript.trimStart()).slice(0, 2000)
    })
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

  const dataUrl = (image: MessageImage) => `data:${image.mediaType};base64,${image.data}`
</script>

<form class="composer" onsubmit={submit}>
  <div class={['box', voice.listening && 'listening']}>
    {#if session.attachments.length > 0}
      <ul class="attachments" aria-label="Attached images">
        {#each session.attachments as attachment, i (attachment.id)}
          <li transition:scale={{ start: 0.85, duration: duration(180) }}>
            <img src={dataUrl(attachment.image)} alt="Attached image {i + 1}" />
            <button
              type="button"
              class="remove"
              aria-label="Remove image {i + 1}"
              onclick={() => session.removeAttachment(attachment.id)}
            >
              <IconX size={14} stroke={2.25} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <label for="message" class="sr-only">Message</label>
    <textarea
      id="message"
      bind:value={text}
      maxlength="2000"
      rows="2"
      placeholder="Ask the Analyst. You can also paste or drop images."
      {onkeydown}
      {onpaste}
    ></textarea>

    <div class="tools">
      <button
        type="button"
        class="tool"
        aria-label="Attach images"
        data-tip="Attach images"
        aria-describedby="image-note"
        disabled={session.attachments.length >= MAX_IMAGES || session.preparing}
        onclick={() => fileInput?.click()}
      >
        <IconPhoto size={20} stroke={1.75} aria-hidden="true" />
      </button>
      <input
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        hidden
        bind:this={fileInput}
        onchange={pickFiles}
      />
      {#if session.sportFocus.sport === 'cricket'}
        <!-- The Wagon wheel is cricket's: it records where a batter's Shots went. -->
        <button
          type="button"
          class="tool"
          aria-label="Add a Wagon wheel"
          data-tip="Add a Wagon wheel: tap where each Shot went"
          disabled={session.busy || session.storeFailed}
          onclick={() => session.startWagonWheel()}
        >
          <IconAperture size={20} stroke={1.75} aria-hidden="true" />
        </button>
      {/if}
      {#if voice.supported}
        <button
          type="button"
          class={['tool', 'mic', voice.listening && 'on']}
          aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
          data-tip={voice.listening ? 'Stop voice input' : 'Speak your question'}
          aria-pressed={voice.listening}
          onclick={toggleVoice}
        >
          <IconMicrophone size={20} stroke={1.75} aria-hidden="true" />
        </button>
      {/if}
      {#if session.attachments.length > 0}
        <span class="count" aria-hidden="true">
          <RollingNumber value={session.attachments.length} />/{MAX_IMAGES}
        </span>
      {/if}

      {#if session.busy}
        <button type="button" class="btn send stop" onclick={() => session.stop()}>
          <IconPlayerStop size={18} stroke={2} aria-hidden="true" />
          Stop
        </button>
      {:else}
        <button type="submit" class="btn btn-ink send" disabled={!canSend}>
          Send
          <IconArrowUp size={18} stroke={2.25} aria-hidden="true" />
        </button>
      {/if}
    </div>
  </div>

  <p id="image-note" class="note">
    Up to {MAX_IMAGES} images. Images go to the model provider to be read, so do not upload personal
    photos.
  </p>
  <p class="status" aria-live="polite">
    {session.preparing ? 'Preparing images…' : voice.listening ? 'Listening… speak now.' : ''}
  </p>
  {#if session.attachError}
    <p class="problem" role="alert">{session.attachError}</p>
  {/if}
  {#if voice.error}
    <p class="problem" role="alert">{voice.error}</p>
  {/if}
</form>

<style>
  .composer {
    padding: 0.75rem 1rem max(0.75rem, env(safe-area-inset-bottom));
    border-top: 1px solid var(--rule-strong);
    background: var(--paper);
  }

  /* The scorecard box the Visitor writes in. */
  .box {
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--paper-raised);
    transition:
      border-color var(--dur-fast) ease,
      box-shadow var(--dur-base) var(--ease-out);
  }

  .box:focus-within {
    border-color: var(--ink);
    box-shadow: 0 2px 10px -4px color-mix(in srgb, var(--ink) 35%, transparent);
  }

  .box.listening {
    border-color: var(--red);
  }

  textarea {
    display: block;
    width: 100%;
    min-height: calc(2 * var(--line) + 1rem);
    max-height: 12rem;
    field-sizing: content;
    padding: 0.5rem 0.75rem;
    border: 0;
    background: transparent;
    resize: none;
    line-height: var(--line);
    color: var(--ink);
  }

  textarea:focus-visible {
    outline: none; /* the box shows focus */
  }

  textarea::placeholder {
    color: var(--pencil-soft);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.375rem 0.375rem;
  }

  .tool {
    display: inline-grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 0;
    border-radius: 2px;
    background: none;
    color: var(--print);
    transition:
      color var(--dur-fast) ease,
      background-color var(--dur-fast) ease;
  }

  .tool:hover:not(:disabled) {
    color: var(--ink);
    background: var(--ink-wash);
  }

  .tool:disabled {
    opacity: 0.4;
  }

  /* While listening, the mic is red and a ring pulses out from it. */
  .mic {
    position: relative;
  }

  .mic.on {
    color: var(--red);
    background: var(--red-wash);
  }

  .mic.on::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 2px solid var(--red);
    border-radius: 50%;
    animation: pulse 1.2s var(--ease-out) infinite;
  }

  .count {
    margin-left: 0.25rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1rem;
    color: var(--print);
  }

  .send {
    margin-left: auto;
  }

  .stop {
    color: var(--red);
    border-color: var(--red);
  }

  .stop:hover:not(:disabled) {
    border-color: var(--red);
    background: var(--red-wash);
  }

  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0.625rem 0.75rem 0;
    list-style: none;
  }

  .attachments li {
    position: relative;
  }

  .attachments img {
    display: block;
    width: 4.5rem;
    height: 4.5rem;
    object-fit: cover;
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
  }

  .remove {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--rule-strong);
    border-radius: 50%;
    background: var(--paper-raised);
    color: var(--pencil);
    transition:
      color var(--dur-fast) ease,
      border-color var(--dur-fast) ease;
  }

  .remove:hover {
    color: var(--red);
    border-color: var(--red);
  }

  .note,
  .status,
  .problem {
    margin: 0.375rem 0 0;
    font-size: 0.75rem;
    line-height: 1.45;
    color: var(--pencil-soft);
  }

  .status:empty {
    display: none;
  }

  .status {
    color: var(--print);
  }

  .problem {
    font-size: 0.8125rem;
    color: var(--red);
  }

  @keyframes pulse {
    from {
      transform: scale(0.7);
      opacity: 1;
    }
    to {
      transform: scale(1.35);
      opacity: 0;
    }
  }
</style>
