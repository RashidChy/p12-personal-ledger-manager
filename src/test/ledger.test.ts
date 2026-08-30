import { describe, expect, it } from 'vitest'
import {
  categoryBreakdown,
  compareWithPreviousMonth,
  largestExpenses,
  monthlySummary,
  monthsWithExpenses,
  salaryForMonth,
  totalSpent,
} from '../domain/ledger'
import { expense, ledger, taka } from './helpers'

const APRIL = '2026-04'

const sample = [
  expense('2026-03-04', 'Rent', 'Landlord', '16000.00'),
  expense('2026-03-10', 'Food', 'Madchef', '1200.00'),
  expense('2026-03-20', 'Transport', 'Uber', '800.00'),
  expense('2026-04-02', 'Rent', 'Landlord', '16000.00'),
  expense('2026-04-05', 'Food', 'Sultans Dine', '2500.00'),
  expense('2026-04-09', 'Food', 'Chillox', '1500.00'),
  expense('2026-04-12', 'Transport', 'Pathao', '1000.00'),
  expense('2026-04-15', 'Groceries', 'Meena Bazar', '4000.00'),
]

describe('salary and total spending', () => {
  it('totals only the selected month', () => {
    const summary = monthlySummary(ledger({ expenses: sample }), APRIL)
    expect(summary.totalSpentPaisa).toBe(taka('25000.00'))
    expect(summary.expenseCount).toBe(5)
    expect(summary.salaryPaisa).toBe(taka('50000.00'))
  })

  it('uses a per-month salary override when one is set', () => {
    const state = ledger({ expenses: sample, salaryByMonth: { '2026-04': taka('60000.00') } })
    expect(salaryForMonth(state, APRIL)).toBe(taka('60000.00'))
    expect(salaryForMonth(state, '2026-03')).toBe(taka('50000.00'))
  })

  it('reports a month with no expenses without inventing figures', () => {
    const summary = monthlySummary(ledger({ expenses: sample }), '2026-07')
    expect(summary.totalSpentPaisa).toBe(0)
    expect(summary.hasExpenses).toBe(false)
    expect(summary.categories).toEqual([])
    expect(summary.largest).toEqual([])
    expect(summary.remainingPaisa).toBe(taka('50000.00'))
  })

  it('reports a month with no salary as unknown, not zero', () => {
    const summary = monthlySummary(ledger({ expenses: sample, salaryPaisa: null }), APRIL)
    expect(summary.salaryPaisa).toBeNull()
    expect(summary.remainingPaisa).toBeNull()
    expect(summary.percentOfSalarySpent).toBeNull()
    expect(summary.isOverspending).toBe(false)
    expect(summary.hasSalary).toBe(false)
  })
})

describe('remaining salary and overspending', () => {
  it('computes remaining salary and percent spent', () => {
    const summary = monthlySummary(ledger({ expenses: sample }), APRIL)
    expect(summary.remainingPaisa).toBe(taka('25000.00'))
    expect(summary.percentOfSalarySpent).toBeCloseTo(50, 10)
    expect(summary.isOverspending).toBe(false)
    expect(summary.overspendPaisa).toBeNull()
  })

  it('flags overspending with the exact overspend amount', () => {
    const state = ledger({ expenses: sample, salaryPaisa: taka('20000.00') })
    const summary = monthlySummary(state, APRIL)
    expect(summary.isOverspending).toBe(true)
    expect(summary.remainingPaisa).toBe(taka('-5000.00'))
    expect(summary.overspendPaisa).toBe(taka('5000.00'))
    expect(summary.percentOfSalarySpent).toBeCloseTo(125, 10)
  })

  it('treats spending exactly equal to salary as not overspending', () => {
    const state = ledger({ expenses: sample, salaryPaisa: taka('25000.00') })
    const summary = monthlySummary(state, APRIL)
    expect(summary.isOverspending).toBe(false)
    expect(summary.remainingPaisa).toBe(0)
    expect(summary.percentOfSalarySpent).toBe(100)
  })
})

describe('previous-month comparison', () => {
  it('returns the amount and percentage change', () => {
    const cmp = compareWithPreviousMonth(sample, APRIL)
    expect(cmp.previousMonth).toBe('2026-03')
    expect(cmp.previousTotalPaisa).toBe(taka('18000.00'))
    expect(cmp.changePaisa).toBe(taka('7000.00'))
    expect(cmp.changePercent).toBeCloseTo((7000 / 18000) * 100, 10)
    expect(cmp.changePercentNote).toBeNull()
  })

  it('returns null (not Infinity or 100%) when the previous month is zero', () => {
    const onlyApril = sample.filter((e) => e.date.startsWith('2026-04'))
    const cmp = compareWithPreviousMonth(onlyApril, APRIL)
    expect(cmp.previousTotalPaisa).toBe(0)
    expect(cmp.changePaisa).toBe(taka('25000.00'))
    expect(cmp.changePercent).toBeNull()
    expect(cmp.previousMonthHasData).toBe(false)
    expect(cmp.changePercentNote).toContain('2026-03')
  })

  it('crosses the year boundary to find the previous month', () => {
    const expenses = [
      expense('2025-12-20', 'Food', 'Star Kabab', '1000.00'),
      expense('2026-01-05', 'Food', 'Star Kabab', '1500.00'),
    ]
    const cmp = compareWithPreviousMonth(expenses, '2026-01')
    expect(cmp.previousMonth).toBe('2025-12')
    expect(cmp.previousTotalPaisa).toBe(taka('1000.00'))
    expect(cmp.changePercent).toBeCloseTo(50, 10)
  })
})

describe('category breakdown', () => {
  it('gives exact amounts and percentages, largest first', () => {
    const april = sample.filter((e) => e.date.startsWith('2026-04'))
    const breakdown = categoryBreakdown(april)
    expect(breakdown.map((c) => c.category)).toEqual(['Rent', 'Food', 'Groceries', 'Transport'])
    expect(breakdown[0].amountPaisa).toBe(taka('16000.00'))
    expect(breakdown[0].percentOfSpending).toBeCloseTo(64, 10)
    expect(breakdown[1].amountPaisa).toBe(taka('4000.00')) // Food: 2500 + 1500
    expect(breakdown[1].count).toBe(2)
    const sumOfPercents = breakdown.reduce((acc, c) => acc + (c.percentOfSpending ?? 0), 0)
    expect(sumOfPercents).toBeCloseTo(100, 8)
  })

  it('returns no percentages for an empty month instead of dividing by zero', () => {
    expect(categoryBreakdown([])).toEqual([])
  })
})

describe('largest expenses', () => {
  it('orders by amount descending with a deterministic tie-break', () => {
    const tied = [
      expense('2026-04-10', 'Food', 'B shop', '500.00'),
      expense('2026-04-02', 'Food', 'A shop', '500.00'),
      expense('2026-04-03', 'Rent', 'Landlord', '9000.00'),
    ]
    const largest = largestExpenses(tied, 3)
    expect(largest.map((e) => e.shop)).toEqual(['Landlord', 'A shop', 'B shop'])
  })

  it('respects the requested limit', () => {
    const april = sample.filter((e) => e.date.startsWith('2026-04'))
    expect(largestExpenses(april, 2).map((e) => e.amountPaisa)).toEqual([taka('16000.00'), taka('4000.00')])
  })
})

describe('helpers', () => {
  it('lists months that actually contain expenses, oldest first', () => {
    expect(monthsWithExpenses(sample)).toEqual(['2026-03', '2026-04'])
  })

  it('sums an empty list to zero', () => {
    expect(totalSpent([])).toBe(0)
  })
})
