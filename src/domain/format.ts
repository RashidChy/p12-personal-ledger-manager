/**
 * Bangladeshi taka formatting. Amounts are grouped with the standard
 * en-BD/en-IN style separators used locally, e.g. ৳12,500 and ৳1,45,000.
 */
import { paisaToTaka, type Paisa } from './money'

const TAKA = '৳'

function groupBd(intPart: string): string {
  // South Asian grouping: last three digits, then pairs.
  if (intPart.length <= 3) return intPart
  const head = intPart.slice(0, -3)
  const tail = intPart.slice(-3)
  return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail
}

export interface CurrencyOptions {
  /** Show paisa. Default: only when the amount is not a whole taka. */
  decimals?: 0 | 2 | 'auto'
  /** Prefix positive values with "+". Useful for month-on-month deltas. */
  signed?: boolean
}

/** Formats paisa as taka, e.g. 1250000 -> "৳12,500". */
export function formatTaka(paisa: Paisa | null | undefined, options: CurrencyOptions = {}): string {
  if (paisa === null || paisa === undefined || !Number.isFinite(paisa)) return '—'
  const { decimals = 'auto', signed = false } = options
  const negative = paisa < 0
  const abs = Math.abs(paisa)
  const showDecimals = decimals === 2 || (decimals === 'auto' && abs % 100 !== 0)
  const taka = paisaToTaka(abs)
  const fixed = showDecimals ? taka.toFixed(2) : String(Math.round(taka))
  const [int, frac] = fixed.split('.')
  const body = groupBd(int) + (frac ? `.${frac}` : '')
  const sign = negative ? '-' : signed ? '+' : ''
  return `${sign}${TAKA}${body}`
}

/** Formats a fractional-paisa forecast value. Rounds only here, never upstream. */
export function formatTakaFromFloatPaisa(value: number | null | undefined, options: CurrencyOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return formatTaka(Math.round(value), options)
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function formatSignedPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

/** "2 days", "1 day" - used by the forecast panel. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
