/** Savings pockets: CRUD, forecast affordability and the DPS projection. */
import { useState, type FormEvent } from 'react'
import { monthLabel, type MonthKey } from '../domain/dates'
import { formatPercent, formatTaka, formatTakaFromFloatPaisa } from '../domain/format'
import { parseTakaToPaisa } from '../domain/money'
import type { PocketProjection } from '../domain/savings'
import type { Pocket } from '../domain/types'
import type { LedgerAction } from '../store/useLedger'
import { newId } from '../store/useLedger'
import { Badge, ConfirmDialog, EmptyState, Meter, Method, Modal, Notice } from './common'

interface PocketDraft {
  name: string
  item: string
  target: string
  saved: string
  contribution: string
}

const EMPTY_DRAFT: PocketDraft = { name: '', item: '', target: '', saved: '0', contribution: '' }

export function SavingsView({
  projections,
  dispatch,
  month,
  dpsAnnualRatePercent,
  onChangeRate,
}: {
  projections: PocketProjection[]
  dispatch: (action: LedgerAction) => void
  month: MonthKey
  dpsAnnualRatePercent: number
  onChangeRate: (percent: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Pocket | null>(null)
  const [deleting, setDeleting] = useState<Pocket | null>(null)

  return (
    <div className="stack">
      <section className="card">
        <div className="spread">
          <div>
            <h2>Savings pockets</h2>
            <p className="small muted" style={{ maxWidth: '70ch' }}>
              Each pocket is checked against the forecast for {monthLabel(month)}: the effective contribution is the
              smaller of what you planned and what the forecast leaves disposable.
            </p>
          </div>
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button type="button" className="primary" onClick={() => setAdding(true)}>
              + New pocket
            </button>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="dps-rate">Illustrative DPS annual rate (%)</label>
            <input
              id="dps-rate"
              type="number"
              min={0}
              max={30}
              step={0.25}
              value={dpsAnnualRatePercent}
              onChange={(e) => {
                const value = Number(e.target.value)
                if (Number.isFinite(value) && value >= 0) onChangeRate(value)
              }}
            />
            <span className="hint">
              Seeded from the official fixture. Illustrative only - not a quoted product or financial advice.
            </span>
          </div>
        </div>
      </section>

      {projections.length === 0 ? (
        <EmptyState title="No savings pockets yet">
          Create a pocket with a target and a planned monthly contribution to see affordability, a completion month and
          a DPS projection.
        </EmptyState>
      ) : (
        projections.map((p) => (
          <PocketCard
            key={p.pocket.id}
            projection={p}
            month={month}
            onEdit={() => setEditing(p.pocket)}
            onDelete={() => setDeleting(p.pocket)}
          />
        ))
      )}

      {adding ? (
        <Modal title="New savings pocket" onClose={() => setAdding(false)}>
          <PocketForm
            initial={EMPTY_DRAFT}
            submitLabel="Create pocket"
            onCancel={() => setAdding(false)}
            onSubmit={(draft) => {
              dispatch({ type: 'addPocket', pocket: draftToPocket(draft, newId('pkt')) })
              setAdding(false)
            }}
          />
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Edit "${editing.name}"`} onClose={() => setEditing(null)}>
          <PocketForm
            initial={pocketToDraft(editing)}
            submitLabel="Save changes"
            onCancel={() => setEditing(null)}
            onSubmit={(draft) => {
              dispatch({ type: 'updatePocket', pocket: { ...draftToPocket(draft, editing.id) } })
              setEditing(null)
            }}
          />
        </Modal>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete this savings pocket?"
          message={
            <>
              <strong>
                {deleting.name} · target {formatTaka(deleting.targetPaisa)}
              </strong>
              <div>Its saved balance and projection will be removed. This cannot be undone.</div>
            </>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            dispatch({ type: 'deletePocket', id: deleting.id })
            setDeleting(null)
          }}
        />
      ) : null}
    </div>
  )
}

function PocketCard({
  projection: p,
  month,
  onEdit,
  onDelete,
}: {
  projection: PocketProjection
  month: MonthKey
  onEdit: () => void
  onDelete: () => void
}) {
  const tone =
    p.status === 'fully-funded' || p.status === 'target-reached'
      ? 'positive'
      : p.status === 'partially-funded'
        ? 'warning'
        : 'critical'
  const statusLabel = {
    'fully-funded': 'Forecast supports the planned contribution',
    'partially-funded': 'Forecast supports part of the contribution',
    'target-reached': 'Target reached',
    unfundable: 'Forecast cannot fund this pocket',
    'forecast-unavailable': 'Forecast unavailable',
    'no-planned-contribution': 'No contribution planned',
  }[p.status]

  return (
    <section className="card">
      <div className="card-title">
        <div>
          <h2>{p.pocket.name}</h2>
          <p className="small muted">{p.pocket.item}</p>
        </div>
        <div className="row-actions">
          <button type="button" className="small" onClick={onEdit}>
            Edit<span className="visually-hidden"> {p.pocket.name}</span>
          </button>
          <button type="button" className="danger small" onClick={onDelete}>
            Delete<span className="visually-hidden"> {p.pocket.name}</span>
          </button>
        </div>
      </div>

      <div className="stack-sm">
        <div className="spread">
          <span className="small">
            <strong>{formatTaka(p.savedPaisa)}</strong> saved of <strong>{formatTaka(p.targetPaisa)}</strong> target ·{' '}
            {formatTaka(p.remainingTargetPaisa)} remaining
          </span>
          <Badge tone={tone}>{statusLabel}</Badge>
        </div>
        <Meter
          percent={p.progressPercent ?? 0}
          label={`${p.pocket.name}: ${formatPercent(p.progressPercent, 1)} of target saved`}
        />

        <div className="grid grid-kpi" style={{ marginTop: 6 }}>
          <Figure label="Current progress" value={formatPercent(p.progressPercent, 1)} note={`${formatTaka(p.savedPaisa)} saved`} />
          <Figure label="Remaining target" value={formatTaka(p.remainingTargetPaisa)} />
          <Figure label="Planned monthly contribution" value={formatTaka(p.plannedContributionPaisa)} />
          <Figure
            label="Forecast disposable amount"
            value={formatTakaFromFloatPaisa(p.forecastDisposablePaisa)}
            note={`max(0, forecast month-end balance) for ${monthLabel(month)}`}
          />
          <Figure
            label="Effective affordable contribution"
            value={formatTakaFromFloatPaisa(p.effectiveContributionPaisa)}
            note="min(planned, forecast disposable)"
            tone={p.forecastSupportsPlanned === false ? 'warning' : undefined}
          />
          <Figure
            label="Expected months to completion"
            value={p.monthsToCompletion === null ? '—' : String(p.monthsToCompletion)}
            note={
              p.completionLabel
                ? `Expected completion: ${p.completionLabel}`
                : 'No completion date is shown without an affordable contribution.'
            }
          />
        </div>

        <Notice tone={tone === 'positive' ? 'positive' : tone === 'warning' ? 'warning' : 'critical'}>
          {p.explanation}
        </Notice>

        {p.dps ? (
          <div className="stack-sm">
            <div className="spread">
              <h3>DPS projection over {p.dps.months} {p.dps.months === 1 ? 'month' : 'months'}</h3>
              <Badge tone="info">Illustrative estimate · not financial advice</Badge>
            </div>
            <div className="grid grid-kpi">
              <Figure label="Annual DPS rate used" value={`${p.dps.annualRatePercent.toFixed(2)}%`} note={`${p.dps.monthlyRatePercent.toFixed(4)}% per month, compounded monthly`} />
              <Figure label="Monthly deposit used" value={formatTaka(p.dps.monthlyDepositPaisa)} note="the effective affordable contribution" />
              <Figure label="Total DPS principal" value={formatTaka(p.dps.totalPrincipalPaisa)} note={`${formatTaka(p.dps.openingBalancePaisa)} opening + ${formatTaka(p.dps.totalDepositsPaisa)} deposits`} />
              <Figure label="Estimated interest earned" value={formatTaka(p.dps.estimatedInterestPaisa)} tone="accent" />
              <Figure label="DPS maturity value" value={formatTaka(p.dps.maturityValuePaisa)} tone="accent" note={`at the end of month ${p.dps.months}`} />
            </div>
            <Method summary="Method, contribution timing and month-by-month schedule">
              <div className="formula">
                {p.dps.formula.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                <span>Contribution timing: {p.dps.contributionTiming}.</span>
              </div>
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table>
                  <caption className="visually-hidden">Month-by-month DPS schedule</caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="num">Opening</th>
                      <th scope="col" className="num">Deposit</th>
                      <th scope="col" className="num">Interest</th>
                      <th scope="col" className="num">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.dps.schedule.map((row) => (
                      <tr key={row.month}>
                        <th scope="row">{row.month}</th>
                        <td className="num">{formatTaka(row.openingPaisa)}</td>
                        <td className="num">{formatTaka(row.depositPaisa)}</td>
                        <td className="num">{formatTaka(row.interestPaisa)}</td>
                        <td className="num">{formatTaka(row.closingPaisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Method>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'accent' | 'warning'
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className={`kpi ${tone ?? ''}`}>
        <span className="kpi-label">{label}</span>
        <span className="kpi-value sm">{value}</span>
        {note ? <span className="kpi-note tiny">{note}</span> : null}
      </div>
    </div>
  )
}

function pocketToDraft(pocket: Pocket): PocketDraft {
  return {
    name: pocket.name,
    item: pocket.item,
    target: (pocket.targetPaisa / 100).toFixed(2),
    saved: (pocket.savedPaisa / 100).toFixed(2),
    contribution: (pocket.monthlyContributionPaisa / 100).toFixed(2),
  }
}

function draftToPocket(draft: PocketDraft, id: string): Pocket {
  return {
    id,
    name: draft.name.trim(),
    item: draft.item.trim(),
    targetPaisa: parseTakaToPaisa(draft.target),
    savedPaisa: draft.saved.trim() === '' ? 0 : parseTakaToPaisa(draft.saved),
    monthlyContributionPaisa: draft.contribution.trim() === '' ? 0 : parseTakaToPaisa(draft.contribution),
  }
}

function PocketForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: PocketDraft
  submitLabel: string
  onSubmit: (draft: PocketDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (value: PocketDraft) => {
    const found: Record<string, string> = {}
    if (!value.name.trim()) found.name = 'Give the pocket a name.'
    const money = (raw: string, key: string, label: string, allowZero: boolean) => {
      if (raw.trim() === '') {
        if (!allowZero) found[key] = `Enter the ${label}.`
        return
      }
      try {
        const paisa = parseTakaToPaisa(raw)
        if (paisa < 0) found[key] = `The ${label} cannot be negative.`
        if (!allowZero && paisa <= 0) found[key] = `The ${label} must be greater than ৳0.`
      } catch {
        found[key] = `Enter the ${label} as a number, for example 15000.`
      }
    }
    money(value.target, 'target', 'target amount', false)
    money(value.saved, 'saved', 'amount already saved', true)
    money(value.contribution, 'contribution', 'planned monthly contribution', true)
    return found
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate(draft)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit(draft)
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="pocket-name">Pocket name</label>
          <input
            id="pocket-name"
            value={draft.name}
            placeholder="e.g. Laptop"
            aria-invalid={Boolean(errors.name)}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          {errors.name ? <span className="error-text">{errors.name}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="pocket-item">Item details</label>
          <input
            id="pocket-item"
            value={draft.item}
            placeholder="e.g. MacBook Air M4"
            onChange={(e) => setDraft({ ...draft, item: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="pocket-target">Target amount (৳)</label>
          <input
            id="pocket-target"
            inputMode="decimal"
            value={draft.target}
            placeholder="145000"
            aria-invalid={Boolean(errors.target)}
            onChange={(e) => setDraft({ ...draft, target: e.target.value })}
          />
          {errors.target ? <span className="error-text">{errors.target}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="pocket-saved">Current amount saved (৳)</label>
          <input
            id="pocket-saved"
            inputMode="decimal"
            value={draft.saved}
            placeholder="0"
            aria-invalid={Boolean(errors.saved)}
            onChange={(e) => setDraft({ ...draft, saved: e.target.value })}
          />
          {errors.saved ? <span className="error-text">{errors.saved}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="pocket-contribution">Planned monthly contribution (৳)</label>
          <input
            id="pocket-contribution"
            inputMode="decimal"
            value={draft.contribution}
            placeholder="12000"
            aria-invalid={Boolean(errors.contribution)}
            onChange={(e) => setDraft({ ...draft, contribution: e.target.value })}
          />
          {errors.contribution ? <span className="error-text">{errors.contribution}</span> : null}
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
