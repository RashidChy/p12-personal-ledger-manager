/**
 * On-device receipt OCR.
 *
 * Tesseract.js runs entirely in the browser: the image, the WASM engine and the
 * English model are all local. The worker, the WASM core and eng.traineddata are
 * served from this app's own /ocr/ directory (copied out of node_modules by
 * scripts/setup-ocr-assets.mjs), so no request is made to any third party and no
 * receipt image ever leaves the device.
 */
import { PSM, createWorker, type Worker } from 'tesseract.js'
import {
  prepareReceiptImage,
  type ReceiptImageInput,
  type ReceiptOcrMode,
} from './imagePreprocess'

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

export interface RecognizeReceiptOptions {
  /** Enhanced mode adds grayscale auto-contrast after local image normalisation. */
  mode?: ReceiptOcrMode
  /** Cancels this scan without affecting scans that use a newer worker generation. */
  signal?: AbortSignal
  /** Maximum time spent inside Tesseract recognition. Defaults to 75 seconds. */
  timeoutMs?: number
}

export const DEFAULT_OCR_TIMEOUT_MS = 75_000

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

type ProgressCallback = (progress: OcrProgress) => void

interface TesseractProgressMessage {
  status: string
  progress: number
  userJobId?: string
}

let workerPromise: Promise<Worker> | null = null
let workerInstance: Worker | null = null
let workerGeneration: symbol | null = null
let recognitionQueue: Promise<void> = Promise.resolve()
let activeRequests = 0
let jobSequence = 0

const progressByJobId = new Map<string, ProgressCallback>()
const startupProgressListeners = new Set<ProgressCallback>()
const generationByWorker = new WeakMap<Worker, symbol>()
const terminationByWorker = new WeakMap<Worker, Promise<void>>()

let requestedTermination = 0
let completedTermination = 0
let terminationInFlight = false
const terminationWaiters: Array<{ version: number; resolve: () => void }> = []

function reportProgress(callback: ProgressCallback | undefined, status: string, progress: number): void {
  if (!callback) return
  try {
    callback({ status, progress, label: labelForStatus(status) })
  } catch {
    // A rendering callback must not be able to break Tesseract's worker event loop.
  }
}

function handleWorkerProgress(message: TesseractProgressMessage): void {
  if (typeof message.progress !== 'number') return

  const jobCallback = message.userJobId ? progressByJobId.get(message.userJobId) : undefined
  if (jobCallback) {
    reportProgress(jobCallback, message.status, message.progress)
    return
  }

  // Worker creation uses Tesseract's internal job IDs. Dynamic listeners let a
  // later caller observe startup without permanently capturing the first scan.
  for (const callback of startupProgressListeners) {
    reportProgress(callback, message.status, message.progress)
  }
}

async function getWorker(onProgress?: ProgressCallback): Promise<Worker> {
  if (workerInstance) return workerInstance

  if (!workerPromise) {
    let createdWorker: Worker | null = null
    const generation = Symbol('receipt-ocr-worker')
    workerGeneration = generation
    const creation = (async () => {
      try {
        createdWorker = await createWorker('eng', 1, {
          workerPath: `${BASE}/ocr/worker.min.js`,
          corePath: `${BASE}/ocr/core`,
          langPath: `${BASE}/ocr/lang`,
          gzip: true,
          logger: handleWorkerProgress,
          // Tesseract already rejects the individual job promise. Supplying an
          // error handler prevents v7 from additionally throwing in its worker
          // message listener, where application code cannot recover cleanly.
          errorHandler: () => undefined,
        })
        generationByWorker.set(createdWorker, generation)
        await createdWorker.setParameters(
          {
            // Receipts are generally one compact block containing aligned rows.
            tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
            preserve_interword_spaces: '1',
            user_defined_dpi: '300',
          },
          `receipt-setup-${++jobSequence}`,
        )
        if (workerGeneration === generation) workerInstance = createdWorker
        return createdWorker
      } catch (error) {
        if (workerGeneration === generation) {
          workerPromise = null
          workerInstance = null
          workerGeneration = null
        }
        if (createdWorker) {
          terminateWorkerOnce(createdWorker)
        }
        throw error
      }
    })()
    workerPromise = creation
  }

  if (onProgress) startupProgressListeners.add(onProgress)
  try {
    return await workerPromise
  } finally {
    if (onProgress) startupProgressListeners.delete(onProgress)
  }
}

function terminateWorkerOnce(worker: Worker): Promise<void> {
  const existing = terminationByWorker.get(worker)
  if (existing) return existing

  let termination: Promise<void>
  try {
    termination = Promise.resolve(worker.terminate()).then(
      () => undefined,
      () => undefined,
    )
  } catch {
    termination = Promise.resolve()
  }
  terminationByWorker.set(worker, termination)
  return termination
}

function invalidateWorker(worker: Worker, generation: symbol | undefined): void {
  // Generation identity matters here: a timed-out worker may reject after its
  // replacement is already running, and must never evict that replacement.
  if (generation && workerGeneration === generation) {
    workerInstance = null
    workerPromise = null
    workerGeneration = null
  }
  // Start shutdown, but do not await it. A wedged Tesseract worker can also
  // wedge terminate(); cancellation must still reject promptly and let Retry
  // create a fresh generation. The stored promise absorbs any later rejection.
  void terminateWorkerOnce(worker)
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  const error = new Error('Receipt OCR was cancelled.')
  error.name = 'AbortError'
  return error
}

function timeoutError(timeoutMs: number): Error {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000))
  const error = new Error(`Receipt OCR timed out after ${seconds} second${seconds === 1 ? '' : 's'}.`)
  error.name = 'TimeoutError'
  return error
}

function normaliseTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_OCR_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) return DEFAULT_OCR_TIMEOUT_MS
  return timeoutMs
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal)
}

interface RecognitionWatchdog {
  promise: Promise<never>
  dispose: () => void
}

function createRecognitionWatchdog(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): RecognitionWatchdog {
  let rejectWatchdog!: (reason: Error) => void
  let settled = false
  const promise = new Promise<never>((_resolve, reject) => {
    rejectWatchdog = reject
  })

  const rejectOnce = (reason: Error) => {
    if (settled) return
    settled = true
    rejectWatchdog(reason)
  }
  const onAbort = () => rejectOnce(abortError(signal as AbortSignal))
  signal?.addEventListener('abort', onAbort, { once: true })
  // Close the tiny check/listen race if another task aborted the signal after
  // runRecognition's preflight check but before the listener was registered.
  if (signal?.aborted) onAbort()

  const timeout = globalThis.setTimeout(
    () => rejectOnce(timeoutError(timeoutMs)),
    timeoutMs,
  )

  return {
    promise,
    dispose: () => {
      settled = true
      globalThis.clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

async function runRecognition(
  image: ReceiptImageInput,
  onProgress: ProgressCallback | undefined,
  options: RecognizeReceiptOptions,
): Promise<OcrResult> {
  const started = now()
  throwIfAborted(options.signal)
  // Enhanced is the reliability-oriented default for the existing two-argument API.
  const preparedImage = await prepareReceiptImage(image, options.mode ?? 'enhanced')
  throwIfAborted(options.signal)
  const worker = await getWorker(onProgress)
  const generation = generationByWorker.get(worker)
  const jobId = `receipt-recognize-${++jobSequence}`

  reportProgress(onProgress, 'recognizing text', 0)
  throwIfAborted(options.signal)
  if (onProgress) progressByJobId.set(jobId, onProgress)
  const watchdog = createRecognitionWatchdog(options.signal, normaliseTimeout(options.timeoutMs))
  try {
    const recognition = worker.recognize(
      preparedImage,
      { rotateAuto: true },
      { text: true },
      jobId,
    )
    const { data } = await Promise.race([recognition, watchdog.promise])
    return {
      text: data.text ?? '',
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      durationMs: now() - started,
    }
  } catch (error) {
    // A failed recognition can leave Tesseract's worker/WASM state unusable.
    // Remove and terminate this exact generation so Retry builds a clean one.
    invalidateWorker(worker, generation)
    throw error
  } finally {
    watchdog.dispose()
    progressByJobId.delete(jobId)
  }
}

function finishRequest(): void {
  activeRequests -= 1
  void drainTermination()
}

/**
 * Reads a receipt with the shared local worker. Jobs are serialised because one
 * Tesseract worker has one mutable recognition context; queued jobs still count
 * as active so an old scanner mount cannot terminate a newer mount's scan.
 */
export function recognizeReceipt(
  image: File | Blob | string,
  onProgress?: ProgressCallback,
  options: RecognizeReceiptOptions = {},
): Promise<OcrResult> {
  // Do not place an already-cancelled request on the global queue. In
  // particular, it must not preprocess an image or acquire the shared worker.
  try {
    throwIfAborted(options.signal)
  } catch (error) {
    return Promise.reject(error)
  }

  activeRequests += 1
  const queued = recognitionQueue.then(
    () => runRecognition(image, onProgress, options),
    () => runRecognition(image, onProgress, options),
  )
  recognitionQueue = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued.finally(finishRequest)
}

function resolveTerminationWaiters(): void {
  for (let index = terminationWaiters.length - 1; index >= 0; index -= 1) {
    const waiter = terminationWaiters[index]
    if (waiter.version <= completedTermination) {
      terminationWaiters.splice(index, 1)
      waiter.resolve()
    }
  }
}

async function drainTermination(): Promise<void> {
  if (terminationInFlight || activeRequests > 0 || requestedTermination <= completedTermination) return

  terminationInFlight = true
  const terminatingThrough = requestedTermination
  const pending = workerPromise
  const instance = workerInstance
  // Clear the cache before awaiting termination. If a new scan starts while an
  // old worker is shutting down, it receives a new worker generation.
  workerPromise = null
  workerInstance = null
  workerGeneration = null

  try {
    const worker = instance ?? (pending ? await pending.catch(() => null) : null)
    if (worker) await worker.terminate()
  } catch {
    /* termination is best-effort; the cache has already been invalidated */
  } finally {
    completedTermination = Math.max(completedTermination, terminatingThrough)
    terminationInFlight = false
    resolveTerminationWaiters()
    // A second request may have arrived while the first worker was stopping.
    if (requestedTermination > completedTermination) void drainTermination()
  }
}

/**
 * Frees the shared worker once every globally queued/in-flight scan has settled.
 * Calls are coalesced, and the returned promise resolves after the corresponding
 * worker generation is actually stopped.
 */
export function terminateOcr(): Promise<void> {
  const version = ++requestedTermination
  const completion = new Promise<void>((resolve) => {
    terminationWaiters.push({ version, resolve })
  })
  void drainTermination()
  return completion
}

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'] as const
const ACCEPTED_EXTENSIONS = /\.(?:jpe?g|png|webp|bmp)$/i
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export interface FileValidation {
  ok: boolean
  error: string | null
}

export function validateReceiptFile(file: File): FileValidation {
  const type = file.type.trim().toLowerCase()
  const acceptedMime = (ACCEPTED_TYPES as readonly string[]).includes(type)
  // Some Android camera/document providers supply a valid image with an empty
  // MIME type. In that case only, use the conservative supported extension list.
  const acceptedMissingMime = type === '' && ACCEPTED_EXTENSIONS.test(file.name.trim())
  if (!acceptedMime && !acceptedMissingMime) {
    const seen = type || 'unknown type'
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
