import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { type ChatMessage, streamReply } from './chat-stream'

const encoder = new TextEncoder()

/** A streamed response that sends the given text chunks, like a real SSE body. */
function sseResponse(chunks: string[], signal?: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      if (signal) {
        // Like a real fetch: aborting errors the body stream. Keep it open until then.
        signal.addEventListener('abort', () =>
          controller.error(new DOMException('The user aborted a request.', 'AbortError')),
        )
      } else {
        controller.close()
      }
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

function mockFetch(respond: (init: RequestInit) => Response | Promise<Response>) {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => respond(init))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const question: ChatMessage[] = [{ role: 'visitor', text: 'Who bowls at the death?' }]

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

test('streams the text pieces in order and finishes with done', async () => {
  const fetch = mockFetch(() =>
    sseResponse([
      'event: text\ndata: {"text": "Bum',
      'rah "}\n\nevent: text\ndata: {"text": "bowls."}\n\n: ping\n\n',
      'event: done\ndata: {}\n\n',
    ]),
  )
  const pieces: string[] = []

  const result = await streamReply(question, { onText: (text) => pieces.push(text) })

  expect(result).toEqual({ status: 'done' })
  expect(pieces).toEqual(['Bumrah ', 'bowls.'])
  const [url, init] = fetch.mock.calls[0]
  expect(url).toBe('/api/chat')
  expect(init.method).toBe('POST')
  expect(JSON.parse(String(init.body))).toEqual({ messages: question })
})

test('sends only the last 20 Messages and skips empty ones', async () => {
  const fetch = mockFetch(() => sseResponse(['event: done\ndata: {}\n\n']))
  const messages: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
    role: i % 2 === 0 ? 'visitor' : 'analyst',
    text: `Message ${i + 1}`,
  }))
  messages.splice(22, 0, { role: 'analyst', text: '' }) // a reply stopped before its first word

  await streamReply(messages, { onText: () => {} })

  const sent = JSON.parse(String(fetch.mock.calls[0][1].body)).messages
  expect(sent).toHaveLength(20)
  expect(sent[0].text).toBe('Message 6')
  expect(sent.at(-1).text).toBe('Message 25')
})

test('an error event fails the reply with its message and retry flag', async () => {
  mockFetch(() =>
    sseResponse([
      'event: text\ndata: {"text": "Half "}\n\n',
      'event: error\ndata: {"code": "model_unavailable", "message": "The Analyst could not answer just now. Please try again.", "retryable": true}\n\n',
    ]),
  )

  const result = await streamReply(question, { onText: () => {} })

  expect(result).toEqual({
    status: 'failed',
    message: 'The Analyst could not answer just now. Please try again.',
    retryable: true,
  })
})

test('HTTP 429 means rate limited until one hour after the first 429', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 21, 14, 40))
  mockFetch(() => new Response('Too Many Requests', { status: 429 }))

  const first = await streamReply(question, { onText: () => {} })
  vi.setSystemTime(new Date(2026, 10, 21, 15, 0))
  const second = await streamReply(question, { onText: () => {} })

  expect(first).toEqual({ status: 'rate-limited', retryAt: new Date(2026, 10, 21, 15, 40) })
  expect(second).toEqual(first)
})

test('a network failure is a retryable failure', async () => {
  mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))

  const result = await streamReply(question, { onText: () => {} })

  expect(result).toEqual({
    status: 'failed',
    message: 'Could not reach the Analyst. Check your connection and try again.',
    retryable: true,
  })
})

test('a stream that ends without done is a retryable failure', async () => {
  mockFetch(() => sseResponse(['event: text\ndata: {"text": "Half "}\n\n']))

  const result = await streamReply(question, { onText: () => {} })

  expect(result).toEqual({
    status: 'failed',
    message: 'The connection dropped before the reply was complete. Please try again.',
    retryable: true,
  })
})

test('aborting the request stops the reply after the text so far', async () => {
  const stop = new AbortController()
  mockFetch((init) =>
    sseResponse(['event: text\ndata: {"text": "Use a deep point "}\n\n'], init.signal ?? undefined),
  )
  const pieces: string[] = []

  const result = await streamReply(question, {
    onText: (text) => {
      pieces.push(text)
      stop.abort()
    },
    signal: stop.signal,
  })

  expect(result).toEqual({ status: 'stopped' })
  expect(pieces).toEqual(['Use a deep point '])
})
