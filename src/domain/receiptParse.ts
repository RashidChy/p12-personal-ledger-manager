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

const TOTAL_KEYWORDS = /\b(grand\s*total|net\s*payable|net\s*amount|net\s*total|total\s*payable|total\s*due|amount\s*due|amount\s*payable|bill\s*total|total\s*amount|payable|total)\b/i
const STRONG_TOTAL = /\b(grand\s*total|net\s*payable|net\s*amount|net\s*total|total\s*payable|total\s*due|amount\s*due|amount\s*payable|bill\s*total)\b/i
const NEGATIVE_KEYWORDS = /\b(sub\s*-?\s*total|vat|tax|s\.?d\.?|discount|change|cash|tendered|received|card|balance|round(?:ing)?\s*off|service\s*charge|qty|rate|unit|mrp|point|due\s*balance|previous)\b/i
const DATE_HINT = /\b(date|dated|invoice\s*date|bill\s*date|time)\b/i

const NON_MERCHANT_LINE =
  /\b(receipt|invoice|cash\s*memo|bill\s*no|memo\s*no|vat|bin\b|tin\b|mushak|tel|phone|mobile|hotline|thank|welcome|customer|copy|order\s*no|table|cashier|token|www\.|http|@|gst|helpline)\b/i

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
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/[Zz]/g, '2')
}

// Note: only a comma groups thousands. A space is never treated as a group
// separator, otherwise "Item B 340.00" would read as one 8,340.00 amount.
const MONEY_TOKEN =
  /(?:৳|tk\.?|bdt|taka|rs\.?)?\s*(-?\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)\s*(?:৳|tk\.?|bdt|taka)?/gi

export function extractAmountsFromLine(line: string): Paisa[] {
  const out: Paisa[] = []
  // Repair OCR digit look-alikes, but only inside whitespace-delimited tokens
  // that are made up entirely of digits, separators and confusable letters -
  // so "1,2S0.O0" is repaired while the "B" of "Item B" is left alone.
  const prepared = line
    .split(/(\s+)/)
    .map((token) =>
      /^[\d,.-]*[OolI|SsBZz][\dOolI|SsBZz,.-]*$/.test(token) && /\d/.test(token)
        ? normaliseNumericToken(token)
        : token,
    )
    .join('')
  // Dates, times, phone and invoice numbers are not money. Mask them first so
  // "12/04/2026" never surfaces as a 2,026 taka candidate.
  const masked = prepared
    .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?/gi, ' ')
    .replace(/\b\d{3,}[-\s]\d{3,}\b/g, ' ')
    .replace(/\b\d{7,}\b/g, ' ')
    // Quantities with a unit suffix ("100g", "5kg", "10s", "1L") are item
    // sizes, not prices.
    .replace(/\b\d+(?:\.\d+)?\s*(?:kgs?|gms?|g|mg|ml|ltr|l|pcs?|pkt|s)\b/gi, ' ')

  MONEY_TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MONEY_TOKEN.exec(masked)) !== null) {
    const raw = match[1]
    if (!raw) continue
    const cleaned = raw.replace(/[\s,]/g, '')
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) continue
    const numeric = Number(cleaned)
    if (!Number.isFinite(numeric) || numeric <= 0) continue
    // A bare integer with no decimals and no currency context that is short is
    // more likely a quantity or an item code than money; keep it but it will
    // score low.
    out.push(parseTakaToPaisa(cleaned))
  }
  return out
}

function scoreLine(line: string): { score: number; label: string } {
  const strong = STRONG_TOTAL.test(line)
  const total = TOTAL_KEYWORDS.test(line)
  const negative = NEGATIVE_KEYWORDS.test(line)
  if (strong && !negative) return { score: 100, label: 'labelled grand/net total' }
  if (strong && negative) return { score: 60, label: 'total line with other keywords' }
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
  for (const line of lines) {
    const amounts = extractAmountsFromLine(line)
    if (amounts.length === 0) continue
    const { score, label } = scoreLine(line)
    // On a labelled total line the payable figure is the last number on the line.
    const chosen = score >= 60 ? amounts[amounts.length - 1] : Math.max(...amounts)
    candidates.push({ amountPaisa: chosen, line: line.trim(), score, label })
    for (const amount of amounts) {
      if (amount !== chosen) candidates.push({ amountPaisa: amount, line: line.trim(), score: Math.max(1, score - 15), label: `${label} (other value on line)` })
    }
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
  const distinct = new Set(candidates.map((c) => c.amountPaisa))
  if (distinct.size > 1) {
    warnings.push(
      `${distinct.size} monetary values were found on this receipt; the highest-confidence total was selected. Check it against the image.`,
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
    candidates: dedupeCandidates(candidates).slice(0, 8),
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

export function extractDatesFromText(text: string): Array<{ date: IsoDate; ambiguous: boolean; source: string }> {
  const found: Array<{ date: IsoDate; ambiguous: boolean; source: string }> = []
  const push = (y: number, m: number, d: number, ambiguous: boolean, source: string) => {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2200) return
    const iso = isoDateFrom(y, m, d)
    if (isIsoDate(iso)) found.push({ date: iso, ambiguous, source })
  }

  for (const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), false, m[0])
  }
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const a = Number(m[1])
    const b = Number(m[2])
    const year = normaliseYear(m[3])
    if (a > 12 && b <= 12) push(year, b, a, false, m[0]) // unambiguous day-first
    else if (b > 12 && a <= 12) push(year, a, b, false, m[0]) // unambiguous month-first
    else push(year, b, a, true, m[0]) // ambiguous: Bangladesh convention is day-first
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s*[-.\s]\s*([A-Za-z]{3,9})\.?,?\s*(\d{2,4})\b/g)) {
    const month = MONTH_WORDS[m[2].slice(0, 4).toLowerCase()] ?? MONTH_WORDS[m[2].slice(0, 3).toLowerCase()]
    if (month) push(normaliseYear(m[3]), month, Number(m[1]), false, m[0])
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{2,4})\b/g)) {
    const month = MONTH_WORDS[m[1].slice(0, 4).toLowerCase()] ?? MONTH_WORDS[m[1].slice(0, 3).toLowerCase()]
    if (month) push(normaliseYear(m[3]), month, Number(m[2]), false, m[0])
  }
  return found
}

export function parseDate(
  lines: string[],
  referenceDate: IsoDate,
): { field: FieldExtraction<IsoDate>; candidates: IsoDate[]; warnings: string[] } {
  const warnings: string[] = []
  const hits: Array<{ date: IsoDate; ambiguous: boolean; hinted: boolean }> = []
  for (const line of lines) {
    const hinted = DATE_HINT.test(line)
    for (const d of extractDatesFromText(line)) hits.push({ date: d.date, ambiguous: d.ambiguous, hinted })
  }

  if (hits.length === 0) {
    warnings.push('No date could be read from the receipt. The forecast date is used as a starting point - please correct it.')
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

  const notFuture = hits.filter((h) => h.date <= referenceDate)
  const pool = notFuture.length > 0 ? notFuture : hits
  if (notFuture.length === 0) {
    warnings.push('Every date found on the receipt is after the forecast date. Please confirm the date.')
  }
  // Prefer a date on a line that mentioned "date", then the most recent one.
  pool.sort((a, b) => Number(b.hinted) - Number(a.hinted) || b.date.localeCompare(a.date))
  const best = pool[0]

  let confidence = best.hinted ? 0.9 : 0.75
  let reason = best.hinted
    ? 'Read from a line labelled as the receipt date.'
    : 'Read from a date pattern in the receipt text.'
  if (best.ambiguous) {
    confidence = Math.min(confidence, 0.6)
    reason += ' The day/month order was ambiguous, so the Bangladeshi day-first convention was assumed.'
    warnings.push('The date format was ambiguous (day/month order). Confirm the date before saving.')
  }
  if (notFuture.length === 0) confidence = Math.min(confidence, 0.4)
  const distinct = new Set(pool.map((h) => h.date))
  if (distinct.size > 1) {
    confidence = Math.min(confidence, 0.65)
    reason += ` ${distinct.size} dates were found; the most likely one was selected.`
  }

  return {
    field: { value: best.date, confidence, reason, needsReview: confidence < REVIEW_THRESHOLD },
    candidates: [...distinct],
    warnings,
  }
}

export function parseMerchant(lines: string[]): { field: FieldExtraction<string>; warnings: string[] } {
  const warnings: string[] = []
  const joined = lines.join('\n')
  const known = KNOWN_MERCHANTS.find((m) => new RegExp(`\\b${escapeRegExp(m)}\\b`, 'i').test(joined))
  if (known) {
    return {
      field: {
        value: known,
        confidence: 0.95,
        reason: `Matched a known merchant name ("${known}") in the receipt text.`,
        needsReview: false,
      },
      warnings,
    }
  }

  const header = lines.slice(0, 6)
  const candidate = header.find((line) => {
    const t = line.trim()
    if (t.length < 3 || t.length > 48) return false
    if (NON_MERCHANT_LINE.test(t)) return false
    const letters = t.replace(/[^A-Za-z]/g, '').length
    if (letters < 3) return false
    // Mostly-digit lines are receipt numbers or totals, not the shop name.
    return letters / t.length > 0.5
  })

  if (!candidate) {
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

  const cleaned = candidate.trim().replace(/\s{2,}/g, ' ').replace(/[.,;:*|-]+$/, '')
  const index = header.indexOf(candidate)
  const confidence = index === 0 ? 0.7 : 0.55
  if (confidence < REVIEW_THRESHOLD) {
    warnings.push('The merchant name was guessed from the receipt header. Please check it.')
  }
  return {
    field: {
      value: cleaned,
      confidence,
      reason:
        index === 0
          ? 'Taken from the first line of the receipt, which is usually the shop name.'
          : `Taken from line ${index + 1} of the receipt header.`,
      needsReview: confidence < REVIEW_THRESHOLD,
    },
    warnings,
  }
}

export function suggestCategory(merchant: string | null, text: string): { category: Category; reason: string } {
  const haystack = `${merchant ?? ''}\n${text}`
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(haystack)) {
      return { category: rule.category, reason: `Matched ${rule.why}.` }
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
