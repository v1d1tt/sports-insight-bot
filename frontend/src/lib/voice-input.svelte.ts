// Voice input: the browser's own speech-to-text (Web Speech API).
// The transcript goes into the Message box for the Visitor to edit; nothing is
// sent by voice alone. Chrome and Edge turn speech into text on their own
// servers; Safari can do it on the device. Firefox has no SpeechRecognition,
// so there the mic button is hidden.

/** The parts of the browser's SpeechRecognition this app uses. */
export interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

/** A SpeechRecognitionEvent: a list of results, each a list of alternatives. */
export interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/** The browser's constructor (Chrome and Safari still use the webkit prefix), if any. */
export function findSpeechRecognition(
  scope: object = globalThis,
): SpeechRecognitionCtor | undefined {
  const found = scope as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return found.SpeechRecognition ?? found.webkitSpeechRecognition
}

// The SpeechRecognitionErrorEvent codes, as plain words for the Visitor.
// "aborted" is missing on purpose: it only means the listening was stopped.
const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed':
    'Microphone access is blocked. Allow it in your browser settings to use voice input.',
  'service-not-allowed':
    'Microphone access is blocked. Allow it in your browser settings to use voice input.',
  'no-speech': 'No speech was heard. Press the mic and try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice input needs an internet connection in this browser.',
}

export class VoiceInput {
  readonly supported: boolean
  listening = $state(false)
  /** Why the last attempt failed, or null. */
  error = $state<string | null>(null)

  #Recognition: SpeechRecognitionCtor | undefined
  #recognition: SpeechRecognitionLike | null = null

  constructor(Recognition: SpeechRecognitionCtor | undefined = findSpeechRecognition()) {
    this.#Recognition = Recognition
    this.supported = Recognition !== undefined
  }

  /** Listen until the Visitor pauses. `onText` gets the whole transcript so far. */
  start(onText: (transcript: string) => void) {
    if (!this.#Recognition || this.listening) return
    const recognition = new this.#Recognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.interimResults = true // show words while the Visitor speaks
    recognition.continuous = false // stop after a pause
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript
      onText(transcript)
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return
      this.error = ERROR_MESSAGES[event.error] ?? 'Voice input stopped. Press the mic to try again.'
    }
    recognition.onend = () => {
      this.listening = false
      this.#recognition = null
    }
    this.error = null
    this.#recognition = recognition
    this.listening = true
    try {
      recognition.start()
    } catch {
      this.listening = false
      this.#recognition = null
      this.error = 'Voice input could not start. Press the mic to try again.'
    }
  }

  stop() {
    this.#recognition?.stop()
  }
}
