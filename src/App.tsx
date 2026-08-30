import { useEffect, useMemo, useRef, useState } from 'react'
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
  {
    id: 'overview',
    label: 'Overview',
    title: 'Your money at a glance',
    description: 'See where your salary went, what remains, and the decisions that need your attention.',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    title: 'Keep every expense organised',
    description: 'Add, search, edit, and review spending for the selected month or your full history.',
  },
  {
    id: 'receipt',
    label: 'Scan receipt',
    title: 'Turn a receipt into an expense',
    description: 'Upload a bill, check what the on-device scanner found, and correct anything before saving.',
  },
  {
    id: 'forecast',
    label: 'Forecast',
    title: 'Know where this month is heading',
    description: 'Project month-end spending and get specific insights drawn from your actual records.',
  },
  {
    id: 'savings',
    label: 'Savings',
    title: 'Plan for the things you want',
    description: 'Create savings pockets and compare your plan with the money your forecast leaves available.',
  },
  {
    id: 'method',
    label: 'How it works',
    title: 'Transparent by design',
    description: 'Review the formulas, assumptions, data source, privacy model, and DPS calculation method.',
  },
] as const

function TabIcon({ id }: { id: (typeof TABS)[number]['id'] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (id === 'overview') {
    return <svg {...common}><path d="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z" /></svg>
  }
  if (id === 'expenses') {
    return <svg {...common}><path d="M4 7.5h16M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 8h4m-4 4h7" /></svg>
  }
  if (id === 'receipt') {
    return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3" /></svg>
  }
  if (id === 'forecast') {
    return <svg {...common}><path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6" /><path d="m16 7 3-.5-.5 3" /></svg>
  }
  if (id === 'savings') {
    return <svg {...common}><path d="M5 11a7 7 0 0 1 13.5-2.6A3 3 0 0 1 20 14h-2l-1 3h-3l-.5-2h-4L9 17H6l-1-3H3v-3h2Z" /><circle cx="14.5" cy="9" r=".75" fill="currentColor" stroke="none" /></svg>
  }
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></svg>
}

export default function App() {
  const { state, dispatch, status, resetToSample, dismissIssues } = useLedger()
  const [tab, setTab] = useState<string>('overview')
  const [month, setMonth] = useState<MonthKey>(() => monthOf(state.referenceDate))
  const [resetting, setResetting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [expenseFormRequest, setExpenseFormRequest] = useState(0)
  const activeTabButton = useRef<HTMLButtonElement | null>(null)
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
  const activeTab = TABS.find((candidate) => candidate.id === tab) ?? TABS[0]

  useEffect(() => {
    activeTabButton.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
                <path d="M5 7.5h14M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9 11.2h6M9 15h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="brand-text">
              <h1>My Ledger</h1>
              <span className="brand-sub">Personal finance, made clear</span>
            </div>
          </div>

          <div className="topbar-controls">
            <div className="field month-control">
              <label htmlFor="month-select">Viewing month</label>
              <select id="month-select" value={month} onChange={(e) => setMonth(e.target.value as MonthKey)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <details className="data-options">
              <summary>Data &amp; demo</summary>
              <div className="data-options-menu">
                <span>Sample and fixture tools</span>
                <button type="button" className="utility-button" onClick={() => setResetting(true)}>
                  Restore sample
                </button>
                <button type="button" className="utility-button" onClick={() => setImporting(true)}>
                  Import fixture data
                </button>
              </div>
            </details>
          </div>
        </div>

        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={tab === t.id ? activeTabButton : null}
              type="button"
              className="tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <TabIcon id={t.id} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <div className="stack">
          <section className="page-heading" aria-labelledby="page-title">
            <div>
              <span className="eyebrow">{monthLabel(month)} workspace</span>
              <h2 id="page-title">{activeTab.title}</h2>
              <p>{activeTab.description}</p>
            </div>
            {tab === 'overview' ? (
              <div className="page-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setExpenseFormRequest((request) => request + 1)
                    setTab('expenses')
                  }}
                >
                  + Add expense
                </button>
                <button type="button" onClick={() => setTab('receipt')}>
                  Scan a receipt
                </button>
              </div>
            ) : (
              <span className={`privacy-note ${status.error ? 'error' : ''}`}>
                <span aria-hidden="true">{status.error ? '!' : '✓'}</span>{' '}
                {status.error ? 'Saving is currently unavailable' : 'Saved automatically on this device'}
              </span>
            )}
          </section>

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

          {tab === 'expenses' ? (
            <Expenses
              state={state}
              dispatch={dispatch}
              month={month}
              openAddRequest={expenseFormRequest}
            />
          ) : null}

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
        <strong>My Ledger</strong>
        <span>Private by default · your records stay on this device</span>
        <span>
          {state.expenses.length} expenses · {state.pockets.length} savings pockets ·{' '}
          {status.lastSavedAt
            ? `last saved at ${new Date(status.lastSavedAt).toLocaleTimeString()}`
            : 'sample data ready'}
          {status.restoredFromDevice ? ' · restored from this device' : ''}
        </span>
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
