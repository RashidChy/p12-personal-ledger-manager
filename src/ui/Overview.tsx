/** Opening screen: everything a judge should see within a few seconds. */
import { formatIsoDate, monthLabel, type MonthKey } from '../domain/dates'
import { formatPercent, formatTaka, formatTakaFromFloatPaisa } from '../domain/format'
import type { MonthlySummary } from '../domain/ledger'
import type { ForecastResult } from '../domain/forecast'
import type { Insight } from '../domain/insights'
import type { PocketProjection } from '../domain/savings'
import { Badge, EmptyState, Meter, StatCard } from './common'
import { InsightList } from './InsightList'

export function Overview({
  summary,
  forecast,
  insights,
  pockets,
  month,
  onGoTo,
}: {
  summary: MonthlySummary
  forecast: ForecastResult
  insights: Insight[]
  pockets: PocketProjection[]
  month: MonthKey
  onGoTo: (tab: string) => void
}) {
  const cmp = summary.comparison
  const spentPercent = summary.percentOfSalarySpent

  return (
    <div className="stack">
      <section className={`budget-hero ${summary.isOverspending ? 'over' : ''}`} aria-labelledby="budget-title">
        <div className="budget-hero-copy">
          <span className="eyebrow">{monthLabel(month)} balance</span>
          <h2 id="budget-title">
            {summary.remainingPaisa === null
              ? 'Set a salary to complete your overview'
              : summary.isOverspending
                ? 'You are over your monthly salary'
                : 'Available after spending'}
          </h2>
          <span className="budget-value">
            {summary.remainingPaisa === null
              ? '—'
              : formatTaka(summary.isOverspending ? summary.overspendPaisa : summary.remainingPaisa)}
          </span>
          <p>
            {formatTaka(summary.totalSpentPaisa)} spent across {summary.expenseCount}{' '}
            {summary.expenseCount === 1 ? 'expense' : 'expenses'}
            {summary.hasSalary ? ` from a ${formatTaka(summary.salaryPaisa)} salary.` : '.'}
          </p>
        </div>
        <div className="budget-progress">
          <div className="spread">
            <span className="kpi-label">Salary used</span>
            <strong className="num">{formatPercent(spentPercent, 1)}</strong>
          </div>
          {spentPercent === null ? (
            <Badge tone="warning">Add your salary to see progress</Badge>
          ) : (
            <Meter
              percent={spentPercent}
              over={spentPercent > 100}
              label={`${formatPercent(spentPercent, 1)} of salary spent`}
            />
          )}
          <Badge tone={summary.isOverspending ? 'critical' : summary.hasSalary ? 'positive' : 'warning'}>
            {summary.isOverspending ? 'Over salary' : summary.hasSalary ? 'On track' : 'Salary needed'}
          </Badge>
        </div>
      </section>

      <div className="grid grid-kpi overview-support">
        <StatCard
          label="Monthly salary"
          value={formatTaka(summary.salaryPaisa)}
          tone="accent"
          note={summary.hasSalary ? monthLabel(month) : 'No salary set for this month'}
        />
        <StatCard
          label={`Change from ${monthLabel(cmp.previousMonth)}`}
          value={formatTaka(cmp.changePaisa, { signed: true })}
          tone={cmp.changePaisa > 0 ? 'warning' : 'positive'}
          note={`${monthLabel(cmp.previousMonth)} total was ${formatTaka(cmp.previousTotalPaisa)}`}
        />
        <StatCard
          label={forecast.status === 'completed' ? 'Actual month-end spending' : 'Expected month-end spending'}
          value={formatTakaFromFloatPaisa(forecast.expectedMonthEndSpendingPaisa)}
          note={forecast.status === 'completed' ? 'This month is complete.' : `Based on ${formatTakaFromFloatPaisa(forecast.dailyRunRatePaisa)} per day`}
        />
        <StatCard
          label={
            forecast.forecastMonthEndBalancePaisa === null
              ? 'Forecast balance'
              : forecast.projectedOverspend
                ? 'Expected shortfall'
                : 'Expected money left'
          }
          value={formatTakaFromFloatPaisa(
            forecast.projectedOverspend ? forecast.forecastShortfallPaisa : forecast.forecastMonthEndBalancePaisa,
          )}
          tone={
            forecast.forecastMonthEndBalancePaisa === null
              ? 'warning'
              : forecast.projectedOverspend
                ? 'critical'
                : 'positive'
          }
          note={forecast.insufficientDataReason ?? `Forecast as of ${formatIsoDate(forecast.referenceDate)}`}
        />
      </div>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="breakdown-title">
          <div className="card-title">
            <h2 id="breakdown-title">Category breakdown</h2>
            <span className="tiny muted">{monthLabel(month)}</span>
          </div>
          {summary.categories.length === 0 ? (
            <EmptyState title="No expenses in this month">
              Add an expense or scan a receipt and the breakdown appears here.
            </EmptyState>
          ) : (
            <div className="breakdown">
              {summary.categories.map((c) => (
                <div className="breakdown-row" key={c.category}>
                  <div className="breakdown-top">
                    <span className="breakdown-name">{c.category}</span>
                    <span className="breakdown-value">
                      <strong>{formatTaka(c.amountPaisa)}</strong> · {formatPercent(c.percentOfSpending, 1)} ·{' '}
                      {c.count} {c.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <Meter
                    percent={c.percentOfSpending ?? 0}
                    label={`${c.category}: ${formatTaka(c.amountPaisa)}, ${formatPercent(c.percentOfSpending, 1)} of spending`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="largest-title">
          <div className="card-title">
            <h2 id="largest-title">Largest expenses</h2>
            <button type="button" className="ghost small" onClick={() => onGoTo('expenses')}>
              All expenses →
            </button>
          </div>
          {summary.largest.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <ol className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {summary.largest.map((e, index) => (
                <li className="row" key={e.id}>
                  <div className="row-main">
                    <span className="row-title">
                      <span className="dim">{index + 1}.</span> {e.shop}
                    </span>
                    <span className="row-sub">
                      <Badge>{e.category}</Badge>
                      <span>{formatIsoDate(e.date)}</span>
                      {e.source === 'receipt' ? <Badge tone="accent">From receipt</Badge> : null}
                    </span>
                  </div>
                  <span className="row-amount">{formatTaka(e.amountPaisa)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="insights-title">
        <div className="card-title">
          <h2 id="insights-title">Insights for {monthLabel(month)}</h2>
          <span className="tiny muted">generated from this month's records</span>
        </div>
        <InsightList insights={insights.slice(0, 5)} />
      </section>

      <section className="card" aria-labelledby="pockets-title">
        <div className="card-title">
          <h2 id="pockets-title">Savings pockets</h2>
          <button type="button" className="ghost small" onClick={() => onGoTo('savings')}>
            Pockets and DPS →
          </button>
        </div>
        {pockets.length === 0 ? (
          <EmptyState title="No savings pockets yet">Create one to see affordability and a DPS projection.</EmptyState>
        ) : (
          <div className="list">
            {pockets.map((p) => (
              <div className="row" key={p.pocket.id}>
                <div className="row-main" style={{ flex: '1 1 260px' }}>
                  <span className="row-title">
                    {p.pocket.name} <span className="dim small">· {p.pocket.item}</span>
                  </span>
                  <span className="row-sub">
                    {formatTaka(p.savedPaisa)} of {formatTaka(p.targetPaisa)} saved ·{' '}
                    {formatPercent(p.progressPercent, 1)}
                  </span>
                  <Meter
                    percent={p.progressPercent ?? 0}
                    label={`${p.pocket.name}: ${formatPercent(p.progressPercent, 1)} of target saved`}
                  />
                </div>
                <div className="stack-sm" style={{ textAlign: 'right' }}>
                  <span className="row-amount">
                    {p.monthsToCompletion === null
                      ? 'Not funded by forecast'
                      : p.monthsToCompletion === 0
                        ? 'Target reached'
                        : `${p.monthsToCompletion} ${p.monthsToCompletion === 1 ? 'month' : 'months'} → ${p.completionLabel}`}
                  </span>
                  <span>
                    {p.status === 'fully-funded' ? (
                      <Badge tone="positive">Forecast supports plan</Badge>
                    ) : p.status === 'partially-funded' ? (
                      <Badge tone="warning">Reduced pace</Badge>
                    ) : p.status === 'target-reached' ? (
                      <Badge tone="positive">Complete</Badge>
                    ) : (
                      <Badge tone="critical">Not affordable</Badge>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
