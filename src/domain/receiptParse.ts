/**
 * Receipt text parsing.
 *
 * This module takes the raw text that Tesseract produced on the user's device
 * and works out the likely merchant, date and total. It is deliberately pure
 * and string-in/object-out so the heuristics can be tested without a browser
 * or an image, and so the UI can show *why* each field was chosen and how
 * confident the parse is. Every field remains fully editable by the user.
 */
import { isIsoDate, isoDateFrom, type IsoDate } from './dates'
import { parseTakaToPaisa, type Paisa } from './money'
import type { Category } from './types'

export interface FieldExtraction<T> {
  value: T | null
  /** 0-1. Below REVIEW_THRESHOLD the UI flags the field for review. */
  confidence: number
  /** Short human explanation of how the value was chosen. */
  reason: string
  needsReview: boolean
}

export interface AmountCandidate {
  amountPaisa: Paisa
  line: string
  /** Higher means the line looked more like a payable total. */
  score: number
  label: string
}

export interface ParsedReceipt {
  merchant: FieldExtraction<string>
  date: FieldExtraction<IsoDate>
  amount: FieldExtraction<Paisa>
  suggestedCategory: Category
  categoryReason: string
  amountCandidates: AmountCandidate[]
  dateCandidates: IsoDate[]
  warnings: string[]
  lines: string[]
}

export const REVIEW_THRESHOLD = 0.7

const TOTAL_KEYWORDS = /\b(grand\s*total|net\s*payable|net\s*amount|net\s*total|total\s*payable|total\s*due|amount\s*due|amount\s*payable|balance\s*due|bill\s*total|total\s*amount|payable|total|amount)\b/i
const STRONG_TOTAL = /\b(grand\s*total|net\s*payable|net\s*amount|net\s*total|total\s*payable|total\s*due|amount\s*due|amount\s*payable|balance\s*due|bill\s*total)\b/i
const COUNT_LABEL = /\b(?:total\s+(?:items?|qty|quantity|pieces?|pcs)|(?:items?|qty|quantity)\s+total|item\s+count)\b/i
const NEGATIVE_KEYWORDS = /\b(sub\s*-?\s*total|vat|tax|s\.?d\.?|discount|change|cash|tendered|received|card|balance|round(?:ing)?\s*off|service\s*charge|qty|rate|unit|mrp|point|due\s*balance|previous)\b/i
const FINAL_ADJUSTED_TOTAL = /\b(?:total|payable|amount)\b.*\b(?:after|less|including|includes?|incl\.?|with)\b.*\b(?:discount|coupon|voucher|vat|tax)\b/i
const DATE_HINT = /\b(date|dated|invoice\s*date|bill\s*date|transaction\s*date|purchase\s*date)\b/i
const NON_TRANSACTION_DATE_HINT = /\b(due|expiry|expires?|exp\.?|mfg\.?|manufactur(?:ed|ing)?|best\s*before|valid\s*(?:until|through)|dob)\b/i

const NON_MERCHANT_LINE =
  /\b(receipt|invoice|cash\s*memo|bill\s*no|memo\s*no|vat|bin\b|tin\b|mushak|tel|phone|mobile|hotline|thank|welcome|customer|copy|order\s*no|table|cashier|token|www\.|http|@|gst|helpline|reprint)\b/i
const PAYMENT_CONTEXT = /\b(paid|payment|pay\s*by|tender(?:ed)?|method|cash|card)\b/i
const ADDRESS_CONTEXT = /\b(branch|road|rd\.?|street|avenue|house|level|floor|block|sector|dhaka|chattogram|sylhet|mirpur|dhanmondi|gulshan|uttara)\b/i

/** Merchants that appear in the official fixture, used to boost confidence. */
export const KNOWN_MERCHANTS = [
  'Meena Bazar', 'Shwapno', 'Agora', 'Unimart', 'Landlord', 'DESCO', 'Dhaka WASA', 'Titas Gas',
  'Udemy', 'Bookworm', 'Madchef', 'Panda Garden', 'Star Kabab', 'Sultans Dine', 'Chillox',
  'Uber', 'Pathao', 'CNG', 'BRTC bus', 'Lazz Pharma', 'Popular Diagnostic', 'GP recharge',
  'Robi recharge', 'bKash', 'Netflix', 'Star Cineplex', 'Steam', 'Aarong', 'Yellow', 'Cats Eye',
] as const

const CATEGORY_RULES: ReadonlyArray<{ pattern: RegExp; category: Category; why: string }> = [
  { pattern: /meena\s*bazar|shwapno|agora|unimart|grocer|super\s*shop|bazar|mart/i, category: 'Groceries', why: 'supermarket / grocery merchant' },
  { pattern: /landlord|rent|house\s*rent/i, category: 'Rent', why: 'rent merchant' },
  { pattern: /desco|wasa|titas|gas|electric|water|utility|palli\s*bidyut|dpdc/i, category: 'Utilities', why: 'utility provider' },
  { pattern: /udemy|bookworm|coursera|school|college|university|book|tuition|course/i, category: 'Education', why: 'education merchant' },
  { pattern: /madchef|panda|kabab|sultan|chillox|restaurant|cafe|coffee|pizza|burger|kfc|food|dine/i, category: 'Food', why: 'restaurant / food merchant' },
  { pattern: /uber|pathao|cng|brtc|bus|rail|ticket|fuel|petrol|octane|taxi|transport/i, category: 'Transport', why: 'transport merchant' },
  { pattern: /pharma|pharmacy|diagnostic|hospital|clinic|doctor|medicine|lab\b|health/i, category: 'Health', why: 'health merchant' },
  { pattern: /gp\s*recharge|robi|banglalink|airtel|teletalk|recharge|mobile|sim|internet|broadband/i, category: 'Mobile', why: 'mobile / connectivity merchant' },
  { pattern: /netflix|cineplex|steam|cinema|movie|game|spotify|entertain/i, category: 'Entertainment', why: 'entertainment merchant' },
  { pattern: /aarong|yellow|cats\s*eye|fashion|clothing|apparel|garment|shoe|textile/i, category: 'Clothing', why: 'clothing merchant' },
  { pattern: /bkash|nagad|rocket|transfer|send\s*money/i, category: 'Other', why: 'mobile financial service' },
]

/** Fixes the digit look-alikes Tesseract commonly produces inside numbers. */
export function normaliseNumericToken(token: string): string {
  return token
    .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/[Zz]/g, '2')
}

/** Repairs OCR look-alikes only in runs that contain at least one real digit. */
function normaliseNumericRuns(value: string): string {
  return value.replace(/[0-9০-৯OolI|SsBZz]+(?:[.,'’/:-][0-9০-৯OolI|SsBZz]+)*/g, (token) =>
    /[\d০-৯]/.test(token) ? normaliseNumericToken(token) : token,
  )
}

/** Makes common OCR mistakes in labels searchable without altering the raw text. */
function normaliseLabelText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bt[0o]ta[l1i|]\b/g, 'total')
    .replace(/\bpayab[l1i|]e\b/g, 'payable')
    .replace(/\bam[0o]unt\b/g, 'amount')
    .replace(/\bgr[a4]nd\b/g, 'grand')
}

// Spaces are intentionally not treated as thousands separators: otherwise
// "Item B 340.00" can collapse into an invented 8,340.00 value.
const MONEY_TOKEN =
  /(?:৳|tk\.?|bdt|taka|rs\.?)?\s*(-?\d[\d.,'’]*)(?:\s*\/-)?\s*(?:৳|tk\.?|bdt|taka)?/gi

interface AmountMatch {
  amountPaisa: Paisa
  start: number
  end: number
}

/** Accepts 1,341.25, 1.341,25, 1341,25 and common "/-" receipt notation. */
function normaliseMoneyNumber(raw: string): string | null {
  let token = raw.replace(/[\s'’]/g, '').replace(/^[.,]+|[.,]+$/g, '')
  if (!token) return null
  const negative = token.startsWith('-')
  if (negative) token = token.slice(1)
  if (!/^\d[\d.,]*$/.test(token)) return null

  const lastComma = token.lastIndexOf(',')
  const lastDot = token.lastIndexOf('.')
  const separator = Math.max(lastComma, lastDot)
  let integer = token
  let decimal = ''
  if (separator >= 0) {
    const digitsAfter = token.length - separator - 1
    const hasBoth = lastComma >= 0 && lastDot >= 0
    const sameSeparatorCount = [...token].filter((c) => c === token[separator]).length
    const isDecimal = digitsAfter > 0 && digitsAfter <= 2
    if (isDecimal) {
      integer = token.slice(0, separator).replace(/[.,]/g, '')
      decimal = token.slice(separator + 1)
    } else if (hasBoth || sameSeparatorCount > 1 || digitsAfter === 3) {
      integer = token.replace(/[.,]/g, '')
    } else {
      return null
    }
  }
  if (!/^\d+$/.test(integer) || (decimal && !/^\d{1,2}$/.test(decimal))) return null
  return `${negative ? '-' : ''}${integer}${decimal ? `.${decimal}` : ''}`
}

function blankToken(token: string): string {
  return ' '.repeat(token.length)
}

/**
 * Removes product descriptors before OCR look-alikes such as `s -> 5` are
 * repaired. Otherwise `14s`, `10s` and `D3` can become invented amounts
 * 145, 105 and 3 in the alternatives list.
 */
function maskNonMoneyProductTokens(line: string): string {
  let masked = line
  if (!TOTAL_KEYWORDS.test(normaliseLabelText(line))) {
    masked = masked.replace(
      /\b[0-9০-৯OolI|SsBZz]+(?:[.,][0-9০-৯OolI|SsBZz]+)?\s*(?:kgs?|gms?|g|mg|ml|ltr|l|pcs?|pkt|s)\b/gi,
      blankToken,
    )
  }
  return masked.replace(/\b[A-Za-z]+\d+(?=\s|$|[^0-9.,])/g, (token, offset: number) => {
    // Do not mask the fractional OCR token in `1,2S0.O0` or a joined
    // currency prefix such as `BDT125` / `Tk500`.
    if (offset > 0 && /[0-9.,]/.test(masked[offset - 1])) return token
    if (/^(?:bdt|tk|taka|rs)\d/i.test(token)) return token
    return blankToken(token)
  })
}

function extractAmountMatchesFromLine(line: string): { prepared: string; matches: AmountMatch[] } {
  const prepared = normaliseNumericRuns(maskNonMoneyProductTokens(line))
  // Dates, times, percentages, phones and reference numbers are not money.
  const masked = prepared
    .replace(
      /\b((?:total\s+(?:items?|qty|quantity|pieces?|pcs)|(?:items?|qty|quantity)\s+total|item\s+count)\s*[:#-]?\s*)(\d+(?:[.,]\d+)?)/gi,
      (_whole, label: string, count: string) => `${label}${blankToken(count)}`,
    )
    .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}\s+\d{1,2}\s+\d{4}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(/\b\d{3,}[-\s]\d{3,}\b/g, ' ')
    .replace(/\b\d{7,}\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:kgs?|gms?|g|mg|ml|ltr|l|pcs?|pkt|s)\b/gi, ' ')
    .replace(/\b(?:bill|memo|invoice|order|token|table|ref|receipt|no|#)\s*(?:no\.?|#|:)?\s*\d+/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*[x*]\s*/gi, ' ')

  // Plain numbers in an address (for example "Mirpur 10, Dhaka") are not
  // useful monetary alternatives unless the line explicitly says total or
  // carries a currency marker.
  if (
    ADDRESS_CONTEXT.test(line)
    && !TOTAL_KEYWORDS.test(normaliseLabelText(line))
    && !/৳|\btk\b|\bbdt\b|\btaka\b|\brs\.?\b/i.test(line)
  ) {
    return { prepared: masked, matches: [] }
  }

  const matches: AmountMatch[] = []
  MONEY_TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MONEY_TOKEN.exec(masked)) !== null) {
    const raw = match[1]
    if (!raw) continue
    const cleaned = normaliseMoneyNumber(raw)
    if (cleaned === null) continue
    const numeric = Number(cleaned)
    if (!Number.isFinite(numeric) || numeric <= 0) continue
    try {
      matches.push({ amountPaisa: parseTakaToPaisa(cleaned), start: match.index, end: MONEY_TOKEN.lastIndex })
    } catch {
      // A wildly large OCR artefact is not a useful amount candidate.
    }
  }
  return { prepared: masked, matches }
}

export function extractAmountsFromLine(line: string): Paisa[] {
  return extractAmountMatchesFromLine(line).matches.map((match) => match.amountPaisa)
}

function scoreLine(line: string): { score: number; label: string } {
  // "TOTAL ITEMS 3" is a count label, not evidence that 3 is payable.
  const searchable = normaliseLabelText(line).replace(COUNT_LABEL, ' ')
  const strong = STRONG_TOTAL.test(searchable)
  const total = TOTAL_KEYWORDS.test(searchable)
  const adjustedFinal = FINAL_ADJUSTED_TOTAL.test(searchable)
  const negative = NEGATIVE_KEYWORDS.test(searchable) && !adjustedFinal
  if (strong && !negative) return { score: 100, label: 'labelled grand/net total' }
  if (strong && negative) return { score: 85, label: 'strong total line with adjustment wording' }
  if (total && adjustedFinal) return { score: 90, label: 'total after an adjustment / including tax' }
  if (total && !negative) return { score: 70, label: 'labelled total' }
  if (total && negative) return { score: 30, label: 'total line mixed with subtotal/VAT wording' }
  if (negative) return { score: 5, label: 'subtotal / VAT / change line' }
  if (/৳|\btk\b|\bbdt\b|taka/i.test(line)) return { score: 20, label: 'currency-marked amount' }
  return { score: 10, label: 'unlabelled amount' }
}

export function parseAmount(lines: string[]): {
  field: FieldExtraction<Paisa>
  candidates: AmountCandidate[]
  warnings: string[]
} {
  const warnings: string[] = []
  const candidates: AmountCandidate[] = []
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const { prepared, matches } = extractAmountMatchesFromLine(line)
    if (matches.length === 0) continue
    const overall = scoreLine(line)
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : ''
    const previousLabel = scoreLine(previousLine)
    const labelIsOnPreviousLine =
      overall.score <= 20 && previousLabel.score >= 70 && extractAmountsFromLine(previousLine).length === 0

    matches.forEach((match, matchIndex) => {
      const clauseStart = matchIndex === 0 ? 0 : matches[matchIndex - 1].end
      const clause = prepared.slice(clauseStart, match.end)
      let scored = scoreLine(clause)
      if (scored.score <= 20 && overall.score >= 70) {
        scored = matchIndex === matches.length - 1
          ? overall
          : { score: Math.max(20, overall.score - 15), label: `${overall.label} (earlier value on line)` }
      }
      let shownLine = line.trim()
      if (labelIsOnPreviousLine) {
        scored = previousLabel
        shownLine = `${previousLine.trim()} / ${shownLine}`
      }
      candidates.push({ amountPaisa: match.amountPaisa, line: shownLine, score: scored.score, label: scored.label })
    })
  }

  if (candidates.length === 0) {
    return {
      field: {
        value: null,
        confidence: 0,
        reason: 'No monetary value could be read from the receipt text.',
        needsReview: true,
      },
      candidates,
      warnings: ['No amount found. Enter the amount manually or retry with a clearer photo.'],
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.amountPaisa - a.amountPaisa)
  const best = candidates[0]
  // Report the number the user can actually see in the candidate list, so the
  // warning and the "use this instead" chips always agree.
  const listed = dedupeCandidates(candidates).slice(0, 8)
  if (listed.length > 1) {
    warnings.push(
      `${listed.length} different monetary values were found on this receipt; the highest-confidence total was selected. Check it against the image.`,
    )
  }

  let confidence: number
  let reason: string
  if (best.score >= 100) {
    confidence = 0.95
    reason = `Taken from a line labelled as the grand/net total: "${best.line}".`
  } else if (best.score >= 70) {
    confidence = 0.85
    reason = `Taken from a line labelled "total": "${best.line}".`
  } else if (best.score >= 20) {
    confidence = 0.55
    reason = `No total label was found; the largest currency-marked value was used: "${best.line}".`
  } else {
    confidence = 0.35
    reason = `No total label was found; the largest value on the receipt was used: "${best.line}".`
  }
  // Several equally-plausible totals should lower confidence, not hide the doubt.
  const topScore = best.score
  const tied = candidates.filter((c) => c.score === topScore && c.amountPaisa !== best.amountPaisa)
  if (tied.length > 0) {
    confidence = Math.min(confidence, 0.5)
    reason += ' Another value on the receipt scored equally, so please confirm.'
  }

  return {
    field: { value: best.amountPaisa, confidence, reason, needsReview: confidence < REVIEW_THRESHOLD },
    candidates: listed,
    warnings,
  }
}

function dedupeCandidates(candidates: AmountCandidate[]): AmountCandidate[] {
  const seen = new Set<number>()
  const out: AmountCandidate[] = []
  for (const c of candidates) {
    if (seen.has(c.amountPaisa)) continue
    seen.add(c.amountPaisa)
    out.push(c)
  }
  return out
}

const MONTH_WORDS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function normaliseYear(raw: string): number {
  const n = Number(raw)
  if (raw.length === 4) return n
  return n >= 70 ? 1900 + n : 2000 + n
}

export interface ExtractedDate {
  date: IsoDate
  ambiguous: boolean
  source: string
  index: number
}

export function extractDatesFromText(text: string, options: { allowSpaced?: boolean } = {}): ExtractedDate[] {
  const prepared = normaliseNumericRuns(text)
  const found: ExtractedDate[] = []
  const push = (y: number, m: number, d: number, ambiguous: boolean, source: string, index: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2200) return
    const iso = isoDateFrom(y, m, d)
    if (isIsoDate(iso)) found.push({ date: iso, ambiguous, source, index })
  }

  for (const m of prepared.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), false, m[0], m.index)
  }
  for (const m of prepared.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const a = Number(m[1])
    const b = Number(m[2])
    const year = normaliseYear(m[3])
    if (a > 12 && b <= 12) push(year, b, a, false, m[0], m.index) // unambiguous day-first
    else if (b > 12 && a <= 12) push(year, a, b, false, m[0], m.index) // unambiguous month-first
    else push(year, b, a, true, m[0], m.index) // ambiguous: Bangladesh convention is day-first
  }
  for (const m of prepared.matchAll(/\b(\d{1,2})\s*[-./\s]\s*([A-Za-z]{3,9})\.?\s*[-,./]?\s*(\d{2,4})\b/g)) {
    const month = MONTH_WORDS[m[2].slice(0, 4).toLowerCase()] ?? MONTH_WORDS[m[2].slice(0, 3).toLowerCase()]
    if (month) push(normaliseYear(m[3]), month, Number(m[1]), false, m[0], m.index)
  }
  for (const m of prepared.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{2,4})\b/g)) {
    const month = MONTH_WORDS[m[1].slice(0, 4).toLowerCase()] ?? MONTH_WORDS[m[1].slice(0, 3).toLowerCase()]
    if (month) push(normaliseYear(m[3]), month, Number(m[2]), false, m[0], m.index)
  }
  for (const m of prepared.matchAll(/\b(\d{4})\s*[-.\s]\s*([A-Za-z]{3,9})\.?\s*[-,./\s]\s*(\d{1,2})\b/g)) {
    const month = MONTH_WORDS[m[2].slice(0, 4).toLowerCase()] ?? MONTH_WORDS[m[2].slice(0, 3).toLowerCase()]
    if (month) push(Number(m[1]), month, Number(m[3]), false, m[0], m.index)
  }
  if (options.allowSpaced) {
    for (const m of prepared.matchAll(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})\b/g)) {
      const a = Number(m[1])
      const b = Number(m[2])
      const year = normaliseYear(m[3])
      if (a > 12 && b <= 12) push(year, b, a, false, m[0], m.index)
      else if (b > 12 && a <= 12) push(year, a, b, false, m[0], m.index)
      else push(year, b, a, true, m[0], m.index)
    }
  }
  return found
}

export function parseDate(
  lines: string[],
  referenceDate: IsoDate,
): { field: FieldExtraction<IsoDate>; candidates: IsoDate[]; warnings: string[] } {
  const warnings: string[] = []
  const hits: Array<{ date: IsoDate; ambiguous: boolean; hinted: boolean; nonTransaction: boolean }> = []
  for (const line of lines) {
    const lineHasDateHint = DATE_HINT.test(line)
    for (const d of extractDatesFromText(line, { allowSpaced: lineHasDateHint })) {
      const localPrefix = line.slice(Math.max(0, d.index - 32), d.index)
      hits.push({
        date: d.date,
        ambiguous: d.ambiguous,
        hinted: DATE_HINT.test(localPrefix),
        nonTransaction: NON_TRANSACTION_DATE_HINT.test(localPrefix),
      })
    }
  }

  if (hits.length === 0) {
    warnings.push('No date could be read from the receipt. Enter the transaction date before saving.')
    return {
      field: {
        value: null,
        confidence: 0,
        reason: 'No date pattern was found in the receipt text.',
        needsReview: true,
      },
      candidates: [],
      warnings,
    }
  }

  const allFuture = hits.every((h) => h.date > referenceDate)
  if (allFuture) {
    warnings.push('Every date found on the receipt is after the scan date. Please confirm the date.')
  }
  // Meaning matters more than chronology: an invoice date should beat a due,
  // expiry or manufacture date even when the latter is newer.
  const rank = (hit: (typeof hits)[number]) =>
    (hit.hinted ? 30 : 0) - (hit.nonTransaction ? 80 : 0) - (hit.date > referenceDate ? 15 : 0)
  hits.sort((a, b) => rank(b) - rank(a) || b.date.localeCompare(a.date))
  const best = hits[0]

  let confidence = best.hinted ? 0.9 : 0.75
  let reason = best.hinted
    ? 'Read from a line labelled as the receipt date.'
    : 'Read from a date pattern in the receipt text.'
  if (best.ambiguous) {
    confidence = Math.min(confidence, 0.6)
    reason += ' The day/month order was ambiguous, so the Bangladeshi day-first convention was assumed.'
    warnings.push('The date format was ambiguous (day/month order). Confirm the date before saving.')
  }
  if (best.nonTransaction) {
    confidence = Math.min(confidence, 0.35)
    reason += ' It was labelled as a due, expiry or manufacture date rather than a transaction date.'
    warnings.push('Only a non-transaction date was found. Enter the actual purchase date before saving.')
  }
  if (best.date > referenceDate) {
    confidence = Math.min(confidence, 0.4)
    if (!allFuture) warnings.push('The selected receipt date is after the scan date. Please confirm it.')
  }
  const plausibleDistinct = new Set(hits.filter((h) => !h.nonTransaction).map((h) => h.date))
  if (plausibleDistinct.size > 1) {
    confidence = Math.min(confidence, 0.65)
    reason += ` ${plausibleDistinct.size} plausible transaction dates were found; the most likely one was selected.`
  }
  const distinct = new Set(hits.map((h) => h.date))

  return {
    field: { value: best.date, confidence, reason, needsReview: confidence < REVIEW_THRESHOLD },
    candidates: [...distinct],
    warnings,
  }
}

function merchantWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1|]/g, 'l')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !/^(?:ltd|limited|branch|outlet|store)$/.test(word))
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      )
    }
    for (let j = 0; j < current.length; j += 1) previous[j] = current[j]
  }
  return previous[b.length]
}

function findApproximateKnownMerchant(header: string[]): (typeof KNOWN_MERCHANTS)[number] | null {
  let best: { merchant: (typeof KNOWN_MERCHANTS)[number]; distance: number } | null = null
  for (const line of header) {
    if (PAYMENT_CONTEXT.test(line) || NON_MERCHANT_LINE.test(line)) continue
    const words = merchantWords(line)
    if (words.length === 0) continue
    for (const merchant of KNOWN_MERCHANTS) {
      const knownWords = merchantWords(merchant)
      const known = knownWords.join('')
      const candidates = [words.join(''), words.slice(0, knownWords.length).join('')]
      for (const candidate of candidates) {
        if (!candidate || Math.abs(candidate.length - known.length) > 2) continue
        const distance = editDistance(candidate, known)
        const allowed = Math.max(1, Math.floor(known.length * 0.18))
        if (distance <= allowed && (!best || distance < best.distance)) best = { merchant, distance }
      }
    }
  }
  return best?.merchant ?? null
}

export function parseMerchant(lines: string[]): { field: FieldExtraction<string>; warnings: string[] } {
  const warnings: string[] = []
  const header = lines.slice(0, 8)
  const exactKnown = KNOWN_MERCHANTS.find((merchant) =>
    header.some((line) => !PAYMENT_CONTEXT.test(line) && new RegExp(`\\b${escapeRegExp(merchant)}\\b`, 'i').test(line)),
  )
  if (exactKnown) {
    return {
      field: {
        value: exactKnown,
        confidence: 0.95,
        reason: `Matched a known merchant name ("${exactKnown}") in the receipt header.`,
        needsReview: false,
      },
      warnings,
    }
  }

  const approximateKnown = findApproximateKnownMerchant(header)
  if (approximateKnown) {
    warnings.push(`The merchant looked like "${approximateKnown}", but the OCR spelling was imperfect. Please confirm it.`)
    return {
      field: {
        value: approximateKnown,
        confidence: 0.68,
        reason: `Matched an OCR-tolerant spelling of the known merchant "${approximateKnown}" in the receipt header.`,
        needsReview: true,
      },
      warnings,
    }
  }

  const candidates = header.flatMap((line, index) => {
    const t = line.trim()
    if (t.length < 3 || t.length > 48) return []
    if (NON_MERCHANT_LINE.test(t) || PAYMENT_CONTEXT.test(t)) return []
    const letters = t.replace(/[^A-Za-z]/g, '').length
    if (letters < 3 || letters / t.length <= 0.5) return []
    let score = 30 - index * 3
    if (index === 0) score += 8
    if (ADDRESS_CONTEXT.test(t)) score -= 20
    if (/^[A-Z][A-Z\s&.'-]+$/.test(t)) score += 4
    if (/\b(?:ltd\.?|limited|restaurant|cafe|store|shop|bazar|mart|pharma(?:cy)?)\b/i.test(t)) score += 4
    return [{ line, index, score }]
  })
  candidates.sort((a, b) => b.score - a.score || a.index - b.index)
  const candidate = candidates[0]

  if (!candidate || candidate.score < 15) {
    warnings.push('No merchant name could be identified. Enter the shop name manually.')
    return {
      field: {
        value: null,
        confidence: 0,
        reason: 'No line in the receipt header looked like a shop name.',
        needsReview: true,
      },
      warnings,
    }
  }

  const cleaned = candidate.line.trim().replace(/\s{2,}/g, ' ').replace(/[.,;:*|-]+$/, '')
  const confidence = candidate.index === 0 && candidate.score >= 38 ? 0.65 : 0.5
  if (confidence < REVIEW_THRESHOLD) {
    warnings.push('The merchant name was guessed from the receipt header. Please check it.')
  }
  return {
    field: {
      value: cleaned,
      confidence,
      reason:
        candidate.index === 0
          ? 'Taken from the first line of the receipt, which is usually the shop name.'
          : `Taken from line ${candidate.index + 1} of the receipt header.`,
      needsReview: confidence < REVIEW_THRESHOLD,
    },
    warnings,
  }
}

export function suggestCategory(merchant: string | null, text: string): { category: Category; reason: string } {
  if (merchant) {
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(merchant)) {
        return { category: rule.category, reason: `Matched ${rule.why} from the merchant name.` }
      }
    }
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      return { category: rule.category, reason: `Matched ${rule.why} in the receipt text.` }
    }
  }
  return { category: 'Other', reason: 'No category rule matched; defaulted to Other.' }
}

export function parseReceiptText(rawText: string, referenceDate: IsoDate): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, '').replace(/^\s+/, ''))
    .filter((l) => l.length > 0)

  const merchant = parseMerchant(lines)
  const date = parseDate(lines, referenceDate)
  const amount = parseAmount(lines)
  const category = suggestCategory(merchant.field.value, rawText)

  const warnings = [...merchant.warnings, ...date.warnings, ...amount.warnings]
  if (lines.length < 3) {
    warnings.unshift('Very little text was recognised. The photo may be blurred, dark or cropped - try again or enter the expense manually.')
  }

  return {
    merchant: merchant.field,
    date: date.field,
    amount: amount.field,
    suggestedCategory: category.category,
    categoryReason: category.reason,
    amountCandidates: amount.candidates,
    dateCandidates: date.candidates,
    warnings,
    lines,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
