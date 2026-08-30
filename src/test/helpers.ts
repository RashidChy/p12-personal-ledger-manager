import { parseTakaToPaisa } from '../domain/money'
import { SCHEMA_VERSION, type Category, type Expense, type LedgerState } from '../domain/types'

let counter = 0

export function expense(date: string, category: Category, shop: string, taka: string): Expense {
  counter += 1
  return {
    id: `T${String(counter).padStart(4, '0')}`,
    date,
    category,
    shop,
    amountPaisa: parseTakaToPaisa(taka),
    source: 'manual',
  }
}

export function ledger(partial: Partial<LedgerState> = {}): LedgerState {
  return {
    schemaVersion: SCHEMA_VERSION,
    salaryPaisa: parseTakaToPaisa('50000.00'),
    salaryByMonth: {},
    expenses: [],
    pockets: [],
    dpsAnnualRatePercent: 8,
    referenceDate: '2026-04-17',
    fixtureCaseId: null,
    updatedAt: '2026-04-17T00:00:00.000Z',
    ...partial,
  }
}

export const taka = parseTakaToPaisa
