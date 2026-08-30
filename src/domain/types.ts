import type { IsoDate, MonthKey } from './dates'
import type { Paisa } from './money'

/** Categories seen in the official P12 fixture, plus "Other" for user entries. */
export const CATEGORIES = [
  'Groceries',
  'Rent',
  'Utilities',
  'Education',
  'Food',
  'Transport',
  'Health',
  'Mobile',
  'Entertainment',
  'Clothing',
  'Other',
] as const

export type Category = (typeof CATEGORIES)[number]

export type ExpenseSource = 'fixture' | 'manual' | 'receipt'

export interface Expense {
  id: string
  date: IsoDate
  category: Category
  shop: string
  amountPaisa: Paisa
  source: ExpenseSource
  /** Free-text note, used by the receipt flow to record what was corrected. */
  note?: string
}

export interface Pocket {
  id: string
  name: string
  item: string
  targetPaisa: Paisa
  savedPaisa: Paisa
  monthlyContributionPaisa: Paisa
}

export const SCHEMA_VERSION = 2

export interface LedgerState {
  schemaVersion: number
  /** Monthly salary that applies unless a month has an explicit override. */
  salaryPaisa: Paisa | null
  /** Per-month salary overrides, keyed "YYYY-MM". */
  salaryByMonth: Record<MonthKey, Paisa>
  expenses: Expense[]
  pockets: Pocket[]
  /** Illustrative annual DPS rate, percent (e.g. 8 for 8.00%). */
  dpsAnnualRatePercent: number
  /** "Forecast as of" date. Seeded from the fixture's `today`. */
  referenceDate: IsoDate
  /** Which official fixture case seeded this ledger. */
  fixtureCaseId: string | null
  updatedAt: string
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}
