/**
 * Savings pockets: progress, forecast affordability and the DPS projection.
 *
 * Affordability method (as specified by the problem statement):
 *
 *   forecast disposable amount   = max(0, forecast month-end balance)
 *   effective monthly contribution = min(planned contribution, forecast disposable)
 *   remaining target             = max(0, target − current saved)
 *   months to completion         = ceil(remaining target ÷ effective contribution)
 *
 * When the effective contribution is zero no completion date is invented; the
 * shortfall is explained instead.
 */
import { addMonths, monthLabel, type MonthKey } from './dates'
import { roundHalfUp, type Paisa } from './money'
import { formatTaka, formatTakaFromFloatPaisa } from './format'
import { projectDps, type DpsProjection } from './dps'
import type { Pocket } from './types'

export type PocketStatus =
  | 'target-reached'
  | 'fully-funded'
  | 'partially-funded'
  | 'unfundable'
  | 'forecast-unavailable'
  | 'no-planned-contribution'

export interface PocketProjection {
  pocket: Pocket
  /** 0-100, capped at 100 for display. Null when the target is 0. */
  progressPercent: number | null
  savedPaisa: Paisa
  targetPaisa: Paisa
  remainingTargetPaisa: Paisa
  plannedContributionPaisa: Paisa
  /** Fractional paisa; null when no forecast balance is available. */
  forecastDisposablePaisa: number | null
  /** min(planned, disposable) in fractional paisa; null when unavailable. */
  effectiveContributionPaisa: number | null
  /** The effective contribution rounded to whole paisa, used for the DPS run. */
  effectiveContributionRoundedPaisa: Paisa | null
  /** True when the forecast fully covers the planned contribution. */
  forecastSupportsPlanned: boolean | null
  /** planned − disposable when the forecast falls short, else null. */
  contributionShortfallPaisa: number | null
  monthsToCompletion: number | null
  completionMonth: MonthKey | null
  completionLabel: string | null
  status: PocketStatus
  explanation: string
  dps: DpsProjection | null
}

export function projectPocket(params: {
  pocket: Pocket
  /** Forecast month-end balance in fractional paisa, or null if unknown. */
  forecastMonthEndBalancePaisa: number | null
  /** The month the contributions start in (the selected month). */
  startMonth: MonthKey
  dpsAnnualRatePercent: number
  /** Why the forecast balance is unavailable, for the explanation text. */
  forecastUnavailableReason?: string | null
}): PocketProjection {
  const { pocket, forecastMonthEndBalancePaisa, startMonth, dpsAnnualRatePercent } = params
  const savedPaisa = pocket.savedPaisa
  const targetPaisa = pocket.targetPaisa
  const remainingTargetPaisa = Math.max(0, targetPaisa - savedPaisa)
  const plannedContributionPaisa = pocket.monthlyContributionPaisa
  const progressPercent = targetPaisa === 0 ? null : Math.min(100, (savedPaisa / targetPaisa) * 100)

  const forecastDisposable =
    forecastMonthEndBalancePaisa === null ? null : Math.max(0, forecastMonthEndBalancePaisa)
  const effective =
    forecastDisposable === null ? null : Math.min(plannedContributionPaisa, forecastDisposable)
  const effectiveRounded = effective === null ? null : roundHalfUp(effective)
  const supportsPlanned =
    forecastDisposable === null ? null : forecastDisposable >= plannedContributionPaisa
  const shortfall =
    forecastDisposable === null || supportsPlanned
      ? null
      : plannedContributionPaisa - forecastDisposable

  const base = {
    pocket,
    progressPercent,
    savedPaisa,
    targetPaisa,
    remainingTargetPaisa,
    plannedContributionPaisa,
    forecastDisposablePaisa: forecastDisposable,
    effectiveContributionPaisa: effective,
    effectiveContributionRoundedPaisa: effectiveRounded,
    forecastSupportsPlanned: supportsPlanned,
    contributionShortfallPaisa: shortfall,
  }

  // 1. Already at (or past) the target.
  if (remainingTargetPaisa === 0) {
    return {
      ...base,
      monthsToCompletion: 0,
      completionMonth: null,
      completionLabel: 'Target already reached',
      status: 'target-reached',
      explanation: `This pocket has already reached its target, so no further months are needed. The DPS projection below is not run because no contribution period remains.`,
      dps: null,
    }
  }

  // 2. No forecast available - never assume zero.
  if (forecastDisposable === null || effective === null || effectiveRounded === null) {
    return {
      ...base,
      monthsToCompletion: null,
      completionMonth: null,
      completionLabel: null,
      status: 'forecast-unavailable',
      explanation:
        params.forecastUnavailableReason ??
        'A forecast month-end balance is not available for the selected month, so affordability cannot be assessed. Set a monthly salary and record at least one expense.',
      dps: null,
    }
  }

  // 3. The user planned nothing.
  if (plannedContributionPaisa <= 0) {
    return {
      ...base,
      monthsToCompletion: null,
      completionMonth: null,
      completionLabel: null,
      status: 'no-planned-contribution',
      explanation:
        'No monthly contribution is planned for this pocket, so a completion date cannot be calculated. Set a planned monthly contribution to see a projection.',
      dps: null,
    }
  }

  // 4. The forecast cannot fund it at all.
  if (effective <= 0) {
    return {
      ...base,
      monthsToCompletion: null,
      completionMonth: null,
      completionLabel: null,
      status: 'unfundable',
      explanation: buildUnfundableExplanation(forecastMonthEndBalancePaisa, plannedContributionPaisa),
      dps: null,
    }
  }

  const monthsToCompletion = Math.ceil(remainingTargetPaisa / effective)
  // Contributions start in the selected month, so a 3-month plan starting in
  // April completes in June (start month + months − 1).
  const completionMonth = addMonths(startMonth, monthsToCompletion - 1)
  const dps = projectDps({
    openingBalancePaisa: savedPaisa,
    monthlyDepositPaisa: effectiveRounded,
    months: monthsToCompletion,
    annualRatePercent: dpsAnnualRatePercent,
  })

  return {
    ...base,
    monthsToCompletion,
    completionMonth,
    completionLabel: monthLabel(completionMonth),
    status: supportsPlanned ? 'fully-funded' : 'partially-funded',
    explanation: supportsPlanned
      ? `The forecast supports the full planned contribution, so the pocket is expected to reach its target in ${monthsToCompletion} ${monthsToCompletion === 1 ? 'month' : 'months'} (by ${monthLabel(completionMonth)}).`
      : `The forecast only supports part of the planned contribution, so completion is projected at the reduced pace: ${monthsToCompletion} ${monthsToCompletion === 1 ? 'month' : 'months'} (by ${monthLabel(completionMonth)}).`,
    dps,
  }
}

function buildUnfundableExplanation(
  forecastBalancePaisa: number | null,
  plannedContributionPaisa: Paisa,
): string {
  if (forecastBalancePaisa !== null && forecastBalancePaisa < 0) {
    return `The current forecast ends the month short of salary, so the forecast disposable amount is ৳0 and the effective contribution is ৳0. This pocket cannot be funded from the current forecast, and no completion date is shown. Projected month-end spending exceeds salary by ${formatTakaFromFloatPaisa(-forecastBalancePaisa)}, so none of the planned ${formatTaka(plannedContributionPaisa)} monthly contribution is affordable yet.`
  }
  return 'The forecast leaves nothing disposable at month end, so the effective contribution is ৳0. This pocket cannot be funded from the current forecast, and no completion date is shown.'
}
