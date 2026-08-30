import { describe, expect, it } from 'vitest'
import {
  RECEIPT_IMAGE_LIMITS,
  applyReceiptAutoContrast,
  prepareReceiptImage,
  receiptCanvasDimensions,
} from '../ocr/imagePreprocess'

describe('receipt image sizing', () => {
  it('bounds high-resolution phone photos without changing their aspect ratio', () => {
    const dimensions = receiptCanvasDimensions(6000, 4000)

    expect(dimensions).toEqual({ width: 3000, height: 2000 })
    expect(Math.max(dimensions.width, dimensions.height)).toBeLessThanOrEqual(
      RECEIPT_IMAGE_LIMITS.maxLongEdge,
    )
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(RECEIPT_IMAGE_LIMITS.maxPixels)
  })

  it('upscales a very small receipt but limits the enlargement', () => {
    expect(receiptCanvasDimensions(300, 600)).toEqual({ width: 800, height: 1600 })
    expect(receiptCanvasDimensions(100, 200)).toEqual({ width: 300, height: 600 })
  })

  it('leaves an already useful receipt size unchanged', () => {
    expect(receiptCanvasDimensions(1200, 2000)).toEqual({ width: 1200, height: 2000 })
  })
})

describe('enhanced receipt pixels', () => {
  it('uses grayscale and stretches low contrast tones while preserving alpha', () => {
    const data = new Uint8ClampedArray([
      50, 50, 50, 11,
      100, 100, 100, 22,
      200, 200, 200, 33,
    ])

    applyReceiptAutoContrast({ data } as ImageData)

    expect([...data]).toEqual([
      0, 0, 0, 11,
      85, 85, 85, 22,
      255, 255, 255, 33,
    ])
  })

  it('safely returns the original when browser decode/canvas APIs are unavailable', async () => {
    const original = new Blob(['local receipt bytes'], { type: 'image/png' })

    await expect(prepareReceiptImage(original, 'enhanced')).resolves.toBe(original)
  })
})
