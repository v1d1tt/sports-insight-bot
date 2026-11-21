import 'fake-indexeddb/auto' // an in-memory IndexedDB for Node (jsdom has none)
import { beforeEach, expect, test } from 'vitest'
import { type ChatStore, openChatStore } from './chat-store'

let name: string
let store: ChatStore

beforeEach(async () => {
  name = `test-${crypto.randomUUID()}` // a fresh database for each test
  store = await openChatStore(name)
})

test('a new Chat takes its title from its first Visitor Message', async () => {
  const chat = await store.createChat()
  await store.addMessage(chat.id, 'visitor', 'Who should bowl the 19th over against a left-hander?')
  await store.addMessage(chat.id, 'analyst', 'Bumrah, with yorkers wide of off stump.')

  const [listed] = await store.listChats()
  expect(listed.title).toBe('Who should bowl the 19th over against a…')
})

test('a short first Message becomes the whole title', async () => {
  const chat = await store.createChat()
  await store.addMessage(chat.id, 'visitor', '  Best T20 opener?  ')

  const [listed] = await store.listChats()
  expect(listed.title).toBe('Best T20 opener?')
})

test('Messages come back in the order they were added', async () => {
  const chat = await store.createChat()
  await store.addMessage(chat.id, 'visitor', 'First')
  await store.addMessage(chat.id, 'analyst', 'Second')
  await store.addMessage(chat.id, 'visitor', 'Third')

  const messages = await store.getMessages(chat.id)
  expect(messages.map((m) => [m.role, m.text])).toEqual([
    ['visitor', 'First'],
    ['analyst', 'Second'],
    ['visitor', 'Third'],
  ])
})

test('the most recently used Chat is listed first', async () => {
  const older = await store.createChat()
  const newer = await store.createChat()
  await store.addMessage(older.id, 'visitor', 'Back to this one')

  const chats = await store.listChats()
  expect(chats.map((c) => c.id)).toEqual([older.id, newer.id])
})

test('a renamed Chat keeps its new title', async () => {
  const chat = await store.createChat()
  await store.renameChat(chat.id, 'Death bowling')
  await store.addMessage(chat.id, 'visitor', 'Who bowls the 20th over?')

  const [listed] = await store.listChats()
  expect(listed.title).toBe('Death bowling')
})

test('deleting a Chat removes it and its Messages', async () => {
  const kept = await store.createChat()
  const deleted = await store.createChat()
  await store.addMessage(kept.id, 'visitor', 'Keep me')
  await store.addMessage(deleted.id, 'visitor', 'Delete me')

  await store.deleteChat(deleted.id)

  expect((await store.listChats()).map((c) => c.id)).toEqual([kept.id])
  expect(await store.getMessages(deleted.id)).toEqual([])
  expect((await store.getMessages(kept.id)).map((m) => m.text)).toEqual(['Keep me'])
})

test('Chats are still there when the store is opened again, as after a page reload', async () => {
  const chat = await store.createChat()
  await store.addMessage(chat.id, 'visitor', 'Remember me')

  const reopened = await openChatStore(name)

  expect((await reopened.listChats()).map((c) => c.title)).toEqual(['Remember me'])
  expect((await reopened.getMessages(chat.id)).map((m) => m.text)).toEqual(['Remember me'])
})
