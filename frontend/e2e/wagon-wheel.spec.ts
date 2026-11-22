import { expect, type Locator, type Page, test } from '@playwright/test'
import { mockApi, ok } from './mock-api.ts'

// Areas are worked out by hand for a right-handed batter (off side x < 0),
// measured from the striker at (0, 0.1): see backend/tests/test_wagon_wheel.py.
const COVER = { x: -0.6, y: -0.3 }
const LONG_ON = { x: 0.5, y: -0.5 }
const SQUARE_LEG = { x: 0.7, y: 0.2 }

async function startWagonWheel(page: Page) {
  const api = await mockApi(page, [ok('Strong through the covers, nothing behind square.')])
  await page.goto('/')
  await page.getByRole('button', { name: 'Add a Wagon wheel' }).click()
  const wheel = page.getByRole('log', { name: 'Messages' }).getByRole('figure', { name: 'Wagon wheel' })
  await expect(wheel).toBeVisible()
  return { api, wheel }
}

/** The screen point of a Ground point (x, y), from the SVG's viewBox (-1.32 -1.12 2.64 2.24). */
async function screenPoint(wheel: Locator, point: { x: number; y: number }) {
  const box = (await wheel.getByRole('application', { name: /^Ground/ }).boundingBox())!
  return {
    x: box.x + ((point.x + 1.32) / 2.64) * box.width,
    y: box.y + ((-point.y + 1.12) / 2.24) * box.height,
  }
}

async function addShot(page: Page, wheel: Locator, point: { x: number; y: number }, runs: string, touch = false) {
  // The whole Wagon wheel is taller than the Message log: bring the Ground into view, as a Visitor scrolls.
  await wheel.getByRole('application').evaluate((ground) => ground.scrollIntoView({ block: 'center' }))
  const { x, y } = await screenPoint(wheel, point)
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await wheel.getByRole('group', { name: 'Runs for this Shot' }).getByRole('button', { name: runs, exact: true }).click()
}

const area = (wheel: Locator, name: string) =>
  wheel.getByRole('list', { name: 'Runs by area' }).getByRole('listitem').filter({ hasText: name })

test('add three Shots by tap, undo one: the totals by area follow, and the Wagon wheel survives a reload', async ({
  page,
}) => {
  const { wheel } = await startWagonWheel(page)

  await addShot(page, wheel, COVER, '4')
  await addShot(page, wheel, LONG_ON, '6')
  await addShot(page, wheel, SQUARE_LEG, '1')
  await expect(wheel.locator('line.shot')).toHaveCount(3)
  await expect(wheel.locator('figcaption')).toContainText('11 runs off 3 Shots')
  await expect(area(wheel, 'Square leg')).toContainText('1')

  await wheel.getByRole('button', { name: 'Undo last Shot' }).click()

  await expect(wheel.locator('line.shot')).toHaveCount(2)
  await expect(wheel.locator('figcaption')).toContainText('10 runs off 2 Shots')
  await expect(area(wheel, 'Cover')).toContainText('4')
  await expect(area(wheel, 'Long on')).toContainText('6')
  await expect(area(wheel, 'Square leg')).toContainText('0')

  await page.reload()
  await page.getByRole('navigation', { name: 'Chats' }).getByRole('button', { name: 'Wagon wheel', exact: true }).click()
  const saved = page.getByRole('log', { name: 'Messages' }).getByRole('figure', { name: 'Wagon wheel' })
  await expect(saved.locator('line.shot')).toHaveCount(2)
  await expect(saved.locator('figcaption')).toContainText('10 runs off 2 Shots')
})

test('remove one Shot from the list', async ({ page }) => {
  const { wheel } = await startWagonWheel(page)
  await addShot(page, wheel, COVER, '4')
  await addShot(page, wheel, LONG_ON, '6')

  await wheel.getByText('Shots (2)').click()
  await wheel.getByRole('button', { name: 'Remove Shot 1: 4 to cover' }).click()

  await expect(wheel.locator('figcaption')).toContainText('6 runs off 1 Shot')
  await expect(area(wheel, 'Cover')).toContainText('0')
})

test('a Shot can be added with the keyboard', async ({ page }) => {
  const { wheel } = await startWagonWheel(page)
  const ground = wheel.getByRole('application', { name: /^Ground/ })

  await ground.focus()
  // The aim starts straight down the Ground; three steps left is on the off side.
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab') // from "1" to "2"
  await page.keyboard.press('Enter')

  await expect(wheel.locator('line.shot')).toHaveCount(1)
  await expect(wheel.locator('figcaption')).toContainText('2 runs off 1 Shot')
  await expect(area(wheel, 'Long off')).toContainText('2')
})

test('"Ask the Analyst about this Wagon wheel" sends the Shots as Board state', async ({ page }) => {
  const { api, wheel } = await startWagonWheel(page)
  await addShot(page, wheel, COVER, '4')
  await addShot(page, wheel, LONG_ON, '6')

  await wheel.getByRole('button', { name: 'Ask the Analyst about this Wagon wheel' }).click()

  await expect(page.getByText('Strong through the covers, nothing behind square.')).toBeVisible()
  const request = api.chatRequests[0] as {
    messages: { text: string }[]
    board: { wheel: { batter_hand: string; shots: { x: number; y: number; runs: number }[] } }
  }
  // The Wagon wheel itself is not a Message: only the question is.
  expect(request.messages.map((m) => m.text)).toEqual(['What does this Wagon wheel say about the batter?'])
  expect(request.board.wheel.batter_hand).toBe('right')
  expect(request.board.wheel.shots.map((shot) => shot.runs)).toEqual([4, 6])
  expect(request.board.wheel.shots[0].x).toBeCloseTo(COVER.x, 1)
  expect(request.board.wheel.shots[0].y).toBeCloseTo(COVER.y, 1)
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a finger taps Shots onto the Ground', async ({ page }) => {
    const { wheel } = await startWagonWheel(page)

    await addShot(page, wheel, COVER, '4', true)
    await addShot(page, wheel, SQUARE_LEG, '2', true)

    await expect(wheel.locator('figcaption')).toContainText('6 runs off 2 Shots')
    await expect(area(wheel, 'Square leg')).toContainText('2')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })
})
