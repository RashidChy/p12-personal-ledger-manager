/**
 * Written insights, generated from the active month's stored records.
 *
 * Every insight names real categories/merchants and real taka amounts taken
 * from the ledger - nothing is templated generic advice, and nothing is
 * hardcoded. Adding, editing or deleting an expense changes them immediately
 * because they are derived from the same summary the dashboard uses.
 */
import { formatIsoDate, monthLabel, previousMonth, type IsoDate, type MonthKey } from './dates'
import { formatTaka, formatTakaFromFloatPaisa, formatPercent } from './format'
import type { Paisa } from './money'
import { categoryTotalsMap, type MonthlySummary } from './ledger'
import type { Category, Expense, LedgerState } from './types'
import type { ForecastResult } from './forecast'
import type { PocketProjection } from './savings'

export type InsightTone = 'neutral' | 'positive' | 'warning' | 'critical'

export interface Insight {
  id: string
  tone: InsightTone
  text: string
  /** Short label shown alongside the tone colour so colour is never the only cue. */
  label: string
}

/** Categories a user can realistically cut back on in-month. */
const DISCRETIONARY: readonly Category[] = [
  'Entertainment',
  'Clothing',
  'Food',
  'Groceries',
  'Transport',
  'Education',
  'Other',
]

export function buildInsights(params: {
  state: Pick<LedgerState, 'expenses'>
  summary: MonthlySummary
  forecast: ForecastResult
  pockets?: readonly PocketProjection[]
  month: MonthKey
  referenceDate: IsoDate
}): Insight[] {
  const { state, summary, forecast, month, referenceDate } = params
  const insights: Insight[] = []
  const total = summary.totalSpentPaisa
  const monthName = monthLabel(month)

  if (!summary.hasExpenses) {
    return [
      {
        id: 'empty-month',
        tone: 'neutral',
        label: 'No data',
        text: `No expenses are recorded for ${monthName}, so there is nothing to analyse yet. Add an expense or scan a receipt and insights will appear here immediately.`,
      },
    ]
  }

  // 1. Largest category, with its exact amount and share.
  const top = summary.categories[0]
  if (top) {
    insights.push({
      id: 'top-category',
      tone: 'neutral',
      label: 'Largest category',
      text: `${top.category} is your largest category at ${formatTaka(top.amountPaisa)}, representing ${formatPercent(top.percentOfSpending)} of ${monthName} spending across ${top.count} ${top.count === 1 ? 'expense' : 'expenses'}.`,
    })
  }

  // 2. Two largest categories combined.
  const second = summary.categories[1]
  if (top && second && total > 0) {
    const combined = top.amountPaisa + second.amountPaisa
    insights.push({
      id: 'top-two-categories',
      tone: 'neutral',
      label: 'Concentration',
      text: `${top.category} and ${second.category} together account for ${formatTaka(combined)}, or ${formatPercent((combined / total) * 100)} of ${monthName} spending.`,
    })
  }

  // 3. Biggest category movement against the previous month.
  const movement = biggestCategoryMovement(state.expenses, month)
  if (movement) {
    const direction = movement.deltaPaisa > 0 ? 'higher' : 'lower'
    insights.push({
      id: 'category-movement',
      tone: movement.deltaPaisa > 0 ? 'warning' : 'positive',
      label: movement.deltaPaisa > 0 ? 'Up on last month' : 'Down on last month',
      text:
        movement.previousPaisa === 0
          ? `${movement.category} is new this month at ${formatTaka(movement.currentPaisa)}; nothing was recorded in ${monthLabel(previousMonth(month))}.`
          : `${movement.category} spending is ${formatTaka(Math.abs(movement.deltaPaisa))} ${direction} than ${monthLabel(previousMonth(month))} (${formatTaka(movement.currentPaisa)} vs ${formatTaka(movement.previousPaisa)}).`,
    })
  }

  // 4. Whole-month comparison.
  const cmp = summary.comparison
  if (cmp.previousMonthHasData && cmp.previousTotalPaisa > 0) {
    const direction = cmp.changePaisa >= 0 ? 'more' : 'less'
    insights.push({
      id: 'month-comparison',
      tone: cmp.changePaisa > 0 ? 'warning' : 'positive',
      label: 'Month on month',
      text: `You have spent ${formatTaka(Math.abs(cmp.changePaisa))} ${direction} so far in ${monthName} than in all of ${monthLabel(cmp.previousMonth)} (${formatTaka(summary.totalSpentPaisa)} vs ${formatTaka(cmp.previousTotalPaisa)}, ${formatPercent(Math.abs(cmp.changePercent ?? 0), 1)} ${cmp.changePaisa >= 0 ? 'up' : 'down'}).`,
    })
  }

  // 5. Forecast outcome in taka.
  if (forecast.status === 'projected' && forecast.forecastMonthEndBalancePaisa !== null) {
    if (forecast.projectedOverspend) {
      insights.push({
        id: 'forecast-overspend',
        tone: 'critical',
        label: 'Projected shortfall',
        text: `At the current pace of ${formatTakaFromFloatPaisa(forecast.dailyRunRatePaisa)} per day, you are projected to spend ${formatTakaFromFloatPaisa(forecast.expectedMonthEndSpendingPaisa)} by ${monthName} month end and exceed salary by ${formatTakaFromFloatPaisa(forecast.forecastShortfallPaisa)}.`,
      })
    } else {
      insights.push({
        id: 'forecast-surplus',
        tone: 'positive',
        label: 'Projected surplus',
        text: `At the current pace of ${formatTakaFromFloatPaisa(forecast.dailyRunRatePaisa)} per day, ${monthName} is projected to end at ${formatTakaFromFloatPaisa(forecast.expectedMonthEndSpendingPaisa)} spent, leaving ${formatTakaFromFloatPaisa(forecast.forecastMonthEndBalancePaisa)} of your ${formatTaka(summary.salaryPaisa)} salary.`,
      })
    }
  } else if (forecast.status === 'completed' && summary.hasSalary) {
    insights.push({
      id: 'forecast-completed',
      tone: summary.isOverspending ? 'critical' : 'positive',
      label: 'Completed month',
      text: summary.isOverspending
        ? `${monthName} is complete: actual spending of ${formatTaka(summary.totalSpentPaisa)} exceeded the ${formatTaka(summary.salaryPaisa)} salary by ${formatTaka(summary.overspendPaisa)}.`
        : `${monthName} is complete: actual spending of ${formatTaka(summary.totalSpentPaisa)} finished ${formatTaka(summary.remainingPaisa)} inside the ${formatTaka(summary.salaryPaisa)} salary.`,
    })
  }

  // 6. Actionable cut that brings the forecast back inside salary.
  if (forecast.projectedOverspend && forecast.forecastShortfallPaisa !== null) {
    const cut = suggestCut(summary, forecast.forecastShortfallPaisa)
    if (cut) {
      insights.push({
        id: 'suggested-cut',
        tone: 'warning',
        label: 'Suggested action',
        text:
          cut.remainingShortfallPaisa <= 0
            ? `Reducing ${cut.category} by ${formatTakaFromFloatPaisa(cut.amountPaisa)} this month would bring the forecast back within salary (${cut.category} is currently ${formatTaka(cut.currentPaisa)}).`
            : `Reducing ${cut.category} by ${formatTakaFromFloatPaisa(cut.amountPaisa)} would lower the projected shortfall from ${formatTakaFromFloatPaisa(forecast.forecastShortfallPaisa)} to ${formatTakaFromFloatPaisa(cut.remainingShortfallPaisa)}, but additional savings would still be needed.`,
      })
    }
  }

  // 7. Largest single expense.
  const largest: Expense | undefined = summary.largest[0]
  if (largest && total > 0) {
    insights.push({
      id: 'largest-expense',
      tone: 'neutral',
      label: 'Largest expense',
      text: `Your largest single expense in ${monthName} is ${formatTaka(largest.amountPaisa)} at ${largest.shop} (${largest.category}) on ${formatIsoDate(largest.date)}, which is ${formatPercent((largest.amountPaisa / total) * 100)} of the month's spending.`,
    })
  }

  // 8. Salary burn rate.
  if (summary.hasSalary && summary.percentOfSalarySpent !== null && forecast.status !== 'completed') {
    insights.push({
      id: 'salary-burn',
      tone: summary.percentOfSalarySpent > 100 ? 'critical' : summary.percentOfSalarySpent > 75 ? 'warning' : 'neutral',
      text: `${formatPercent(summary.percentOfSalarySpent, 1)} of your ${formatTaka(summary.salaryPaisa)} salary is already spent ${forecast.elapsedDays} ${forecast.elapsedDays === 1 ? 'day' : 'days'} into ${monthName} (as of ${formatIsoDate(referenceDate)}), with ${forecast.remainingDays} ${forecast.remainingDays === 1 ? 'day' : 'days'} left.`,
      label: 'Salary used',
    })
  }

  // 9. Pocket affordability, when pockets exist.
  const pocket = (params.pockets ?? []).find((p) => p.status === 'unfundable' || p.status === 'partially-funded')
  if (pocket) {
    insights.push({
      id: `pocket-${pocket.pocket.id}`,
      tone: pocket.status === 'unfundable' ? 'critical' : 'warning',
      label: 'Savings impact',
      text:
        pocket.status === 'unfundable'
          ? `The forecast leaves nothing for the "${pocket.pocket.name}" pocket, so none of its planned ${formatTaka(pocket.plannedContributionPaisa)} monthly contribution is affordable this month.`
          : `The forecast only supports ${formatTakaFromFloatPaisa(pocket.effectiveContributionPaisa)} of the planned ${formatTaka(pocket.plannedContributionPaisa)} contribution to "${pocket.pocket.name}", pushing completion to ${pocket.completionLabel}.`,
    })
  }

  return insights
}

export interface CategoryMovement {
  category: Category
  currentPaisa: Paisa
  previousPaisa: Paisa
  deltaPaisa: Paisa
}

/** The category whose spend moved most (in taka) against the previous month. */
export function biggestCategoryMovement(
  expenses: readonly Expense[],
  month: MonthKey,
): CategoryMovement | null {
  const current = categoryTotalsMap(expenses, month)
  const prev = categoryTotalsMap(expenses, previousMonth(month))
  if (current.size === 0) return null
  const categories = new Set<Category>([...current.keys(), ...prev.keys()])
  let best: CategoryMovement | null = null
  for (const category of categories) {
    const currentPaisa = current.get(category) ?? 0
    const previousPaisa = prev.get(category) ?? 0
    const deltaPaisa = currentPaisa - previousPaisa
    // Only report categories that are actually present this month.
    if (currentPaisa === 0) continue
    if (!best || Math.abs(deltaPaisa) > Math.abs(best.deltaPaisa)) {
      best = { category, currentPaisa, previousPaisa, deltaPaisa }
    }
  }
  return best && best.deltaPaisa !== 0 ? best : null
}

/**
 * Picks the discretionary category best able to absorb the projected shortfall.
 * The suggested cut is capped at what the category actually contains.
 */
export function suggestCut(
  summary: MonthlySummary,
  shortfallPaisa: number,
): { category: Category; amountPaisa: number; currentPaisa: Paisa; remainingShortfallPaisa: number } | null {
  const candidates = summary.categories.filter((c) => DISCRETIONARY.includes(c.category))
  const affordable = candidates.find((c) => c.amountPaisa >= shortfallPaisa)
  if (affordable) {
    return {
      category: affordable.category,
      amountPaisa: shortfallPaisa,
      currentPaisa: affordable.amountPaisa,
      remainingShortfallPaisa: 0,
    }
  }
  const biggest = candidates[0]
  if (!biggest) return null
  return {
    category: biggest.category,
    amountPaisa: biggest.amountPaisa,
    currentPaisa: biggest.amountPaisa,
    remainingShortfallPaisa: Math.max(0, shortfallPaisa - biggest.amountPaisa),
  }
}
