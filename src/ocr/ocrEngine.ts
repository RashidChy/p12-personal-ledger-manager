/**
 * On-device receipt OCR.
 *
 * Tesseract.js runs entirely in the browser: the image, the WASM engine and the
 * English model are all local. The worker, the WASM core and eng.traineddata are
 * served from this app's own /ocr/ directory (copied out of node_modules by
 * scripts/setup-ocr-assets.mjs), so no request is made to any third party and no
 * receipt image ever leaves the device.
 */
import { createWorker, type Worker } from 'tesseract.js'

export interface OcrProgress {
  status: string
  /** 0-1 within the current status step. */
  progress: number
  label: string
}

export interface OcrResult {
  text: string
  /** Tesseract's own mean word confidence, 0-100. */
  confidence: number
  durationMs: number
}

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')

const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Loading the on-device OCR engine',
  'initializing tesseract': 'Starting the OCR engine',
  'loading language traineddata': 'Loading the English model (local file)',
  'initializing api': 'Preparing to read the receipt',
  'recognizing text': 'Reading the receipt text',
}

export function labelForStatus(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/^\w/, (c) => c.toUpperCase())
}

let workerPromise: Promise<Worker> | null = null

async function getWorker(onProgress?: (p: OcrProgress) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: `${BASE}/ocr/worker.min.js`,
      corePath: `${BASE}/ocr/core`,
      langPath: `${BASE}/ocr/lang`,
      gzip: true,
      logger: (m) => {
        if (onProgress && typeof m.progress === 'number') {
          onProgress({ status: m.status, progress: m.progress, label: labelForStatus(m.status) })
        }
      },
    }).catch((err) => {
      // Let the next attempt rebuild the worker rather than caching the failure.
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

export async function recognizeReceipt(
  image: File | Blob | string,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const started = performance.now()
  const worker = await getWorker(onProgress)
  onProgress?.({ status: 'recognizing text', progress: 0, label: labelForStatus('recognizing text') })
  const { data } = await worker.recognize(image)
  return {
    text: data.text ?? '',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    durationMs: performance.now() - started,
  }
}

/** Frees the worker (and its WASM memory) once the scanner is closed. */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    /* the worker never started; nothing to release */
  }
}

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'] as const
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export interface FileValidation {
  ok: boolean
  error: string | null
}

export function validateReceiptFile(file: File): FileValidation {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    const seen = file.type || 'unknown type'
    return {
      ok: false,
      error: `"${file.name}" is a ${seen} file. Upload a JPEG, PNG, WebP or BMP photograph of the receipt, or enter the expense manually.`,
    }
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB - take a smaller photo or crop it, then try again.`,
    }
  }
  if (file.size === 0) {
    return { ok: false, error: `"${file.name}" is empty. Choose a different image.` }
  }
  return { ok: true, error: null }
}
