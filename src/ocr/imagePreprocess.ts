/**
 * Local image preparation for receipt OCR.
 *
 * Drawing a phone photo to a canvas normalises browser-applied EXIF rotation
 * before Tesseract sees it. It also gives us a bounded input size, avoiding
 * excessive WASM memory use for modern high-resolution camera images. No
 * pixels are sent anywhere: every operation in this module uses browser image
 * and canvas APIs on the device.
 */

export type ReceiptOcrMode = 'standard' | 'enhanced'

export type ReceiptImageInput = File | Blob | string
export type PreparedReceiptImage = ReceiptImageInput | HTMLCanvasElement | OffscreenCanvas

export const RECEIPT_IMAGE_LIMITS = {
  /** Large enough to keep small thermal-print text, without feeding huge phone photos to WASM. */
  maxLongEdge: 3000,
  maxPixels: 8_000_000,
  /** Upscaling genuinely small captures helps Tesseract segment narrow glyphs. */
  minLongEdge: 1600,
  maxUpscale: 3,
} as const

export interface ReceiptImageDimensions {
  width: number
  height: number
}

/** Computes a bounded OCR canvas size while preserving the source aspect ratio. */
export function receiptCanvasDimensions(width: number, height: number): ReceiptImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The receipt image has invalid dimensions.')
  }

  const longEdge = Math.max(width, height)
  const pixels = width * height
  let scale = 1

  if (longEdge > RECEIPT_IMAGE_LIMITS.maxLongEdge || pixels > RECEIPT_IMAGE_LIMITS.maxPixels) {
    scale = Math.min(
      RECEIPT_IMAGE_LIMITS.maxLongEdge / longEdge,
      Math.sqrt(RECEIPT_IMAGE_LIMITS.maxPixels / pixels),
    )
  } else if (longEdge < RECEIPT_IMAGE_LIMITS.minLongEdge) {
    scale = Math.min(RECEIPT_IMAGE_LIMITS.minLongEdge / longEdge, RECEIPT_IMAGE_LIMITS.maxUpscale)
  }

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Converts pixels to grayscale and stretches the useful luminance range.
 * One percent of pixels at each end of the histogram is clipped so a small
 * glare spot or dark border does not flatten the rest of the receipt.
 */
export function applyReceiptAutoContrast(imageData: ImageData): void {
  const { data } = imageData
  const pixelCount = Math.floor(data.length / 4)
  if (pixelCount === 0) return

  const histogram = new Uint32Array(256)
  const luminance = new Uint8Array(pixelCount)

  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
    const gray = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114)
    luminance[pixel] = gray
    histogram[gray] += 1
  }

  const clipCount = Math.floor(pixelCount * 0.01)
  let low = 0
  let seen = 0
  while (low < 255) {
    seen += histogram[low]
    if (seen > clipCount) break
    low += 1
  }

  let high = 255
  seen = 0
  while (high > 0) {
    seen += histogram[high]
    if (seen > clipCount) break
    high -= 1
  }

  const range = high - low
  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
    const gray = luminance[pixel]
    const contrasted = range < 2 ? gray : Math.round(((gray - low) * 255) / range)
    const value = Math.max(0, Math.min(255, contrasted))
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
  }
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

function canUseImageBitmap(): boolean {
  return typeof createImageBitmap === 'function'
}

async function decodeBlobWithImageBitmap(blob: Blob): Promise<DecodedImage | null> {
  if (!canUseImageBitmap()) return null

  let bitmap: ImageBitmap
  try {
    // `from-image` asks the browser to honour phone-photo EXIF orientation.
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    try {
      // Older implementations support createImageBitmap but not the options bag.
      bitmap = await createImageBitmap(blob)
    } catch {
      return null
    }
  }

  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    release: () => bitmap.close(),
  }
}

function decodeWithImageElement(image: ReceiptImageInput): Promise<DecodedImage | null> {
  if (typeof Image !== 'function') return Promise.resolve(null)

  const canCreateObjectUrl =
    typeof image !== 'string' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
  if (typeof image !== 'string' && !canCreateObjectUrl) return Promise.resolve(null)

  return new Promise((resolve) => {
    const element = new Image()
    const objectUrl = canCreateObjectUrl ? URL.createObjectURL(image as Blob) : null
    const sourceUrl = objectUrl ?? (image as string)

    const revoke = () => {
      if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl)
    }

    element.onload = () => {
      const width = element.naturalWidth || element.width
      const height = element.naturalHeight || element.height
      if (width <= 0 || height <= 0) {
        revoke()
        resolve(null)
        return
      }
      resolve({
        source: element,
        width,
        height,
        release: revoke,
      })
    }
    element.onerror = () => {
      revoke()
      resolve(null)
    }
    element.decoding = 'async'
    element.src = sourceUrl
  })
}

async function decodeReceiptImage(image: ReceiptImageInput): Promise<DecodedImage | null> {
  if (typeof image !== 'string') {
    const bitmap = await decodeBlobWithImageBitmap(image)
    if (bitmap) return bitmap
  }
  return decodeWithImageElement(image)
}

function createReceiptCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement | OffscreenCanvas; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context) return { canvas, context }
  }

  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context) return { canvas, context }
  }

  return null
}

/**
 * Decodes and redraws a receipt locally. Enhanced mode additionally applies
 * grayscale auto-contrast. If any required browser API or codec is unavailable,
 * the original input is returned so OCR still has a chance to read it.
 */
export async function prepareReceiptImage(
  image: ReceiptImageInput,
  mode: ReceiptOcrMode = 'standard',
): Promise<PreparedReceiptImage> {
  let decoded: DecodedImage | null = null
  try {
    decoded = await decodeReceiptImage(image)
    if (!decoded) return image

    const { width, height } = receiptCanvasDimensions(decoded.width, decoded.height)
    const target = createReceiptCanvas(width, height)
    if (!target) return image

    target.context.imageSmoothingEnabled = true
    target.context.imageSmoothingQuality = 'high'
    target.context.drawImage(decoded.source, 0, 0, width, height)

    if (mode === 'enhanced') {
      const pixels = target.context.getImageData(0, 0, width, height)
      applyReceiptAutoContrast(pixels)
      target.context.putImageData(pixels, 0, 0)
    }

    return target.canvas
  } catch {
    // Unsupported image codecs, tainted canvases and partial browser canvas
    // implementations should never prevent Tesseract from trying the original.
    return image
  } finally {
    decoded?.release()
  }
}
