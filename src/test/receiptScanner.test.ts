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

describe('receipt scanner reliability', () => {
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
    const signal = ocr.recognizeReceipt.mock.calls[0]?.[2]?.signal as AbortSignal
    expect(signal.aborted).toBe(false)

    const cancel = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Cancel scan',
    )
    expect(cancel).toBeDefined()
    await act(async () => cancel?.click())

    // Ask the engine to release resources. The engine owns global in-flight
    // tracking and defers actual worker termination until recognition settles.
    expect(ocr.terminateOcr).toHaveBeenCalledTimes(1)
    expect(signal.aborted).toBe(true)
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

  it('uses a valid fallback when the Food category was deleted', async () => {
    await act(async () => {
      root.render(
        createElement(ReceiptScanner, {
          month: '2026-04',
          categories: ['Groceries', 'Other'],
          onSave: vi.fn(),
        }),
      )
    })

    const manual = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Enter the expense manually'),
    )
    await act(async () => manual?.click())
    expect(container.querySelector<HTMLSelectElement>('#receipt-category')?.value).toBe('Other')
  })

  it('automatically runs and selects an enhanced pass when the first read is uncertain', async () => {
    const first = deferred<{ text: string; confidence: number; durationMs: number }>()
    const second = deferred<{ text: string; confidence: number; durationMs: number }>()
    ocr.recognizeReceipt.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    await act(async () => {
      root.render(
        createElement(ReceiptScanner, {
          month: '2026-04',
          categories: ['Groceries', 'Other'],
          onSave: vi.fn(),
        }),
      )
    })
    const input = container.querySelector<HTMLInputElement>('#receipt-input')
    const file = new File(['receipt pixels'], 'receipt.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input?.dispatchEvent(new Event('change', { bubbles: true })))

    await act(async () => {
      first.resolve({ text: 'Corner Shop\n05/04/2026\nTOTAL 1250', confidence: 61, durationMs: 20 })
      await first.promise
    })
    expect(ocr.recognizeReceipt).toHaveBeenCalledTimes(2)
    expect(ocr.recognizeReceipt.mock.calls[0]?.[2]).toMatchObject({ mode: 'standard' })
    expect(ocr.recognizeReceipt.mock.calls[1]?.[2]).toMatchObject({ mode: 'enhanced' })

    await act(async () => {
      second.resolve({
        text: 'Meena Bazar\nDate 17/04/2026\nGRAND TOTAL 1341.25',
        confidence: 92,
        durationMs: 30,
      })
      await second.promise
    })
    expect(container.textContent).toContain('Enhanced scan selected')
    expect(container.querySelector<HTMLInputElement>('#receipt-shop')?.value).toBe('Meena Bazar')
    expect(container.querySelector<HTMLInputElement>('#receipt-amount')?.value).toBe('1341.25')
    expect(document.activeElement?.textContent).toBe('Review and correct')
  })

  it('surfaces conflicting values from two OCR passes and requires review', async () => {
    ocr.recognizeReceipt
      .mockResolvedValueOnce({
        text: 'Meena Bazar\nDate 17/04/2026\nGRAND TOTAL 575.00',
        confidence: 60,
        durationMs: 20,
      })
      .mockResolvedValueOnce({
        text: 'Meena Bazar\nDate 17/04/2026\nGRAND TOTAL 515.00',
        confidence: 92,
        durationMs: 25,
      })

    await act(async () => {
      root.render(
        createElement(ReceiptScanner, {
          month: '2026-04',
          categories: ['Groceries', 'Other'],
          onSave: vi.fn(),
        }),
      )
    })
    const input = container.querySelector<HTMLInputElement>('#receipt-input')
    const file = new File(['receipt pixels'], 'receipt.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input?.dispatchEvent(new Event('change', { bubbles: true })))

    expect(container.textContent).toContain('The OCR passes disagreed')
    expect(container.textContent).toContain('Amount: ৳575.00 or ৳515.00')
    expect(container.querySelectorAll('.candidate-option')).toHaveLength(2)
    expect(
      [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save expense')
        ?.disabled,
    ).toBe(true)
  })

  it('requires an explicit image check before saving uncertain extracted fields', async () => {
    const first = deferred<{ text: string; confidence: number; durationMs: number }>()
    const second = deferred<{ text: string; confidence: number; durationMs: number }>()
    ocr.recognizeReceipt.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    await act(async () => {
      root.render(
        createElement(ReceiptScanner, {
          month: '2026-04',
          categories: ['Food', 'Other'],
          onSave: vi.fn(),
        }),
      )
    })
    const input = container.querySelector<HTMLInputElement>('#receipt-input')
    const file = new File(['receipt pixels'], 'receipt.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input?.dispatchEvent(new Event('change', { bubbles: true })))

    const uncertain = { text: 'Corner Shop\nDate 05/04/2026\nTOTAL 1250', confidence: 55, durationMs: 20 }
    await act(async () => {
      first.resolve(uncertain)
      await first.promise
    })
    await act(async () => {
      second.resolve(uncertain)
      await second.promise
    })

    const save = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save expense')
    const confirmation = container.querySelector<HTMLInputElement>('.review-confirmation input')
    expect(container.textContent).toContain('Please verify this uncertain scan result')
    expect(save?.disabled).toBe(true)
    expect(confirmation).not.toBeNull()
    await act(async () => confirmation?.click())
    expect(save?.disabled).toBe(false)
  })
})
