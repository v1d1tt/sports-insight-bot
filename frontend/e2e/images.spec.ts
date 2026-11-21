import { writeFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { mockApi, ok } from './mock-api.ts'

type FileSpec = { name: string; mimeType: string; buffer: Buffer }
type ImageSpec = {
  width: number
  height: number
  type: string
  /** gradient: like a photo; flat: like a screenshot; noise: a worst-case huge file. */
  look: 'gradient' | 'flat' | 'noise'
  quality?: number
}
type SentImage = { media_type: string; data: string }
type ChatBody = {
  messages: { role: string; text: string; images?: SentImage[] }[]
  sport_focus: { sport: string; team: string }
}

/** Draw a test image in the page and return it as a file. */
async function makeImage(page: Page, name: string, spec: ImageSpec): Promise<FileSpec> {
  const base64 = await page.evaluate(async ({ width, height, type, look, quality }) => {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')!
    if (look === 'flat') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#1a4d8f'
      context.fillRect(0, 0, width, height / 8)
      context.font = `${height / 10}px sans-serif`
      context.fillText('IND 187/4 (20)', width / 10, height / 2)
    } else if (look === 'noise') {
      const pixels = context.createImageData(width, height)
      for (let i = 0; i < pixels.data.length; i += 65_536) {
        crypto.getRandomValues(pixels.data.subarray(i, i + 65_536))
      }
      for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255
      context.putImageData(pixels, 0, 0)
    } else {
      const gradient = context.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#2a7a2a')
      gradient.addColorStop(1, '#c8e6c8')
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)
    }
    const blob = await canvas.convertToBlob({ type, quality })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
  }, spec)
  return { name, mimeType: spec.type, buffer: Buffer.from(base64, 'base64') }
}

/** The width and height of a base64 image, as the browser decodes it. */
function sizeOf(page: Page, image: SentImage) {
  return page.evaluate(async ({ media_type, data }) => {
    const blob = await (await fetch(`data:${media_type};base64,${data}`)).blob()
    const bitmap = await createImageBitmap(blob)
    return [bitmap.width, bitmap.height]
  }, image)
}

async function attach(page: Page, files: FileSpec[]) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Attach images' }).click()
  await (await chooser).setFiles(files)
}

const previews = (page: Page) => page.getByRole('list', { name: 'Attached images' }).getByRole('img')
const messages = (page: Page) => page.getByRole('log', { name: 'Messages' }).getByRole('article')
const chatList = (page: Page) => page.getByRole('navigation', { name: 'Chats' })

test('attached images are resized to 1600 px and keep their type', async ({ page }) => {
  const { chatRequests } = await mockApi(page, [ok('Two slips and a gully.')])
  await page.goto('/')
  await expect(page.getByText('Images go to the model provider')).toBeVisible()

  const photo = await makeImage(page, 'field.jpg', {
    width: 4000,
    height: 3000,
    type: 'image/jpeg',
    look: 'gradient',
  })
  const screenshot = await makeImage(page, 'score.png', {
    width: 2000,
    height: 1000,
    type: 'image/png',
    look: 'flat',
  })
  await attach(page, [photo, screenshot])
  await expect(previews(page)).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Message' }).fill('What field is this?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(messages(page).last()).toContainText('Two slips and a gully.')
  const [sentPhoto, sentScreenshot] = (chatRequests[0] as ChatBody).messages[0].images!
  expect(sentPhoto.media_type).toBe('image/jpeg')
  expect(sentScreenshot.media_type).toBe('image/png')
  expect(await sizeOf(page, sentPhoto)).toEqual([1600, 1200])
  expect(await sizeOf(page, sentScreenshot)).toEqual([1600, 800])
  await expect(previews(page)).toHaveCount(0) // the composer is clear again

  await page.reload() // the images are saved with the Chat
  await chatList(page).getByRole('button', { name: 'What field is this?', exact: true }).click()
  await expect(messages(page).first().getByRole('img')).toHaveCount(2)
})

test('four 10 MB photos still go out in one request under 4.5 MB', async ({ page }, testInfo) => {
  test.slow() // drawing and resizing big noisy images takes a few seconds
  const { chatRequests } = await mockApi(page, [ok('Noted.')])
  let bodyBytes = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/chat')) bodyBytes = request.postDataBuffer()?.length ?? 0
  })
  await page.goto('/')

  const huge = await makeImage(page, 'phone.jpg', {
    width: 4000,
    height: 3000,
    type: 'image/jpeg',
    look: 'noise',
    quality: 0.97,
  })
  expect(huge.buffer.length).toBeGreaterThan(10_000_000)
  // setFiles() takes at most 50 MB of buffers, so pass a file path instead.
  const path = testInfo.outputPath('phone.jpg')
  await writeFile(path, huge.buffer)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Attach images' }).click()
  await (await chooser).setFiles([path, path, path, path])
  await expect(previews(page)).toHaveCount(4)
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(messages(page).last()).toContainText('Noted.')
  expect((chatRequests[0] as ChatBody).messages[0].images).toHaveLength(4)
  expect(bodyBytes).toBeGreaterThan(0)
  expect(bodyBytes).toBeLessThan(4_500_000)
})

test('images can be pasted and dropped; other files and a fifth image are refused', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/')
  const png = await makeImage(page, 'shot.png', {
    width: 300,
    height: 200,
    type: 'image/png',
    look: 'flat',
  })

  // Paste a screenshot into the Message box, then drop one on the chat.
  for (const [eventName, target] of [
    ['paste', 'textarea'],
    ['drop', '[role="log"]'],
  ] as const) {
    await page.evaluate(
      ({ eventName, target, base64 }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const data = new DataTransfer()
        data.items.add(new File([bytes], 'shot.png', { type: 'image/png' }))
        const init = { clipboardData: data, dataTransfer: data, bubbles: true, cancelable: true }
        const event =
          eventName === 'paste' ? new ClipboardEvent('paste', init) : new DragEvent('drop', init)
        document.querySelector(target)!.dispatchEvent(event)
      },
      { eventName, target, base64: png.buffer.toString('base64') },
    )
  }
  await expect(previews(page)).toHaveCount(2)

  const pdf = { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }
  await attach(page, [pdf])
  await expect(page.getByRole('alert')).toHaveText('"notes.pdf" is not a JPEG, PNG or WebP image.')
  await expect(previews(page)).toHaveCount(2)

  await attach(page, [png, png, png])
  await expect(previews(page)).toHaveCount(4)
  await expect(page.getByRole('alert')).toHaveText('You can attach up to 4 images to one Message.')
  await expect(page.getByRole('button', { name: 'Attach images' })).toBeDisabled()

  await page.getByRole('button', { name: 'Remove image 1' }).click()
  await expect(previews(page)).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Attach images' })).toBeEnabled()
})

test('the Sport focus is sent with each Message and stays with its Chat', async ({ page }) => {
  const { chatRequests } = await mockApi(page, [ok('Press high.'), ok('Bowl yorkers.')])
  await page.goto('/')
  const sport = page.getByRole('combobox', { name: 'Sport' })
  const team = page.getByRole('textbox', { name: 'Team (optional)' })
  await expect(sport).toHaveValue('cricket')

  await sport.selectOption('football')
  await team.fill('Arsenal')
  await page.getByRole('textbox', { name: 'Message' }).fill('How do we beat a low block?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(messages(page).last()).toContainText('Press high.')
  expect((chatRequests[0] as ChatBody).sport_focus).toEqual({ sport: 'football', team: 'Arsenal' })
  await expect(page.getByText('The Analyst gives text answers for this sport.')).toBeVisible()

  // A new Chat starts with cricket and keeps it.
  await page.getByRole('button', { name: 'New Chat' }).click()
  await expect(sport).toHaveValue('cricket')
  await expect(team).toHaveValue('')
  await page.getByRole('textbox', { name: 'Message' }).fill('Death bowling plan?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(messages(page).last()).toContainText('Bowl yorkers.')
  expect((chatRequests[1] as ChatBody).sport_focus).toEqual({ sport: 'cricket', team: '' })

  await page.reload()
  await chatList(page).getByRole('button', { name: 'How do we beat a low block?', exact: true }).click()
  await expect(sport).toHaveValue('football')
  await expect(team).toHaveValue('Arsenal')
  await chatList(page).getByRole('button', { name: 'Death bowling plan?', exact: true }).click()
  await expect(sport).toHaveValue('cricket')
})
