import { EventSourceParserStream } from 'eventsource-parser/stream'
import type { FieldPlacement } from './field-placement'
import type { MessageImage } from './image-prep'
import { DEFAULT_SPORT_FOCUS, type SportFocus } from './sport-focus'

/** One Message of the Chat's history. */
export type ChatMessage = { role: 'visitor' | 'analyst'; text: string; images?: MessageImage[] }

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
  /** Called with a Field placement the server has checked, for the Board. */
  onFieldPlacement?: (field: FieldPlacement) => void
  /** Abort it to stop the reply (the Stop button). */
  signal?: AbortSignal
  /** The Chat's Sport focus; cricket when not given. */
  sportFocus?: SportFocus
  /** The Board as it now stands, sent with "Ask the Analyst about this field". */
  board?: { field: FieldPlacement }
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
const TOO_LARGE: StreamResult = {
  status: 'failed',
  message: 'This Message is too large to send. Remove an image and try again.',
  retryable: false,
}
const DROPPED: StreamResult = {
  status: 'failed',
  message: 'The connection dropped before the reply was complete. Please try again.',
  retryable: true,
}

/** Send the recent Messages to the Analyst and stream its reply. */
export async function streamReply(
  messages: ChatMessage[],
  { onText, onFieldPlacement, signal, sportFocus = DEFAULT_SPORT_FOCUS, board }: StreamOptions,
): Promise<StreamResult> {
  const body = {
    messages: requestMessages(messages),
    sport_focus: { sport: sportFocus.sport, team: sportFocus.team },
    ...(board ? { board } : {}),
  }

  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    return signal?.aborted ? { status: 'stopped' } : NETWORK_FAILURE
  }
  if (response.status === 429) return { status: 'rate-limited', retryAt: rateLimitEnd() }
  // Vercel (or our server) refused a body over 4.5 MB before any reply began.
  if (response.status === 413) return TOO_LARGE
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
      else if (event.event === 'field_placement') onFieldPlacement?.(data.field)
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

/**
 * The last 20 non-empty Messages, in the API's shape. Only the newest Message
 * with images keeps them: follow-up questions still see the picture, and the
 * body holds at most 4 images, which keeps it under 4.5 MB.
 */
function requestMessages(messages: ChatMessage[]) {
  const recent = messages
    .filter((message) => message.text.length > 0 || message.images?.length)
    .slice(-MAX_HISTORY)
  const withImages = recent.findLastIndex((message) => message.images?.length)
  return recent.map(({ role, text, images }, index) =>
    index === withImages && images
      ? { role, text, images: images.map((image) => ({ media_type: image.mediaType, data: image.data })) }
      : { role, text },
  )
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
