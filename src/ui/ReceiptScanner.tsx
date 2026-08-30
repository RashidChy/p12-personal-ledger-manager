/**
 * Receipt scanner: select or drop an image, validate it, preview it, run OCR on
 * this device, parse the merchant / date / total, show confidence, let the user
 * correct every field, and save only on explicit confirmation.
 *
 * The image never leaves the browser: Tesseract.js runs in a web worker with the
 * WASM engine and English model served from this app's own /ocr/ directory.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatIsoDate, type IsoDate, type MonthKey } from '../domain/dates'
import { formatTaka } from '../domain/format'
import { parseTakaToPaisa } from '../domain/money'
import { REVIEW_THRESHOLD, parseReceiptText, type ParsedReceipt } from '../domain/receiptParse'
import type { Expense } from '../domain/types'
import {
  MAX_FILE_BYTES,
  recognizeReceipt,
  terminateOcr,
  validateReceiptFile,
  type OcrProgress,
} from '../ocr/ocrEngine'
import { newId } from '../store/useLedger'
import { Badge, Notice } from './common'
import { ExpenseFields, validateDraft, type DraftErrors, type ExpenseDraft } from './ExpenseForm'

type Phase = 'idle' | 'scanning' | 'review' | 'failed'

const SAMPLES = [
  { file: 'meena-bazar.png', label: 'Supermarket receipt' },
  { file: 'sultans-dine.png', label: 'Restaurant bill' },
  { file: 'blurred.png', label: 'Hard-to-read receipt' },
]

export function ReceiptScanner({
  referenceDate,
  month,
  onSave,
}: {
  referenceDate: IsoDate
  month: MonthKey
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
  const lastFile = useRef<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  // Release the OCR worker (and its WASM memory) when the scanner unmounts.
  useEffect(() => () => {
    void terminateOcr()
  }, [])

  const reset = useCallback(
    (keepMessage = false) => {
      setPhase('idle')
      setParsed(null)
      setDraft(null)
      setErrors({})
      setProgress(null)
      setOcrError(null)
      setRawText('')
      setEngineConfidence(null)
      setDurationMs(null)
      if (!keepMessage) setSaved(null)
      setPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url)
        return null
      })
      setFileName(null)
      lastFile.current = null
      if (inputRef.current) inputRef.current.value = ''
    },
    [],
  )

  const runOcr = useCallback(
    async (file: File) => {
      setPhase('scanning')
      setOcrError(null)
      setSaved(null)
      setProgress({ status: 'starting', progress: 0, label: 'Starting the on-device OCR engine' })
      try {
        const result = await recognizeReceipt(file, (p) => setProgress(p))
        setRawText(result.text)
        setEngineConfidence(result.confidence)
        setDurationMs(result.durationMs)
        const parsedReceipt = parseReceiptText(result.text, referenceDate)
        setParsed(parsedReceipt)
        setDraft({
          date: parsedReceipt.date.value ?? '',
          category: parsedReceipt.suggestedCategory,
          shop: parsedReceipt.merchant.value ?? '',
          amount: parsedReceipt.amount.value === null ? '' : (parsedReceipt.amount.value / 100).toFixed(2),
        })
        setPhase('review')
      } catch (error) {
        setOcrError(
          error instanceof Error
            ? `The receipt could not be read (${error.message}). This can happen if the OCR engine failed to load. Retry, or enter the expense manually.`
            : 'The receipt could not be read. Retry, or enter the expense manually.',
        )
        setPhase('failed')
      }
    },
    [referenceDate],
  )

  const acceptFile = useCallback(
    (file: File) => {
      const validation = validateReceiptFile(file)
      if (!validation.ok) {
        setFileError(validation.error)
        setPhase('idle')
        return
      }
      setFileError(null)
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
      setFileError(null)
      try {
        const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')
        const response = await fetch(`${base}/sample-receipts/${sample}`)
        if (!response.ok) throw new Error(`sample not found (${response.status})`)
        const blob = await response.blob()
        acceptFile(new File([blob], sample, { type: blob.type || 'image/png' }))
      } catch (error) {
        setFileError(
          `The sample receipt could not be loaded (${error instanceof Error ? error.message : 'unknown error'}). Upload your own image instead.`,
        )
      }
    },
    [acceptFile],
  )

  const startManualEntry = () => {
    setDraft({ date: `${month}-01`, category: 'Food', shop: '', amount: '' })
    setParsed(null)
    setPhase('review')
  }

  const handleSave = () => {
    if (!draft) return
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
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
      <Notice tone="positive" title="Private by design.">
        The photo stays on this device. Text recognition runs in your browser with Tesseract.js (WebAssembly); the
        engine and English model are served from this app itself. No image, and no extracted text, is uploaded
        anywhere - you can disconnect from the network and the scanner still works.
      </Notice>

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
            <span className="small muted">or choose a file from this device</span>
            <label className="visually-hidden" htmlFor="receipt-input">
              Receipt image
            </label>
            <input
              ref={inputRef}
              id="receipt-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp"
              style={{ maxWidth: 320 }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) acceptFile(file)
              }}
            />
            <div className="chips">
              {SAMPLES.map((sample) => (
                <button key={sample.file} type="button" className="small" onClick={() => void loadSample(sample.file)}>
                  Try sample: {sample.label}
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
              <h2 id="extract-title">
                {phase === 'scanning' ? 'Reading the receipt' : phase === 'failed' ? 'Scan failed' : 'Review and correct'}
              </h2>
              {engineConfidence !== null ? (
                <Badge tone={engineConfidence >= 70 ? 'positive' : engineConfidence >= 45 ? 'warning' : 'critical'}>
                  OCR confidence {engineConfidence.toFixed(0)}%
                </Badge>
              ) : null}
            </div>

            {phase === 'scanning' ? (
              <div className="stack-sm" aria-live="polite">
                <p className="small">{progress?.label ?? 'Working…'}</p>
                <div className="progress-track">
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
                {parsed ? <ExtractionSummary parsed={parsed} durationMs={durationMs} /> : null}
                {!parsed ? (
                  <Notice tone="info" title="Manual entry.">
                    Nothing was scanned, so fill in the details yourself.
                  </Notice>
                ) : null}

                <ExpenseFields
                  draft={draft}
                  errors={errors}
                  idPrefix="receipt"
                  onChange={(next) => {
                    setDraft(next)
                    if (Object.keys(errors).length > 0) setErrors(validateDraft(next))
                  }}
                />

                {parsed && parsed.amountCandidates.length > 1 ? (
                  <div className="field">
                    <span className="label">Other amounts found on this receipt</span>
                    <div className="chips">
                      {parsed.amountCandidates.map((c) => (
                        <button
                          key={`${c.amountPaisa}-${c.label}`}
                          type="button"
                          className="small"
                          onClick={() => setDraft({ ...draft, amount: (c.amountPaisa / 100).toFixed(2) })}
                          title={c.line}
                        >
                          Use {formatTaka(c.amountPaisa)}
                          <span className="visually-hidden"> from line: {c.line}</span>
                        </button>
                      ))}
                    </div>
                    <span className="hint">Tap one to use it instead. Hover or focus to see the line it came from.</span>
                  </div>
                ) : null}

                <div className="form-actions">
                  <button type="button" className="primary" onClick={handleSave}>
                    Save expense
                  </button>
                  <button
                    type="button"
                    onClick={() => lastFile.current && void runOcr(lastFile.current)}
                    disabled={!lastFile.current}
                  >
                    Re-scan image
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
