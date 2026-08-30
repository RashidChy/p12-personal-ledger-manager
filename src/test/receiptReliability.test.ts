import { describe, expect, it } from 'vitest'
import { parseReceiptText } from '../domain/receiptParse'
import {
  chooseBestReceiptScan,
  needsEnhancedReceiptPass,
  receiptScanDisagreements,
  receiptScanScore,
  reconcileReceiptScans,
  type ReceiptScanCandidate,
} from '../domain/receiptReliability'

const REFERENCE = '2026-04-30'

function candidate(text: string, engineConfidence: number, mode: 'standard' | 'enhanced'): ReceiptScanCandidate {
  return {
    mode,
    text,
    engineConfidence,
    durationMs: 100,
    parsed: parseReceiptText(text, REFERENCE),
  }
}

describe('receipt scan reliability scoring', () => {
  it('keeps a complete high-confidence first pass fast', () => {
    const scan = candidate('Meena Bazar\nDate 17/04/2026\nGRAND TOTAL 1250.00', 93, 'standard')
    expect(needsEnhancedReceiptPass(scan)).toBe(false)
    expect(receiptScanScore(scan)).toBeGreaterThan(82)
  })

  it('requests enhancement when a required field is missing or uncertain', () => {
    const missing = candidate('TOTAL 1250', 88, 'standard')
    const uncertain = candidate('Corner Shop\n05/04/2026\nTOTAL 1250', 90, 'standard')
    expect(needsEnhancedReceiptPass(missing)).toBe(true)
    expect(needsEnhancedReceiptPass(uncertain)).toBe(true)
  })

  it('chooses the pass with stronger extracted fields, not merely the higher engine score', () => {
    const standard = candidate('unreadable\nTOTAL 1250', 91, 'standard')
    const enhanced = candidate('Meena Bazar\nDate 17/04/2026\nGRAND TOTAL 1250', 78, 'enhanced')
    expect(chooseBestReceiptScan([standard, enhanced]).mode).toBe('enhanced')
  })

  it('never hides a conflicting total from another successful OCR pass', () => {
    const standard = candidate('Meena Bazar\nDate 17/04/2026\nGRAND TOTAL 575.00', 94, 'standard')
    const enhanced = candidate('Meena Bazar\nDate 17/04/2026\nGRAND TOTAL 515.00', 93, 'enhanced')

    expect(receiptScanDisagreements([standard, enhanced])).toContainEqual({
      field: 'amount',
      values: ['575.00', '515.00'],
    })
    const reconciled = reconcileReceiptScans([standard, enhanced])
    expect(reconciled.parsed.amount.needsReview).toBe(true)
    expect(reconciled.parsed.amount.confidence).toBeLessThan(0.7)
    expect(reconciled.parsed.amountCandidates.map((item) => item.amountPaisa)).toEqual(
      expect.arrayContaining([57500, 51500]),
    )
  })
})
