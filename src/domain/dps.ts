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
import { roundHalfUp, type Paisa } from './money'

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
  const months = Math.max(0, Math.floor(params.months))
  const monthlyRatePercent = annualRatePercent / 12

  let balance = openingBalancePaisa
  const schedule: DpsMonthRow[] = []
  for (let m = 1; m <= months; m += 1) {
    const opening = balance
    balance += monthlyDepositPaisa
    const interest = roundHalfUp((balance * annualRatePercent) / 12 / 100)
    balance += interest
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
