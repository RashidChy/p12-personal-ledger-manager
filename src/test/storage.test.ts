import { describe, expect, it } from 'vitest'
import { migrate, validateLedgerState } from '../store/validate'
import { SCHEMA_VERSION } from '../domain/types'
import { taka } from './helpers'

const validBlob = {
  schemaVersion: SCHEMA_VERSION,
  salaryPaisa: taka('50000.00'),
  salaryByMonth: { '2026-04': taka('55000.00') },
  expenses: [
    { id: 'E1', date: '2026-04-02', category: 'Rent', shop: 'Landlord', amountPaisa: taka('16000.00'), source: 'fixture' },
  ],
  pockets: [
    { id: 'SP-1', name: 'Bike', item: 'Honda Livo', targetPaisa: taka('150000.00'), savedPaisa: taka('9000.00'), monthlyContributionPaisa: taka('9000.00') },
  ],
  dpsAnnualRatePercent: 8,
  referenceDate: '2026-04-17',
  fixtureCaseId: 'PUB-01',
  updatedAt: '2026-04-17T10:00:00.000Z',
}

describe('local data validation', () => {
  it('accepts a well-formed blob unchanged', () => {
    const { state, issues } = validateLedgerState(validBlob)
    expect(issues).toEqual([])
    expect(state!.expenses).toHaveLength(1)
    expect(state!.pockets[0].savedPaisa).toBe(taka('9000.00'))
    expect(state!.salaryByMonth['2026-04']).toBe(taka('55000.00'))
  })

  it('drops unreadable records and reports each one instead of failing to load', () => {
    const { state, issues } = validateLedgerState({
      ...validBlob,
      expenses: [
        validBlob.expenses[0],
        { id: 'E2', date: '2026-02-30', category: 'Food', shop: 'X', amountPaisa: 100 },
        { id: 'E3', date: '2026-04-03', category: 'Food', shop: 'X', amountPaisa: 'lots' },
        { id: 'E4', date: '2026-04-04', category: 'Spaceships', shop: 'X', amountPaisa: 500 },
        'not an object',
      ],
    })
    expect(state!.expenses.map((e) => e.id)).toEqual(['E1', 'E4'])
    expect(state!.expenses[1].category).toBe('Other')
    expect(issues).toHaveLength(4)
    expect(issues.join(' ')).toMatch(/invalid date/)
    expect(issues.join(' ')).toMatch(/invalid amount/)
    expect(issues.join(' ')).toMatch(/unknown category/)
  })

  it('never turns a missing salary into zero', () => {
    const { state } = validateLedgerState({ ...validBlob, salaryPaisa: null })
    expect(state!.salaryPaisa).toBeNull()
  })

  it('clears an invalid salary and says so', () => {
    const { state, issues } = validateLedgerState({ ...validBlob, salaryPaisa: 'fifty thousand' })
    expect(state!.salaryPaisa).toBeNull()
    expect(issues.join(' ')).toMatch(/monthly salary was invalid/)
  })

  it('drops invalid month overrides but keeps valid ones', () => {
    const { state, issues } = validateLedgerState({
      ...validBlob,
      salaryByMonth: { '2026-04': taka('55000.00'), 'last-month': 1000, '2026-13': 500 },
    })
    expect(Object.keys(state!.salaryByMonth)).toEqual(['2026-04'])
    expect(issues.filter((i) => i.includes('salary override'))).toHaveLength(2)
  })

  it('replaces an invalid forecast date rather than crashing', () => {
    const { state, issues } = validateLedgerState({ ...validBlob, referenceDate: 'yesterday' })
    expect(state!.referenceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(issues.join(' ')).toMatch(/forecast date was invalid/)
  })

  it('rejects a non-object blob', () => {
    expect(validateLedgerState('nope').state).toBeNull()
    expect(validateLedgerState(null).state).toBeNull()
  })
})

describe('local data migration', () => {
  it('migrates a v1 blob (salary in taka, no month overrides) to the current schema', () => {
    const issues: string[] = []
    const migrated = migrate({ schemaVersion: 1, salary: 45000, expenses: [], pockets: [] }, issues)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.salaryPaisa).toBe(taka('45000.00'))
    expect(migrated.salary).toBeUndefined()
    expect(migrated.salaryByMonth).toEqual({})
    expect(issues.join(' ')).toMatch(/upgraded from schema v1/)
  })

  it('migrates through validateLedgerState end to end', () => {
    const { state, migratedFrom, issues } = validateLedgerState({
      schemaVersion: 1,
      salary: 30000,
      expenses: [{ id: 'E1', date: '2026-03-01', category: 'Rent', shop: 'Landlord', amountPaisa: taka('10000.00') }],
      pockets: [],
      referenceDate: '2026-04-17',
    })
    expect(migratedFrom).toBe(1)
    expect(state!.salaryPaisa).toBe(taka('30000.00'))
    expect(state!.expenses).toHaveLength(1)
    expect(issues.join(' ')).toMatch(/schema v1 to v2/)
  })

  it('loads data written by a newer schema on a best-effort basis and warns', () => {
    const { state, issues } = validateLedgerState({ ...validBlob, schemaVersion: 99 })
    expect(state).not.toBeNull()
    expect(state!.schemaVersion).toBe(SCHEMA_VERSION)
    expect(issues.join(' ')).toMatch(/newer version of this app/)
  })
})
