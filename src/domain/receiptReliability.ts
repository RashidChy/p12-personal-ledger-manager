/** Pure scoring used to decide when a second, enhanced OCR pass is worthwhile. */
import type { ParsedReceipt, FieldExtraction } from './receiptParse'

export type ReceiptScanMode = 'standard' | 'enhanced'

export interface ReceiptScanCandidate {
  mode: ReceiptScanMode
  text: string
  engineConfidence: number
  durationMs: number
  parsed: ParsedReceipt
}

export type ReceiptScanField = 'merchant' | 'date' | 'amount'

export interface ReceiptScanDisagreement {
  field: ReceiptScanField
  /** Stable display values from the OCR passes; amount values use taka decimals. */
  values: string[]
}

function fieldPoints<T>(field: FieldExtraction<T>, weight: number): number {
  if (field.value === null) return 0
  return weight * (0.4 + 0.6 * Math.max(0, Math.min(1, field.confidence)))
}

/** A 0-100 score that favours complete, explainable fields over raw OCR confidence. */
export function receiptScanScore(candidate: ReceiptScanCandidate): number {
  const { parsed } = candidate
  const text = candidate.text.trim()
  const linePoints = parsed.lines.length >= 8 ? 8 : parsed.lines.length >= 3 ? 5 : parsed.lines.length > 0 ? 2 : 0
  const enginePoints = Math.max(0, Math.min(100, candidate.engineConfidence)) * 0.12
  const score =
    fieldPoints(parsed.merchant, 20) +
    fieldPoints(parsed.date, 25) +
    fieldPoints(parsed.amount, 35) +
    linePoints +
    enginePoints -
    (text.length < 12 ? 12 : 0)
  return Math.max(0, Math.min(100, score))
}

/** Run the slower contrast-enhanced pass only when the first pass contains doubt. */
export function needsEnhancedReceiptPass(candidate: ReceiptScanCandidate): boolean {
  const required = [candidate.parsed.merchant, candidate.parsed.date, candidate.parsed.amount]
  return (
    candidate.engineConfidence < 72 ||
    candidate.parsed.lines.length < 3 ||
    required.some((field) => field.value === null || field.needsReview) ||
    receiptScanScore(candidate) < 82
  )
}

/** Stable tie-breaking keeps the standard pass unless enhancement is measurably better. */
export function chooseBestReceiptScan(candidates: readonly ReceiptScanCandidate[]): ReceiptScanCandidate {
  if (candidates.length === 0) throw new Error('At least one receipt scan candidate is required.')
  return candidates.reduce((best, candidate) =>
    receiptScanScore(candidate) > receiptScanScore(best) + 0.5 ? candidate : best,
  )
}

function distinct(values: Array<string | null>): string[] {
  const byKey = new Map<string, string>()
  for (const value of values) {
    if (value === null) continue
    const cleaned = value.trim()
    if (!cleaned) continue
    const key = cleaned.toLocaleLowerCase('en')
    if (!byKey.has(key)) byKey.set(key, cleaned)
  }
  return [...byKey.values()]
}

/** Finds fields for which two successful OCR passes produced different values. */
export function receiptScanDisagreements(
  candidates: readonly ReceiptScanCandidate[],
): ReceiptScanDisagreement[] {
  const fields: Array<[ReceiptScanField, string[]]> = [
    ['merchant', distinct(candidates.map((candidate) => candidate.parsed.merchant.value))],
    ['date', distinct(candidates.map((candidate) => candidate.parsed.date.value))],
    [
      'amount',
      distinct(
        candidates.map((candidate) =>
          candidate.parsed.amount.value === null
            ? null
            : (candidate.parsed.amount.value / 100).toFixed(2),
        ),
      ),
    ],
  ]
  return fields
    .filter(([, values]) => values.length > 1)
    .map(([field, values]) => ({ field, values }))
}

/**
 * Keeps the strongest whole OCR pass, but never hides a conflicting value from
 * another pass. Disputed fields are lowered to review confidence and date/
 * amount alternatives from every pass remain available to the user.
 */
export function reconcileReceiptScans(
  candidates: readonly ReceiptScanCandidate[],
): ReceiptScanCandidate {
  const selected = chooseBestReceiptScan(candidates)
  const ordered = [selected, ...candidates.filter((candidate) => candidate !== selected)]
  const disagreements = receiptScanDisagreements(candidates)
  const disputed = new Map(disagreements.map((item) => [item.field, item.values]))

  const withReview = <T>(
    field: ReceiptScanField,
    extraction: FieldExtraction<T>,
  ): FieldExtraction<T> => {
    const values = disputed.get(field)
    if (!values) return extraction
    return {
      ...extraction,
      confidence: Math.min(extraction.confidence, 0.55),
      needsReview: true,
      reason: `${extraction.reason} The OCR passes disagreed (${values.join(' / ')}), so the image must decide.`,
    }
  }

  const amountCandidates = ordered
    .flatMap((candidate) => candidate.parsed.amountCandidates)
    .filter((candidate, index, all) =>
      all.findIndex((other) => other.amountPaisa === candidate.amountPaisa) === index,
    )
  const dateCandidates = ordered
    .flatMap((candidate) => [candidate.parsed.date.value, ...candidate.parsed.dateCandidates])
    .filter((date): date is NonNullable<typeof date> => date !== null)
    .filter((date, index, all) => all.indexOf(date) === index)

  return {
    ...selected,
    parsed: {
      ...selected.parsed,
      merchant: withReview('merchant', selected.parsed.merchant),
      date: withReview('date', selected.parsed.date),
      amount: withReview('amount', selected.parsed.amount),
      amountCandidates,
      dateCandidates,
      warnings: [
        ...selected.parsed.warnings,
        ...disagreements.map(
          ({ field, values }) =>
            `OCR passes disagreed on ${field}: ${values.join(' / ')}. Check the receipt image before saving.`,
        ),
      ],
    },
  }
}
