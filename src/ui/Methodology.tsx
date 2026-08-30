/** Every formula, assumption and data source in one panel. */
import { DPS_RULE_TEXT, FIXTURE_SOURCE_URL, fixture, validateFixture } from '../data/fixture'
import { formatIsoDate, type IsoDate } from '../domain/dates'
import { Badge, Method, Notice } from './common'

export function Methodology({
  referenceDate,
  dpsAnnualRatePercent,
  fixtureCaseId,
}: {
  referenceDate: IsoDate
  dpsAnnualRatePercent: number
  fixtureCaseId: string | null
}) {
  const validation = validateFixture()

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title">
          <h2>Where the numbers come from</h2>
          <Badge tone="info">No figure on any screen is hardcoded</Badge>
        </div>
        <p className="small muted">
          Every total, percentage, forecast and insight is computed from the stored expense records by pure functions in{' '}
          <code>src/domain/</code>, which are covered by the automated test suite. Changing an expense re-derives all of
          them immediately.
        </p>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Official fixture</h2>
          <Badge tone={validation.ok ? 'positive' : 'critical'}>
            {validation.ok ? 'Schema validated' : `${validation.problems.length} schema problems`}
          </Badge>
        </div>
        <div className="stack-sm">
          <p className="small">
            Source:{' '}
            <a href={FIXTURE_SOURCE_URL} rel="noreferrer noopener" target="_blank">
              {FIXTURE_SOURCE_URL}
            </a>
          </p>
          <p className="small muted">
            Fetched during development and committed unmodified at <code>public/data/fixtures/P12.json</code> (schema
            version {fixture.schema_version}, {validation.caseCount} public cases). The app bundles that same file, so
            the opening screen never depends on the fixture endpoint or browser CORS after the app loads. The active demo case is{' '}
            <strong>{fixtureCaseId ?? 'none (your own data)'}</strong>.
          </p>
          <ul className="small muted" style={{ paddingLeft: '1.1rem', margin: 0 }}>
            {validation.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>
              Assumption: the fixture's <code>today</code> ({formatIsoDate(referenceDate)}) is the forecast reference
              date. It always falls inside <code>months.this</code>, and no expense is dated after it.
            </li>
            <li>Assumption: amounts are exact 2-decimal strings, so they are stored as integer paisa (1 taka = 100 paisa).</li>
          </ul>
          {validation.problems.length > 0 ? (
            <Notice tone="critical" title="Schema problems found:">
              {validation.problems.slice(0, 5).join(' · ')}
            </Notice>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Dashboard formulas</h2>
        </div>
        <div className="formula">
          <span>total spent = sum of expense amounts dated inside the selected month</span>
          <span>remaining salary = salary − total spent (blank when no salary is set)</span>
          <span>percentage of salary spent = total spent ÷ salary × 100</span>
          <span>overspending = total spent &gt; salary; overspend = total spent − salary</span>
          <span>category share = category total ÷ month total × 100</span>
          <span>previous-month change = this month total − previous month total</span>
          <span>previous-month change % = change ÷ previous month total × 100 (undefined when the previous month is ৳0)</span>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Forecast</h2>
          <Badge tone="accent">Baseline daily run rate</Badge>
        </div>
        <div className="formula">
          <span>daily run rate = spending to date ÷ elapsed days</span>
          <span>expected additional spending = daily run rate × remaining days</span>
          <span>expected month-end spending = spending to date + expected additional spending</span>
          <span>forecast month-end balance = salary − expected month-end spending</span>
        </div>
        <ul className="small muted" style={{ paddingLeft: '1.1rem', marginTop: 10 }}>
          <li>Elapsed days include the forecast date itself; a month that is already over uses actual spending and projects nothing.</li>
          <li>Intermediate values are never rounded - only displayed figures are.</li>
          <li>Spending is assumed to continue at the same average pace: no seasonality, no scheduled bills, no salary change.</li>
          <li>Where data is missing the app says so rather than treating it as ৳0.</li>
        </ul>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Savings affordability</h2>
        </div>
        <div className="formula">
          <span>forecast disposable amount = max(0, forecast month-end balance)</span>
          <span>effective monthly contribution = min(planned contribution, forecast disposable amount)</span>
          <span>remaining target = max(0, target amount − current saved)</span>
          <span>months to completion = ceil(remaining target ÷ effective contribution)</span>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Contributions are counted from the selected month, so a 3-month plan starting in April completes in June. When
          the effective contribution is ৳0 no completion date is shown - the shortfall is explained instead. Each pocket
          is an independent what-if projection against the same forecast balance; this screen does not allocate one shared
          pool across multiple pockets.
        </p>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>DPS projection</h2>
          <Badge tone="warning">Illustrative estimate · not financial advice</Badge>
        </div>
        <div className="stack-sm">
          <p className="small muted">
            The annual rate currently in use is <strong>{dpsAnnualRatePercent.toFixed(2)}%</strong>, seeded from the
            official fixture's <code>dps_annual_rate_percent</code>. It is an illustrative assumption, not a quoted
            market product, and no bank or scheme is being represented.
          </p>
          <Notice tone="info" title="Fixture DPS rule (applied exactly):">
            {DPS_RULE_TEXT}
          </Notice>
          <div className="formula">
            <span>monthly rate = annual rate ÷ 12</span>
            <span>each month: balance = balance + deposit</span>
            <span>then: interest = balance × annual rate ÷ 12 ÷ 100, rounded half up to the paisa</span>
            <span>balance = balance + interest (so later months earn on it)</span>
            <span>total principal = current saved + (monthly deposit × months)</span>
            <span>estimated return = maturity value − total principal</span>
          </div>
          <Method summary="Why not the closed-form annuity formula?">
            <p className="small muted">
              The closed-form ordinary-annuity formula{' '}
              <code>current saved × (1+r)^n + contribution × [((1+r)^n − 1) ÷ r]</code> gives a very close figure, but
              the fixture specifies deposit-first timing (an annuity due) with the interest rounded half up to the paisa
              every month. The app runs that month-by-month schedule instead so the projection matches the stated rule
              to the paisa. The full schedule is shown under each pocket.
            </p>
          </Method>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Receipt OCR and privacy</h2>
          <Badge tone="positive">On-device</Badge>
        </div>
        <ul className="small muted" style={{ paddingLeft: '1.1rem', margin: 0 }}>
          <li>OCR runs in the browser with Tesseract.js (Apache-2.0) compiled to WebAssembly, inside a web worker.</li>
          <li>The worker, WASM core and the English model are served from this app's own <code>/ocr/</code> directory - no CDN, no third-party request.</li>
          <li>Receipt images are held in memory as object URLs, are never uploaded, and are not stored after you leave the scanner.</li>
          <li>Only the values you confirm (date, merchant, amount, category) are saved, and only to this device's local storage.</li>
          <li>The parser reports its confidence per field and shows every other monetary value it found, so a wrong pick is visible and correctable.</li>
        </ul>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Local storage</h2>
        </div>
        <ul className="small muted" style={{ paddingLeft: '1.1rem', margin: 0 }}>
          <li>Salary, expenses and pockets are saved in this browser's localStorage under <code>plm.ledger</code>, versioned by schema.</li>
          <li>Older stored data is migrated on load; unreadable records are dropped individually and reported, never silently zeroed.</li>
          <li>A blob that cannot be parsed is left untouched and, when browser storage permits it, copied to a separate backup key. A failed write is surfaced instead of being swallowed.</li>
          <li>“Reset to sample data” restores the official fixture case after a confirmation.</li>
        </ul>
      </section>
    </div>
  )
}
