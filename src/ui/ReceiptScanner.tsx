/**
 * Receipt scanner: select or drop an image, validate it, preview it, run OCR on
 * this device, parse the merchant / date / total, show confidence, let the user
 * correct every field, and save only on explicit confirmation.
 *
 * The image never leaves the browser: Tesseract.js runs in a web worker with the
 * WASM engine and English model served from this app's own /ocr/ directory.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveCategory } from '../domain/categories'
import { formatIsoDate, todayIso, type IsoDate, type MonthKey } from '../domain/dates'
import { formatTaka } from '../domain/format'
import { parseTakaToPaisa } from '../domain/money'
import { REVIEW_THRESHOLD, parseReceiptText, type ParsedReceipt } from '../domain/receiptParse'
import {
  chooseBestReceiptScan,
  needsEnhancedReceiptPass,
  receiptScanDisagreements,
  reconcileReceiptScans,
  type ReceiptScanCandidate,
  type ReceiptScanDisagreement,
  type ReceiptScanMode,
} from '../domain/receiptReliability'
import type { Category, Expense } from '../domain/types'
import {
  MAX_FILE_BYTES,
  recognizeReceipt,
  terminateOcr,
  validateReceiptFile,
  type OcrProgress,
} from '../ocr/ocrEngine'
import { newId } from '../store/useLedger'
import { Badge, Method, Notice } from './common'
import { ExpenseFields, validateDraft, type DraftErrors, type ExpenseDraft } from './ExpenseForm'

type Phase = 'idle' | 'scanning' | 'review' | 'failed'

const SAMPLES = [
  { file: 'meena-bazar.png', label: 'Supermarket receipt' },
  { file: 'sultans-dine.png', label: 'Restaurant bill' },
  { file: 'blurred.png', label: 'Hard-to-read receipt' },
]

export function ReceiptScanner({
  month,
  categories,
  onSave,
}: {
  month: MonthKey
  /** The user's category list; the suggestion is mapped onto it. */
  categories: readonly Category[]
  onSave: (expense: Expense) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [fileError, setFileError] = useState<string | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null)
  const [engineConfidence, setEngineConfidence] = useState<number | null>(null)
  const [rawText, setRawText] = useState('')
  const [draft, setDraft] = useState<ExpenseDraft | null>(null)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [dragging, setDragging] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [scanMode, setScanMode] = useState<ReceiptScanMode | null>(null)
  const [scanPasses, setScanPasses] = useState(0)
  const [scanDisagreements, setScanDisagreements] = useState<ReceiptScanDisagreement[]>([])
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [loadingSample, setLoadingSample] = useState<string | null>(null)
  const lastFile = useRef<File | null>(null)
  const bestScan = useRef<ReceiptScanCandidate | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  // Every scan owns a monotonically increasing token. Resetting, cancelling or
  // starting another scan invalidates the old token, so a late worker result can
  // never reopen the review form after the user has left the scan.
  const ocrRunId = useRef(0)
  const sampleRunId = useRef(0)
  const sampleAbort = useRef<AbortController | null>(null)
  const activeOcrAbort = useRef<AbortController | null>(null)

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  // Release the OCR worker (and its WASM memory) when the scanner unmounts.
  useEffect(() => () => {
    ocrRunId.current += 1
    sampleRunId.current += 1
    sampleAbort.current?.abort()
    activeOcrAbort.current?.abort()
    void terminateOcr()
  }, [])

  useEffect(() => {
    if (phase === 'review' || phase === 'failed') resultHeadingRef.current?.focus()
  }, [phase])

  const reset = useCallback(
    (keepMessage = false) => {
      ocrRunId.current += 1
      sampleRunId.current += 1
      sampleAbort.current?.abort()
      sampleAbort.current = null
      activeOcrAbort.current?.abort()
      activeOcrAbort.current = null
      void terminateOcr()
      setPhase('idle')
      setParsed(null)
      setDraft(null)
      setErrors({})
      setProgress(null)
      setOcrError(null)
      setRawText('')
      setEngineConfidence(null)
      setDurationMs(null)
      setScanMode(null)
      setScanPasses(0)
      setScanDisagreements([])
      setReviewConfirmed(false)
      setLoadingSample(null)
      if (!keepMessage) setSaved(null)
      setPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url)
        return null
      })
      setFileName(null)
      lastFile.current = null
      bestScan.current = null
      if (inputRef.current) inputRef.current.value = ''
    },
    [],
  )

  const runOcr = useCallback(
    async (file: File, options: { forceEnhanced?: boolean } = {}) => {
      const runId = ++ocrRunId.current
      activeOcrAbort.current?.abort()
      const controller = new AbortController()
      activeOcrAbort.current = controller
      const prior = options.forceEnhanced ? bestScan.current : null
      setPhase('scanning')
      setOcrError(null)
      setSaved(null)
      setParsed(null)
      setDraft(null)
      setErrors({})
      setRawText('')
      setEngineConfidence(null)
      setDurationMs(null)
      setScanMode(null)
      setScanPasses(0)
      setScanDisagreements([])
      setReviewConfirmed(false)
      setProgress({ status: 'starting', progress: 0, label: 'Starting the on-device OCR engine' })
      try {
        const attempts: ReceiptScanCandidate[] = []
        const runPass = async (mode: ReceiptScanMode, start: number, span: number, prefix: string) => {
          const result = await recognizeReceipt(
            file,
            (p) => {
              if (ocrRunId.current !== runId) return
              setProgress({ ...p, progress: Math.min(1, start + p.progress * span), label: `${prefix}: ${p.label}` })
            },
            { mode, signal: controller.signal },
          )
          const candidate: ReceiptScanCandidate = {
            mode,
            text: result.text,
            engineConfidence: result.confidence,
            durationMs: result.durationMs,
            parsed: parseReceiptText(result.text, todayIso()),
          }
          attempts.push(candidate)
          return candidate
        }

        const firstMode: ReceiptScanMode = options.forceEnhanced ? 'enhanced' : 'standard'
        const first = await runPass(firstMode, 0, options.forceEnhanced ? 1 : 0.58, options.forceEnhanced ? 'Enhanced pass' : 'First pass')
        if (ocrRunId.current !== runId) return

        if (!options.forceEnhanced && needsEnhancedReceiptPass(first)) {
          setProgress({
            status: 'enhancing image',
            progress: 0.6,
            label: 'First pass was uncertain — enhancing contrast and checking again',
          })
          await runPass('enhanced', 0.62, 0.38, 'Accuracy pass')
          if (ocrRunId.current !== runId) return
        }

        const eligible = prior ? [prior, ...attempts] : attempts
        const disagreements = receiptScanDisagreements(eligible)
        const selectedBase = chooseBestReceiptScan(eligible)
        const selected = reconcileReceiptScans(eligible)
        // Keep the untouched candidate for a later manual re-scan so an old
        // disagreement warning cannot leak into a new comparison.
        bestScan.current = selectedBase
        const parsedReceipt = selected.parsed
        setRawText(selected.text)
        setEngineConfidence(selected.engineConfidence)
        setDurationMs(attempts.reduce((total, attempt) => total + attempt.durationMs, 0))
        setScanMode(selected.mode)
        setScanPasses(eligible.length)
        setScanDisagreements(disagreements)
        setParsed(parsedReceipt)
        setDraft({
          date: parsedReceipt.date.value ?? '',
          category: resolveCategory(categories, parsedReceipt.suggestedCategory),
          shop: parsedReceipt.merchant.value ?? '',
          amount: parsedReceipt.amount.value === null ? '' : (parsedReceipt.amount.value / 100).toFixed(2),
        })
        setPhase('review')
      } catch (error) {
        // A stale run is intentional and must not show an error or transition
        // back into the scanner after the user cancelled or chose another file.
        if (ocrRunId.current !== runId) return
        setOcrError(describeOcrFailure(error))
        setPhase('failed')
      } finally {
        if (activeOcrAbort.current === controller) activeOcrAbort.current = null
      }
    },
    [categories],
  )

  const acceptFile = useCallback(
    (file: File) => {
      sampleRunId.current += 1
      sampleAbort.current?.abort()
      sampleAbort.current = null
      setLoadingSample(null)
      const validation = validateReceiptFile(file)
      if (!validation.ok) {
        setFileError(validation.error)
        setPhase('idle')
        return
      }
      setFileError(null)
      bestScan.current = null
      lastFile.current = file
      setFileName(file.name)
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(file)
      })
      void runOcr(file)
    },
    [runOcr],
  )

  const loadSample = useCallback(
    async (sample: string) => {
      const requestId = ++sampleRunId.current
      sampleAbort.current?.abort()
      const controller = new AbortController()
      sampleAbort.current = controller
      setFileError(null)
      setLoadingSample(sample)
      try {
        const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')
        const response = await fetch(`${base}/sample-receipts/${sample}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`sample not found (${response.status})`)
        const blob = await response.blob()
        if (sampleRunId.current !== requestId) return
        sampleAbort.current = null
        acceptFile(new File([blob], sample, { type: blob.type || 'image/png' }))
      } catch (error) {
        if (controller.signal.aborted || sampleRunId.current !== requestId) return
        sampleAbort.current = null
        setFileError(
          `The sample receipt could not be loaded (${error instanceof Error ? error.message : 'unknown error'}). Upload your own image instead.`,
        )
      } finally {
        if (sampleRunId.current === requestId) setLoadingSample(null)
      }
    },
    [acceptFile],
  )

  const startManualEntry = () => {
    ocrRunId.current += 1
    sampleRunId.current += 1
    sampleAbort.current?.abort()
    sampleAbort.current = null
    activeOcrAbort.current?.abort()
    activeOcrAbort.current = null
    void terminateOcr()
    setLoadingSample(null)
    setDraft({ date: `${month}-01`, category: resolveCategory(categories, 'Food'), shop: '', amount: '' })
    setParsed(null)
    setRawText('')
    setEngineConfidence(null)
    setDurationMs(null)
    setScanMode(null)
    setScanPasses(0)
    setScanDisagreements([])
    setReviewConfirmed(false)
    setPhase('review')
  }

  const reviewFieldNames = parsed
    ? [
        parsed.merchant.needsReview ? 'merchant' : null,
        parsed.date.needsReview ? 'date' : null,
        parsed.amount.needsReview ? 'amount' : null,
      ].filter((name): name is string => name !== null)
    : []
  const requiresReviewConfirmation =
    parsed !== null && (reviewFieldNames.length > 0 || (engineConfidence !== null && engineConfidence < 72))

  const handleSave = () => {
    if (!draft) return
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (requiresReviewConfirmation && !reviewConfirmed) return
    const corrections = describeCorrections(parsed, draft)
    onSave({
      id: newId('rcpt'),
      date: draft.date as IsoDate,
      category: draft.category,
      shop: draft.shop.trim(),
      amountPaisa: parseTakaToPaisa(draft.amount),
      source: parsed ? 'receipt' : 'manual',
      note: corrections ?? undefined,
    })
    const message = `Saved ${formatTaka(parseTakaToPaisa(draft.amount))} at ${draft.shop.trim()} on ${formatIsoDate(draft.date as IsoDate)}. Every dashboard figure has been updated.`
    reset(true)
    setSaved(message)
  }

  return (
    <div className="stack">
      <Notice tone="positive" title="Processed privately on this device.">
        Your receipt image and its recognised text are never uploaded. Only the expense you approve is saved.
      </Notice>

      <ol className="scan-steps" aria-label="Receipt scan steps">
        <li className={saved ? 'complete' : phase === 'idle' ? 'current' : 'complete'}>
          <span>1</span> Choose photo
        </li>
        <li className={saved ? 'complete' : phase === 'scanning' || phase === 'failed' ? 'current' : phase === 'review' ? 'complete' : ''}>
          <span>2</span> Read receipt
        </li>
        <li className={saved ? 'complete' : phase === 'review' ? 'current' : ''}>
          <span>3</span> Review &amp; save
        </li>
      </ol>

      {saved ? (
        <Notice tone="positive" onDismiss={() => setSaved(null)}>
          {saved}
        </Notice>
      ) : null}

      {fileError ? (
        <Notice tone="critical" title="That file cannot be scanned.">
          {fileError}
        </Notice>
      ) : null}

      {phase === 'idle' ? (
        <section className="card" aria-labelledby="scan-title">
          <div className="card-title">
            <h2 id="scan-title">Scan a receipt</h2>
            <span className="tiny muted">JPEG, PNG, WebP or BMP · up to {MAX_FILE_BYTES / 1024 / 1024} MB</span>
          </div>
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) acceptFile(file)
            }}
          >
            <span className="dropzone-icon" aria-hidden="true">🧾</span>
            <strong>Drop a photo of a bill or receipt here</strong>
            <span className="small muted">Keep the whole receipt in frame, flatten it, and avoid glare or deep shadows.</span>
            <label className="visually-hidden" htmlFor="receipt-input">
              Receipt image
            </label>
            <input
              ref={inputRef}
              id="receipt-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp"
              capture="environment"
              style={{ maxWidth: 320 }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) acceptFile(file)
              }}
            />
            <div className="chips">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.file}
                  type="button"
                  className="small"
                  disabled={loadingSample !== null}
                  onClick={() => void loadSample(sample.file)}
                >
                  {loadingSample === sample.file ? 'Loading sample…' : `Try sample: ${sample.label}`}
                </button>
              ))}
            </div>
            <button type="button" className="ghost small" onClick={startManualEntry}>
              No photo? Enter the expense manually →
            </button>
          </div>
        </section>
      ) : null}

      {phase !== 'idle' ? (
        <div className="receipt-layout">
          <section className="card" aria-labelledby="preview-title">
            <div className="card-title">
              <h2 id="preview-title">Uploaded image</h2>
              <button type="button" className="ghost small" onClick={() => reset()}>
                Cancel
              </button>
            </div>
            {previewUrl ? (
              <div className="stack-sm">
                <div className="preview-frame">
                  <img src={previewUrl} alt={`Receipt preview${fileName ? `: ${fileName}` : ''}`} />
                </div>
                <span className="tiny muted">{fileName}</span>
              </div>
            ) : (
              <p className="small muted">Manual entry - no image attached.</p>
            )}
            {rawText ? (
              <details className="method" style={{ marginTop: 12 }}>
                <summary>Recognised text ({rawText.trim().split(/\s+/).length} words)</summary>
                <pre className="ocr-text">{rawText.trim() || '(no text recognised)'}</pre>
              </details>
            ) : null}
          </section>

          <section className="card" aria-labelledby="extract-title">
            <div className="card-title">
              <h2 id="extract-title" ref={resultHeadingRef} tabIndex={-1}>
                {phase === 'scanning' ? 'Reading the receipt' : phase === 'failed' ? 'Scan failed' : 'Review and correct'}
              </h2>
              {engineConfidence !== null ? (
                <Badge tone={engineConfidence >= 80 ? 'positive' : engineConfidence >= 50 ? 'warning' : 'critical'}>
                  Text quality {engineConfidence.toFixed(0)}%
                </Badge>
              ) : null}
            </div>

            {phase === 'scanning' ? (
              <div className="stack-sm" aria-live="polite">
                <p className="small">{progress?.label ?? 'Working…'}</p>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={progress?.label ?? 'Reading receipt'}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((progress?.progress ?? 0) * 100)}
                >
                  <span style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }} />
                </div>
                <p className="tiny muted">
                  {Math.round((progress?.progress ?? 0) * 100)}% · the first scan also loads the local OCR model, so it
                  takes a few seconds longer.
                </p>
                <div>
                  <button type="button" className="ghost small" onClick={() => reset()}>
                    Cancel scan
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'failed' ? (
              <div className="stack-sm">
                <Notice tone="critical" title="OCR failed.">
                  {ocrError}
                </Notice>
                <div className="form-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => lastFile.current && void runOcr(lastFile.current)}
                    disabled={!lastFile.current}
                  >
                    Retry scan
                  </button>
                  <button type="button" onClick={startManualEntry}>
                    Enter manually instead
                  </button>
                  <button type="button" className="ghost" onClick={() => reset()}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'review' && draft ? (
              <div className="stack-sm">
                {!parsed ? (
                  <Notice tone="info" title="Manual entry.">
                    Nothing was scanned, so fill in the details yourself.
                  </Notice>
                ) : null}

                {parsed && (scanPasses > 1 || scanMode === 'enhanced') ? (
                  <Notice tone="info" title={scanMode === 'enhanced' ? 'Enhanced scan selected.' : 'Two-pass check completed.'}>
                    {scanPasses > 1
                      ? 'The first read contained uncertainty, so the app enhanced contrast and checked the receipt again.'
                      : 'This re-scan used contrast enhancement and a receipt-focused text layout.'}{' '}
                    The stronger set of extracted fields is shown below.
                  </Notice>
                ) : null}

                {scanDisagreements.length > 0 ? (
                  <Notice tone="warning" title="The OCR passes disagreed.">
                    {scanDisagreements.map(formatScanDisagreement).join(' ')} Check the receipt image and choose or type the correct value.
                  </Notice>
                ) : null}

                {requiresReviewConfirmation ? (
                  <Notice tone="warning" title="Please verify this uncertain scan result before saving.">
                    {reviewFieldNames.length > 0
                      ? `Check the ${reviewFieldNames.join(', ')} against the receipt image.`
                      : 'The overall text quality was low even though the fields were found.'}{' '}
                    OCR can mistake digits, so use the alternatives below or type the correct value.
                  </Notice>
                ) : null}

                <ExpenseFields
                  draft={draft}
                  errors={errors}
                  categories={categories}
                  idPrefix="receipt"
                  onChange={(next) => {
                    setDraft(next)
                    setReviewConfirmed(false)
                    if (Object.keys(errors).length > 0) setErrors(validateDraft(next))
                  }}
                />

                {parsed ? (
                  <Method summary="View scan confidence and extraction details">
                    <ExtractionSummary parsed={parsed} durationMs={durationMs} />
                  </Method>
                ) : null}

                {parsed && parsed.dateCandidates.length > 1 ? (
                  <div className="field">
                    <span className="label">Dates found on this receipt</span>
                    <div className="candidate-options">
                      {parsed.dateCandidates.map((date) => (
                        <button
                          key={date}
                          type="button"
                          className={draft.date === date ? 'candidate-option selected' : 'candidate-option'}
                          onClick={() => {
                            setDraft({ ...draft, date })
                            setReviewConfirmed(false)
                          }}
                        >
                          <strong>{formatIsoDate(date)}</strong>
                          <span>{draft.date === date ? 'Currently selected' : 'Use this date'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {parsed && parsed.amountCandidates.length > 1 ? (
                  <div className="field">
                    <span className="label">Amounts found on this receipt</span>
                    <div className="candidate-options">
                      {parsed.amountCandidates.map((c) => (
                        <button
                          key={`${c.amountPaisa}-${c.label}`}
                          type="button"
                          className={draft.amount === (c.amountPaisa / 100).toFixed(2) ? 'candidate-option selected' : 'candidate-option'}
                          onClick={() => {
                            setDraft({ ...draft, amount: (c.amountPaisa / 100).toFixed(2) })
                            setReviewConfirmed(false)
                          }}
                        >
                          <strong>{formatTaka(c.amountPaisa)}</strong>
                          <span>{c.label} · “{c.line}”</span>
                        </button>
                      ))}
                    </div>
                    <span className="hint">Choose the value that matches the payable total on the image.</span>
                  </div>
                ) : null}

                {requiresReviewConfirmation ? (
                  <label className="review-confirmation">
                    <input
                      type="checkbox"
                      checked={reviewConfirmed}
                      onChange={(event) => setReviewConfirmed(event.target.checked)}
                    />
                    <span>I checked the flagged fields against the receipt image.</span>
                  </label>
                ) : null}

                <div className="form-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={handleSave}
                    disabled={requiresReviewConfirmation && !reviewConfirmed}
                  >
                    Save expense
                  </button>
                  <button
                    type="button"
                    onClick={() => lastFile.current && void runOcr(lastFile.current, { forceEnhanced: true })}
                    disabled={!lastFile.current}
                  >
                    Enhance &amp; re-scan
                  </button>
                  <button type="button" className="ghost" onClick={() => reset()}>
                    Cancel without saving
                  </button>
                </div>
                <p className="tiny muted">Nothing is stored until you press “Save expense”.</p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ExtractionSummary({ parsed, durationMs }: { parsed: ParsedReceipt; durationMs: number | null }) {
  const fields = [
    { name: 'Merchant', field: parsed.merchant, shown: parsed.merchant.value ?? 'not found' },
    { name: 'Date', field: parsed.date, shown: parsed.date.value ? formatIsoDate(parsed.date.value) : 'not found' },
    {
      name: 'Amount',
      field: parsed.amount,
      shown: parsed.amount.value === null ? 'not found' : formatTaka(parsed.amount.value),
    },
  ]
  const needsReview = fields.filter((f) => f.field.needsReview)

  return (
    <div className="stack-sm">
      <div className="table-scroll">
        <table>
          <caption className="visually-hidden">Extracted fields with confidence and how each was chosen</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Extracted</th>
              <th scope="col">Confidence</th>
              <th scope="col">How it was chosen</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.name}>
                <th scope="row">{f.name}</th>
                <td className="num">{f.shown}</td>
                <td className="num">
                  {f.field.value === null ? (
                    <Badge tone="critical">Missing</Badge>
                  ) : f.field.confidence >= REVIEW_THRESHOLD ? (
                    <Badge tone="positive">{Math.round(f.field.confidence * 100)}%</Badge>
                  ) : (
                    <Badge tone="warning">{Math.round(f.field.confidence * 100)}% · check</Badge>
                  )}
                </td>
                <td className="small muted">{f.field.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {needsReview.length > 0 ? (
        <Notice tone="warning" title={`${needsReview.length} field${needsReview.length === 1 ? '' : 's'} need${needsReview.length === 1 ? 's' : ''} review:`}>
          {needsReview.map((f) => f.name).join(', ')}. Correct anything below before saving.
        </Notice>
      ) : (
        <Notice tone="positive" title="All three fields were read with high confidence.">
          Check them anyway - every field stays editable.
        </Notice>
      )}

      {parsed.warnings.map((warning) => (
        <Notice tone="warning" key={warning}>
          {warning}
        </Notice>
      ))}

      <p className="tiny muted">
        Category suggested from the merchant: {parsed.suggestedCategory}. {parsed.categoryReason}
        {durationMs !== null ? ` Scanned on this device in ${(durationMs / 1000).toFixed(1)}s.` : ''}
      </p>
    </div>
  )
}

function formatScanDisagreement(disagreement: ReceiptScanDisagreement): string {
  const label = disagreement.field[0].toUpperCase() + disagreement.field.slice(1)
  const values = disagreement.values.map((value) => {
    if (disagreement.field === 'amount') return `৳${value}`
    if (disagreement.field === 'date') return formatIsoDate(value as IsoDate)
    return `“${value}”`
  })
  return `${label}: ${values.join(' or ')}.`
}

function describeOcrFailure(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'The scan took too long and was stopped. Crop the photo around the receipt, then retry; you can also enter the expense manually.'
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'The scan was cancelled. Retry when ready, or enter the expense manually.'
  }
  return error instanceof Error
    ? `The receipt could not be read (${error.message}). Retry, or enter the expense manually.`
    : 'The receipt could not be read. Retry, or enter the expense manually.'
}

/** Records which extracted values the user corrected, for the expense note. */
function describeCorrections(parsed: ParsedReceipt | null, draft: ExpenseDraft): string | null {
  if (!parsed) return null
  const changes: string[] = []
  if ((parsed.merchant.value ?? '') !== draft.shop.trim()) {
    changes.push(`merchant "${parsed.merchant.value ?? '(none)'}" → "${draft.shop.trim()}"`)
  }
  if ((parsed.date.value ?? '') !== draft.date) {
    changes.push(`date ${parsed.date.value ?? '(none)'} → ${draft.date}`)
  }
  let draftPaisa: number | null = null
  try {
    draftPaisa = parseTakaToPaisa(draft.amount)
  } catch {
    draftPaisa = null
  }
  if (parsed.amount.value !== draftPaisa) {
    changes.push(
      `amount ${parsed.amount.value === null ? '(none)' : formatTaka(parsed.amount.value)} → ${draftPaisa === null ? '(none)' : formatTaka(draftPaisa)}`,
    )
  }
  if (parsed.suggestedCategory !== draft.category) {
    changes.push(`category ${parsed.suggestedCategory} → ${draft.category}`)
  }
  return changes.length === 0 ? 'Scanned from a receipt; extracted values accepted as read.' : `Scanned from a receipt; corrected ${changes.join(', ')}.`
}
