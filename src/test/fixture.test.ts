import { describe, expect, it } from 'vitest'
import { DEFAULT_CASE_ID, fixture, getCase, ledgerStateFromCase, listCases, validateFixture } from '../data/fixture'
import { forecastMonth } from '../domain/forecast'
import { buildInsights } from '../domain/insights'
import { monthlySummary } from '../domain/ledger'
import { projectPocket } from '../domain/savings'
import { taka } from './helpers'

describe('official P12 fixture', () => {
  it('matches the documented schema across every public case', () => {
    const result = validateFixture()
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.caseCount).toBe(25)
    expect(fixture.schema_version).toBe('2.2')
    expect(fixture.problem_id).toBe('P12')
  })

  it('loads the demo case into ledger state with exact paisa amounts', () => {
    const state = ledgerStateFromCase(getCase(DEFAULT_CASE_ID))
    expect(state.referenceDate).toBe('2026-04-17')
    expect(state.salaryPaisa).toBe(taka('50000.00'))
    expect(state.dpsAnnualRatePercent).toBe(8)
    expect(state.expenses).toHaveLength(41)
    expect(state.pockets).toHaveLength(3)
    expect(state.expenses.every((e) => Number.isInteger(e.amountPaisa))).toBe(true)
    expect(state.pockets.every((p) => p.savedPaisa === 0)).toBe(true)
  })

  it('gives the opening screen everything a judge should see, on real fixture data', () => {
    for (const fixtureCase of listCases()) {
      const state = ledgerStateFromCase(fixtureCase)
      const month = fixtureCase.months.this
      const summary = monthlySummary(state, month)
      const forecast = forecastMonth(state, month, state.referenceDate)
      const pockets = state.pockets.map((p) =>
        projectPocket({
          pocket: p,
          forecastMonthEndBalancePaisa: forecast.forecastMonthEndBalancePaisa,
          startMonth: month,
          dpsAnnualRatePercent: state.dpsAnnualRatePercent,
        }),
      )
      const insights = buildInsights({
        state,
        summary,
        forecast,
        pockets,
        month,
        referenceDate: state.referenceDate,
      })

      expect(summary.hasSalary, fixtureCase.case_id).toBe(true)
      expect(summary.totalSpentPaisa, fixtureCase.case_id).toBeGreaterThan(0)
      expect(summary.categories.length, fixtureCase.case_id).toBeGreaterThan(1)
      expect(summary.largest.length, fixtureCase.case_id).toBeGreaterThan(0)
      expect(summary.comparison.previousMonth, fixtureCase.case_id).toBe(fixtureCase.months.last)
      expect(summary.comparison.previousTotalPaisa, fixtureCase.case_id).toBeGreaterThan(0)
      expect(forecast.status, fixtureCase.case_id).toBe('projected')
      expect(insights.length, fixtureCase.case_id).toBeGreaterThanOrEqual(3)
      expect(pockets.length, fixtureCase.case_id).toBe(3)
    }
  })

  it('derives the demo case totals from the records, not from constants', () => {
    const state = ledgerStateFromCase(getCase('PUB-01'))
    const summary = monthlySummary(state, '2026-04')
    const recomputed = state.expenses
      .filter((e) => e.date.startsWith('2026-04'))
      .reduce((acc, e) => acc + e.amountPaisa, 0)
    expect(summary.totalSpentPaisa).toBe(recomputed)
    const categorySum = summary.categories.reduce((acc, c) => acc + c.amountPaisa, 0)
    expect(categorySum).toBe(summary.totalSpentPaisa)
  })

  it('keeps every fixture expense inside its two documented months', () => {
    for (const fixtureCase of listCases()) {
      const months = new Set(fixtureCase.expenses.map((e) => e.date.slice(0, 7)))
      expect([...months].sort(), fixtureCase.case_id).toEqual([fixtureCase.months.last, fixtureCase.months.this])
    }
  })
})
