import { describe, expect, it } from 'vitest'
import { MAX_DPS_PROJECTION_MONTHS, projectDps } from '../domain/dps'
import { projectPocket } from '../domain/savings'
import { taka } from './helpers'
import type { Pocket } from '../domain/types'
import { validatePocketDraft } from '../ui/SavingsView'

function pocket(partial: Partial<Pocket> = {}): Pocket {
  return {
    id: 'SP-1',
    name: 'Laptop',
    item: 'MacBook Air M4',
    targetPaisa: taka('145000.00'),
    savedPaisa: 0,
    monthlyContributionPaisa: taka('12000.00'),
    ...partial,
  }
}

describe('savings completion duration', () => {
  it('uses the planned contribution when the forecast fully supports it', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('60000.00'), monthlyContributionPaisa: taka('15000.00') }),
      forecastMonthEndBalancePaisa: taka('20000.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.forecastDisposablePaisa).toBe(taka('20000.00'))
    expect(p.effectiveContributionPaisa).toBe(taka('15000.00'))
    expect(p.forecastSupportsPlanned).toBe(true)
    expect(p.monthsToCompletion).toBe(4)
    expect(p.completionMonth).toBe('2026-07') // start month counts as month 1
    expect(p.status).toBe('fully-funded')
  })

  it('rounds a part month up', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('50000.00'), monthlyContributionPaisa: taka('15000.00') }),
      forecastMonthEndBalancePaisa: taka('30000.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.monthsToCompletion).toBe(4) // 50,000 / 15,000 = 3.33 -> 4
    expect(p.completionMonth).toBe('2026-07')
  })

  it('slows completion to the affordable pace when the forecast is tight', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('60000.00'), monthlyContributionPaisa: taka('15000.00') }),
      forecastMonthEndBalancePaisa: taka('10000.00'),
      startMonth: '2026-11',
      dpsAnnualRatePercent: 8,
    })
    expect(p.effectiveContributionPaisa).toBe(taka('10000.00'))
    expect(p.forecastSupportsPlanned).toBe(false)
    expect(p.contributionShortfallPaisa).toBe(taka('5000.00'))
    expect(p.monthsToCompletion).toBe(6)
    expect(p.completionMonth).toBe('2027-04') // crosses the year boundary
    expect(p.status).toBe('partially-funded')
  })

  it('counts an existing saved balance towards the target', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('60000.00'), savedPaisa: taka('45000.00'), monthlyContributionPaisa: taka('15000.00') }),
      forecastMonthEndBalancePaisa: taka('20000.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.remainingTargetPaisa).toBe(taka('15000.00'))
    expect(p.monthsToCompletion).toBe(1)
    expect(p.completionMonth).toBe('2026-04')
    expect(p.progressPercent).toBeCloseTo(75, 10)
  })
})

describe('unaffordable pocket', () => {
  it('invents no completion date when the forecast overspends', () => {
    const p = projectPocket({
      pocket: pocket(),
      forecastMonthEndBalancePaisa: taka('-2340.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.forecastDisposablePaisa).toBe(0)
    expect(p.effectiveContributionPaisa).toBe(0)
    expect(p.monthsToCompletion).toBeNull()
    expect(p.completionMonth).toBeNull()
    expect(p.dps).toBeNull()
    expect(p.status).toBe('unfundable')
    expect(p.explanation).toContain('৳2,340')
  })

  it('says so plainly when no forecast is available, rather than assuming zero', () => {
    const p = projectPocket({
      pocket: pocket(),
      forecastMonthEndBalancePaisa: null,
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
      forecastUnavailableReason: 'No salary is set for April 2026.',
    })
    expect(p.status).toBe('forecast-unavailable')
    expect(p.monthsToCompletion).toBeNull()
    expect(p.explanation).toBe('No salary is set for April 2026.')
  })

  it('will not project when nothing is planned', () => {
    const p = projectPocket({
      pocket: pocket({ monthlyContributionPaisa: 0 }),
      forecastMonthEndBalancePaisa: taka('20000.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.status).toBe('no-planned-contribution')
    expect(p.monthsToCompletion).toBeNull()
  })

  it('refuses a multi-million-row projection caused by a tiny contribution', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('145000.00'), monthlyContributionPaisa: 1 }),
      forecastMonthEndBalancePaisa: 1,
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.status).toBe('projection-too-long')
    expect(p.monthsToCompletion).toBeNull()
    expect(p.completionMonth).toBeNull()
    expect(p.dps).toBeNull()
    expect(p.explanation).toContain(`${MAX_DPS_PROJECTION_MONTHS} months (50 years)`)
    expect(p.explanation).toContain('Increase the effective monthly contribution')
  })
})

describe('pocket already at its target', () => {
  it('reports zero months and runs no DPS projection', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('50000.00'), savedPaisa: taka('50000.00') }),
      forecastMonthEndBalancePaisa: taka('20000.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.remainingTargetPaisa).toBe(0)
    expect(p.monthsToCompletion).toBe(0)
    expect(p.status).toBe('target-reached')
    expect(p.dps).toBeNull()
    expect(p.progressPercent).toBe(100)
  })

  it('caps progress at 100% when the pocket is over-saved', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('50000.00'), savedPaisa: taka('65000.00') }),
      forecastMonthEndBalancePaisa: taka('20000.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 8,
    })
    expect(p.remainingTargetPaisa).toBe(0)
    expect(p.progressPercent).toBe(100)
    expect(p.status).toBe('target-reached')
  })
})

describe('DPS compounding', () => {
  it('follows the fixture rule: deposit first, then interest on the new balance', () => {
    const dps = projectDps({
      openingBalancePaisa: 0,
      monthlyDepositPaisa: taka('1000.00'),
      months: 3,
      annualRatePercent: 12,
    })
    // 1% per month. M1: 1000 -> 1010.00. M2: 2010 -> 2030.10. M3: 3030.10 -> 3060.40 (30.301 -> 30.30).
    expect(dps.schedule[0].interestPaisa).toBe(taka('10.00'))
    expect(dps.schedule[0].closingPaisa).toBe(taka('1010.00'))
    expect(dps.schedule[1].closingPaisa).toBe(taka('2030.10'))
    expect(dps.schedule[2].interestPaisa).toBe(taka('30.30'))
    expect(dps.maturityValuePaisa).toBe(taka('3060.40'))
    expect(dps.totalPrincipalPaisa).toBe(taka('3000.00'))
    expect(dps.estimatedInterestPaisa).toBe(taka('60.40'))
  })

  it('earns interest on the opening balance too', () => {
    const dps = projectDps({
      openingBalancePaisa: taka('10000.00'),
      monthlyDepositPaisa: 0,
      months: 1,
      annualRatePercent: 12,
    })
    expect(dps.maturityValuePaisa).toBe(taka('10100.00'))
    expect(dps.totalPrincipalPaisa).toBe(taka('10000.00'))
    expect(dps.estimatedInterestPaisa).toBe(taka('100.00'))
  })

  it('rounds each month half up to the paisa', () => {
    // Balance 100.05 at 12%/yr -> 1.0005 taka interest -> rounds to 1.00 (100.05 paisa -> 100).
    const dps = projectDps({
      openingBalancePaisa: taka('100.05'),
      monthlyDepositPaisa: 0,
      months: 1,
      annualRatePercent: 12,
    })
    expect(dps.schedule[0].interestPaisa).toBe(100)
    expect(dps.maturityValuePaisa).toBe(taka('101.05'))
  })

  it('returns principal only at a zero rate and nothing at zero months', () => {
    const zeroRate = projectDps({ openingBalancePaisa: 0, monthlyDepositPaisa: taka('500.00'), months: 4, annualRatePercent: 0 })
    expect(zeroRate.maturityValuePaisa).toBe(taka('2000.00'))
    expect(zeroRate.estimatedInterestPaisa).toBe(0)

    const zeroMonths = projectDps({ openingBalancePaisa: taka('900.00'), monthlyDepositPaisa: taka('500.00'), months: 0, annualRatePercent: 8 })
    expect(zeroMonths.maturityValuePaisa).toBe(taka('900.00'))
    expect(zeroMonths.schedule).toEqual([])
  })

  it('compounds - the maturity value exceeds simple interest on the same deposits', () => {
    const dps = projectDps({ openingBalancePaisa: 0, monthlyDepositPaisa: taka('5000.00'), months: 12, annualRatePercent: 8 })
    expect(dps.totalPrincipalPaisa).toBe(taka('60000.00'))
    expect(dps.maturityValuePaisa).toBeGreaterThan(taka('62000.00'))
    expect(dps.maturityValuePaisa).toBeLessThan(taka('63000.00'))
    // Every month's closing balance is strictly larger than the last.
    const closings = dps.schedule.map((r) => r.closingPaisa)
    expect([...closings].sort((a, b) => a - b)).toEqual(closings)
  })

  it('uses the effective (not planned) contribution for the DPS run', () => {
    const p = projectPocket({
      pocket: pocket({ targetPaisa: taka('60000.00'), monthlyContributionPaisa: taka('15000.00') }),
      forecastMonthEndBalancePaisa: taka('10000.00'),
      startMonth: '2026-04',
      dpsAnnualRatePercent: 9,
    })
    expect(p.dps?.monthlyDepositPaisa).toBe(taka('10000.00'))
    expect(p.dps?.months).toBe(6)
    expect(p.dps?.annualRatePercent).toBe(9)
    expect(p.dps?.totalPrincipalPaisa).toBe(taka('60000.00'))
    expect(p.dps?.maturityValuePaisa).toBeGreaterThan(taka('60000.00'))
  })

  it('caps the schedule at 50 years before allocating rows', () => {
    const atLimit = projectDps({
      openingBalancePaisa: 0,
      monthlyDepositPaisa: taka('100.00'),
      months: MAX_DPS_PROJECTION_MONTHS,
      annualRatePercent: 8,
    })
    expect(atLimit.schedule).toHaveLength(MAX_DPS_PROJECTION_MONTHS)

    expect(() =>
      projectDps({
        openingBalancePaisa: 0,
        monthlyDepositPaisa: 1,
        months: MAX_DPS_PROJECTION_MONTHS + 1,
        annualRatePercent: 8,
      }),
    ).toThrow(/limited to 600 months/)
    expect(() =>
      projectDps({
        openingBalancePaisa: 0,
        monthlyDepositPaisa: 1,
        months: Number.POSITIVE_INFINITY,
        annualRatePercent: 8,
      }),
    ).toThrow(/finite number/)
  })

  it('rejects unsafe money inputs and rates outside the stated UI range', () => {
    expect(() =>
      projectDps({
        openingBalancePaisa: -1,
        monthlyDepositPaisa: 100,
        months: 1,
        annualRatePercent: 8,
      }),
    ).toThrow(/opening balance/)
    expect(() =>
      projectDps({
        openingBalancePaisa: 0,
        monthlyDepositPaisa: Number.MAX_SAFE_INTEGER,
        months: 2,
        annualRatePercent: 0,
      }),
    ).toThrow(/safe supported money range/)
    expect(() =>
      projectDps({
        openingBalancePaisa: 0,
        monthlyDepositPaisa: 100,
        months: 1,
        annualRatePercent: 30.01,
      }),
    ).toThrow(/between 0% and 30%/)
  })
})

describe('savings pocket form requirements', () => {
  const validDraft = {
    name: 'Laptop',
    item: 'MacBook Air M4, 16 GB RAM',
    target: '145000',
    saved: '0',
    contribution: '12000',
  }

  it('requires item details and a positive monthly contribution', () => {
    expect(validatePocketDraft({ ...validDraft, item: '   ' }).item).toMatch(/Describe the item/)
    expect(validatePocketDraft({ ...validDraft, contribution: '' }).contribution).toMatch(/Enter the planned/)
    expect(validatePocketDraft({ ...validDraft, contribution: '0' }).contribution).toMatch(/greater than/)
  })

  it('accepts a complete pocket with a positive contribution', () => {
    expect(validatePocketDraft(validDraft)).toEqual({})
  })
})
