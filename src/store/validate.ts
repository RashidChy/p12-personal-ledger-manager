/**
 * Validation and schema migration for locally-stored ledger data.
 *
 * Rules this file exists to enforce:
 *  - a stored blob from an older schema version is migrated, not discarded;
 *  - a record that cannot be understood is dropped with a reported issue,
 *    never silently coerced into a zero;
 *  - a corrupt blob never takes the rest of the user's data down with it.
 */
import { canonicalCategories, defaultCategories, findCategory, normalizeCategoryName } from '../domain/categories'
import { isIsoDate, isMonthKey, todayIso } from '../domain/dates'
import { isValidPaisa } from '../domain/money'
import {
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  SCHEMA_VERSION,
  type Category,
  type Expense,
  type LedgerState,
  type Pocket,
} from '../domain/types'

export interface ValidationResult {
  state: LedgerState | null
  issues: string[]
  migratedFrom: number | null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asPaisa(value: unknown): number | null {
  if (isValidPaisa(value)) return value
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  return null
}

/**
 * Repairs the stored category list. A missing list is normal for data written
 * before categories were editable, so it falls back to the defaults quietly;
 * entries that cannot be used are reported individually.
 */
function validateCategories(raw: unknown, issues: string[]): Category[] {
  if (!Array.isArray(raw)) return defaultCategories()

  const usable: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || !normalizeCategoryName(entry)) {
      issues.push(`A stored category (${JSON.stringify(entry)}) was not a usable name and was dropped.`)
      continue
    }
    usable.push(normalizeCategoryName(entry))
  }
  if (usable.length === 0) {
    issues.push('The stored category list was empty; the built-in categories are used instead.')
    return defaultCategories()
  }

  const categories = canonicalCategories(usable)
  const kept = new Set(categories.map((c) => c.toLowerCase()))
  const lost = [...new Set(usable.filter((name) => !kept.has(name.toLowerCase())))]
  for (const name of lost) {
    issues.push(`The stored category "${name}" was too long to keep and was dropped.`)
  }
  return categories
}

function validateExpense(
  raw: unknown,
  index: number,
  categories: readonly Category[],
  issues: string[],
): Expense | null {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(`Expense #${index + 1} was not an object and was dropped.`)
    return null
  }
  const r = raw as Record<string, unknown>
  const id = asString(r.id)
  const date = asString(r.date)
  const amountPaisa = asPaisa(r.amountPaisa)
  if (!id) {
    issues.push(`Expense #${index + 1} had no id and was dropped.`)
    return null
  }
  if (!isIsoDate(date)) {
    issues.push(`Expense ${id} had an invalid date (${JSON.stringify(r.date)}) and was dropped.`)
    return null
  }
  if (amountPaisa === null) {
    issues.push(`Expense ${id} had an invalid amount (${JSON.stringify(r.amountPaisa)}) and was dropped.`)
    return null
  }
  const known = typeof r.category === 'string' ? findCategory(categories, r.category) : null
  const category = known ?? FALLBACK_CATEGORY
  if (known === null) {
    issues.push(
      `Expense ${id} had an unknown category (${JSON.stringify(r.category)}); it was moved to "${FALLBACK_CATEGORY}".`,
    )
  }
  const source = r.source === 'fixture' || r.source === 'manual' || r.source === 'receipt' ? r.source : 'manual'
  const expense: Expense = {
    id,
    date,
    category,
    shop: asString(r.shop, 'Unknown'),
    amountPaisa,
    source,
  }
  if (typeof r.note === 'string' && r.note) expense.note = r.note
  return expense
}

function validatePocket(raw: unknown, index: number, issues: string[]): Pocket | null {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(`Savings pocket #${index + 1} was not an object and was dropped.`)
    return null
  }
  const r = raw as Record<string, unknown>
  const id = asString(r.id)
  const targetPaisa = asPaisa(r.targetPaisa)
  const savedPaisa = asPaisa(r.savedPaisa) ?? 0
  const monthlyContributionPaisa = asPaisa(r.monthlyContributionPaisa) ?? 0
  if (!id) {
    issues.push(`Savings pocket #${index + 1} had no id and was dropped.`)
    return null
  }
  if (targetPaisa === null) {
    issues.push(`Savings pocket ${id} had an invalid target amount and was dropped.`)
    return null
  }
  return {
    id,
    name: asString(r.name, 'Untitled pocket'),
    item: asString(r.item),
    targetPaisa,
    savedPaisa,
    monthlyContributionPaisa,
  }
}

/** Migrates any older stored shape up to the current schema version. */
export function migrate(raw: Record<string, unknown>, issues: string[]): Record<string, unknown> {
  const data = { ...raw }
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1

  if (version < 2) {
    // v1 stored a single salary in whole taka and had no per-month overrides.
    const legacySalary = data.salary ?? data.salaryTaka
    if (typeof legacySalary === 'number' && Number.isFinite(legacySalary)) {
      data.salaryPaisa = Math.round(legacySalary * 100)
    }
    delete data.salary
    delete data.salaryTaka
    if (typeof data.salaryByMonth !== 'object' || data.salaryByMonth === null) data.salaryByMonth = {}
    issues.push('Stored data was upgraded from schema v1 to v2 (salary is now stored in paisa with per-month overrides).')
    version = 2
  }

  if (version < 3) {
    // v2 had a fixed, built-in category list; v3 stores an editable one.
    if (!Array.isArray(data.categories)) data.categories = [...DEFAULT_CATEGORIES]
    issues.push('Stored data was upgraded from schema v2 to v3 (expense categories are now an editable list).')
    version = 3
  }

  if (version > SCHEMA_VERSION) {
    issues.push(
      `Stored data was written by a newer version of this app (schema v${version}); it was loaded on a best-effort basis.`,
    )
  }
  data.schemaVersion = SCHEMA_VERSION
  return data
}

/** Validates an unknown blob into a LedgerState, reporting everything it drops. */
export function validateLedgerState(input: unknown): ValidationResult {
  const issues: string[] = []
  if (typeof input !== 'object' || input === null) {
    return { state: null, issues: ['Stored data was not a JSON object.'], migratedFrom: null }
  }
  const original = input as Record<string, unknown>
  const originalVersion = typeof original.schemaVersion === 'number' ? original.schemaVersion : 1
  const raw = migrate(original, issues)

  const categories = validateCategories(raw.categories, issues)

  const expensesRaw = Array.isArray(raw.expenses) ? raw.expenses : []
  if (!Array.isArray(raw.expenses)) issues.push('No expense list was found in stored data; an empty list was used.')
  const expenses = expensesRaw
    .map((e, i) => validateExpense(e, i, categories, issues))
    .filter((e): e is Expense => e !== null)

  const pocketsRaw = Array.isArray(raw.pockets) ? raw.pockets : []
  const pockets = pocketsRaw
    .map((p, i) => validatePocket(p, i, issues))
    .filter((p): p is Pocket => p !== null)

  const salaryPaisa = raw.salaryPaisa === null ? null : asPaisa(raw.salaryPaisa)
  if (raw.salaryPaisa !== null && raw.salaryPaisa !== undefined && salaryPaisa === null) {
    issues.push('The stored monthly salary was invalid and has been cleared. Set it again to restore salary-based figures.')
  }

  const salaryByMonth: Record<string, number> = {}
  if (typeof raw.salaryByMonth === 'object' && raw.salaryByMonth !== null) {
    for (const [month, value] of Object.entries(raw.salaryByMonth as Record<string, unknown>)) {
      const paisa = asPaisa(value)
      if (isMonthKey(month) && paisa !== null) salaryByMonth[month] = paisa
      else issues.push(`A salary override for "${month}" was invalid and was dropped.`)
    }
  }

  const referenceDate = isIsoDate(raw.referenceDate) ? raw.referenceDate : todayIso()
  if (!isIsoDate(raw.referenceDate)) {
    issues.push(`The stored forecast date was invalid; today's date (${referenceDate}) is used instead.`)
  }

  const dpsAnnualRatePercent =
    typeof raw.dpsAnnualRatePercent === 'number' && Number.isFinite(raw.dpsAnnualRatePercent) && raw.dpsAnnualRatePercent >= 0
      ? raw.dpsAnnualRatePercent
      : 8
  if (raw.dpsAnnualRatePercent !== undefined && dpsAnnualRatePercent !== raw.dpsAnnualRatePercent) {
    issues.push('The stored DPS rate was invalid; the illustrative 8.00% default is used instead.')
  }

  const state: LedgerState = {
    schemaVersion: SCHEMA_VERSION,
    salaryPaisa: salaryPaisa,
    salaryByMonth,
    expenses,
    pockets,
    categories,
    dpsAnnualRatePercent,
    referenceDate,
    fixtureCaseId: typeof raw.fixtureCaseId === 'string' ? raw.fixtureCaseId : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  }

  return { state, issues, migratedFrom: originalVersion !== SCHEMA_VERSION ? originalVersion : null }
}
