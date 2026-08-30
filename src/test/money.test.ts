import { describe, expect, it } from 'vitest'
import { isValidPaisa, parseTakaToPaisa, roundHalfUp, sumPaisa } from '../domain/money'
import { formatTaka, formatPercent, formatSignedPercent } from '../domain/format'

describe('money', () => {
  it('parses fixture-style 2-decimal strings exactly', () => {
    expect(parseTakaToPaisa('2475.00')).toBe(247500)
    expect(parseTakaToPaisa('856.50')).toBe(85650)
    expect(parseTakaToPaisa('0.05')).toBe(5)
    expect(parseTakaToPaisa('110000.00')).toBe(11000000)
  })

  it('accepts commas, currency marks and missing decimals', () => {
    expect(parseTakaToPaisa('৳1,250')).toBe(125000)
    expect(parseTakaToPaisa('BDT 12,500.75')).toBe(1250075)
    expect(parseTakaToPaisa('Tk 99')).toBe(9900)
  })

  it('rejects nonsense instead of coercing it to zero', () => {
    expect(() => parseTakaToPaisa('abc')).toThrow()
    expect(() => parseTakaToPaisa('')).toThrow()
    expect(() => parseTakaToPaisa('12.3.4')).toThrow()
  })

  it('rejects values that cannot be represented as exact integer paisa', () => {
    expect(() => parseTakaToPaisa('999999999999999999999999.00')).toThrow(/safe supported range/)
    expect(() => parseTakaToPaisa(Number.MAX_SAFE_INTEGER)).toThrow(/safe supported range/)
    expect(isValidPaisa(Number.MAX_SAFE_INTEGER)).toBe(true)
    expect(isValidPaisa(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
    expect(() => sumPaisa([Number.MAX_SAFE_INTEGER, 1])).toThrow(/safe supported range/)
  })

  it('rounds sub-paisa input half up', () => {
    expect(parseTakaToPaisa('10.005')).toBe(1001)
    expect(parseTakaToPaisa('10.004')).toBe(1000)
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(-2.5)).toBe(-3)
  })

  it('sums without floating point drift', () => {
    const values = Array.from({ length: 1000 }, () => parseTakaToPaisa('0.10'))
    expect(sumPaisa(values)).toBe(10000)
  })
})

describe('taka formatting', () => {
  it('uses the taka sign and South Asian grouping', () => {
    expect(formatTaka(1250000)).toBe('৳12,500')
    expect(formatTaka(14500000)).toBe('৳1,45,000')
    expect(formatTaka(85650)).toBe('৳856.50')
    expect(formatTaka(-247500)).toBe('-৳2,475')
    expect(formatTaka(247500, { signed: true })).toBe('+৳2,475')
  })

  it('renders missing values as an em dash rather than zero', () => {
    expect(formatTaka(null)).toBe('—')
    expect(formatPercent(null)).toBe('—')
    expect(formatSignedPercent(12.3, 1)).toBe('+12.3%')
  })
})
