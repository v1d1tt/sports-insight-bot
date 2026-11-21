import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { mockApi } from './mock-api.ts'

// A legal field from the shared Fielding restriction cases (docs/adr/0003).
const cases = JSON.parse(readFileSync(new URL('../../backend/tests/fielding_cases.json', import.meta.url), 'utf8'))
const field = cases.cases[0].field
const positions: string[] = field.fielders.map((fielder: { position: string }) => fielder.position)

async function askForAField(page: Page) {
  await page.getByRole('textbox', { name: 'Message' }).fill('Set a T20 powerplay field for a quick')
  await page.getByRole('button', { name: 'Send' }).click()
}

test('a field_placement event draws eleven labelled fielders under the reply, also after a reload', async ({
  page,
}) => {
  await mockApi(page, [
    [
      { event: 'text', data: { text: 'Two slips and a gully. ' } },
      { event: 'field_placement', data: { field } },
      { event: 'text', data: { text: 'Fine leg and third man stay back.' } },
      { event: 'done', data: {} },
    ],
  ])
  await page.goto('/')

  await askForAField(page)

  const reply = page.getByRole('log', { name: 'Messages' }).getByRole('article').last()
  await expect(reply).toContainText('Fine leg and third man stay back.')
  const board = reply.getByRole('figure', { name: 'Field placement' })
  await expect(board).toContainText('T20 powerplay · right-arm fast to a right-hander')
  await expect(board).toContainText('2 outside the 30-yard circle')
  await expect(board.locator('text.name')).toHaveCount(11)
  // Labels are drawn from the top of the picture down, so compare them as sets.
  const names = (await board.locator('text.name').allTextContents()).map((name) => name.trim())
  expect(names.sort()).toEqual([...positions].sort())

  await page.reload()
  await page
    .getByRole('navigation', { name: 'Chats' })
    .getByRole('button', { name: 'Set a T20 powerplay field for a quick', exact: true })
    .click()

  const saved = page.getByRole('log', { name: 'Messages' }).getByRole('article').last()
  await expect(saved.getByRole('figure', { name: 'Field placement' }).locator('text.name')).toHaveCount(11)
})

test('a reply with no field_placement event shows no Board', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')

  await askForAField(page)

  await expect(page.getByText('(no reply scripted)')).toBeVisible()
  await expect(page.getByRole('figure', { name: 'Field placement' })).toHaveCount(0)
})
