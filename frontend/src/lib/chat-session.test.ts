import 'fake-indexeddb/auto' // an in-memory IndexedDB for Node (jsdom has none)
import { afterEach, expect, test, vi } from 'vitest'
import { boardOf, ChatSession } from './chat-session.svelte'
import { type ChatStore, openChatStore } from './chat-store'
import type { MessageImage } from './image-prep'

const freshStore = () => openChatStore(`test-${crypto.randomUUID()}`)

/** A reply that is only `done`, like the server after an empty answer. */
function mockDoneReply() {
  const fetch = vi.fn(async () => new Response('event: done\ndata: {}\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/** A resize that takes a moment, so two attaches overlap like two quick pastes. */
const slowResize = async (): Promise<MessageImage> => {
  await new Promise((resolve) => setTimeout(resolve, 5))
  return { mediaType: 'image/png', data: 'AAAA' }
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' })

afterEach(() => vi.unstubAllGlobals())

test('the Chat list is loading until the store answers, then ready', async () => {
  const session = new ChatSession(freshStore())
  expect(session.chatList).toBe('loading')
  await session.load()
  expect(session.chatList).toBe('ready')
  expect(session.storeFailed).toBe(false)
})

test('a browser that cannot open the store puts the Chat list in failed', async () => {
  const session = new ChatSession(Promise.reject(new Error('blocked')))
  await session.load()
  expect(session.chatList).toBe('failed')
  expect(session.storeFailed).toBe(true)
})

test('the reply shows thinking at once, so a second send while saving is ignored', async () => {
  const fetch = mockDoneReply()
  const session = new ChatSession(freshStore())
  await session.load()

  const first = session.send('Who bowls the 19th over?')
  expect(session.reply.status).toBe('thinking')
  expect(session.busy).toBe(true)
  await session.send('Who bowls the 19th over?') // a double press of Enter
  await first

  expect(fetch).toHaveBeenCalledTimes(1)
  expect(session.messages.filter((m) => m.role === 'visitor')).toHaveLength(1)
  expect(session.reply.status).toBe('idle')
})

test('a Chat that cannot be saved ends in a failed reply, not a stuck "thinking"', async () => {
  mockDoneReply()
  const store: ChatStore = await freshStore()
  store.addMessage = () => Promise.reject(new Error('QuotaExceededError'))
  const session = new ChatSession(Promise.resolve(store))
  await session.load()

  await session.send('Who bowls the 19th over?')

  expect(session.busy).toBe(false)
  expect(session.reply).toEqual({
    status: 'failed',
    message: 'This browser could not save the Chat, so the Message was not sent.',
    retryable: false,
  })
})

test('two quick attaches still keep the 4-image limit', async () => {
  const session = new ChatSession(freshStore(), slowResize)

  const first = session.attach([png('a.png'), png('b.png'), png('c.png')])
  const second = session.attach([png('d.png'), png('e.png'), png('f.png')])
  expect(session.preparing).toBe(true)
  await first
  expect(session.preparing).toBe(true) // the second batch is still being prepared
  await second

  expect(session.preparing).toBe(false)
  expect(session.attachments).toHaveLength(4)
  expect(session.attachError).toBe('You can attach up to 4 images to one Message.')
})

test('a Visitor question about the Board carries its field or Wagon wheel; other Messages carry none', () => {
  const field = { format: 'T20', phase: 'death', bowler_type: 'pace', batter_hand: 'right', fielders: [] } as never
  const wheel = { batter_hand: 'left', shots: [] } as never
  const base = { id: 1, chatId: 'c', text: 'q', createdAt: 0 } as const
  expect(boardOf({ ...base, role: 'visitor', field })).toEqual({ field })
  expect(boardOf({ ...base, role: 'visitor', wheel })).toEqual({ wheel })
  expect(boardOf({ ...base, role: 'analyst', field })).toBeUndefined()
  expect(boardOf({ ...base, role: 'visitor' })).toBeUndefined()
})
