import type { IsoDate, MonthKey } from './dates'
import type { Paisa } from './money'

/**
 * Categories the app ships with: the ones seen in the official P12 fixture,
 * plus "Other". They only seed a new ledger - from then on the list lives in
 * `LedgerState.categories` and the user can add, rename and delete entries.
 */
export const DEFAULT_CATEGORIES = [
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

/** @deprecated Kept as the previous name for {@link DEFAULT_CATEGORIES}. */
export const CATEGORIES = DEFAULT_CATEGORIES

/**
 * A category is any user-chosen label, not a fixed union: the list is data the
 * user owns. See `domain/categories.ts` for the naming rules that constrain it.
 */
export type Category = string

/**
 * The bucket unrecognised or orphaned records fall into. It cannot be deleted
 * or renamed, because import and validation both need somewhere to put a
 * category they do not recognise.
 */
export const FALLBACK_CATEGORY = 'Other'

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

export const SCHEMA_VERSION = 3

export interface LedgerState {
  schemaVersion: number
  /** Monthly salary that applies unless a month has an explicit override. */
  salaryPaisa: Paisa | null
  /** Per-month salary overrides, keyed "YYYY-MM". */
  salaryByMonth: Record<MonthKey, Paisa>
  expenses: Expense[]
  pockets: Pocket[]
  /** The user's expense categories, in display order. Always includes "Other". */
  categories: Category[]
  /** Illustrative annual DPS rate, percent (e.g. 8 for 8.00%). */
  dpsAnnualRatePercent: number
  /** "Forecast as of" date. Seeded from the fixture's `today`. */
  referenceDate: IsoDate
  /** Which official fixture case seeded this ledger. */
  fixtureCaseId: string | null
  updatedAt: string
}

/** True when `value` is one of the categories the app ships with. */
export function isDefaultCategory(value: unknown): value is Category {
  return typeof value === 'string' && (DEFAULT_CATEGORIES as readonly string[]).includes(value)
}

/** @deprecated Kept as the previous name for {@link isDefaultCategory}. */
export const isCategory = isDefaultCategory
