import { expect, test } from 'vitest'
import { findSpeechRecognition, type SpeechRecognitionLike, VoiceInput } from './voice-input.svelte'

/** A stand-in for the browser's SpeechRecognition that the test drives by hand. */
class FakeRecognition implements SpeechRecognitionLike {
  static last: FakeRecognition
  lang = ''
  interimResults = false
  continuous = true
  started = false
  onresult: SpeechRecognitionLike['onresult'] = null
  onerror: SpeechRecognitionLike['onerror'] = null
  onend: SpeechRecognitionLike['onend'] = null

  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.started = true
  }
  stop() {
    this.onend?.()
  }
  abort() {
    this.onend?.()
  }
  /** Send the results so far; each entry is [transcript, isFinal]. */
  hear(...results: [string, boolean][]) {
    const list = results.map(([transcript, isFinal]) =>
      Object.assign([{ transcript, confidence: 0.9 }], { isFinal }),
    )
    this.onresult?.({ resultIndex: 0, results: list })
  }
}

test('finds the standard or the webkit-prefixed constructor, or nothing', () => {
  expect(findSpeechRecognition({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition)
  expect(findSpeechRecognition({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition)
  expect(findSpeechRecognition({})).toBeUndefined()
})

test('without a constructor the voice input is not supported and start does nothing', () => {
  const voice = new VoiceInput(undefined)
  expect(voice.supported).toBe(false)
  voice.start(() => {})
  expect(voice.listening).toBe(false)
})

test('passes the whole transcript so far, interim words included, and stops listening at the end', () => {
  const voice = new VoiceInput(FakeRecognition)
  const heard: string[] = []

  voice.start((text) => heard.push(text))

  const recognition = FakeRecognition.last
  expect(recognition.started).toBe(true)
  expect(recognition.interimResults).toBe(true)
  expect(voice.listening).toBe(true)

  recognition.hear(['who bowls', false])
  recognition.hear(['who bowls the', true], [' death overs', false])
  recognition.stop()

  expect(heard).toEqual(['who bowls', 'who bowls the death overs'])
  expect(voice.listening).toBe(false)
})

test('a blocked microphone gives a clear message; a manual stop gives none', () => {
  const voice = new VoiceInput(FakeRecognition)
  voice.start(() => {})
  FakeRecognition.last.onerror?.({ error: 'not-allowed' })
  FakeRecognition.last.onend?.()
  expect(voice.error).toBe(
    'Microphone access is blocked. Allow it in your browser settings to use voice input.',
  )
  expect(voice.listening).toBe(false)

  voice.start(() => {})
  expect(voice.error).toBeNull() // a new attempt clears the old message
  FakeRecognition.last.onerror?.({ error: 'aborted' })
  voice.stop()
  expect(voice.error).toBeNull()
})
