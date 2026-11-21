import { expect, type Page, test } from '@playwright/test'
import { mockApi, ok, startSseServer } from './mock-api.ts'

async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

const messages = (page: Page) => page.getByRole('log', { name: 'Messages' }).getByRole('article')
const chatList = (page: Page) => page.getByRole('navigation', { name: 'Chats' })

test('a Message gets a reply that streams in and renders as Markdown', async ({ page }) => {
  await mockApi(page)
  const server = await startSseServer([
    { event: 'text', data: { text: '**Bumrah** ' }, delayMs: 600 },
    { event: 'text', data: { text: 'bowls the 19th over.' }, delayMs: 700 },
    { event: 'text', data: { text: '\n\n- wide yorkers\n- slower balls' }, delayMs: 700 },
    { event: 'done', data: {} },
  ])
  await page.route('**/api/chat', (route) => route.continue({ url: server.url }))
  await page.goto('/')

  await send(page, 'Who bowls the 19th over?')

  await expect(page.getByText('Analyst is thinking…')).toBeVisible()
  const reply = messages(page).last()
  await expect(reply).toContainText('Bumrah')
  await expect(reply).not.toContainText('19th over') // still streaming
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()

  await expect(reply.getByRole('listitem')).toHaveText(['wide yorkers', 'slower balls'])
  await expect(reply.locator('strong')).toHaveText('Bumrah')
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
  await expect(chatList(page).getByRole('button', { name: 'Who bowls the 19th over?', exact: true })).toBeVisible()
  await server.close()
})

test('Stop ends the reply and keeps the text so far, also after a reload', async ({ page }) => {
  await mockApi(page)
  const server = await startSseServer([
    { event: 'text', data: { text: 'Set a deep point ' }, delayMs: 300 },
    { event: 'text', data: { text: 'and never shown.' }, delayMs: 60_000 },
  ])
  await page.route('**/api/chat', (route) => route.continue({ url: server.url }))
  await page.goto('/')

  await send(page, 'Field for a leg-spinner?')
  await expect(messages(page).last()).toContainText('Set a deep point')
  await page.getByRole('button', { name: 'Stop' }).click()

  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await chatList(page).getByRole('button', { name: 'Field for a leg-spinner?', exact: true }).click()
  await expect(messages(page)).toHaveText([/Field for a leg-spinner\?/, /Set a deep point/])
  await server.close()
})

test('Chats survive a page reload', async ({ page }) => {
  await mockApi(page, [ok('Use two slips early on.')])
  await page.goto('/')
  await send(page, 'Field for a new ball spell?')
  await expect(messages(page).last()).toContainText('Use two slips early on.')

  await page.reload()

  await chatList(page).getByRole('button', { name: 'Field for a new ball spell?', exact: true }).click()
  await expect(messages(page)).toHaveText([/Field for a new ball spell\?/, /Use two slips early on\./])
})

test('a Chat can be renamed and deleted', async ({ page }) => {
  await mockApi(page, [ok('Yes.')])
  await page.goto('/')
  await send(page, 'Is a draw likely?')
  await expect(messages(page).last()).toContainText('Yes.')

  await chatList(page).getByRole('button', { name: 'Rename Is a draw likely?', exact: true }).click()
  await page.getByLabel('New title').fill('Test match day 5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(chatList(page).getByRole('button', { name: 'Test match day 5', exact: true })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await chatList(page).getByRole('button', { name: 'Delete Test match day 5', exact: true }).click()
  await expect(chatList(page).getByText('No Chats yet.')).toBeVisible()
  await expect(messages(page)).toHaveCount(0)
})

test('two Visitors never see each other’s Chats', async ({ browser }) => {
  const first = await (await browser.newContext()).newPage()
  const second = await (await browser.newContext()).newPage()
  await mockApi(first, [ok('Only for the first Visitor.')])
  await mockApi(second)

  await first.goto('/')
  await send(first, 'My private question')
  await expect(messages(first).last()).toContainText('Only for the first Visitor.')
  await second.goto('/')

  await expect(chatList(second).getByText('No Chats yet.')).toBeVisible()
  await expect(chatList(first).getByRole('button', { name: 'My private question', exact: true })).toBeVisible()
})

test('a failed reply shows the error, and Retry gets the reply', async ({ page }) => {
  const api = await mockApi(page, [
    [
      {
        event: 'error',
        data: {
          code: 'model_busy',
          message: 'The Analyst is busy right now. Please try again in a moment.',
          retryable: true,
        },
      },
    ],
    ok('Here is the answer.'),
  ])
  await page.goto('/')

  await send(page, 'Best death bowler?')
  await expect(page.getByRole('alert')).toContainText('The Analyst is busy right now.')
  await page.getByRole('button', { name: 'Retry' }).click()

  await expect(messages(page).last()).toContainText('Here is the answer.')
  await expect(page.getByRole('alert')).toHaveCount(0)
  const request = {
    messages: [{ role: 'visitor', text: 'Best death bowler?' }],
    sport_focus: { sport: 'cricket', team: '' },
  }
  expect(api.chatRequests).toEqual([request, request])
})

test('HTTP 429 from the firewall shows the limit message with a time', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/chat', (route) => route.fulfill({ status: 429, body: 'Too Many Requests' }))
  await page.goto('/')

  await send(page, 'One more question')

  await expect(page.getByRole('alert')).toContainText(
    /Limit reached: you can send 20 Messages in 10 minutes\.\s+Please try again after\s+\d{1,2}:\d{2}/,
  )
})
