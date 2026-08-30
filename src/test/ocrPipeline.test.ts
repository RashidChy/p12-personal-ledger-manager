import { describe, expect, it } from 'vitest'
import { parseReceiptText } from '../domain/receiptParse'
import { OCR_SAMPLES } from './ocrSamples'
import { taka } from './helpers'

const REFERENCE = '2026-04-17'

describe('parsing real Tesseract output from the sample receipts', () => {
  it('reads the supermarket receipt end to end', () => {
    const parsed = parseReceiptText(OCR_SAMPLES['meena-bazar.png'].text, REFERENCE)
    expect(parsed.merchant.value).toBe('Meena Bazar')
    expect(parsed.date.value).toBe('2026-04-14')
    expect(parsed.amount.value).toBe(taka('1341.25'))
    expect(parsed.suggestedCategory).toBe('Groceries')
    expect(parsed.merchant.needsReview).toBe(false)
    expect(parsed.amount.needsReview).toBe(false)
  })

  it('ignores the invoice number, phone number and time when picking the amount', () => {
    const parsed = parseReceiptText(OCR_SAMPLES['meena-bazar.png'].text, REFERENCE)
    const values = parsed.amountCandidates.map((c) => c.amountPaisa)
    expect(values).not.toContain(taka('9612.00'))
    expect(values).not.toContain(taka('1924.00'))
    expect(values).not.toContain(taka('4417.00'))
  })

  it('ignores item sizes such as "100g" and "5kg" when listing amounts', () => {
    const parsed = parseReceiptText(OCR_SAMPLES['meena-bazar.png'].text, REFERENCE)
    const values = parsed.amountCandidates.map((c) => c.amountPaisa)
    expect(values).not.toContain(taka('100.00')) // "Savlon Soap 100g"
    expect(values).toContain(taka('95.00')) // its actual price
  })

  it('reads the restaurant bill and prefers "TOTAL PAYABLE" over the subtotal', () => {
    const parsed = parseReceiptText(OCR_SAMPLES['sultans-dine.png'].text, REFERENCE)
    expect(parsed.merchant.value).toBe('Sultans Dine')
    expect(parsed.date.value).toBe('2026-04-17')
    expect(parsed.amount.value).toBe(taka('1617.00'))
    expect(parsed.suggestedCategory).toBe('Food')
  })

  it('still reads a blurred, skewed, low-contrast scan', () => {
    const parsed = parseReceiptText(OCR_SAMPLES['blurred.png'].text, REFERENCE)
    expect(parsed.merchant.value).toBe('Lazz Pharma')
    expect(parsed.date.value).toBe('2026-04-09')
    expect(parsed.amount.value).toBe(taka('575.00'))
    expect(parsed.suggestedCategory).toBe('Health')
  })

  it('reports every alternative monetary value so a wrong pick is correctable', () => {
    const parsed = parseReceiptText(OCR_SAMPLES['meena-bazar.png'].text, REFERENCE)
    const values = parsed.amountCandidates.map((c) => c.amountPaisa)
    expect(values).toContain(taka('1341.25'))
    expect(values).toContain(taka('1325.00'))
    expect(values).toContain(taka('1500.00'))
    expect(parsed.warnings.join(' ')).toMatch(/monetary values/)
  })
})
