/** Expenses: salary control, search, filters, add / edit / delete. */
import { useMemo, useState } from 'react'
import { resolveCategory } from '../domain/categories'
import { formatIsoDate, monthLabel, monthOf, type MonthKey } from '../domain/dates'
import { formatTaka } from '../domain/format'
import { parseTakaToPaisa } from '../domain/money'
import type { Category, Expense, LedgerState } from '../domain/types'
import type { LedgerAction } from '../store/useLedger'
import { newId } from '../store/useLedger'
import { Categories } from './Categories'
import { Badge, ConfirmDialog, EmptyState, Modal, Notice } from './common'
import { ExpenseForm, type ExpenseDraft } from './ExpenseForm'

export function Expenses({
  state,
  dispatch,
  month,
}: {
  state: LedgerState
  dispatch: (action: LedgerAction) => void
  month: MonthKey
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | Category>('all')
  const [scope, setScope] = useState<'month' | 'all'>('month')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // A filter pinned to a category the user has since deleted would hide
  // everything with no explanation, so it falls back to "all".
  const activeCategory = category !== 'all' && !state.categories.includes(category) ? 'all' : category

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return state.expenses
      .filter((e) => (scope === 'month' ? monthOf(e.date) === month : true))
      .filter((e) => (activeCategory === 'all' ? true : e.category === activeCategory))
      .filter((e) =>
        needle === ''
          ? true
          : e.shop.toLowerCase().includes(needle) ||
            e.category.toLowerCase().includes(needle) ||
            e.date.includes(needle) ||
            formatTaka(e.amountPaisa).includes(needle),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.amountPaisa - a.amountPaisa)
  }, [state.expenses, search, activeCategory, scope, month])

  const visibleTotal = visible.reduce((acc, e) => acc + e.amountPaisa, 0)

  return (
    <div className="stack">
      <SalaryCard state={state} dispatch={dispatch} month={month} onFlash={setFlash} />

      {flash ? <Notice tone="positive" onDismiss={() => setFlash(null)}>{flash}</Notice> : null}

      <section className="card" aria-labelledby="expenses-title">
        <div className="card-title">
          <h2 id="expenses-title">Expenses</h2>
          <button type="button" className="primary small" onClick={() => setAdding(true)}>
            + Add expense
          </button>
        </div>

        <div className="toolbar">
          <div className="field">
            <label htmlFor="expense-search">Search</label>
            <input
              id="expense-search"
              type="search"
              value={search}
              placeholder="Shop, category, date or amount"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="expense-category">Category</label>
            <select id="expense-category" value={activeCategory} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {state.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="expense-scope">Period</label>
            <select id="expense-scope" value={scope} onChange={(e) => setScope(e.target.value as 'month' | 'all')}>
              <option value="month">{monthLabel(month)} only</option>
              <option value="all">All recorded months</option>
            </select>
          </div>
        </div>

        <p className="small muted" role="status">
          Showing {visible.length} of {state.expenses.length} expenses · total {formatTaka(visibleTotal)}
        </p>

        {visible.length === 0 ? (
          <EmptyState title="No expenses match">
            {state.expenses.length === 0
              ? 'Add your first expense, or scan a receipt in the Receipt scanner tab.'
              : 'Try a different search, category or period.'}
          </EmptyState>
        ) : (
          <ul className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {visible.map((e) => (
              <li className="row" key={e.id}>
                <div className="row-main" style={{ flex: '1 1 240px' }}>
                  <span className="row-title">{e.shop}</span>
                  <span className="row-sub">
                    <Badge>{e.category}</Badge>
                    <span>{formatIsoDate(e.date)}</span>
                    {e.source === 'receipt' ? <Badge tone="accent">From receipt</Badge> : null}
                    {e.source === 'fixture' ? <Badge tone="info">Sample data</Badge> : null}
                  </span>
                </div>
                <span className="row-amount">{formatTaka(e.amountPaisa)}</span>
                <div className="row-actions">
                  <button type="button" className="small" onClick={() => setEditing(e)}>
                    Edit<span className="visually-hidden"> {e.shop}, {formatTaka(e.amountPaisa)}</span>
                  </button>
                  <button type="button" className="danger small" onClick={() => setDeleting(e)}>
                    Delete<span className="visually-hidden"> {e.shop}, {formatTaka(e.amountPaisa)}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Categories state={state} dispatch={dispatch} onFlash={setFlash} />

      {adding ? (
        <Modal
          title="Add an expense"
          description={`It will be recorded against the date you choose and included in every calculation immediately.`}
          onClose={() => setAdding(false)}
        >
          <ExpenseForm
            initial={{ date: `${month}-01`, category: resolveCategory(state.categories, 'Food'), shop: '', amount: '' }}
            submitLabel="Save expense"
            categories={state.categories}
            onCancel={() => setAdding(false)}
            onSubmit={(draft) => {
              dispatch({
                type: 'addExpense',
                expense: {
                  id: newId('exp'),
                  date: draft.date,
                  category: draft.category,
                  shop: draft.shop.trim(),
                  amountPaisa: parseTakaToPaisa(draft.amount),
                  source: 'manual',
                },
              })
              setAdding(false)
              setFlash(`Added ${formatTaka(parseTakaToPaisa(draft.amount))} at ${draft.shop.trim()}.`)
            }}
          />
        </Modal>
      ) : null}

      {editing ? (
        <Modal title="Edit expense" description={`Editing ${editing.shop} on ${formatIsoDate(editing.date)}.`} onClose={() => setEditing(null)}>
          <ExpenseForm
            initial={toDraft(editing)}
            submitLabel="Save changes"
            categories={state.categories}
            onCancel={() => setEditing(null)}
            onSubmit={(draft) => {
              dispatch({
                type: 'updateExpense',
                expense: {
                  ...editing,
                  date: draft.date,
                  category: draft.category,
                  shop: draft.shop.trim(),
                  amountPaisa: parseTakaToPaisa(draft.amount),
                },
              })
              setEditing(null)
              setFlash(`Updated ${draft.shop.trim()}.`)
            }}
          />
        </Modal>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete this expense?"
          message={
            <>
              <strong>
                {deleting.shop} · {formatTaka(deleting.amountPaisa)} · {formatIsoDate(deleting.date)}
              </strong>
              <div>This cannot be undone, and every total, forecast and insight will update immediately.</div>
            </>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            dispatch({ type: 'deleteExpense', id: deleting.id })
            setFlash(`Deleted ${deleting.shop} (${formatTaka(deleting.amountPaisa)}).`)
            setDeleting(null)
          }}
        />
      ) : null}
    </div>
  )
}

function toDraft(expense: Expense): ExpenseDraft {
  return {
    date: expense.date,
    category: expense.category,
    shop: expense.shop,
    amount: (expense.amountPaisa / 100).toFixed(2),
  }
}

function SalaryCard({
  state,
  dispatch,
  month,
  onFlash,
}: {
  state: LedgerState
  dispatch: (action: LedgerAction) => void
  month: MonthKey
  onFlash: (message: string) => void
}) {
  const override = state.salaryByMonth[month]
  const [value, setValue] = useState(() =>
    state.salaryPaisa === null ? '' : (state.salaryPaisa / 100).toFixed(2),
  )
  const [monthValue, setMonthValue] = useState(() => (override === undefined ? '' : (override / 100).toFixed(2)))
  const [error, setError] = useState<string | null>(null)

  const apply = (raw: string, target: 'default' | 'month') => {
    if (raw.trim() === '') {
      if (target === 'default') dispatch({ type: 'setSalary', paisa: null })
      else dispatch({ type: 'setMonthSalary', month, paisa: null })
      setError(null)
      onFlash(target === 'default' ? 'Monthly salary cleared.' : `Salary override for ${monthLabel(month)} removed.`)
      return
    }
    try {
      const paisa = parseTakaToPaisa(raw)
      if (paisa < 0) throw new Error('negative')
      if (target === 'default') dispatch({ type: 'setSalary', paisa })
      else dispatch({ type: 'setMonthSalary', month, paisa })
      setError(null)
      onFlash(
        target === 'default'
          ? `Monthly salary set to ${formatTaka(paisa)}.`
          : `${monthLabel(month)} salary set to ${formatTaka(paisa)}.`,
      )
    } catch {
      setError('Enter an amount in taka, for example 50000. Leave it blank to clear the salary.')
    }
  }

  return (
    <section className="card" aria-labelledby="salary-title">
      <div className="card-title">
        <h2 id="salary-title">Monthly salary</h2>
        <Badge tone="info">Used by every remaining-salary and forecast figure</Badge>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="salary-default">Standing monthly salary (৳)</label>
          <input
            id="salary-default"
            type="text"
            inputMode="decimal"
            value={value}
            placeholder="50000"
            aria-invalid={Boolean(error)}
            aria-describedby="salary-help"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => apply(value, 'default')}
          />
          <span className="hint" id="salary-help">
            Applies to every month unless overridden. Blank means "no salary set".
          </span>
        </div>
        <div className="field">
          <label htmlFor="salary-month">Override for {monthLabel(month)} (৳)</label>
          <input
            id="salary-month"
            type="text"
            inputMode="decimal"
            value={monthValue}
            placeholder="Leave blank to use the standing salary"
            onChange={(e) => setMonthValue(e.target.value)}
            onBlur={() => apply(monthValue, 'month')}
          />
          <span className="hint">Use this for a bonus month or a month with no income.</span>
        </div>
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
