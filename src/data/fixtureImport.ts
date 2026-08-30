import { isIsoDate, isMonthKey } from '../domain/dates'
import { parseTakaToPaisa } from '../domain/money'
import { isCategory } from '../domain/types'
import type { FixtureCase } from './fixture'

export const MAX_FIXTURE_FILE_BYTES = 5 * 1024 * 1024
const MAX_CASES = 100
const MAX_EXPENSES_PER_CASE = 500
const MAX_POCKETS_PER_CASE = 100

export interface ParsedFixtureImport {
  sourceShape: 'fixture-file' | 'single-case'
  schemaVersion: string | null
  cases: FixtureCase[]
  warnings: string[]
}

export class FixtureImportError extends Error {
  readonly problems: string[]

  constructor(problems: string[] | string) {
    const list = Array.isArray(problems) ? problems : [problems]
    super(list.join(' '))
    this.name = 'FixtureImportError'
    this.problems = list
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textField(raw: Record<string, unknown>, key: string, path: string, problems: string[]): string {
  const value = raw[key]
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${path}.${key} must be a non-empty string.`)
    return ''
  }
  return value.trim()
}

function amountField(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  problems: string[],
  options: { allowZero: boolean },
): string {
  const value = raw[key]
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) {
    problems.push(`${path}.${key} must be a non-negative BDT string with exactly two decimals.`)
    return ''
  }
  try {
    const paisa = parseTakaToPaisa(value)
    if (paisa < 0 || (!options.allowZero && paisa === 0)) {
      problems.push(`${path}.${key} must be ${options.allowZero ? 'zero or greater' : 'greater than zero'}.`)
    }
  } catch {
    problems.push(`${path}.${key} is outside the supported money range.`)
  }
  return value
}

function validateCase(input: unknown, path: string, warnings: string[]): { value: FixtureCase | null; problems: string[] } {
  const problems: string[] = []
  if (!isRecord(input)) return { value: null, problems: [`${path} must be a JSON object.`] }

  const caseId = textField(input, 'case_id', path, problems)
  const today = textField(input, 'today', path, problems)
  if (today && !isIsoDate(today)) problems.push(`${path}.today must be a real YYYY-MM-DD calendar date.`)

  let lastMonth = ''
  let thisMonth = ''
  if (!isRecord(input.months)) {
    problems.push(`${path}.months must be an object with "last" and "this" month keys.`)
  } else {
    lastMonth = textField(input.months, 'last', `${path}.months`, problems)
    thisMonth = textField(input.months, 'this', `${path}.months`, problems)
    if (lastMonth && !isMonthKey(lastMonth)) problems.push(`${path}.months.last must be YYYY-MM.`)
    if (thisMonth && !isMonthKey(thisMonth)) problems.push(`${path}.months.this must be YYYY-MM.`)
    if (lastMonth && thisMonth && lastMonth >= thisMonth) {
      problems.push(`${path}.months.last must be before months.this.`)
    }
  }
  if (isIsoDate(today) && isMonthKey(thisMonth) && !today.startsWith(`${thisMonth}-`)) {
    problems.push(`${path}.today must fall inside months.this.`)
  }

  const salaryBdt = amountField(input, 'salary_bdt', path, problems, { allowZero: true })

  const expenses: FixtureCase['expenses'] = []
  if (!Array.isArray(input.expenses)) {
    problems.push(`${path}.expenses must be an array.`)
  } else if (input.expenses.length > MAX_EXPENSES_PER_CASE) {
    problems.push(`${path}.expenses exceeds the safe limit of ${MAX_EXPENSES_PER_CASE} records.`)
  } else {
    const seenExpenseIds = new Set<string>()
    input.expenses.forEach((candidate, index) => {
      const expensePath = `${path}.expenses[${index}]`
      if (!isRecord(candidate)) {
        problems.push(`${expensePath} must be a JSON object.`)
        return
      }
      const id = textField(candidate, 'id', expensePath, problems)
      const date = textField(candidate, 'date', expensePath, problems)
      const category = textField(candidate, 'category', expensePath, problems)
      const shop = textField(candidate, 'shop', expensePath, problems)
      const amountBdt = amountField(candidate, 'amount_bdt', expensePath, problems, { allowZero: false })

      if (id && seenExpenseIds.has(id)) problems.push(`${expensePath}.id duplicates expense id "${id}".`)
      if (id) seenExpenseIds.add(id)
      if (date && !isIsoDate(date)) problems.push(`${expensePath}.date must be a real YYYY-MM-DD calendar date.`)
      if (isIsoDate(date) && isIsoDate(today) && date > today) {
        problems.push(`${expensePath}.date cannot be after today (${today}).`)
      }
      if (isIsoDate(date) && isMonthKey(lastMonth) && isMonthKey(thisMonth)) {
        const expenseMonth = date.slice(0, 7)
        if (expenseMonth !== lastMonth && expenseMonth !== thisMonth) {
          problems.push(`${expensePath}.date must be inside months.last or months.this.`)
        }
      }
      if (category && !isCategory(category)) {
        warnings.push(`${caseId || path}/${id || `expense ${index + 1}`}: category "${category}" will be imported as Other.`)
      }

      expenses.push({ id, date, category, shop, amount_bdt: amountBdt })
    })
  }

  const pockets: FixtureCase['pockets'] = []
  if (!Array.isArray(input.pockets)) {
    problems.push(`${path}.pockets must be an array.`)
  } else if (input.pockets.length > MAX_POCKETS_PER_CASE) {
    problems.push(`${path}.pockets exceeds the safe limit of ${MAX_POCKETS_PER_CASE} records.`)
  } else {
    const seenPocketIds = new Set<string>()
    input.pockets.forEach((candidate, index) => {
      const pocketPath = `${path}.pockets[${index}]`
      if (!isRecord(candidate)) {
        problems.push(`${pocketPath} must be a JSON object.`)
        return
      }
      const id = textField(candidate, 'id', pocketPath, problems)
      const name = textField(candidate, 'name', pocketPath, problems)
      const item = textField(candidate, 'item', pocketPath, problems)
      const targetBdt = amountField(candidate, 'target_bdt', pocketPath, problems, { allowZero: false })
      const monthlyContributionBdt = amountField(candidate, 'monthly_contribution_bdt', pocketPath, problems, {
        allowZero: false,
      })
      if (id && seenPocketIds.has(id)) problems.push(`${pocketPath}.id duplicates pocket id "${id}".`)
      if (id) seenPocketIds.add(id)
      pockets.push({
        id,
        name,
        item,
        target_bdt: targetBdt,
        monthly_contribution_bdt: monthlyContributionBdt,
      })
    })
  }

  const rateText = textField(input, 'dps_annual_rate_percent', path, problems)
  const rate = Number(rateText)
  if (rateText && (!/^\d+(?:\.\d+)?$/.test(rateText) || !Number.isFinite(rate) || rate < 0 || rate > 30)) {
    problems.push(`${path}.dps_annual_rate_percent must be a number from 0 to 30, provided as a string.`)
  }
  const dpsRule = textField(input, 'dps_rule', path, problems)

  if (problems.length > 0) return { value: null, problems }
  return {
    value: {
      case_id: caseId,
      today,
      months: { last: lastMonth, this: thisMonth },
      salary_bdt: salaryBdt,
      expenses,
      pockets,
      dps_annual_rate_percent: rateText,
      dps_rule: dpsRule,
    },
    problems: [],
  }
}

/** Parse and validate either the official P12 fixture envelope or one P12 case object. */
export function parseFixtureImport(text: string): ParsedFixtureImport {
  if (text.trim() === '') throw new FixtureImportError('The selected file is empty.')

  let decoded: unknown
  try {
    decoded = JSON.parse(text) as unknown
  } catch {
    throw new FixtureImportError('The selected file is not valid JSON.')
  }
  if (!isRecord(decoded)) throw new FixtureImportError('The JSON root must be an object.')

  const warnings: string[] = []
  if ('cases' in decoded) {
    if (decoded.problem_id !== 'P12') {
      const found = typeof decoded.problem_id === 'string' ? decoded.problem_id : 'missing'
      throw new FixtureImportError(`This importer accepts P12 fixtures only; problem_id was ${found}.`)
    }
    if (!Array.isArray(decoded.cases) || decoded.cases.length === 0) {
      throw new FixtureImportError('The P12 fixture must contain at least one case in its cases array.')
    }
    if (decoded.cases.length > MAX_CASES) {
      throw new FixtureImportError(`The P12 fixture exceeds the safe limit of ${MAX_CASES} cases.`)
    }
    if (typeof decoded.schema_version !== 'string' || decoded.schema_version.trim() === '') {
      throw new FixtureImportError('The P12 fixture is missing its schema_version string.')
    }

    const cases: FixtureCase[] = []
    const problems: string[] = []
    const seenCaseIds = new Set<string>()
    decoded.cases.forEach((candidate, index) => {
      const result = validateCase(candidate, `cases[${index}]`, warnings)
      problems.push(...result.problems)
      if (!result.value) return
      if (seenCaseIds.has(result.value.case_id)) {
        problems.push(`cases[${index}].case_id duplicates "${result.value.case_id}".`)
      } else {
        seenCaseIds.add(result.value.case_id)
        cases.push(result.value)
      }
    })
    if (problems.length > 0) throw new FixtureImportError(problems)
    return {
      sourceShape: 'fixture-file',
      schemaVersion: decoded.schema_version,
      cases,
      warnings,
    }
  }

  if ('problem_id' in decoded && decoded.problem_id !== 'P12') {
    const found = typeof decoded.problem_id === 'string' ? decoded.problem_id : 'invalid'
    throw new FixtureImportError(`This importer accepts P12 data only; problem_id was ${found}.`)
  }
  const result = validateCase(decoded, 'case', warnings)
  if (!result.value) throw new FixtureImportError(result.problems)
  return { sourceShape: 'single-case', schemaVersion: null, cases: [result.value], warnings }
}

export function fixtureFileProblem(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.size <= 0) return 'The selected file is empty.'
  if (file.size > MAX_FIXTURE_FILE_BYTES) return 'The selected file is larger than the 5 MB import limit.'
  if (!/\.json$/i.test(file.name)) return 'Choose a .json fixture file.'

  const mime = file.type.toLowerCase()
  const supportedMime =
    mime === '' || mime === 'application/json' || mime === 'text/json' || mime.endsWith('+json') || mime === 'application/octet-stream'
  if (!supportedMime) return `Unsupported file type (${file.type || 'unknown'}). Choose a JSON file.`
  return null
}

export async function readFixtureImportFile(file: File): Promise<ParsedFixtureImport> {
  const fileProblem = fixtureFileProblem(file)
  if (fileProblem) throw new FixtureImportError(fileProblem)
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new FixtureImportError('The browser could not read the selected file.')
  }
  return parseFixtureImport(text)
}
