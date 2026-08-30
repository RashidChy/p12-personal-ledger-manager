import { useMemo, useState } from 'react'
import { DEFAULT_CASE_ID, listCases } from './data/fixture'
import { addMonths, monthLabel, monthOf, type IsoDate, type MonthKey } from './domain/dates'
import { forecastMonth } from './domain/forecast'
import { buildInsights } from './domain/insights'
import { monthlySummary, monthsWithExpenses } from './domain/ledger'
import { projectPocket } from './domain/savings'
import { useLedger } from './store/useLedger'
import { ConfirmDialog, Notice } from './ui/common'
import { Expenses } from './ui/Expenses'
import { FixtureImporter } from './ui/FixtureImporter'
import { ForecastView } from './ui/ForecastView'
import { Methodology } from './ui/Methodology'
import { Overview } from './ui/Overview'
import { ReceiptScanner } from './ui/ReceiptScanner'
import { SavingsView } from './ui/SavingsView'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'receipt', label: 'Receipt scanner' },
  { id: 'forecast', label: 'Forecast & insights' },
  { id: 'savings', label: 'Savings pockets' },
  { id: 'method', label: 'Methodology' },
] as const

export default function App() {
  const { state, dispatch, status, resetToSample, dismissIssues } = useLedger()
  const [tab, setTab] = useState<string>('overview')
  const [month, setMonth] = useState<MonthKey>(() => monthOf(state.referenceDate))
  const [resetting, setResetting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [resetCase, setResetCase] = useState<string>(() =>
    listCases().some((candidate) => candidate.case_id === state.fixtureCaseId)
      ? (state.fixtureCaseId as string)
      : DEFAULT_CASE_ID,
  )

  const months = useMemo(() => {
    const recorded = monthsWithExpenses(state.expenses)
    const anchor = monthOf(state.referenceDate)
    const set = new Set<MonthKey>([...recorded, anchor, month, addMonths(anchor, 1), addMonths(anchor, -1)])
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [state.expenses, state.referenceDate, month])

  const summary = useMemo(() => monthlySummary(state, month), [state, month])
  const forecast = useMemo(() => forecastMonth(state, month, state.referenceDate), [state, month])
  const pockets = useMemo(
    () =>
      state.pockets.map((pocket) =>
        projectPocket({
          pocket,
          forecastMonthEndBalancePaisa: forecast.forecastMonthEndBalancePaisa,
          startMonth: month,
          dpsAnnualRatePercent: state.dpsAnnualRatePercent,
          forecastUnavailableReason: forecast.insufficientDataReason,
        }),
      ),
    [state.pockets, state.dpsAnnualRatePercent, forecast, month],
  )
  const insights = useMemo(
    () => buildInsights({ state, summary, forecast, pockets, month, referenceDate: state.referenceDate }),
    [state, summary, forecast, pockets, month],
  )

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">৳</span>
            <div className="brand-text">
              <h1>Personal Ledger Manager</h1>
              <span className="brand-sub">
                Salary, expenses, on-device receipt OCR, forecast and DPS savings · LofiStack P12
              </span>
            </div>
          </div>

          <div className="topbar-controls">
            <div className="field">
              <label htmlFor="month-select">Month</label>
              <select id="month-select" value={month} onChange={(e) => setMonth(e.target.value as MonthKey)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setResetting(true)}>
              Reset to sample data
            </button>
            <button type="button" onClick={() => setImporting(true)}>
              Import fixture JSON
            </button>
          </div>
        </div>

        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <div className="stack">
          {status.error ? (
            <Notice tone="critical" title="Local storage problem.">
              {status.error}
            </Notice>
          ) : null}
          {status.issues.length > 0 ? (
            <Notice tone="warning" title="Saved data was repaired on load:" onDismiss={dismissIssues}>
              <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>
                {status.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {tab === 'overview' ? (
            <Overview
              summary={summary}
              forecast={forecast}
              insights={insights}
              pockets={pockets}
              month={month}
              onGoTo={setTab}
            />
          ) : null}

          {tab === 'expenses' ? <Expenses state={state} dispatch={dispatch} month={month} /> : null}

          {tab === 'receipt' ? (
            <ReceiptScanner
              referenceDate={state.referenceDate}
              month={month}
              onSave={(expense) => {
                dispatch({ type: 'addExpense', expense })
                setMonth(monthOf(expense.date))
              }}
            />
          ) : null}

          {tab === 'forecast' ? (
            <ForecastView
              forecast={forecast}
              insights={insights}
              month={month}
              referenceDate={state.referenceDate}
              onChangeReferenceDate={(date: IsoDate) => dispatch({ type: 'setReferenceDate', date })}
            />
          ) : null}

          {tab === 'savings' ? (
            <SavingsView
              projections={pockets}
              dispatch={dispatch}
              month={month}
              dpsAnnualRatePercent={state.dpsAnnualRatePercent}
              onChangeRate={(percent) => dispatch({ type: 'setDpsRate', percent })}
            />
          ) : null}

          {tab === 'method' ? (
            <Methodology
              referenceDate={state.referenceDate}
              dpsAnnualRatePercent={state.dpsAnnualRatePercent}
              fixtureCaseId={state.fixtureCaseId}
            />
          ) : null}
        </div>
      </main>

      <footer className="footer">
        Data stays on this device · {state.expenses.length} expenses · {state.pockets.length} pockets ·{' '}
        {status.lastSavedAt
          ? `saved on this device at ${new Date(status.lastSavedAt).toLocaleTimeString()}`
          : 'official sample data · nothing changed yet'}
        {status.restoredFromDevice ? ' · restored from this device' : ''}
      </footer>

      {resetting ? (
        <ConfirmDialog
          title="Reset to sample data?"
          confirmLabel="Reset now"
          message={
            <div className="stack-sm">
              <div>
                Every expense, pocket and salary change you made on this device will be replaced by the official
                LofiStack P12 fixture case. This cannot be undone.
              </div>
              <div className="field">
                <label htmlFor="reset-case">Fixture case</label>
                <select id="reset-case" value={resetCase} onChange={(e) => setResetCase(e.target.value)}>
                  {listCases().map((c) => (
                    <option key={c.case_id} value={c.case_id}>
                      {c.case_id} · {monthLabel(c.months.this)} · salary ৳{Number(c.salary_bdt).toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          }
          onCancel={() => setResetting(false)}
          onConfirm={() => {
            resetToSample(resetCase)
            const target = listCases().find((c) => c.case_id === resetCase)
            if (target) setMonth(target.months.this)
            setResetting(false)
            setTab('overview')
          }}
        />
      ) : null}

      {importing ? (
        <FixtureImporter
          onCancel={() => setImporting(false)}
          onReplace={(nextState, selectedCase) => {
            dispatch({ type: 'replace', state: nextState })
            setMonth(selectedCase.months.this)
            setImporting(false)
            setTab('overview')
          }}
        />
      ) : null}
    </div>
  )
}
