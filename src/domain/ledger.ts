/**
 * Pure monthly ledger maths. Nothing here touches React, storage or the DOM,
 * and no dashboard figure is ever hardcoded - every number is derived from the
 * expense records passed in.
 */
import { compareMonths, monthOf, previousMonth, type MonthKey } from './dates'
import { sumPaisa, type Paisa } from './money'
import type { Category, Expense, LedgerState } from './types'

export function expensesForMonth(expenses: readonly Expense[], month: MonthKey): Expense[] {
  return expenses.filter((e) => monthOf(e.date) === month)
}

export function totalSpent(expenses: readonly Expense[]): Paisa {
  return sumPaisa(expenses.map((e) => e.amountPaisa))
}

/** Salary in force for a month: an explicit override, else the standing salary. */
export function salaryForMonth(state: Pick<LedgerState, 'salaryPaisa' | 'salaryByMonth'>, month: MonthKey): Paisa | null {
  const override = state.salaryByMonth?.[month]
  if (override !== undefined && override !== null) return override
  return state.salaryPaisa ?? null
}

export interface CategoryTotal {
  category: Category
  amountPaisa: Paisa
  /** Share of the month's total spending, 0-100. Null when the month is empty. */
  percentOfSpending: number | null
  count: number
}

/**
 * Category totals for a month, largest first. Ties break alphabetically so the
 * order is deterministic for tests and for the demo.
 */
export function categoryBreakdown(expenses: readonly Expense[]): CategoryTotal[] {
  const total = totalSpent(expenses)
  const byCategory = new Map<Category, { amountPaisa: Paisa; count: number }>()
  for (const e of expenses) {
    const current = byCategory.get(e.category) ?? { amountPaisa: 0, count: 0 }
    current.amountPaisa += e.amountPaisa
    current.count += 1
    byCategory.set(e.category, current)
  }
  return [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      amountPaisa: v.amountPaisa,
      percentOfSpending: total === 0 ? null : (v.amountPaisa / total) * 100,
      count: v.count,
    }))
    .sort((a, b) => b.amountPaisa - a.amountPaisa || a.category.localeCompare(b.category))
}

/**
 * Largest individual expenses, biggest first. Ties break by earlier date then
 * by id, so the list is stable however the expenses were entered.
 */
export function largestExpenses(expenses: readonly Expense[], limit = 5): Expense[] {
  return [...expenses]
    .sort((a, b) => b.amountPaisa - a.amountPaisa || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, limit)
}

export interface MonthComparison {
  previousMonth: MonthKey
  previousTotalPaisa: Paisa
  /** thisMonth - previousMonth. Positive means more was spent this month. */
  changePaisa: Paisa
  /**
   * Percent change against the previous month, or null when the previous month
   * spent nothing (a percentage change from zero is undefined, not "100%").
   */
  changePercent: number | null
  /** Why changePercent is null, for display. */
  changePercentNote: string | null
  previousMonthHasData: boolean
}

export function compareWithPreviousMonth(
  allExpenses: readonly Expense[],
  month: MonthKey,
): MonthComparison {
  const prev = previousMonth(month)
  const prevExpenses = expensesForMonth(allExpenses, prev)
  const previousTotalPaisa = totalSpent(prevExpenses)
  const currentTotal = totalSpent(expensesForMonth(allExpenses, month))
  const changePaisa = currentTotal - previousTotalPaisa
  const previousMonthHasData = prevExpenses.length > 0
  const changePercent = previousTotalPaisa === 0 ? null : (changePaisa / previousTotalPaisa) * 100
  return {
    previousMonth: prev,
    previousTotalPaisa,
    changePaisa,
    changePercent,
    changePercentNote:
      changePercent === null
        ? previousMonthHasData
          ? `${prev} has expenses recorded but they total ৳0, so a percentage change cannot be calculated.`
          : `No expenses are recorded for ${prev}, so a percentage change cannot be calculated.`
        : null,
    previousMonthHasData,
  }
}

export interface MonthlySummary {
  month: MonthKey
  salaryPaisa: Paisa | null
  totalSpentPaisa: Paisa
  /** salary - spent. Null when no salary is set for the month. */
  remainingPaisa: Paisa | null
  /** Share of salary spent, 0-100+. Null when no salary is set (or salary is 0). */
  percentOfSalarySpent: number | null
  isOverspending: boolean
  /** How far past the salary the month has gone. Null when not overspending. */
  overspendPaisa: Paisa | null
  expenseCount: number
  categories: CategoryTotal[]
  largest: Expense[]
  comparison: MonthComparison
  hasExpenses: boolean
  hasSalary: boolean
}

export function monthlySummary(
  state: Pick<LedgerState, 'salaryPaisa' | 'salaryByMonth' | 'expenses'>,
  month: MonthKey,
  largestLimit = 5,
): MonthlySummary {
  const monthExpenses = expensesForMonth(state.expenses, month)
  const salaryPaisa = salaryForMonth(state, month)
  const totalSpentPaisa = totalSpent(monthExpenses)
  const remainingPaisa = salaryPaisa === null ? null : salaryPaisa - totalSpentPaisa
  const percentOfSalarySpent =
    salaryPaisa === null || salaryPaisa === 0 ? null : (totalSpentPaisa / salaryPaisa) * 100
  const isOverspending = salaryPaisa !== null && totalSpentPaisa > salaryPaisa
  return {
    month,
    salaryPaisa,
    totalSpentPaisa,
    remainingPaisa,
    percentOfSalarySpent,
    isOverspending,
    overspendPaisa: isOverspending ? totalSpentPaisa - (salaryPaisa as number) : null,
    expenseCount: monthExpenses.length,
    categories: categoryBreakdown(monthExpenses),
    largest: largestExpenses(monthExpenses, largestLimit),
    comparison: compareWithPreviousMonth(state.expenses, month),
    hasExpenses: monthExpenses.length > 0,
    hasSalary: salaryPaisa !== null,
  }
}

/** Every month that has at least one expense, oldest first. */
export function monthsWithExpenses(expenses: readonly Expense[]): MonthKey[] {
  const months = new Set(expenses.map((e) => monthOf(e.date)))
  return [...months].sort(compareMonths)
}

/** Category totals for a month keyed by category, for month-on-month deltas. */
export function categoryTotalsMap(expenses: readonly Expense[], month: MonthKey): Map<Category, Paisa> {
  const map = new Map<Category, Paisa>()
  for (const e of expensesForMonth(expenses, month)) {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amountPaisa)
  }
  return map
}
