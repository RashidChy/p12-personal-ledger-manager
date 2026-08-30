/**
 * Validation and schema migration for locally-stored ledger data.
 *
 * Rules this file exists to enforce:
 *  - a stored blob from an older schema version is migrated, not discarded;
 *  - a record that cannot be understood is dropped with a reported issue,
 *    never silently coerced into a zero;
 *  - a corrupt blob never takes the rest of the user's data down with it.
 */
import { isIsoDate, isMonthKey, todayIso } from '../domain/dates'
import { isValidPaisa } from '../domain/money'
import { SCHEMA_VERSION, isCategory, type Expense, type LedgerState, type Pocket } from '../domain/types'

export interface ValidationResult {
  state: LedgerState | null
  issues: string[]
  migratedFrom: number | null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asPaisa(value: unknown): number | null {
  return isValidPaisa(value) ? value : null
}

function validateExpense(raw: unknown, index: number, issues: string[]): Expense | null {
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
  if (amountPaisa === null || amountPaisa <= 0) {
    issues.push(`Expense ${id} had an invalid amount (${JSON.stringify(r.amountPaisa)}) and was dropped.`)
    return null
  }
  const category = isCategory(r.category) ? r.category : 'Other'
  if (!isCategory(r.category)) {
    issues.push(`Expense ${id} had an unknown category (${JSON.stringify(r.category)}); it was moved to "Other".`)
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
  const name = asString(r.name).trim()
  const item = asString(r.item).trim()
  const targetPaisa = asPaisa(r.targetPaisa)
  const savedPaisa = asPaisa(r.savedPaisa)
  const monthlyContributionPaisa = asPaisa(r.monthlyContributionPaisa)
  if (!id) {
    issues.push(`Savings pocket #${index + 1} had no id and was dropped.`)
    return null
  }
  if (
    !name ||
    !item ||
    targetPaisa === null ||
    targetPaisa <= 0 ||
    savedPaisa === null ||
    savedPaisa < 0 ||
    monthlyContributionPaisa === null ||
    monthlyContributionPaisa <= 0
  ) {
    issues.push(`Savings pocket ${id} had missing details or invalid amounts and was dropped.`)
    return null
  }
  return {
    id,
    name,
    item,
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

  const expensesRaw = Array.isArray(raw.expenses) ? raw.expenses : []
  if (!Array.isArray(raw.expenses)) issues.push('No expense list was found in stored data; an empty list was used.')
  const expenses = expensesRaw
    .map((e, i) => validateExpense(e, i, issues))
    .filter((e): e is Expense => e !== null)

  const pocketsRaw = Array.isArray(raw.pockets) ? raw.pockets : []
  const pockets = pocketsRaw
    .map((p, i) => validatePocket(p, i, issues))
    .filter((p): p is Pocket => p !== null)

  const parsedSalaryPaisa = raw.salaryPaisa === null ? null : asPaisa(raw.salaryPaisa)
  const salaryPaisa = parsedSalaryPaisa !== null && parsedSalaryPaisa >= 0 ? parsedSalaryPaisa : null
  if (raw.salaryPaisa !== null && raw.salaryPaisa !== undefined && salaryPaisa === null) {
    issues.push('The stored monthly salary was invalid and has been cleared. Set it again to restore salary-based figures.')
  }

  const salaryByMonth: Record<string, number> = {}
  if (typeof raw.salaryByMonth === 'object' && raw.salaryByMonth !== null) {
    for (const [month, value] of Object.entries(raw.salaryByMonth as Record<string, unknown>)) {
      const paisa = asPaisa(value)
      if (isMonthKey(month) && paisa !== null && paisa >= 0) salaryByMonth[month] = paisa
      else issues.push(`A salary override for "${month}" was invalid and was dropped.`)
    }
  }

  const referenceDate = isIsoDate(raw.referenceDate) ? raw.referenceDate : todayIso()
  if (!isIsoDate(raw.referenceDate)) {
    issues.push(`The stored forecast date was invalid; today's date (${referenceDate}) is used instead.`)
  }

  const dpsAnnualRatePercent =
    typeof raw.dpsAnnualRatePercent === 'number' &&
    Number.isFinite(raw.dpsAnnualRatePercent) &&
    raw.dpsAnnualRatePercent >= 0 &&
    raw.dpsAnnualRatePercent <= 30
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
    dpsAnnualRatePercent,
    referenceDate,
    fixtureCaseId: typeof raw.fixtureCaseId === 'string' ? raw.fixtureCaseId : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  }

  return { state, issues, migratedFrom: originalVersion !== SCHEMA_VERSION ? originalVersion : null }
}
