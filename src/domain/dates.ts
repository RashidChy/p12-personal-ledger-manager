/**
 * Calendar helpers. Every date in this app is an ISO calendar day string
 * ("2026-04-17") and every month is a month key ("2026-04"). All arithmetic is
 * done on the string parts so a browser timezone can never shift a day.
 */

export type IsoDate = string // YYYY-MM-DD
export type MonthKey = string // YYYY-MM

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false
  const m = ISO_DATE_RE.exec(value)
  if (!m) return false
  const [, y, mo, d] = m
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(`${y}-${mo}`)
}

export function isMonthKey(value: unknown): value is MonthKey {
  if (typeof value !== 'string') return false
  const m = MONTH_KEY_RE.exec(value)
  if (!m) return false
  const month = Number(m[2])
  return month >= 1 && month <= 12
}

export function monthOf(date: IsoDate): MonthKey {
  return date.slice(0, 7)
}

export function dayOfMonth(date: IsoDate): number {
  return Number(date.slice(8, 10))
}

export function yearOf(month: MonthKey): number {
  return Number(month.slice(0, 4))
}

export function monthNumber(month: MonthKey): number {
  return Number(month.slice(5, 7))
}

export function daysInMonth(month: MonthKey): number {
  const y = yearOf(month)
  const m = monthNumber(month)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Adds (or subtracts) whole months, rolling the year over correctly. */
export function addMonths(month: MonthKey, delta: number): MonthKey {
  const total = yearOf(month) * 12 + (monthNumber(month) - 1) + delta
  const y = Math.floor(total / 12)
  const m = total - y * 12 + 1
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
}

export function previousMonth(month: MonthKey): MonthKey {
  return addMonths(month, -1)
}

/** Negative when a is before b, positive when after, 0 when equal. */
export function compareMonths(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthLabel(month: MonthKey): string {
  return `${MONTH_NAMES[monthNumber(month) - 1]} ${yearOf(month)}`
}

export function shortMonthName(month: MonthKey): string {
  return MONTH_NAMES[monthNumber(month) - 1].slice(0, 3)
}

/** "17 Apr 2026" - the format used across the UI. */
export function formatIsoDate(date: IsoDate): string {
  return `${dayOfMonth(date)} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1].slice(0, 3)} ${date.slice(0, 4)}`
}

export function isoDateFrom(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function lastDayOfMonth(month: MonthKey): IsoDate {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
}

/** Today in the browser's local calendar, as an ISO day string. */
export function todayIso(now: Date = new Date()): IsoDate {
  return isoDateFrom(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
