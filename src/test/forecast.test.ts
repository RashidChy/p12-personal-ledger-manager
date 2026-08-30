import { describe, expect, it } from 'vitest'
import { forecastMonth, forecastDisposablePaisa } from '../domain/forecast'
import { expense, ledger, taka } from './helpers'

const april = [
  expense('2026-04-02', 'Rent', 'Landlord', '16000.00'),
  expense('2026-04-05', 'Food', 'Sultans Dine', '2500.00'),
  expense('2026-04-09', 'Food', 'Chillox', '1500.00'),
]
// 20,000 spent by 10 April -> 2,000/day.

describe('daily run rate', () => {
  it('divides spending to date by elapsed days, including the forecast date', () => {
    const f = forecastMonth(ledger({ expenses: april }), '2026-04', '2026-04-10')
    expect(f.status).toBe('projected')
    expect(f.elapsedDays).toBe(10)
    expect(f.remainingDays).toBe(20)
    expect(f.spentToDatePaisa).toBe(taka('20000.00'))
    expect(f.dailyRunRatePaisa).toBe(taka('2000.00'))
  })

  it('keeps a fractional run rate unrounded', () => {
    const f = forecastMonth(ledger({ expenses: april }), '2026-04', '2026-04-07')
    // The 9 April expense is future-dated relative to this forecast and must
    // not leak into the 7 April run rate.
    expect(f.spentToDatePaisa).toBe(taka('18500.00'))
    expect(f.dailyRunRatePaisa).toBeCloseTo(1850000 / 7, 10)
    expect(f.expectedAdditionalPaisa).toBeCloseTo((1850000 / 7) * 23, 10)
    // No intermediate rounding: month-end equals the exact algebraic result.
    expect(f.expectedMonthEndSpendingPaisa).toBeCloseTo(1850000 + (1850000 / 7) * 23, 10)
    expect(f.assumptions.join(' ')).toContain('on or before 2026-04-07')
  })
})

describe('expected additional and month-end spending', () => {
  it('projects the remaining days at the current run rate', () => {
    const f = forecastMonth(ledger({ expenses: april }), '2026-04', '2026-04-10')
    expect(f.expectedAdditionalPaisa).toBe(taka('40000.00')) // 2,000 x 20 days
    expect(f.expectedMonthEndSpendingPaisa).toBe(taka('60000.00'))
  })

  it('computes the month-end balance and shortfall against salary', () => {
    const f = forecastMonth(ledger({ expenses: april }), '2026-04', '2026-04-10')
    expect(f.salaryPaisa).toBe(taka('50000.00'))
    expect(f.forecastMonthEndBalancePaisa).toBe(taka('-10000.00'))
    expect(f.projectedOverspend).toBe(true)
    expect(f.forecastShortfallPaisa).toBe(taka('10000.00'))
    expect(forecastDisposablePaisa(f)).toBe(0)
  })

  it('reports a surplus when the pace stays within salary', () => {
    const f = forecastMonth(ledger({ expenses: april, salaryPaisa: taka('90000.00') }), '2026-04', '2026-04-10')
    expect(f.projectedOverspend).toBe(false)
    expect(f.forecastMonthEndBalancePaisa).toBe(taka('30000.00'))
    expect(f.forecastShortfallPaisa).toBeNull()
    expect(forecastDisposablePaisa(f)).toBe(taka('30000.00'))
  })
})

describe('completed month behaviour', () => {
  const march = [
    expense('2026-03-04', 'Rent', 'Landlord', '16000.00'),
    expense('2026-03-20', 'Food', 'Madchef', '2000.00'),
  ]

  it('uses actual spending as the final total and projects nothing further', () => {
    const f = forecastMonth(ledger({ expenses: march }), '2026-03', '2026-04-17')
    expect(f.status).toBe('completed')
    expect(f.elapsedDays).toBe(31)
    expect(f.remainingDays).toBe(0)
    expect(f.expectedAdditionalPaisa).toBe(0)
    expect(f.expectedMonthEndSpendingPaisa).toBe(taka('18000.00'))
    expect(f.expectedMonthEndSpendingPaisa).toBe(f.spentToDatePaisa)
    expect(f.forecastMonthEndBalancePaisa).toBe(taka('32000.00'))
    expect(f.assumptions.join(' ')).toContain('already complete')
  })

  it('reports an overspent completed month as an actual shortfall', () => {
    const f = forecastMonth(ledger({ expenses: march, salaryPaisa: taka('10000.00') }), '2026-03', '2026-04-17')
    expect(f.status).toBe('completed')
    expect(f.projectedOverspend).toBe(true)
    expect(f.forecastShortfallPaisa).toBe(taka('8000.00'))
  })
})

describe('insufficient data', () => {
  it('explains an empty month instead of forecasting zero', () => {
    const f = forecastMonth(ledger({ expenses: april }), '2026-05', '2026-05-08')
    expect(f.status).toBe('no-spending-yet')
    expect(f.dailyRunRatePaisa).toBe(0)
    expect(f.expectedMonthEndSpendingPaisa).toBeNull()
    expect(f.forecastMonthEndBalancePaisa).toBeNull()
    expect(f.insufficientDataReason).toContain('No expenses are recorded')
    expect(forecastDisposablePaisa(f)).toBeNull()
  })

  it('refuses to forecast a month that has not started', () => {
    const f = forecastMonth(
      ledger({ expenses: [...april, expense('2026-06-01', 'Rent', 'Landlord', '16000.00')] }),
      '2026-06',
      '2026-04-17',
    )
    expect(f.status).toBe('future-month')
    expect(f.elapsedDays).toBe(0)
    expect(f.spentToDatePaisa).toBe(0)
    expect(f.dailyRunRatePaisa).toBeNull()
    expect(f.insufficientDataReason).toContain('starts after the forecast date')
  })

  it('projects spending but not a balance when no salary is set', () => {
    const f = forecastMonth(ledger({ expenses: april, salaryPaisa: null }), '2026-04', '2026-04-10')
    expect(f.expectedMonthEndSpendingPaisa).toBe(taka('60000.00'))
    expect(f.forecastMonthEndBalancePaisa).toBeNull()
    expect(f.insufficientDataReason).toContain('no salary is set')
  })
})

describe('month boundaries', () => {
  it('handles the first day of a month', () => {
    const f = forecastMonth(
      ledger({ expenses: [expense('2026-04-01', 'Food', 'Chillox', '900.00')] }),
      '2026-04',
      '2026-04-01',
    )
    expect(f.elapsedDays).toBe(1)
    expect(f.remainingDays).toBe(29)
    expect(f.dailyRunRatePaisa).toBe(taka('900.00'))
    expect(f.expectedMonthEndSpendingPaisa).toBe(taka('27000.00'))
  })

  it('handles the last day of a month, where nothing further is projected', () => {
    const f = forecastMonth(
      ledger({ expenses: [expense('2026-04-30', 'Food', 'Chillox', '900.00')] }),
      '2026-04',
      '2026-04-30',
    )
    expect(f.elapsedDays).toBe(30)
    expect(f.remainingDays).toBe(0)
    expect(f.expectedAdditionalPaisa).toBe(0)
    expect(f.expectedMonthEndSpendingPaisa).toBe(taka('900.00'))
  })

  it('handles a leap-February', () => {
    const f = forecastMonth(
      ledger({ expenses: [expense('2028-02-01', 'Food', 'Chillox', '1000.00')] }),
      '2028-02',
      '2028-02-01',
    )
    expect(f.daysInMonth).toBe(29)
    expect(f.expectedMonthEndSpendingPaisa).toBe(taka('29000.00'))
  })
})
