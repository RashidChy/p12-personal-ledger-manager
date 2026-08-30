import { describe, expect, it } from 'vitest'
import { fixture, getCase, ledgerStateFromCase } from '../data/fixture'
import {
  FixtureImportError,
  MAX_FIXTURE_FILE_BYTES,
  fixtureFileProblem,
  parseFixtureImport,
} from '../data/fixtureImport'

describe('P12 fixture import', () => {
  it('accepts the official fixture envelope and a single same-shape case', () => {
    const full = parseFixtureImport(JSON.stringify(fixture))
    expect(full.sourceShape).toBe('fixture-file')
    expect(full.schemaVersion).toBe('2.2')
    expect(full.cases).toHaveLength(25)

    const single = parseFixtureImport(JSON.stringify(getCase('PUB-01')))
    expect(single.sourceShape).toBe('single-case')
    expect(single.cases.map((candidate) => candidate.case_id)).toEqual(['PUB-01'])
    const state = ledgerStateFromCase(single.cases[0])
    expect(state.fixtureCaseId).toBe('PUB-01')
    expect(state.expenses).toHaveLength(getCase('PUB-01').expenses.length)
  })

  it('reports malformed JSON without attempting an import', () => {
    expect(() => parseFixtureImport('{"problem_id":"P12",')).toThrowError(FixtureImportError)
    expect(() => parseFixtureImport('{"problem_id":"P12",')).toThrow('not valid JSON')
  })

  it('rejects a fixture for the wrong problem', () => {
    const wrongProblem = { ...fixture, problem_id: 'P08' }
    expect(() => parseFixtureImport(JSON.stringify(wrongProblem))).toThrow('accepts P12 fixtures only')
  })

  it('rejects an invalid case and names the offending field', () => {
    const invalidCase = {
      ...getCase('PUB-01'),
      salary_bdt: 'fifty thousand',
      expenses: [{ ...getCase('PUB-01').expenses[0], date: '2026-02-31' }],
      pockets: [{ ...getCase('PUB-01').pockets[0], monthly_contribution_bdt: '0.00' }],
    }

    let error: unknown
    try {
      parseFixtureImport(JSON.stringify(invalidCase))
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(FixtureImportError)
    expect((error as FixtureImportError).problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('salary_bdt'),
        expect.stringContaining('expenses[0].date'),
        expect.stringContaining('monthly_contribution_bdt'),
      ]),
    )
  })

  it('checks file extension, MIME type and size before reading', () => {
    expect(fixtureFileProblem({ name: 'P12.json', type: 'application/json', size: 100 })).toBeNull()
    expect(fixtureFileProblem({ name: 'P12.txt', type: 'text/plain', size: 100 })).toContain('.json')
    expect(fixtureFileProblem({ name: 'P12.json', type: 'text/plain', size: 100 })).toContain('Unsupported')
    expect(
      fixtureFileProblem({ name: 'P12.json', type: 'application/json', size: MAX_FIXTURE_FILE_BYTES + 1 }),
    ).toContain('larger than')
  })
})
