import { describe, expect, it } from 'vitest'
import { forecastMonth } from '../domain/forecast'
import { biggestCategoryMovement, buildInsights, suggestCut } from '../domain/insights'
import { monthlySummary } from '../domain/ledger'
import { expense, ledger, taka } from './helpers'

const expenses = [
  expense('2026-03-04', 'Rent', 'Landlord', '16000.00'),
  expense('2026-03-11', 'Transport', 'Uber', '800.00'),
  expense('2026-03-15', 'Food', 'Madchef', '1200.00'),
  expense('2026-04-02', 'Rent', 'Landlord', '16000.00'),
  expense('2026-04-05', 'Food', 'Sultans Dine', '5000.00'),
  expense('2026-04-08', 'Food', 'Chillox', '3450.00'),
  expense('2026-04-09', 'Transport', 'Pathao', '2000.00'),
  expense('2026-04-10', 'Entertainment', 'Star Cineplex', '1800.00'),
]

function build(month = '2026-04', referenceDate = '2026-04-10', salary = '50000.00') {
  const state = ledger({ expenses, salaryPaisa: taka(salary) })
  const summary = monthlySummary(state, month)
  const forecast = forecastMonth(state, month, referenceDate)
  return buildInsights({ state, summary, forecast, month, referenceDate })
}

describe('insights', () => {
  it('produces at least three insights for a month with data', () => {
    const insights = build()
    expect(insights.length).toBeGreaterThanOrEqual(3)
  })

  it('names the real largest category with its exact amount and share', () => {
    const top = build().find((i) => i.id === 'top-category')
    expect(top).toBeDefined()
    // Rent: 16,000 of 28,250 = 56.6%; Food is second at 8,450.
    expect(top!.text).toContain('Rent')
    expect(top!.text).toContain('৳16,000')
    expect(top!.text).toContain('57%')
  })

  it('combines the two largest categories with an exact total and percentage', () => {
    const combined = build().find((i) => i.id === 'top-two-categories')
    expect(combined!.text).toContain('Rent and Food')
    expect(combined!.text).toContain('৳24,450')
    expect(combined!.text).toContain('87%')
  })

  it('states a category movement against the previous month in taka', () => {
    const movement = build().find((i) => i.id === 'category-movement')
    expect(movement!.text).toContain('Food')
    expect(movement!.text).toContain('৳7,250') // 8,450 this month vs 1,200 last
    expect(movement!.text).toContain('higher')
  })

  it('quantifies a projected overspend in taka', () => {
    const overspend = build().find((i) => i.id === 'forecast-overspend')
    // 28,250 over 10 days = 2,825/day -> 84,750 by month end -> 34,750 over a 50,000 salary.
    expect(overspend!.text).toContain('৳84,750')
    expect(overspend!.text).toContain('৳34,750')
    expect(overspend!.tone).toBe('critical')
  })

  it('suggests a specific category cut that closes the projected shortfall', () => {
    const cut = build().find((i) => i.id === 'suggested-cut')
    expect(cut).toBeDefined()
    expect(cut!.text).toMatch(/Reducing (Food|Entertainment|Transport)/)
    expect(cut!.text).toMatch(/৳[\d,]+/)
  })

  it('names the largest single expense with merchant, category and date', () => {
    const largest = build().find((i) => i.id === 'largest-expense')
    expect(largest!.text).toContain('৳16,000')
    expect(largest!.text).toContain('Landlord')
    expect(largest!.text).toContain('Rent')
    expect(largest!.text).toContain('2 Apr 2026')
  })

  it('reports a completed month with actual figures rather than a projection', () => {
    const insights = build('2026-03', '2026-04-17')
    const completed = insights.find((i) => i.id === 'forecast-completed')
    expect(completed!.text).toContain('complete')
    expect(completed!.text).toContain('৳18,000')
    expect(insights.some((i) => i.id === 'forecast-overspend')).toBe(false)
  })

  it('every insight for a populated month mentions a taka amount', () => {
    for (const insight of build()) {
      expect(insight.text, insight.id).toMatch(/৳/)
    }
  })

  it('updates when an expense is added', () => {
    const before = build().find((i) => i.id === 'top-category')!.text
    const state = ledger({
      expenses: [...expenses, expense('2026-04-10', 'Groceries', 'Meena Bazar', '20000.00')],
    })
    const after = buildInsights({
      state,
      summary: monthlySummary(state, '2026-04'),
      forecast: forecastMonth(state, '2026-04', '2026-04-10'),
      month: '2026-04',
      referenceDate: '2026-04-10',
    }).find((i) => i.id === 'top-category')!.text
    expect(after).not.toBe(before)
    expect(after).toContain('Groceries')
    expect(after).toContain('৳20,000')
  })

  it('explains an empty month instead of emitting generic advice', () => {
    const insights = build('2026-07', '2026-07-05')
    expect(insights).toHaveLength(1)
    expect(insights[0].id).toBe('empty-month')
    expect(insights[0].text).toContain('July 2026')
  })
})

describe('insight building blocks', () => {
  it('finds the biggest category movement, ignoring categories absent this month', () => {
    const movement = biggestCategoryMovement(expenses, '2026-04')
    expect(movement).toEqual({
      category: 'Food',
      currentPaisa: taka('8450.00'),
      previousPaisa: taka('1200.00'),
      deltaPaisa: taka('7250.00'),
    })
  })

  it('caps a suggested cut at what the category actually holds', () => {
    const state = ledger({ expenses })
    const summary = monthlySummary(state, '2026-04')
    const cut = suggestCut(summary, taka('999999.00'))
    expect(cut).not.toBeNull()
    expect(cut!.amountPaisa).toBe(cut!.currentPaisa)
  })

  it('returns no suggestion when there is no discretionary spending to cut', () => {
    const rentOnly = [expense('2026-04-02', 'Rent', 'Landlord', '16000.00')]
    const state = ledger({ expenses: rentOnly })
    expect(suggestCut(monthlySummary(state, '2026-04'), taka('1000.00'))).toBeNull()
  })
})
