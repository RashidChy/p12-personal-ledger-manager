/**
 * Transparent baseline month-end forecast.
 *
 *   daily run rate            = spending to date / elapsed days
 *   expected additional spend = daily run rate * remaining days
 *   expected month-end spend  = spending to date + expected additional spend
 *   forecast month-end balance= salary - expected month-end spending
 *
 * Intermediate values are kept as fractional paisa (floats) and are never
 * rounded; rounding happens only when a value is formatted for display.
 * A month that has already finished relative to the forecast date is reported
 * as actual spending, not projected.
 */
import {
  compareMonths,
  dayOfMonth,
  daysInMonth,
  monthOf,
  type IsoDate,
  type MonthKey,
} from './dates'
import type { Paisa } from './money'
import { expensesForMonth, salaryForMonth, totalSpent } from './ledger'
import type { Expense, LedgerState } from './types'

export type ForecastStatus =
  /** The forecast month is over: the total is actual, nothing is projected. */
  | 'completed'
  /** The month is in progress and there is enough data to project. */
  | 'projected'
  /** The month is in progress but nothing has been spent yet. */
  | 'no-spending-yet'
  /** The month has not started relative to the forecast date. */
  | 'future-month'

export interface ForecastResult {
  month: MonthKey
  /** The "forecast as of" date every figure below is calculated from. */
  referenceDate: IsoDate
  status: ForecastStatus
  daysInMonth: number
  elapsedDays: number
  remainingDays: number
  spentToDatePaisa: Paisa
  /** Fractional paisa per day. Null when no days have elapsed. */
  dailyRunRatePaisa: number | null
  /** Fractional paisa. Null when a run rate cannot be calculated. */
  expectedAdditionalPaisa: number | null
  /** Fractional paisa. Equals spentToDate for a completed month. */
  expectedMonthEndSpendingPaisa: number | null
  salaryPaisa: Paisa | null
  /** salary - expected month-end spending. Null when salary is unknown. */
  forecastMonthEndBalancePaisa: number | null
  /** Positive shortfall in fractional paisa when the forecast exceeds salary. */
  forecastShortfallPaisa: number | null
  /** True when the forecast expects to end the month over salary. */
  projectedOverspend: boolean
  /** Human explanation when a figure cannot be produced. */
  insufficientDataReason: string | null
  /** Formula strings shown in the methodology panel. */
  assumptions: string[]
}

/** Elapsed days of `month` as at `referenceDate` (whole days, 1-based). */
export function elapsedDaysInMonth(month: MonthKey, referenceDate: IsoDate): number {
  const refMonth = monthOf(referenceDate)
  const cmp = compareMonths(refMonth, month)
  if (cmp > 0) return daysInMonth(month) // month already finished
  if (cmp < 0) return 0 // month has not started
  return dayOfMonth(referenceDate)
}

export function forecastMonth(
  state: Pick<LedgerState, 'salaryPaisa' | 'salaryByMonth' | 'expenses'>,
  month: MonthKey,
  referenceDate: IsoDate,
): ForecastResult {
  const monthExpenses: Expense[] = expensesForMonth(state.expenses, month)
  const spentToDatePaisa = totalSpent(monthExpenses)
  const salaryPaisa = salaryForMonth(state, month)
  const totalDays = daysInMonth(month)
  const elapsedDays = elapsedDaysInMonth(month, referenceDate)
  const remainingDays = totalDays - elapsedDays
  const monthIsOver = compareMonths(monthOf(referenceDate), month) > 0
  const monthNotStarted = compareMonths(monthOf(referenceDate), month) < 0

  const base = {
    month,
    referenceDate,
    daysInMonth: totalDays,
    elapsedDays,
    remainingDays,
    spentToDatePaisa,
    salaryPaisa,
    assumptions: buildAssumptions(month, referenceDate, monthIsOver),
  }

  if (monthNotStarted) {
    return {
      ...base,
      status: 'future-month',
      dailyRunRatePaisa: null,
      expectedAdditionalPaisa: null,
      expectedMonthEndSpendingPaisa: null,
      forecastMonthEndBalancePaisa: null,
      forecastShortfallPaisa: null,
      projectedOverspend: false,
      insufficientDataReason: `${month} starts after the forecast date ${referenceDate}, so there is no spending history to project from.`,
    }
  }

  if (monthIsOver) {
    // Completed month: the actual total is the final total. Nothing is projected.
    const expectedMonthEndSpendingPaisa = spentToDatePaisa
    const balance = salaryPaisa === null ? null : salaryPaisa - expectedMonthEndSpendingPaisa
    return {
      ...base,
      status: 'completed',
      dailyRunRatePaisa: elapsedDays > 0 ? spentToDatePaisa / elapsedDays : null,
      expectedAdditionalPaisa: 0,
      expectedMonthEndSpendingPaisa,
      forecastMonthEndBalancePaisa: balance,
      forecastShortfallPaisa: balance !== null && balance < 0 ? -balance : null,
      projectedOverspend: balance !== null && balance < 0,
      insufficientDataReason: null,
    }
  }

  if (spentToDatePaisa === 0) {
    return {
      ...base,
      status: 'no-spending-yet',
      dailyRunRatePaisa: elapsedDays > 0 ? 0 : null,
      expectedAdditionalPaisa: null,
      expectedMonthEndSpendingPaisa: null,
      forecastMonthEndBalancePaisa: null,
      forecastShortfallPaisa: null,
      projectedOverspend: false,
      insufficientDataReason:
        monthExpenses.length === 0
          ? `No expenses are recorded for ${month} yet, so a run rate cannot be calculated. Add an expense (or scan a receipt) to see a forecast.`
          : `Recorded expenses for ${month} total ৳0, so a meaningful run rate cannot be calculated.`,
    }
  }

  const dailyRunRatePaisa = spentToDatePaisa / elapsedDays
  const expectedAdditionalPaisa = dailyRunRatePaisa * remainingDays
  const expectedMonthEndSpendingPaisa = spentToDatePaisa + expectedAdditionalPaisa
  const forecastMonthEndBalancePaisa =
    salaryPaisa === null ? null : salaryPaisa - expectedMonthEndSpendingPaisa

  return {
    ...base,
    status: 'projected',
    dailyRunRatePaisa,
    expectedAdditionalPaisa,
    expectedMonthEndSpendingPaisa,
    forecastMonthEndBalancePaisa,
    forecastShortfallPaisa:
      forecastMonthEndBalancePaisa !== null && forecastMonthEndBalancePaisa < 0
        ? -forecastMonthEndBalancePaisa
        : null,
    projectedOverspend: forecastMonthEndBalancePaisa !== null && forecastMonthEndBalancePaisa < 0,
    insufficientDataReason:
      salaryPaisa === null
        ? `Spending is projected, but no salary is set for ${month}, so a month-end balance cannot be calculated.`
        : null,
  }
}

function buildAssumptions(month: MonthKey, referenceDate: IsoDate, monthIsOver: boolean): string[] {
  if (monthIsOver) {
    return [
      `${month} is already complete as at the forecast date ${referenceDate}.`,
      'Actual recorded spending is used as the month-end total; no additional days are projected.',
      'Forecast month-end balance = salary − actual spending.',
    ]
  }
  return [
    `Forecast date ("as of"): ${referenceDate}. Elapsed days include the forecast date itself.`,
    'Daily run rate = spending to date ÷ elapsed days.',
    'Expected additional spending = daily run rate × remaining days.',
    'Expected month-end spending = spending to date + expected additional spending.',
    'Forecast month-end balance = salary − expected month-end spending.',
    'Spending is assumed to continue at the same average daily pace; no seasonality, no scheduled bills, no salary changes.',
    'Intermediate values are not rounded; only displayed figures are.',
  ]
}

/** Forecast disposable amount used by the savings affordability rule. */
export function forecastDisposablePaisa(forecast: ForecastResult): number | null {
  if (forecast.forecastMonthEndBalancePaisa === null) return null
  return Math.max(0, forecast.forecastMonthEndBalancePaisa)
}
