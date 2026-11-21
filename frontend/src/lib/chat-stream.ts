import { EventSourceParserStream } from 'eventsource-parser/stream'

/** One Message as the API takes it. */
export type ChatMessage = { role: 'visitor' | 'analyst'; text: string }

/** Each request carries at most this many recent Messages (the server trims too). */
export const MAX_HISTORY = 20

/** How the reply ended. */
export type StreamResult =
  | { status: 'done' }
  | { status: 'stopped' }
  | { status: 'failed'; message: string; retryable: boolean }
  | { status: 'rate-limited'; retryAt: Date }

export type StreamOptions = {
  /** Called with each new piece of the reply text, in order. */
  onText: (text: string) => void
  /** Abort it to stop the reply (the Stop button). */
  signal?: AbortSignal
}

// The Vercel firewall blocks an IP for 1 hour after it passes the chat limit
// (20 requests in 10 minutes). See "Setup outside the code" in the README.
const RATE_LIMIT_BLOCK_MS = 60 * 60 * 1000
const RATE_LIMIT_KEY = 'sports-insight-bot:rate-limited-until'

const NETWORK_FAILURE: StreamResult = {
  status: 'failed',
  message: 'Could not reach the Analyst. Check your connection and try again.',
  retryable: true,
}
const SERVER_FAILURE: StreamResult = {
  status: 'failed',
  message: 'The Analyst could not answer just now. Please try again.',
  retryable: true,
}
const DROPPED: StreamResult = {
  status: 'failed',
  message: 'The connection dropped before the reply was complete. Please try again.',
  retryable: true,
}

/** Send the recent Messages to the Analyst and stream its reply. */
export async function streamReply(
  messages: ChatMessage[],
  { onText, signal }: StreamOptions,
): Promise<StreamResult> {
  const recent = messages.filter((message) => message.text.length > 0).slice(-MAX_HISTORY)

  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: recent }),
      signal,
    })
  } catch {
    return signal?.aborted ? { status: 'stopped' } : NETWORK_FAILURE
  }
  if (response.status === 429) return { status: 'rate-limited', retryAt: rateLimitEnd() }
  if (!response.ok || !response.body) return SERVER_FAILURE

  // bytes → text → server-sent events ({ event, data })
  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader()
  try {
    for (;;) {
      const { done, value: event } = await reader.read()
      if (done) break
      const data = JSON.parse(event.data)
      if (event.event === 'text') onText(data.text)
      else if (event.event === 'done') return { status: 'done' }
      else if (event.event === 'error') {
        return { status: 'failed', message: data.message, retryable: data.retryable }
      }
      // Other event names are for later features; ignore them.
    }
  } catch {
    // An aborted fetch errors the body stream; anything else is a broken stream.
  }
  return signal?.aborted ? { status: 'stopped' } : DROPPED
}

/** The end of the firewall's block: 1 hour after the first 429, kept across reloads. */
function rateLimitEnd(): Date {
  const now = Date.now()
  const saved = Number(readStorage(RATE_LIMIT_KEY))
  if (saved > now) return new Date(saved)
  const end = now + RATE_LIMIT_BLOCK_MS
  writeStorage(RATE_LIMIT_KEY, String(end))
  return new Date(end)
}

// localStorage can throw (for example when the browser blocks site data).
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Without storage, a reload shows a later time. That is acceptable.
  }
}
