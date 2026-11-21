import { type DBSchema, openDB } from 'idb'
import type { FieldPlacement } from './field-placement'
import type { MessageImage } from './image-prep'
import { DEFAULT_SPORT_FOCUS, type SportFocus } from './sport-focus'

// The Chat store keeps Chats and Messages in the Visitor's own browser
// (IndexedDB, see docs/adr/0001). The server never stores them.

export type Role = 'visitor' | 'analyst'

export interface Chat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** Missing on Chats saved before Sport focus existed: read it with sportFocusOf(). */
  sportFocus?: SportFocus
}

export interface StoredMessage {
  id: number
  chatId: string
  role: Role
  text: string
  /** Visitor Messages only; already resized by Image prep. */
  images?: MessageImage[]
  /** Analyst Messages only: the Field placement shown on the Board. */
  field?: FieldPlacement
  createdAt: number
}

/** What a Message can hold besides its text. */
export type MessageExtras = { images?: MessageImage[]; field?: FieldPlacement }

export interface ChatStore {
  /** Create an empty Chat titled "New Chat" (cricket unless a Sport focus is given). */
  createChat(sportFocus?: SportFocus): Promise<Chat>
  /** All Chats, the most recently used first. */
  listChats(): Promise<Chat[]>
  renameChat(id: string, title: string): Promise<void>
  setSportFocus(id: string, sportFocus: SportFocus): Promise<void>
  /** Delete a Chat and all its Messages. */
  deleteChat(id: string): Promise<void>
  /** A Chat's Messages, oldest first. */
  getMessages(chatId: string): Promise<StoredMessage[]>
  /** Add a Message. The first Visitor Message also becomes the Chat's title. */
  addMessage(chatId: string, role: Role, text: string, extras?: MessageExtras): Promise<StoredMessage>
}

export const DEFAULT_TITLE = 'New Chat'
const TITLE_LENGTH = 40

interface ChatDB extends DBSchema {
  chats: { key: string; value: Chat; indexes: { 'by-updated': number } }
  messages: { key: number; value: StoredMessage; indexes: { 'by-chat': string } }
}

export async function openChatStore(name = 'sports-insight-bot'): Promise<ChatStore> {
  const db = await openDB<ChatDB>(name, 1, {
    upgrade(db) {
      const chats = db.createObjectStore('chats', { keyPath: 'id' })
      chats.createIndex('by-updated', 'updatedAt')
      // autoIncrement ids keep each Chat's Messages in the order they were added.
      const messages = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true })
      messages.createIndex('by-chat', 'chatId')
    },
  })

  // A clock that never returns the same time twice, so "most recent" is exact.
  let lastTime = 0
  const now = () => (lastTime = Math.max(Date.now(), lastTime + 1))

  return {
    async createChat(sportFocus = DEFAULT_SPORT_FOCUS) {
      const time = now()
      const chat = {
        id: crypto.randomUUID(),
        title: DEFAULT_TITLE,
        createdAt: time,
        updatedAt: time,
        sportFocus: { ...sportFocus },
      }
      await db.add('chats', chat)
      return chat
    },

    async listChats() {
      return (await db.getAllFromIndex('chats', 'by-updated')).reverse()
    },

    async renameChat(id, title) {
      const tx = db.transaction('chats', 'readwrite')
      const chat = await tx.store.get(id)
      if (chat) await tx.store.put({ ...chat, title })
      await tx.done
    },

    async setSportFocus(id, sportFocus) {
      const tx = db.transaction('chats', 'readwrite')
      const chat = await tx.store.get(id)
      // Copy the plain fields: a Svelte state proxy cannot be stored.
      if (chat) await tx.store.put({ ...chat, sportFocus: { sport: sportFocus.sport, team: sportFocus.team } })
      await tx.done
    },

    async deleteChat(id) {
      const tx = db.transaction(['chats', 'messages'], 'readwrite')
      const messages = tx.objectStore('messages')
      const messageIds = await messages.index('by-chat').getAllKeys(id)
      await Promise.all([
        tx.objectStore('chats').delete(id),
        ...messageIds.map((messageId) => messages.delete(messageId)),
      ])
      await tx.done
    },

    async getMessages(chatId) {
      return db.getAllFromIndex('messages', 'by-chat', chatId)
    },

    async addMessage(chatId, role, text, { images, field } = {}) {
      const time = now()
      const tx = db.transaction(['chats', 'messages'], 'readwrite')
      const newMessage = {
        chatId,
        role,
        text,
        createdAt: time,
        ...(images?.length ? { images } : {}),
        ...(field ? { field } : {}),
      }
      // The store adds the id (autoIncrement), so the new record has none yet.
      const id = await tx.objectStore('messages').add(newMessage as StoredMessage)
      const chat = await tx.objectStore('chats').get(chatId)
      if (chat) {
        const firstQuestion = chat.title === DEFAULT_TITLE && role === 'visitor'
        const title = firstQuestion ? titleFrom(text, images?.length ?? 0) : chat.title
        await tx.objectStore('chats').put({ ...chat, title, updatedAt: time })
      }
      await tx.done
      return { ...newMessage, id }
    },
  }
}

/** The Sport focus of a Chat; cricket for Chats saved before it existed. */
export function sportFocusOf(chat: Chat | undefined): SportFocus {
  return chat?.sportFocus ?? DEFAULT_SPORT_FOCUS
}

/** The first words of a Message, cut at a word break, as a Chat title. */
function titleFrom(text: string, imageCount: number): string {
  const line = text.trim().replace(/\s+/g, ' ')
  if (!line) return imageCount === 1 ? 'Image' : `${imageCount} images`
  if (line.length <= TITLE_LENGTH) return line
  const cut = line.slice(0, TITLE_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}
