import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ledgerStateFromCase, type FixtureCase } from '../data/fixture'
import {
  FixtureImportError,
  MAX_FIXTURE_FILE_BYTES,
  readFixtureImportFile,
  type ParsedFixtureImport,
} from '../data/fixtureImport'
import { monthLabel } from '../domain/dates'
import { formatTaka } from '../domain/format'
import type { LedgerState } from '../domain/types'
import { Badge, Modal, Notice } from './common'

export function FixtureImporter({
  onCancel,
  onReplace,
}: {
  onCancel: () => void
  onReplace: (state: LedgerState, selectedCase: FixtureCase) => void
}) {
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedFixtureImport | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const readSequence = useRef(0)

  const selectedCase = useMemo(
    () => parsed?.cases.find((candidate) => candidate.case_id === selectedCaseId) ?? parsed?.cases[0] ?? null,
    [parsed, selectedCaseId],
  )
  const selectedLedger = useMemo(() => (selectedCase ? ledgerStateFromCase(selectedCase) : null), [selectedCase])

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const sequence = ++readSequence.current
    setFileName(file.name)
    setParsed(null)
    setProblems([])
    setConfirmed(false)
    setReading(true)
    try {
      const result = await readFixtureImportFile(file)
      if (sequence !== readSequence.current) return
      setParsed(result)
      setSelectedCaseId(result.cases[0]?.case_id ?? '')
    } catch (error) {
      if (sequence !== readSequence.current) return
      setProblems(
        error instanceof FixtureImportError ? error.problems : ['The fixture could not be validated. Choose another file.'],
      )
    } finally {
      if (sequence === readSequence.current) setReading(false)
    }
  }

  return (
    <Modal
      title="Import P12 fixture JSON"
      description="Load an official-format fixture file or one case. Validation happens entirely in this browser; nothing is uploaded."
      onClose={onCancel}
      labelledBy="fixture-import-title"
    >
      <div className="stack-sm">
        <div className="field">
          <label htmlFor="fixture-file">P12 JSON file</label>
          <input
            id="fixture-file"
            type="file"
            accept=".json,application/json,text/json"
            onChange={chooseFile}
            aria-describedby="fixture-file-help"
          />
          <span id="fixture-file-help" className="hint">
            Maximum {MAX_FIXTURE_FILE_BYTES / 1024 / 1024} MB. The file must contain problem P12 data in Submission Kit shape.
          </span>
        </div>

        {reading ? <Notice title="Reading fixture…">Checking the file and every case.</Notice> : null}

        {problems.length > 0 ? (
          <Notice tone="critical" title={`Cannot import ${fileName || 'this file'}.`}>
            <ul className="import-problem-list">
              {problems.map((problem, index) => (
                <li key={`${index}-${problem}`}>{problem}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {parsed && selectedCase && selectedLedger ? (
          <>
            <Notice tone="positive" title="Valid P12 data.">
              {fileName} contains {parsed.cases.length} {parsed.cases.length === 1 ? 'case' : 'cases'}
              {parsed.schemaVersion ? ` using schema ${parsed.schemaVersion}` : ''}.
            </Notice>

            {parsed.cases.length > 1 ? (
              <div className="field">
                <label htmlFor="import-case">Case to load</label>
                <select
                  id="import-case"
                  value={selectedCase.case_id}
                  onChange={(event) => {
                    setSelectedCaseId(event.target.value)
                    setConfirmed(false)
                  }}
                >
                  {parsed.cases.map((candidate) => (
                    <option key={candidate.case_id} value={candidate.case_id}>
                      {candidate.case_id} · {monthLabel(candidate.months.this)} · {candidate.expenses.length} expenses
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <section className="import-review" aria-labelledby="fixture-review-title">
              <div className="spread">
                <div>
                  <span className="label">Review before replacement</span>
                  <h3 id="fixture-review-title">{selectedCase.case_id}</h3>
                </div>
                <Badge tone="info">P12</Badge>
              </div>
              <dl className="import-facts">
                <div>
                  <dt>Forecast date</dt>
                  <dd className="num">{selectedCase.today}</dd>
                </div>
                <div>
                  <dt>Current month</dt>
                  <dd>{monthLabel(selectedCase.months.this)}</dd>
                </div>
                <div>
                  <dt>Monthly salary</dt>
                  <dd className="num">{formatTaka(selectedLedger.salaryPaisa)}</dd>
                </div>
                <div>
                  <dt>Records</dt>
                  <dd className="num">
                    {selectedCase.expenses.length} expenses · {selectedCase.pockets.length} pockets
                  </dd>
                </div>
                <div>
                  <dt>DPS rate</dt>
                  <dd className="num">{Number(selectedCase.dps_annual_rate_percent).toFixed(2)}% annually</dd>
                </div>
              </dl>
            </section>

            {parsed.warnings.length > 0 ? (
              <Notice tone="warning" title="Import notes:">
                <ul className="import-problem-list">
                  {parsed.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            <label className="confirm-replacement">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>I understand this replaces the current salary, expenses and savings pockets on this device.</span>
            </label>

            <div className="form-actions">
              <button
                type="button"
                className="danger"
                disabled={!confirmed}
                onClick={() => onReplace(selectedLedger, selectedCase)}
              >
                Replace with {selectedCase.case_id}
              </button>
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="form-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
