import { type Chat, type ChatStore, openChatStore, type StoredMessage, sportFocusOf } from './chat-store'
import { type BoardState, streamReply } from './chat-stream'
import type { FieldPlacement } from './field-placement'
import { type MessageImage, prepareImages } from './image-prep'
import { DEFAULT_SPORT_FOCUS, type SportFocus } from './sport-focus'
import { EMPTY_WAGON_WHEEL, type WagonWheel } from './wagon-wheel'

/** What the Analyst's reply to the last Message is doing. */
export type ReplyState =
  | { status: 'idle' }
  | { status: 'thinking' } // sent, no words yet
  | { status: 'streaming' }
  | { status: 'failed'; message: string; retryable: boolean }
  | { status: 'rate-limited'; retryAt: Date }

const IDLE: ReplyState = { status: 'idle' }

/** The Visitor's Message when they press "Ask the Analyst about this field". */
export const ASK_ABOUT_FIELD = 'What do you think of this field as it stands now?'

/** The Visitor's Message when they press "Ask the Analyst about this Wagon wheel". */
export const ASK_ABOUT_WHEEL = 'What does this Wagon wheel say about the batter?'


/** An image attached to the Message being written; the id keys the preview. */
export type Attachment = { id: string; image: MessageImage }

/**
 * The page's state: the Chat list, the open Chat and its reply.
 * It joins the Chat store (IndexedDB) and the Chat stream client (the API).
 */
export class ChatSession {
  chats = $state.raw<Chat[]>([])
  currentChatId = $state<string | null>(null)
  messages = $state.raw<StoredMessage[]>([])
  /** The Analyst's reply text so far, while it streams or after it failed. */
  draft = $state('')
  /** The Field placement of the reply that is streaming, if it has one yet. */
  draftField = $state.raw<FieldPlacement | null>(null)
  reply = $state.raw<ReplyState>(IDLE)
  /** True when the browser does not let the page save Chats. */
  storeFailed = $state(false)
  /** The open Chat's Sport focus (for a new Chat: what it will be saved with). */
  sportFocus = $state.raw<SportFocus>(DEFAULT_SPORT_FOCUS)
  /** Images attached to the Message being written, already resized. */
  attachments = $state.raw<Attachment[]>([])
  /** True while Image prep resizes newly attached images. */
  preparing = $state(false)
  /** Why some attached files were left out, or null. */
  attachError = $state<string | null>(null)

  busy = $derived(this.reply.status === 'thinking' || this.reply.status === 'streaming')

  #store: Promise<ChatStore>
  #stop: AbortController | null = null

  constructor(store: Promise<ChatStore> = openChatStore()) {
    this.#store = store
  }

  async load() {
    try {
      this.chats = await (await this.#store).listChats()
    } catch {
      this.storeFailed = true
    }
  }

  /** Start a new Chat. It is saved when its first Message is sent. */
  newChat() {
    this.stop()
    this.currentChatId = null
    this.messages = []
    this.sportFocus = DEFAULT_SPORT_FOCUS
    this.#clearDraftMessage()
    this.#clearReply()
  }

  async openChat(id: string) {
    this.stop()
    this.currentChatId = id
    this.sportFocus = sportFocusOf(this.chats.find((chat) => chat.id === id))
    this.#clearDraftMessage()
    this.#clearReply()
    this.messages = await (await this.#store).getMessages(id)
  }

  /** Change the Sport focus; an existing Chat saves it at once. */
  async setSportFocus(focus: SportFocus) {
    this.sportFocus = focus
    if (!this.currentChatId) return
    const store = await this.#store
    await store.setSportFocus(this.currentChatId, focus)
    this.chats = await store.listChats()
  }

  /** Check, resize and attach images the Visitor picked, pasted or dropped. */
  async attach(files: File[]) {
    if (files.length === 0) return
    this.preparing = true
    const { images, error } = await prepareImages(files, this.attachments.length)
    const added = images.map((image) => ({ id: crypto.randomUUID(), image }))
    this.attachments = [...this.attachments, ...added]
    this.attachError = error
    this.preparing = false
  }

  removeAttachment(id: string) {
    this.attachments = this.attachments.filter((attachment) => attachment.id !== id)
    this.attachError = null
  }

  /** Save the Visitor's edit of the Field placement under an Analyst Message. */
  async editField(messageId: number, field: FieldPlacement) {
    this.messages = this.messages.map((m) => (m.id === messageId ? { ...m, field } : m))
    await (await this.#store).setField(messageId, field)
  }

  /** "Ask the Analyst about this field": send the Board as it now stands with a question. */
  async askAboutField(field: FieldPlacement) {
    await this.send(ASK_ABOUT_FIELD, { field })
  }

  /** Start an empty Wagon wheel at the end of the Chat (a new Chat is saved for it). */
  async startWagonWheel() {
    if (this.busy) return
    const store = await this.#store
    let chatId = this.currentChatId
    if (!chatId) {
      chatId = (await store.createChat(this.sportFocus)).id
      this.currentChatId = chatId
    }
    this.#clearReply()
    await store.addMessage(chatId, 'visitor', '', { wheel: EMPTY_WAGON_WHEEL })
    this.messages = await store.getMessages(chatId)
    this.chats = await store.listChats()
  }

  /** Save the Visitor's change to a Wagon wheel. */
  async editWheel(messageId: number, wheel: WagonWheel) {
    this.messages = this.messages.map((m) => (m.id === messageId ? { ...m, wheel } : m))
    await (await this.#store).setWheel(messageId, wheel)
  }

  /** "Ask the Analyst about this Wagon wheel": send its Shots with a question. */
  async askAboutWheel(wheel: WagonWheel) {
    await this.send(ASK_ABOUT_WHEEL, { wheel })
  }

  async send(text: string, board?: BoardState) {
    const message = text.trim()
    const images = this.attachments.map((attachment) => attachment.image)
    if ((!message && images.length === 0) || this.busy || this.preparing) return
    const store = await this.#store
    let chatId = this.currentChatId
    if (!chatId) {
      chatId = (await store.createChat(this.sportFocus)).id
      this.currentChatId = chatId
    }
    this.#clearDraftMessage()
    await store.addMessage(chatId, 'visitor', message, { images, ...board })
    this.messages = await store.getMessages(chatId)
    this.chats = await store.listChats()
    await this.#reply(chatId)
  }

  /** Ask again for a reply to the last Message, after a failure. */
  async retry() {
    if (this.currentChatId && !this.busy) await this.#reply(this.currentChatId)
  }

  /** Stop the reply. The text so far stays and is saved. */
  stop() {
    this.#stop?.abort()
  }

  async rename(id: string, title: string) {
    const newTitle = title.trim()
    if (!newTitle) return
    const store = await this.#store
    await store.renameChat(id, newTitle)
    this.chats = await store.listChats()
  }

  async remove(id: string) {
    if (id === this.currentChatId) this.newChat()
    const store = await this.#store
    await store.deleteChat(id)
    this.chats = await store.listChats()
  }

  async #reply(chatId: string) {
    const store = await this.#store
    const stop = new AbortController()
    this.#stop = stop
    this.draft = ''
    this.draftField = null
    this.reply = { status: 'thinking' }
    const isOpen = () => this.currentChatId === chatId

    let text = ''
    let field: FieldPlacement | undefined
    // A Wagon wheel the Visitor records has no text: it is Board state, not a Message.
    const sent = this.messages.filter((m) => m.text || m.images?.length)
    const history = sent.map(({ role, text, images }) => ({ role, text, images }))
    // A question about the Board carries the field or Wagon wheel as it stood when asked (also on retry).
    const last = sent.at(-1)
    const board =
      last?.role !== 'visitor'
        ? undefined
        : last.field
          ? { field: last.field }
          : last.wheel
            ? { wheel: last.wheel }
            : undefined
    const result = await streamReply(history, {
      board,
      signal: stop.signal,
      sportFocus: this.sportFocus,
      onText: (piece) => {
        text += piece
        if (isOpen()) {
          this.draft = text
          this.reply = { status: 'streaming' }
        }
      },
      onFieldPlacement: (placement) => {
        field = placement
        if (isOpen()) {
          this.draftField = placement
          this.reply = { status: 'streaming' }
        }
      },
    })
    if (this.#stop === stop) this.#stop = null

    // Save what the Visitor saw: the whole reply, or the part before Stop.
    if ((result.status === 'done' || result.status === 'stopped') && (text || field)) {
      await store.addMessage(chatId, 'analyst', text, { field })
      this.chats = await store.listChats()
      if (isOpen()) this.messages = await store.getMessages(chatId)
    }
    if (!isOpen()) return // the Visitor moved to another Chat

    if (result.status === 'failed') {
      this.reply = { status: 'failed', message: result.message, retryable: result.retryable }
    } else if (result.status === 'rate-limited') {
      this.reply = { status: 'rate-limited', retryAt: result.retryAt }
    } else {
      this.#clearReply()
    }
  }

  #clearDraftMessage() {
    this.attachments = []
    this.attachError = null
  }

  #clearReply() {
    this.draft = ''
    this.draftField = null
    this.reply = IDLE
  }
}
