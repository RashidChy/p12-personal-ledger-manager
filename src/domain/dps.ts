/**
 * DPS (Deposit Pension Scheme) projection.
 *
 * The official P12 fixture states the rule to use:
 *
 *   "Annual rate as stated. Each month: balance = balance + deposit, then
 *    interest = balance x rate / 12 / 100 rounded half up to the paisa and
 *    added to the balance (interest joins the balance, so later months earn
 *    on it)."
 *
 * So this is a monthly-compounded annuity *due* (deposit first, interest on the
 * post-deposit balance), with the interest rounded half up to the paisa each
 * month. That per-month rounding is why the schedule is computed month by month
 * instead of via a closed-form annuity formula.
 *
 * The rate is an illustrative assumption, not a quoted market product.
 */
import { isValidPaisa, roundHalfUp, type Paisa } from './money'

/**
 * Hard safety limit for an item projection and its month-by-month DPS rows.
 * Fifty years is far beyond a normal savings pocket while keeping malformed or
 * tiny contributions from allocating millions of schedule entries in the UI.
 */
export const MAX_DPS_PROJECTION_MONTHS = 600

export interface DpsMonthRow {
  month: number
  openingPaisa: Paisa
  depositPaisa: Paisa
  interestPaisa: Paisa
  closingPaisa: Paisa
}

export interface DpsProjection {
  months: number
  annualRatePercent: number
  monthlyRatePercent: number
  openingBalancePaisa: Paisa
  monthlyDepositPaisa: Paisa
  /** Opening balance + every deposit made. */
  totalPrincipalPaisa: Paisa
  /** Total deposits only (excludes the opening balance). */
  totalDepositsPaisa: Paisa
  /** Value at the end of the final month. */
  maturityValuePaisa: Paisa
  /** maturity − principal. */
  estimatedInterestPaisa: Paisa
  schedule: DpsMonthRow[]
  contributionTiming: 'start-of-month (annuity due)'
  formula: string[]
}

export function projectDps(params: {
  openingBalancePaisa: Paisa
  monthlyDepositPaisa: Paisa
  months: number
  annualRatePercent: number
}): DpsProjection {
  const { openingBalancePaisa, monthlyDepositPaisa, annualRatePercent } = params
  if (!isValidPaisa(openingBalancePaisa) || openingBalancePaisa < 0) {
    throw new RangeError('DPS opening balance must be a non-negative, safe whole number of paisa.')
  }
  if (!isValidPaisa(monthlyDepositPaisa) || monthlyDepositPaisa < 0) {
    throw new RangeError('DPS monthly deposit must be a non-negative, safe whole number of paisa.')
  }
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0 || annualRatePercent > 30) {
    throw new RangeError('DPS annual rate must be between 0% and 30%.')
  }
  const requestedMonths = Math.floor(params.months)
  if (!Number.isFinite(requestedMonths)) {
    throw new RangeError('DPS projection months must be a finite number.')
  }
  const months = Math.max(0, requestedMonths)
  if (months > MAX_DPS_PROJECTION_MONTHS) {
    throw new RangeError(
      `DPS projections are limited to ${MAX_DPS_PROJECTION_MONTHS} months (50 years).`,
    )
  }
  const monthlyRatePercent = annualRatePercent / 12

  let balance = openingBalancePaisa
  const schedule: DpsMonthRow[] = []
  for (let m = 1; m <= months; m += 1) {
    const opening = balance
    balance += monthlyDepositPaisa
    if (!Number.isSafeInteger(balance)) {
      throw new RangeError('DPS balance exceeds the safe supported money range.')
    }
    const interest = roundHalfUp((balance * annualRatePercent) / 12 / 100)
    balance += interest
    if (!Number.isSafeInteger(interest) || !Number.isSafeInteger(balance)) {
      throw new RangeError('DPS balance exceeds the safe supported money range.')
    }
    schedule.push({
      month: m,
      openingPaisa: opening,
      depositPaisa: monthlyDepositPaisa,
      interestPaisa: interest,
      closingPaisa: balance,
    })
  }

  const totalDepositsPaisa = monthlyDepositPaisa * months
  const totalPrincipalPaisa = openingBalancePaisa + totalDepositsPaisa
  if (!Number.isSafeInteger(totalDepositsPaisa) || !Number.isSafeInteger(totalPrincipalPaisa)) {
    throw new RangeError('DPS principal exceeds the safe supported money range.')
  }
  return {
    months,
    annualRatePercent,
    monthlyRatePercent,
    openingBalancePaisa,
    monthlyDepositPaisa,
    totalPrincipalPaisa,
    totalDepositsPaisa,
    maturityValuePaisa: balance,
    estimatedInterestPaisa: balance - totalPrincipalPaisa,
    schedule,
    contributionTiming: 'start-of-month (annuity due)',
    formula: [
      `Monthly rate = annual rate ÷ 12 = ${annualRatePercent.toFixed(2)}% ÷ 12 = ${monthlyRatePercent.toFixed(4)}% per month.`,
      'Each month: balance = balance + deposit.',
      'Then: interest = balance × annual rate ÷ 12 ÷ 100, rounded half up to the paisa.',
      'Interest is added to the balance, so later months earn on it (monthly compounding).',
      'Total principal = current saved + (monthly deposit × months).',
      'Estimated return = maturity value − total principal.',
    ],
  }
}
