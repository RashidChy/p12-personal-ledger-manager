/** Opening screen: everything a judge should see within a few seconds. */
import { formatIsoDate, monthLabel, type MonthKey } from '../domain/dates'
import { formatPercent, formatSignedPercent, formatTaka, formatTakaFromFloatPaisa } from '../domain/format'
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
      <div className="grid grid-kpi">
        <StatCard
          label="Monthly salary"
          value={formatTaka(summary.salaryPaisa)}
          tone="accent"
          note={summary.hasSalary ? monthLabel(month) : 'No salary set for this month'}
        />
        <StatCard
          label="Total spent"
          value={formatTaka(summary.totalSpentPaisa)}
          note={`${summary.expenseCount} ${summary.expenseCount === 1 ? 'expense' : 'expenses'} recorded in ${monthLabel(month)}`}
        />
        <StatCard
          label={summary.isOverspending ? 'Overspent by' : 'Remaining salary'}
          value={
            summary.remainingPaisa === null
              ? '—'
              : formatTaka(summary.isOverspending ? summary.overspendPaisa : summary.remainingPaisa)
          }
          tone={summary.isOverspending ? 'critical' : 'positive'}
          badge={
            summary.remainingPaisa === null ? (
              <Badge tone="warning">Set a salary to see this</Badge>
            ) : summary.isOverspending ? (
              <Badge tone="critical">Over salary</Badge>
            ) : (
              <Badge tone="positive">Within salary</Badge>
            )
          }
          note={
            summary.remainingPaisa === null
              ? 'Remaining salary needs a monthly salary figure.'
              : `Salary ${formatTaka(summary.salaryPaisa)} − spent ${formatTaka(summary.totalSpentPaisa)}`
          }
        />
        <StatCard
          label="Percentage of salary spent"
          value={formatPercent(spentPercent, 1)}
          tone={spentPercent !== null && spentPercent > 100 ? 'critical' : spentPercent !== null && spentPercent > 80 ? 'warning' : 'neutral'}
          note={
            spentPercent === null ? (
              'Not available without a salary.'
            ) : (
              <Meter percent={spentPercent} over={spentPercent > 100} label={`${formatPercent(spentPercent, 1)} of salary spent`} />
            )
          }
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

      <div className="grid grid-2">
        <section className="card" aria-labelledby="compare-title">
          <div className="card-title">
            <h2 id="compare-title">Compared with {monthLabel(cmp.previousMonth)}</h2>
          </div>
          <div className="stack-sm">
            <div className="spread">
              <div className="kpi">
                <span className="kpi-label">Change in spending</span>
                <span className={`kpi-value sm ${cmp.changePaisa > 0 ? 'critical' : 'positive'}`}>
                  {formatTaka(cmp.changePaisa, { signed: true })}
                </span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Change %</span>
                <span className="kpi-value sm">{formatSignedPercent(cmp.changePercent, 1)}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">{monthLabel(cmp.previousMonth)} total</span>
                <span className="kpi-value sm">{formatTaka(cmp.previousTotalPaisa)}</span>
              </div>
            </div>
            <div>
              {cmp.changePercentNote ? (
                <Badge tone="warning">{cmp.changePercentNote}</Badge>
              ) : (
                <Badge tone={cmp.changePaisa > 0 ? 'warning' : 'positive'}>
                  {cmp.changePaisa > 0 ? 'Spending is up on last month' : 'Spending is down on last month'}
                </Badge>
              )}
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="forecast-summary-title">
          <div className="card-title">
            <h2 id="forecast-summary-title">Forecast</h2>
            <span className="tiny muted">as of {formatIsoDate(forecast.referenceDate)}</span>
          </div>
          {forecast.insufficientDataReason && forecast.expectedMonthEndSpendingPaisa === null ? (
            <NoticeLike reason={forecast.insufficientDataReason} />
          ) : (
            <div className="stack-sm">
              <div className="spread">
                <div className="kpi">
                  <span className="kpi-label">
                    {forecast.status === 'completed' ? 'Actual month-end spending' : 'Expected month-end spending'}
                  </span>
                  <span className="kpi-value sm">{formatTakaFromFloatPaisa(forecast.expectedMonthEndSpendingPaisa)}</span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">
                    {forecast.projectedOverspend ? 'Expected shortfall' : 'Expected money left'}
                  </span>
                  <span className={`kpi-value sm ${forecast.projectedOverspend ? 'critical' : 'positive'}`}>
                    {formatTakaFromFloatPaisa(
                      forecast.projectedOverspend ? forecast.forecastShortfallPaisa : forecast.forecastMonthEndBalancePaisa,
                    )}
                  </span>
                </div>
              </div>
              <p className="small muted">
                {forecast.status === 'completed'
                  ? `${monthLabel(month)} is complete, so actual spending is used as the final total.`
                  : `${formatTakaFromFloatPaisa(forecast.dailyRunRatePaisa)}/day over ${forecast.elapsedDays} elapsed ${forecast.elapsedDays === 1 ? 'day' : 'days'}, projected across ${forecast.remainingDays} remaining ${forecast.remainingDays === 1 ? 'day' : 'days'}.`}
              </p>
              <div>
                <button type="button" className="ghost small" onClick={() => onGoTo('forecast')}>
                  Forecast details and assumptions →
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="insights-title">
        <div className="card-title">
          <h2 id="insights-title">Insights for {monthLabel(month)}</h2>
          <span className="tiny muted">generated from this month's records</span>
        </div>
        <InsightList insights={insights.slice(0, 4)} />
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

function NoticeLike({ reason }: { reason: string }) {
  return (
    <div className="notice warning" role="status">
      <span className="notice-icon" aria-hidden="true">!</span>
      <div>{reason}</div>
    </div>
  )
}
