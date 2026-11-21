import { expect, type Page, test } from '@playwright/test'
import { mockApi, ok } from './mock-api.ts'

const textbox = (page: Page) => page.getByRole('textbox', { name: 'Message' })

test.describe('voice input', () => {
  test('the mic button is hidden when the browser has no speech recognition', async ({ page }) => {
    await page.addInitScript(() => {
      for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
        Object.defineProperty(window, name, { value: undefined, configurable: true })
      }
    })
    await mockApi(page)
    await page.goto('/')

    await expect(textbox(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start voice input' })).toHaveCount(0)
  })

  test('speech fills the Message box for editing and is not sent by itself', async ({ page }) => {
    // A fake recogniser: on start it "hears" a question in two steps, then ends.
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = ''
        interimResults = false
        continuous = true
        onresult: ((event: unknown) => void) | null = null
        onerror: ((event: unknown) => void) | null = null
        onend: (() => void) | null = null
        start() {
          const result = (transcript: string, isFinal: boolean) =>
            Object.assign([{ transcript }], { isFinal })
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [result('who bowls', false)] }), 50)
          setTimeout(() => {
            this.onresult?.({
              resultIndex: 0,
              results: [result('who bowls the death', true), result(' overs', true)],
            })
            this.onend?.()
          }, 150)
        }
        stop() {
          this.onend?.()
        }
        abort() {
          this.onend?.()
        }
      }
      for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
        Object.defineProperty(window, name, { value: FakeRecognition, configurable: true })
      }
    })
    const api = await mockApi(page, [ok('Bumrah.')])
    await page.goto('/')

    await textbox(page).fill('India:')
    await page.getByRole('button', { name: 'Start voice input' }).click()

    await expect(textbox(page)).toHaveValue('India: who bowls the death overs')
    await expect(page.getByRole('button', { name: 'Start voice input' })).toBeVisible()
    expect(api.chatRequests).toHaveLength(0)

    await textbox(page).fill('India: who bowls the death overs today?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Bumrah.')
    expect(api.chatRequests).toHaveLength(1)
  })
})

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true })

  test('the chat fits 375 px without sideways scroll and the Chat list opens as a drawer', async ({
    page,
  }) => {
    await mockApi(page, [ok('| Over | Bowler | Plan |\n|---|---|---|\n| 19 | Bumrah | wide yorkers outside off stump |')])
    await page.goto('/')
    const chats = page.getByRole('navigation', { name: 'Chats' })
    await expect(chats).toBeHidden()

    await textbox(page).tap()
    await textbox(page).fill('Who bowls the 19th over?')
    await page.getByRole('button', { name: 'Send' }).tap()
    await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Bumrah')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)

    await page.getByRole('button', { name: 'Chats', exact: true }).tap()
    await expect(chats).toBeVisible()
    await chats.getByRole('button', { name: 'New Chat' }).tap()
    await expect(chats).toBeHidden()
    await expect(page.getByRole('log', { name: 'Messages' }).getByRole('article')).toHaveCount(0)

    await page.getByRole('button', { name: 'Chats', exact: true }).tap()
    await chats.getByRole('button', { name: 'Who bowls the 19th over?', exact: true }).tap()
    await expect(chats).toBeHidden()
    await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Bumrah')
  })
})
