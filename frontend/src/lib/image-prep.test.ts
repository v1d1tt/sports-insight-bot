import { expect, test, vi } from 'vitest'
import { fitWithin, type MessageImage, prepareImages } from './image-prep'

// jsdom cannot decode or draw images, so these tests pass a stand-in resizer.
// The real resize runs in Chromium in e2e/images.spec.ts.
const resized = (file: File): Promise<MessageImage> =>
  Promise.resolve({ mediaType: file.type as MessageImage['mediaType'], data: btoa(file.name) })

const file = (name: string, type: string) => new File(['x'], name, { type })
const jpeg = (name = 'photo.jpg') => file(name, 'image/jpeg')

test('a large image is scaled so its long side is 1600 px, keeping its shape', () => {
  expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
  expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  expect(fitWithin(1000, 600, 1600)).toEqual({ width: 1000, height: 600 }) // never enlarged
})

test('JPEG, PNG and WebP images are prepared in order, keeping their type', async () => {
  const files = [jpeg('a.jpg'), file('b.png', 'image/png'), file('c.webp', 'image/webp')]

  const result = await prepareImages(files, 0, resized)

  expect(result.error).toBeNull()
  expect(result.images.map((image) => image.mediaType)).toEqual([
    'image/jpeg',
    'image/png',
    'image/webp',
  ])
})

test('a file that is not a supported image is refused with a clear message', async () => {
  const files = [file('notes.pdf', 'application/pdf'), jpeg(), file('cat.gif', 'image/gif')]

  const result = await prepareImages(files, 0, resized)

  expect(result.images).toHaveLength(1)
  expect(result.error).toBe('"notes.pdf" and "cat.gif" are not JPEG, PNG or WebP images.')
})

test('at most 4 images fit in one Message, counting those already attached', async () => {
  const resize = vi.fn(resized)

  const result = await prepareImages([jpeg('1.jpg'), jpeg('2.jpg'), jpeg('3.jpg')], 2, resize)

  expect(result.images).toHaveLength(2)
  expect(resize).toHaveBeenCalledTimes(2) // the extra image is not even read
  expect(result.error).toBe('You can attach up to 4 images to one Message.')
})

test('an image the browser cannot read is skipped with a clear message', async () => {
  const resize = (image: File) =>
    image.name === 'broken.jpg' ? Promise.reject(new Error('decode failed')) : resized(image)

  const result = await prepareImages([jpeg('broken.jpg'), jpeg('fine.jpg')], 0, resize)

  expect(result.images).toHaveLength(1)
  expect(result.error).toBe('Could not read "broken.jpg". Try another image.')
})
