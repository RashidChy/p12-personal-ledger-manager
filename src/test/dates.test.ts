import { describe, expect, it } from 'vitest'
import {
  addMonths,
  daysInMonth,
  elapsedDaysCheck,
  formatIsoDate,
  isIsoDate,
  lastDayOfMonth,
  monthLabel,
  monthOf,
  previousMonth,
} from './dateReexports'

describe('month and year boundaries', () => {
  it('rolls the year over when stepping across December and January', () => {
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -13)).toBe('2024-12')
    expect(addMonths('2026-11', 14)).toBe('2028-01')
  })

  it('knows month lengths including leap years', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
  })

  it('validates ISO dates against real calendar days', () => {
    expect(isIsoDate('2026-04-17')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-4-1')).toBe(false)
  })

  it('formats months and dates for display', () => {
    expect(monthLabel('2026-04')).toBe('April 2026')
    expect(formatIsoDate('2026-04-17')).toBe('17 Apr 2026')
    expect(monthOf('2026-04-17')).toBe('2026-04')
  })

  it('counts elapsed days across a month boundary', () => {
    expect(elapsedDaysCheck('2026-03', '2026-04-17')).toBe(31) // month already over
    expect(elapsedDaysCheck('2026-04', '2026-04-17')).toBe(17)
    expect(elapsedDaysCheck('2026-05', '2026-04-17')).toBe(0) // month not started
  })
})
