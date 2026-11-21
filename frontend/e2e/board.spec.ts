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

// ---- The interactive Board (ticket 06) ----

const fieldReply = [
  { event: 'text', data: { text: 'Two slips and a gully. ' } },
  { event: 'field_placement', data: { field } },
  { event: 'done', data: {} },
]

async function showBoard(page: Page) {
  const api = await mockApi(page, [fieldReply])
  await page.goto('/')
  await askForAField(page)
  const board = page.getByRole('log', { name: 'Messages' }).getByRole('figure', { name: 'Field placement' })
  await expect(board.locator('text.name')).toHaveCount(11)
  return { api, board }
}

/** The screen point of a Ground point (x, y), from the SVG's viewBox (-1.32 -1.12 2.64 2.24). */
async function screenPoint(board: ReturnType<Page['locator']>, x: number, y: number) {
  const box = (await board.getByRole('group', { name: /^Ground/ }).boundingBox())!
  return {
    x: box.x + ((x + 1.32) / 2.64) * box.width,
    y: box.y + ((-y + 1.12) / 2.24) * box.height,
  }
}

const fielder = (board: ReturnType<Page['locator']>, name: string) =>
  board.getByRole('button', { name: new RegExp(`^${name},`) })

test('drag a fielder outside the circle in a T20 powerplay: the Board names the spot and warns', async ({
  page,
}) => {
  const { board } = await showBoard(page)
  await expect(board.getByRole('status')).toContainText('Inside the Fielding restrictions')

  // Point stands at (-0.38, 0.05). Drag them out to the boundary square of the wicket.
  const from = await screenPoint(board, -0.38, 0.05)
  const to = await screenPoint(board, -0.9, 0.1)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  // While dragging, the fielder already carries the nearest position's name.
  await expect(board.locator('g.dragging text.name')).toHaveText('deep point')
  await page.mouse.up()

  await expect(fielder(board, 'deep point')).toBeVisible()
  await expect(board).toContainText('3 outside the 30-yard circle')
  await expect(board.getByRole('status')).toHaveText(
    '3 fielders are outside the 30-yard circle; the T20 powerplay allows at most 2.',
  )

  // The same field is legal in the middle overs (limit 5): the warning clears.
  await board.getByRole('combobox', { name: 'Phase' }).selectOption('middle')
  await expect(board.getByRole('status')).toContainText('Inside the Fielding restrictions')

  // The edited field is saved with the Chat.
  await page.reload()
  await page.getByRole('navigation', { name: 'Chats' }).getByRole('button', { name: 'Set a T20 powerplay field for a quick', exact: true }).click()
  const saved = page.getByRole('figure', { name: 'Field placement' })
  await expect(fielder(saved, 'deep point')).toBeVisible()
  await expect(saved.getByRole('combobox', { name: 'Phase' })).toHaveValue('middle')
})

test('the Batter hand switch mirrors every fielder', async ({ page }) => {
  const { board } = await showBoard(page)
  const before = await fielder(board, 'third man').boundingBox()

  await board.getByRole('button', { name: 'Left-hander' }).click()

  await expect(board).toContainText('right-arm fast to a left-hander')
  await expect(board.getByRole('button', { name: 'Left-hander' })).toHaveAttribute('aria-pressed', 'true')
  // Third man moves from the left of the picture to the right; the sides swap their names.
  await expect(async () => {
    const after = (await fielder(board, 'third man').boundingBox())!
    expect(after.x).toBeGreaterThan(before!.x + 50)
  }).toPass()
  await expect(board.locator('text.side').first()).toHaveText('Leg side')
  // A mirrored legal field stays legal.
  await expect(board.getByRole('status')).toContainText('Inside the Fielding restrictions')
})

test('a fielder moves with the arrow keys', async ({ page }) => {
  const { board } = await showBoard(page)

  await fielder(board, 'point').focus()
  // Shift+Left moves 0.1 per press: from (-0.38, 0.05) out to (-0.88, 0.05).
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft')

  await expect(fielder(board, 'deep point')).toBeFocused()
  await expect(board.getByRole('status')).toContainText('3 fielders are outside the 30-yard circle')
})

test('"Ask the Analyst about this field" sends the field as it now stands', async ({ page }) => {
  const { api, board } = await showBoard(page)
  await board.getByRole('button', { name: 'Left-hander' }).click()
  api.replies.push([
    { event: 'text', data: { text: 'For the left-hander, third man is now on the leg side.' } },
    { event: 'done', data: {} },
  ])

  await board.getByRole('button', { name: 'Ask the Analyst about this field' }).click()

  await expect(page.getByText('For the left-hander, third man is now on the leg side.')).toBeVisible()
  const request = api.chatRequests[1] as { board: { field: typeof field }; messages: { text: string }[] }
  expect(request.board.field.batter_hand).toBe('left')
  expect(request.board.field.fielders).toEqual(
    field.fielders.map((f: { x: number }) => ({ ...f, x: -f.x || 0 })),
  )
  expect(request.messages.at(-1)!.text).toBe('What do you think of this field as it stands now?')
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a finger drags a fielder and the page does not scroll', async ({ page }) => {
    const { board } = await showBoard(page)
    await board.scrollIntoViewIfNeeded()
    const scrollBefore = await page.evaluate(() => document.scrollingElement!.scrollTop)
    const from = await screenPoint(board, -0.38, 0.05)
    const to = await screenPoint(board, -0.9, 0.1)

    // Real touch input through the Chrome DevTools Protocol (Playwright has no touch drag).
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] })
    await touch('touchStart', from)
    for (let step = 1; step <= 8; step++) {
      await touch('touchMove', {
        x: from.x + ((to.x - from.x) * step) / 8,
        y: from.y + ((to.y - from.y) * step) / 8,
      })
    }
    await touch('touchEnd')

    await expect(fielder(board, 'deep point')).toBeVisible()
    await expect(board.getByRole('status')).toContainText('3 fielders are outside the 30-yard circle')
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(scrollBefore)
  })
})
