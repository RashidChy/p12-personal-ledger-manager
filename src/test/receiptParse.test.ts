import { describe, expect, it } from 'vitest'
import {
  extractAmountsFromLine,
  extractDatesFromText,
  parseReceiptText,
  suggestCategory,
} from '../domain/receiptParse'
import { taka } from './helpers'

const REFERENCE = '2026-04-17'

const SUPERMARKET = `Meena Bazar
Dhanmondi Branch, Dhaka
Tel: 09612-345678
CASH MEMO
Invoice No: 4417-2261
Date: 14/04/2026

Basmati Rice 5kg      850.00
Milk 1L x2            220.00
Eggs (dozen)          160.00
Soap bar               95.00

Sub Total            1325.00
VAT 5%                 66.25
Discount              -50.00
GRAND TOTAL          1341.25
Cash Received        1500.00
Change                158.75

Thank you for shopping`

const RESTAURANT = `SULTANS DINE
Gulshan 1, Dhaka
Bill No 8821
17-04-2026 8:42 PM
Kacchi Full x2        1300
Borhani x2             120
Total Payable        1420 Tk`

describe('OCR parsing of representative receipt text', () => {
  it('extracts merchant, date and payable total from a supermarket receipt', () => {
    const parsed = parseReceiptText(SUPERMARKET, REFERENCE)
    expect(parsed.merchant.value).toBe('Meena Bazar')
    expect(parsed.merchant.confidence).toBeGreaterThan(0.9)
    expect(parsed.date.value).toBe('2026-04-14')
    expect(parsed.amount.value).toBe(taka('1341.25'))
    expect(parsed.suggestedCategory).toBe('Groceries')
  })

  it('prefers the labelled total over subtotal, VAT, cash and change lines', () => {
    const parsed = parseReceiptText(SUPERMARKET, REFERENCE)
    expect(parsed.amount.value).not.toBe(taka('1325.00')) // sub total
    expect(parsed.amount.value).not.toBe(taka('1500.00')) // cash received (largest number)
    expect(parsed.amount.reason).toMatch(/grand\/net total|total/i)
    expect(parsed.amount.needsReview).toBe(false)
  })

  it('handles a compact restaurant receipt with a trailing Tk marker', () => {
    const parsed = parseReceiptText(RESTAURANT, REFERENCE)
    expect(parsed.merchant.value).toBe('Sultans Dine')
    expect(parsed.date.value).toBe('2026-04-17')
    expect(parsed.amount.value).toBe(taka('1420.00'))
    expect(parsed.suggestedCategory).toBe('Food')
  })

  it('flags a receipt containing multiple monetary values', () => {
    const parsed = parseReceiptText(SUPERMARKET, REFERENCE)
    expect(parsed.amountCandidates.length).toBeGreaterThan(3)
    expect(parsed.warnings.join(' ')).toMatch(/monetary values/)
    const values = parsed.amountCandidates.map((c) => c.amountPaisa)
    expect(values).toContain(taka('1341.25'))
    expect(values).toContain(taka('1325.00'))
    expect(new Set(values).size).toBe(values.length) // candidates are de-duplicated
  })

  it('falls back to the largest value with low confidence when nothing is labelled', () => {
    const parsed = parseReceiptText(`Corner Store\n12/04/2026\nItem A 120.00\nItem B 340.00`, REFERENCE)
    expect(parsed.amount.value).toBe(taka('340.00'))
    expect(parsed.amount.confidence).toBeLessThan(0.7)
    expect(parsed.amount.needsReview).toBe(true)
    expect(parsed.amount.reason).toMatch(/No total label/)
  })

  it('reports a missing amount instead of guessing zero', () => {
    const parsed = parseReceiptText(`Some Shop\nThank you\nplease come again`, REFERENCE)
    expect(parsed.amount.value).toBeNull()
    expect(parsed.amount.needsReview).toBe(true)
    expect(parsed.warnings.join(' ')).toMatch(/No amount found/)
  })

  it('reports a missing date instead of defaulting silently', () => {
    const parsed = parseReceiptText(`Chillox\nBurger Combo\nTotal 780`, REFERENCE)
    expect(parsed.date.value).toBeNull()
    expect(parsed.date.needsReview).toBe(true)
    expect(parsed.warnings.join(' ')).toMatch(/No date could be read/)
    expect(parsed.amount.value).toBe(taka('780.00'))
  })

  it('reports a missing merchant instead of inventing one', () => {
    const parsed = parseReceiptText(`Invoice No: 88213\nDate: 04/04/2026\nTotal 250.00`, REFERENCE)
    expect(parsed.merchant.value).toBeNull()
    expect(parsed.merchant.needsReview).toBe(true)
    expect(parsed.warnings.join(' ')).toMatch(/No merchant name/)
  })

  it('warns when almost nothing was recognised', () => {
    const parsed = parseReceiptText('!!!', REFERENCE)
    expect(parsed.warnings[0]).toMatch(/Very little text/)
  })

  it('corrects common OCR digit confusions inside amounts', () => {
    expect(extractAmountsFromLine('TOTAL  1,2S0.O0')).toContain(taka('1250.00'))
    expect(extractAmountsFromLine('Total l50.00')).toContain(taka('150.00'))
  })

  it('suggests a category from the merchant', () => {
    expect(suggestCategory('Uber', 'trip fare').category).toBe('Transport')
    expect(suggestCategory('DESCO', 'electricity bill').category).toBe('Utilities')
    expect(suggestCategory('Lazz Pharma', '').category).toBe('Health')
    expect(suggestCategory('Some Random Shop', '').category).toBe('Other')
  })
})

describe('date extraction', () => {
  it('reads several written formats', () => {
    expect(extractDatesFromText('Date: 2026-04-14')[0].date).toBe('2026-04-14')
    expect(extractDatesFromText('17 Apr 2026')[0].date).toBe('2026-04-17')
    expect(extractDatesFromText('Apr 17, 2026')[0].date).toBe('2026-04-17')
    expect(extractDatesFromText('14.04.26')[0].date).toBe('2026-04-14')
  })

  it('assumes day-first for ambiguous dates and marks them ambiguous', () => {
    const [hit] = extractDatesFromText('05/04/2026')
    expect(hit.date).toBe('2026-04-05')
    expect(hit.ambiguous).toBe(true)
  })

  it('resolves unambiguous orders correctly', () => {
    expect(extractDatesFromText('25/12/2026')[0]).toMatchObject({ date: '2026-12-25', ambiguous: false })
    expect(extractDatesFromText('12/25/2026')[0]).toMatchObject({ date: '2026-12-25', ambiguous: false })
  })

  it('rejects impossible calendar days', () => {
    expect(extractDatesFromText('31/02/2026')).toHaveLength(0)
  })

  it('prefers a non-future date and warns when the receipt date is ahead of the forecast date', () => {
    const parsed = parseReceiptText('Agora\nDate: 20/04/2026\nTotal 300.00', REFERENCE)
    expect(parsed.date.value).toBe('2026-04-20')
    expect(parsed.date.confidence).toBeLessThan(0.5)
    expect(parsed.warnings.join(' ')).toMatch(/after the forecast date/)
  })

  it('flags an ambiguous date for review', () => {
    const parsed = parseReceiptText('Agora\n05/04/2026\nGRAND TOTAL 300.00', REFERENCE)
    expect(parsed.date.value).toBe('2026-04-05')
    expect(parsed.warnings.join(' ')).toMatch(/ambiguous/)
  })
})
