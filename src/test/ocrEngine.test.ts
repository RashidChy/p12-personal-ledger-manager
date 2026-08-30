import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tesseract = vi.hoisted(() => ({
  createWorker: vi.fn(),
  PSM: { SINGLE_BLOCK: '6' },
}))

const preprocessing = vi.hoisted(() => ({
  prepareReceiptImage: vi.fn(async (image: File | Blob | string) => image),
}))

vi.mock('tesseract.js', () => ({
  createWorker: tesseract.createWorker,
  PSM: tesseract.PSM,
}))

vi.mock('../ocr/imagePreprocess', () => ({
  prepareReceiptImage: preprocessing.prepareReceiptImage,
}))

import {
  DEFAULT_OCR_TIMEOUT_MS,
  recognizeReceipt,
  terminateOcr,
  validateReceiptFile,
  type OcrProgress,
} from '../ocr/ocrEngine'

interface LoggerMessage {
  status: string
  progress: number
  userJobId: string
}

function result(text = 'SHOP\nTOTAL 120.00', confidence = 91) {
  return { jobId: 'mock-job', data: { text, confidence } }
}

function mockWorker() {
  return {
    setParameters: vi.fn(async () => ({ jobId: 'setup', data: null })),
    recognize: vi.fn(async () => result()),
    terminate: vi.fn(async () => ({ jobId: 'terminate', data: null })),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('receipt OCR worker', () => {
  beforeEach(() => {
    tesseract.createWorker.mockReset()
    preprocessing.prepareReceiptImage.mockClear()
    preprocessing.prepareReceiptImage.mockImplementation(async (image: File | Blob | string) => image)
  })

  afterEach(async () => {
    await terminateOcr()
  })

  it('normalises locally and configures Tesseract for receipt text', async () => {
    const worker = mockWorker()
    tesseract.createWorker.mockResolvedValue(worker)
    const image = new Blob(['receipt'], { type: 'image/png' })

    const found = await recognizeReceipt(image, undefined, { mode: 'standard' })

    expect(found.text).toContain('TOTAL')
    expect(preprocessing.prepareReceiptImage).toHaveBeenCalledWith(image, 'standard')
    expect(tesseract.createWorker).toHaveBeenCalledWith(
      'eng',
      1,
      expect.objectContaining({
        workerPath: expect.stringContaining('/ocr/worker.min.js'),
        corePath: expect.stringContaining('/ocr/core'),
        langPath: expect.stringContaining('/ocr/lang'),
        gzip: true,
        logger: expect.any(Function),
        errorHandler: expect.any(Function),
      }),
    )
    expect(worker.setParameters).toHaveBeenCalledWith(
      {
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      },
      expect.stringMatching(/^receipt-setup-/),
    )
    expect(worker.recognize).toHaveBeenCalledWith(
      image,
      { rotateAuto: true },
      { text: true },
      expect.stringMatching(/^receipt-recognize-/),
    )
  })

  it('keeps the two-argument API and uses enhanced preprocessing by default', async () => {
    const worker = mockWorker()
    tesseract.createWorker.mockResolvedValue(worker)
    const image = new Blob(['receipt'], { type: 'image/jpeg' })

    await recognizeReceipt(image, vi.fn())

    expect(preprocessing.prepareReceiptImage).toHaveBeenCalledWith(image, 'enhanced')
  })

  it('routes cached-worker progress to the callback for each unique job', async () => {
    const worker = mockWorker()
    let logger: ((message: LoggerMessage) => void) | null = null
    let recognitionCount = 0
    tesseract.createWorker.mockImplementation(async (...args: unknown[]) => {
      logger = (args[2] as { logger: (message: LoggerMessage) => void }).logger
      return worker
    })
    worker.recognize.mockImplementation(async (...args: unknown[]) => {
      recognitionCount += 1
      const progress = recognitionCount === 1 ? 0.25 : 0.75
      const jobId = args[3] as string
      ;(logger as ((message: LoggerMessage) => void) | null)?.({
        status: 'recognizing text',
        progress,
        userJobId: jobId,
      })
      return result()
    })
    const first: OcrProgress[] = []
    const second: OcrProgress[] = []

    await recognizeReceipt(new Blob(['one']), (progress) => first.push(progress))
    await recognizeReceipt(new Blob(['two']), (progress) => second.push(progress))

    expect(first.map((item) => item.progress)).toContain(0.25)
    expect(first.map((item) => item.progress)).not.toContain(0.75)
    expect(second.map((item) => item.progress)).toContain(0.75)
  })

  it('invalidates a poisoned worker so retry creates a fresh generation', async () => {
    const failedWorker = mockWorker()
    const replacementWorker = mockWorker()
    failedWorker.recognize.mockRejectedValue(new Error('WASM worker stopped'))
    tesseract.createWorker.mockResolvedValueOnce(failedWorker).mockResolvedValueOnce(replacementWorker)

    await expect(recognizeReceipt(new Blob(['bad']))).rejects.toThrow('WASM worker stopped')
    await expect(recognizeReceipt(new Blob(['good']))).resolves.toMatchObject({ text: expect.stringContaining('TOTAL') })

    expect(failedWorker.terminate).toHaveBeenCalledTimes(1)
    expect(tesseract.createWorker).toHaveBeenCalledTimes(2)
    expect(replacementWorker.recognize).toHaveBeenCalledTimes(1)
  })

  it('rejects a pre-aborted queued scan without preprocessing or touching the worker', async () => {
    const worker = mockWorker()
    const firstRecognition = deferred<ReturnType<typeof result>>()
    worker.recognize.mockImplementationOnce(() => firstRecognition.promise)
    tesseract.createWorker.mockResolvedValue(worker)

    const firstScan = recognizeReceipt(new Blob(['active']), undefined, { timeoutMs: 10_000 })
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalledTimes(1))

    const controller = new AbortController()
    controller.abort()
    const cancelledScan = recognizeReceipt(new Blob(['cancelled']), undefined, {
      signal: controller.signal,
    })

    await expect(cancelledScan).rejects.toMatchObject({ name: 'AbortError' })
    expect(preprocessing.prepareReceiptImage).toHaveBeenCalledTimes(1)
    expect(tesseract.createWorker).toHaveBeenCalledTimes(1)
    expect(worker.recognize).toHaveBeenCalledTimes(1)

    firstRecognition.resolve(result('ACTIVE'))
    await firstScan
  })

  it('aborts a hung recognition, retires that generation once and retries fresh', async () => {
    const hungWorker = mockWorker()
    const replacementWorker = mockWorker()
    const hungRecognition = deferred<ReturnType<typeof result>>()
    hungWorker.recognize.mockImplementationOnce(() => hungRecognition.promise)
    tesseract.createWorker.mockResolvedValueOnce(hungWorker).mockResolvedValueOnce(replacementWorker)
    const controller = new AbortController()

    const scan = recognizeReceipt(new Blob(['hung']), undefined, {
      signal: controller.signal,
      timeoutMs: 10_000,
    })
    await vi.waitFor(() => expect(hungWorker.recognize).toHaveBeenCalledTimes(1))

    controller.abort()
    await expect(scan).rejects.toMatchObject({ name: 'AbortError' })
    expect(hungWorker.terminate).toHaveBeenCalledTimes(1)

    await expect(recognizeReceipt(new Blob(['retry']))).resolves.toMatchObject({
      text: expect.stringContaining('TOTAL'),
    })
    expect(tesseract.createWorker).toHaveBeenCalledTimes(2)
    expect(replacementWorker.recognize).toHaveBeenCalledTimes(1)

    // A late failure from the abandoned Tesseract promise is already observed
    // by the race and must neither become unhandled nor terminate twice.
    hungRecognition.reject(new Error('late worker failure'))
    await Promise.resolve()
    expect(hungWorker.terminate).toHaveBeenCalledTimes(1)
  })

  it('times out a hung recognition and makes the next scan use a new worker', async () => {
    const hungWorker = mockWorker()
    const replacementWorker = mockWorker()
    const hungRecognition = deferred<ReturnType<typeof result>>()
    hungWorker.recognize.mockImplementationOnce(() => hungRecognition.promise)
    tesseract.createWorker.mockResolvedValueOnce(hungWorker).mockResolvedValueOnce(replacementWorker)

    const scan = recognizeReceipt(new Blob(['slow']), undefined, { timeoutMs: 10 })

    await expect(scan).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(hungWorker.terminate).toHaveBeenCalledTimes(1)
    await expect(recognizeReceipt(new Blob(['retry']))).resolves.toMatchObject({
      text: expect.stringContaining('TOTAL'),
    })
    expect(tesseract.createWorker).toHaveBeenCalledTimes(2)

    hungRecognition.resolve(result('TOO LATE'))
  })

  it('uses a 75 second recognition watchdog by default', () => {
    expect(DEFAULT_OCR_TIMEOUT_MS).toBe(75_000)
  })

  it('defers a cross-mount termination request until all global scans settle', async () => {
    const worker = mockWorker()
    const first = deferred<ReturnType<typeof result>>()
    const second = deferred<ReturnType<typeof result>>()
    worker.recognize
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    tesseract.createWorker.mockResolvedValue(worker)

    const firstScan = recognizeReceipt(new Blob(['first']))
    const secondScan = recognizeReceipt(new Blob(['second']))
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalledTimes(1))

    const terminating = terminateOcr()
    expect(worker.terminate).not.toHaveBeenCalled()

    first.resolve(result('FIRST'))
    await firstScan
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalledTimes(2))
    expect(worker.terminate).not.toHaveBeenCalled()

    second.resolve(result('SECOND'))
    await Promise.all([secondScan, terminating])
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})

describe('receipt file validation', () => {
  it('accepts camera images with an empty MIME type and a supported extension', () => {
    expect(validateReceiptFile(new File(['pixels'], 'camera-capture.JPG', { type: '' }))).toEqual({
      ok: true,
      error: null,
    })
  })

  it('does not let an extension override an explicitly unsupported MIME type', () => {
    const validation = validateReceiptFile(
      new File(['not an image'], 'renamed.png', { type: 'application/pdf' }),
    )

    expect(validation.ok).toBe(false)
    expect(validation.error).toContain('application/pdf')
  })
})
