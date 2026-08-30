/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ocr = vi.hoisted(() => ({
  recognizeReceipt: vi.fn(),
  terminateOcr: vi.fn(() => Promise.resolve()),
}))

vi.mock('../ocr/ocrEngine', () => ({
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  recognizeReceipt: ocr.recognizeReceipt,
  terminateOcr: ocr.terminateOcr,
  validateReceiptFile: (file: File) => ({ ok: file.size > 0, error: file.size > 0 ? null : 'empty' }),
}))

import { ReceiptScanner } from '../ui/ReceiptScanner'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('receipt scanner cancellation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ocr.recognizeReceipt.mockReset()
    ocr.terminateOcr.mockClear()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test-receipt'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('ignores a late OCR result and cleans up after the cancelled run settles', async () => {
    const pending = deferred<{ text: string; confidence: number; durationMs: number }>()
    ocr.recognizeReceipt.mockReturnValue(pending.promise)

    await act(async () => {
      root.render(
        createElement(ReceiptScanner, {
          referenceDate: '2026-04-14',
          month: '2026-04',
          categories: ['Food', 'Other'],
          onSave: vi.fn(),
        }),
      )
    })

    const input = container.querySelector<HTMLInputElement>('#receipt-input')
    expect(input).not.toBeNull()
    const file = new File(['receipt pixels'], 'receipt.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })

    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.textContent).toContain('Reading the receipt')

    const cancel = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Cancel scan',
    )
    expect(cancel).toBeDefined()
    await act(async () => cancel?.click())

    // Do not terminate Tesseract while recognize() is active; doing so makes
    // the library emit a noisy worker error in the browser console.
    expect(ocr.terminateOcr).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Scan a receipt')

    await act(async () => {
      pending.resolve({ text: 'LATE RESULT\nTOTAL 500.00', confidence: 99, durationMs: 25 })
      await pending.promise
    })

    expect(container.textContent).toContain('Scan a receipt')
    expect(container.textContent).not.toContain('Review and correct')
    expect(container.textContent).not.toContain('LATE RESULT')
    expect(ocr.terminateOcr).toHaveBeenCalledTimes(1)
  })
})
