// Image prep: checks the type and count of the images a Visitor attaches,
// shrinks each one in the browser, and returns the upload payload.
// Shrinking here keeps big phone photos under Vercel's 4.5 MB request limit.

export const MAX_IMAGES = 4
export const MAX_LONG_SIDE = 1600
/**
 * Most bytes one image may take after resizing. 4 images in base64 (4/3 larger)
 * plus 20 Messages of text stay under 4.5 MB.
 */
export const MAX_IMAGE_BYTES = 700_000

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type MediaType = (typeof ACCEPTED_TYPES)[number]

/** One image of a Message: base64 bytes and their real MIME type. */
export interface MessageImage {
  mediaType: MediaType
  data: string
}

export interface PrepResult {
  images: MessageImage[]
  /** A message for the Visitor about files that were left out, or null. */
  error: string | null
}

// Each pass that is still too big shrinks the image by this factor, down to MIN_LONG_SIDE.
const SHRINK_STEP = 0.8
const MIN_LONG_SIDE = 400
const JPEG_WEBP_QUALITY = 0.85

const isAccepted = (type: string): type is MediaType =>
  (ACCEPTED_TYPES as readonly string[]).includes(type)

/**
 * Prepare the files a Visitor attached, pasted or dropped.
 * `attached` is how many images the Message already has.
 */
export async function prepareImages(
  files: File[],
  attached: number,
  resize: (file: File) => Promise<MessageImage> = resizeImage,
): Promise<PrepResult> {
  const errors: string[] = []

  const wrongType = files.filter((file) => !isAccepted(file.type))
  if (wrongType.length > 0) {
    const names = wrongType.map((file) => `"${file.name}"`).join(' and ')
    const verb = wrongType.length === 1 ? 'is not a' : 'are not'
    errors.push(`${names} ${verb} JPEG, PNG or WebP ${wrongType.length === 1 ? 'image' : 'images'}.`)
  }

  let images = files.filter((file) => isAccepted(file.type))
  const room = Math.max(0, MAX_IMAGES - attached)
  if (images.length > room) {
    images = images.slice(0, room)
    errors.push(`You can attach up to ${MAX_IMAGES} images to one Message.`)
  }

  const prepared: MessageImage[] = []
  for (const file of images) {
    try {
      prepared.push(await resize(file))
    } catch {
      errors.push(`Could not read "${file.name}". Try another image.`)
    }
  }
  return { images: prepared, error: errors.length > 0 ? errors.join(' ') : null }
}

/** The size that fits within `maxSide` on the long side. Never enlarges. */
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Decode, scale to 1600 px on the long side, and encode again in the same type.
 * Encoding again also drops the photo's metadata (for example its GPS location).
 */
async function resizeImage(file: File): Promise<MessageImage> {
  // Turns the image upright from its EXIF orientation (the default, "from-image").
  const bitmap = await createImageBitmap(file)
  try {
    let { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_LONG_SIDE)
    for (;;) {
      const blob = await encode(bitmap, width, height, file.type)
      const smallest = Math.max(width, height) <= MIN_LONG_SIDE
      if (blob.size <= MAX_IMAGE_BYTES || smallest) {
        // A browser that cannot write the type gives PNG: blob.type is the real one.
        if (!isAccepted(blob.type)) throw new Error(`Unexpected type ${blob.type}`)
        return { mediaType: blob.type, data: await toBase64(blob) }
      }
      ;({ width, height } = fitWithin(width, height, Math.max(width, height) * SHRINK_STEP))
    }
  } finally {
    bitmap.close()
  }
}

function encode(bitmap: ImageBitmap, width: number, height: number, type: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('No 2D canvas'))
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    // The quality setting applies to JPEG and WebP only; PNG is lossless.
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode'))),
      type,
      JPEG_WEBP_QUALITY,
    ),
  )
}

/** The blob's bytes as base64 (FileReader gives "data:<type>;base64,<data>"). */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
