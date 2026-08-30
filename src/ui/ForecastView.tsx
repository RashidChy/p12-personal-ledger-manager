/** Forecast figures, assumptions and the full list of generated insights. */
import { formatIsoDate, monthLabel, type IsoDate, type MonthKey } from '../domain/dates'
import { formatTaka, formatTakaFromFloatPaisa, pluralise } from '../domain/format'
import type { ForecastResult } from '../domain/forecast'
import type { Insight } from '../domain/insights'
import { Badge, Method, Notice, StatCard } from './common'
import { InsightList } from './InsightList'

export function ForecastView({
  forecast,
  insights,
  month,
  referenceDate,
  onChangeReferenceDate,
}: {
  forecast: ForecastResult
  insights: Insight[]
  month: MonthKey
  referenceDate: IsoDate
  onChangeReferenceDate: (date: IsoDate) => void
}) {
  const projecting = forecast.status === 'projected'
  const completed = forecast.status === 'completed'

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title">
          <h2>Forecast for {monthLabel(month)}</h2>
          <Badge tone={completed ? 'info' : projecting ? 'accent' : 'warning'}>
            {completed ? 'Completed month - actuals' : projecting ? 'In-month projection' : 'Insufficient data'}
          </Badge>
        </div>

        <div className="form-grid" style={{ marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="forecast-date">Forecast as of</label>
            <input
              id="forecast-date"
              type="date"
              value={referenceDate}
              onChange={(e) => {
                if (e.target.value) onChangeReferenceDate(e.target.value as IsoDate)
              }}
            />
            <span className="hint">
              Seeded from the official fixture's <code>today</code> ({formatIsoDate(referenceDate)}) so the demo is
              reproducible. Change it to see the projection move.
            </span>
          </div>
        </div>

        {forecast.insufficientDataReason ? (
          <Notice tone="warning" title="Not enough data for a full forecast.">
            {forecast.insufficientDataReason}
          </Notice>
        ) : null}
      </section>

      <div className="grid grid-kpi">
        <StatCard
          label="Spending recorded so far"
          value={formatTaka(forecast.spentToDatePaisa)}
          note={`${pluralise(forecast.elapsedDays, 'day')} elapsed of ${forecast.daysInMonth}`}
        />
        <StatCard
          label="Average daily spending"
          value={formatTakaFromFloatPaisa(forecast.dailyRunRatePaisa)}
          note="spending to date ÷ elapsed days"
        />
        <StatCard
          label="Remaining days in month"
          value={String(forecast.remainingDays)}
          note={completed ? 'The month is already complete.' : `of ${forecast.daysInMonth} days`}
        />
        <StatCard
          label="Expected additional spending"
          value={formatTakaFromFloatPaisa(forecast.expectedAdditionalPaisa)}
          note={completed ? 'Nothing is projected for a completed month.' : 'daily run rate × remaining days'}
        />
        <StatCard
          label={completed ? 'Actual month-end spending' : 'Expected total at month end'}
          value={formatTakaFromFloatPaisa(forecast.expectedMonthEndSpendingPaisa)}
          tone="accent"
          note={completed ? 'Actual recorded spending' : 'spending so far + expected additional'}
        />
        <StatCard
          label={forecast.projectedOverspend ? 'Expected shortfall' : 'Expected money left'}
          value={formatTakaFromFloatPaisa(
            forecast.projectedOverspend ? forecast.forecastShortfallPaisa : forecast.forecastMonthEndBalancePaisa,
          )}
          tone={forecast.projectedOverspend ? 'critical' : 'positive'}
          badge={
            forecast.forecastMonthEndBalancePaisa === null ? (
              <Badge tone="warning">Needs a salary figure</Badge>
            ) : forecast.projectedOverspend ? (
              <Badge tone="critical">Over salary</Badge>
            ) : (
              <Badge tone="positive">Within salary</Badge>
            )
          }
          note={`salary ${formatTaka(forecast.salaryPaisa)} − expected month-end spending`}
        />
      </div>

      <section className="card">
        <div className="card-title">
          <h2>Insights</h2>
          <span className="tiny muted">
            {insights.length} generated from {monthLabel(month)} records
          </span>
        </div>
        <InsightList insights={insights} />
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Forecast assumptions</h2>
          <span className="tiny muted">calculated {formatIsoDate(forecast.referenceDate)}</span>
        </div>
        <ul className="small muted" style={{ paddingLeft: '1.1rem', margin: 0 }}>
          {forecast.assumptions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div style={{ marginTop: 12 }}>
          <Method summary="Show the formula with this month's numbers">
            <div className="formula">
              <span>
                daily run rate = {formatTaka(forecast.spentToDatePaisa)} ÷ {forecast.elapsedDays} ={' '}
                {formatTakaFromFloatPaisa(forecast.dailyRunRatePaisa)}
              </span>
              <span>
                expected additional = {formatTakaFromFloatPaisa(forecast.dailyRunRatePaisa)} × {forecast.remainingDays} ={' '}
                {formatTakaFromFloatPaisa(forecast.expectedAdditionalPaisa)}
              </span>
              <span>
                expected month-end = {formatTaka(forecast.spentToDatePaisa)} +{' '}
                {formatTakaFromFloatPaisa(forecast.expectedAdditionalPaisa)} ={' '}
                {formatTakaFromFloatPaisa(forecast.expectedMonthEndSpendingPaisa)}
              </span>
              <span>
                forecast balance = {formatTaka(forecast.salaryPaisa)} −{' '}
                {formatTakaFromFloatPaisa(forecast.expectedMonthEndSpendingPaisa)} ={' '}
                {formatTakaFromFloatPaisa(forecast.forecastMonthEndBalancePaisa)}
              </span>
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Displayed figures are rounded to the nearest taka; the underlying calculation keeps full precision.
            </p>
          </Method>
        </div>
      </section>
    </div>
  )
}
