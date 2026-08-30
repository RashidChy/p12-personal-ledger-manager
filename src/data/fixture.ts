/**
 * Official LofiStack P12 fixture loader.
 *
 * Source: https://live.hackathon.lofistack.com/api/fixtures/P12?teamId=LSH26-T008
 * An unmodified copy is committed at public/data/fixtures/P12.json (and imported
 * here from src/data/P12.fixture.json, byte-identical) so the demo is
 * reproducible offline and browser CORS can never break the opening screen.
 *
 * Fixture shape (schema_version 2.1), validated against all 25 public cases:
 *   case_id, today, months {last, this}, salary_bdt,
 *   expenses[] { id, date, category, shop, amount_bdt },
 *   pockets[]  { id, name, item, target_bdt, monthly_contribution_bdt },
 *   dps_annual_rate_percent, dps_rule
 *
 * Documented assumptions (see README):
 *  - amounts are fixed 2-decimal strings and are converted to exact paisa;
 *  - `today` is the reference/"forecast as of" date and always falls inside
 *    `months.this`;
 *  - pockets carry no "already saved" figure, so pockets start at ৳0 saved and
 *    the amount is editable in the app.
 */
import rawFixture from './P12.fixture.json'
import { isIsoDate, type IsoDate } from '../domain/dates'
import { parseTakaToPaisa } from '../domain/money'
import { canonicalCategories, defaultCategories, normalizeCategoryName } from '../domain/categories'
import { SCHEMA_VERSION, isDefaultCategory, type Expense, type LedgerState, type Pocket } from '../domain/types'

export interface FixtureCase {
  case_id: string
  today: string
  months: { last: string; this: string }
  salary_bdt: string
  expenses: Array<{ id: string; date: string; category: string; shop: string; amount_bdt: string }>
  pockets: Array<{ id: string; name: string; item: string; target_bdt: string; monthly_contribution_bdt: string }>
  dps_annual_rate_percent: string
  dps_rule: string
}

export interface FixtureFile {
  schema_version: string
  problem_id: string
  format_note: string
  cases: FixtureCase[]
}

export const fixture = rawFixture as unknown as FixtureFile

export const FIXTURE_SOURCE_URL =
  'https://live.hackathon.lofistack.com/api/fixtures/P12?teamId=LSH26-T008'

export const DEFAULT_CASE_ID = 'PUB-01'

export interface FixtureValidation {
  ok: boolean
  caseCount: number
  problems: string[]
  notes: string[]
}

/** Schema check run over the whole fixture; surfaced in the methodology panel. */
export function validateFixture(file: FixtureFile = fixture): FixtureValidation {
  const problems: string[] = []
  const notes: string[] = []
  if (file.problem_id !== 'P12') problems.push(`Unexpected problem_id: ${file.problem_id}`)
  if (!Array.isArray(file.cases) || file.cases.length === 0) problems.push('Fixture contains no cases.')

  for (const c of file.cases ?? []) {
    if (!isIsoDate(c.today)) problems.push(`${c.case_id}: invalid "today" (${c.today})`)
    if (c.today?.slice(0, 7) !== c.months?.this) {
      problems.push(`${c.case_id}: "today" (${c.today}) is not inside months.this (${c.months?.this})`)
    }
    for (const e of c.expenses ?? []) {
      if (!isIsoDate(e.date)) problems.push(`${c.case_id}/${e.id}: invalid date ${e.date}`)
      if (!/^\d+\.\d{2}$/.test(e.amount_bdt)) problems.push(`${c.case_id}/${e.id}: unexpected amount format ${e.amount_bdt}`)
      if (e.date > c.today) problems.push(`${c.case_id}/${e.id}: dated after "today"`)
      if (!isDefaultCategory(e.category)) {
        notes.push(`${c.case_id}/${e.id}: category "${e.category}" is not in the built-in list; it is added to the category list on import.`)
      }
    }
    for (const p of c.pockets ?? []) {
      if (!/^\d+\.\d{2}$/.test(p.target_bdt)) problems.push(`${c.case_id}/${p.id}: unexpected target format ${p.target_bdt}`)
    }
  }
  if (problems.length === 0) {
    notes.push(`All ${file.cases.length} public cases match the documented schema (dates, 2-decimal amounts, categories).`)
    notes.push('Pockets carry no "current saved" field, so the app seeds them at ৳0 saved and lets the user edit it.')
  }
  return { ok: problems.length === 0, caseCount: file.cases?.length ?? 0, problems, notes }
}

export function listCases(file: FixtureFile = fixture): FixtureCase[] {
  return file.cases ?? []
}

export function getCase(caseId: string, file: FixtureFile = fixture): FixtureCase {
  const found = (file.cases ?? []).find((c) => c.case_id === caseId)
  if (!found) throw new Error(`Fixture case not found: ${caseId}`)
  return found
}

/** Converts one official fixture case into the app's ledger state. */
export function ledgerStateFromCase(fixtureCase: FixtureCase): LedgerState {
  const expenses: Expense[] = fixtureCase.expenses.map((e) => ({
    id: `fx-${fixtureCase.case_id}-${e.id}`,
    date: e.date as IsoDate,
    category: normalizeCategoryName(e.category),
    shop: e.shop,
    amountPaisa: parseTakaToPaisa(e.amount_bdt),
    source: 'fixture' as const,
  }))

  // A case may use a label the app does not ship with; keep it as a category
  // rather than flattening the record into "Other".
  const categories = canonicalCategories([...defaultCategories(), ...expenses.map((e) => e.category)])

  const pockets: Pocket[] = fixtureCase.pockets.map((p) => ({
    id: `fx-${fixtureCase.case_id}-${p.id}`,
    name: p.name,
    item: p.item,
    targetPaisa: parseTakaToPaisa(p.target_bdt),
    // The fixture does not carry a saved balance; pockets start empty.
    savedPaisa: 0,
    monthlyContributionPaisa: parseTakaToPaisa(p.monthly_contribution_bdt),
  }))

  return {
    schemaVersion: SCHEMA_VERSION,
    salaryPaisa: parseTakaToPaisa(fixtureCase.salary_bdt),
    salaryByMonth: {},
    expenses,
    pockets,
    categories,
    dpsAnnualRatePercent: Number(fixtureCase.dps_annual_rate_percent),
    referenceDate: fixtureCase.today as IsoDate,
    fixtureCaseId: fixtureCase.case_id,
    updatedAt: new Date().toISOString(),
  }
}

export function defaultLedgerState(): LedgerState {
  return ledgerStateFromCase(getCase(DEFAULT_CASE_ID))
}

export const DPS_RULE_TEXT = getCase(DEFAULT_CASE_ID).dps_rule
