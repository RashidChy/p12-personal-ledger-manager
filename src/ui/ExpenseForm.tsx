/** Add / edit expense form with inline validation. Shared by the expenses list
 *  and the receipt review step. */
import { useId, useState, type FormEvent } from 'react'
import { isIsoDate, type IsoDate } from '../domain/dates'
import { parseTakaToPaisa } from '../domain/money'
import type { Category, Expense } from '../domain/types'

export interface ExpenseDraft {
  date: string
  category: Category
  shop: string
  amount: string
  note?: string
}

export interface DraftErrors {
  date?: string
  shop?: string
  amount?: string
}

export function validateDraft(draft: ExpenseDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.date) errors.date = 'Enter the date on the receipt.'
  else if (!isIsoDate(draft.date)) errors.date = 'Enter a real calendar date (YYYY-MM-DD).'
  if (!draft.shop.trim()) errors.shop = 'Enter the shop or merchant name.'
  if (!draft.amount.trim()) errors.amount = 'Enter the amount in taka.'
  else {
    try {
      const paisa = parseTakaToPaisa(draft.amount)
      if (paisa <= 0) errors.amount = 'The amount must be greater than ৳0.'
    } catch {
      errors.amount = 'Enter a number, for example 1250.75.'
    }
  }
  return errors
}

export function draftToExpense(draft: ExpenseDraft, id: string, source: Expense['source']): Expense {
  const expense: Expense = {
    id,
    date: draft.date as IsoDate,
    category: draft.category,
    shop: draft.shop.trim(),
    amountPaisa: parseTakaToPaisa(draft.amount),
    source,
  }
  if (draft.note) expense.note = draft.note
  return expense
}

export function ExpenseFields({
  draft,
  errors,
  categories,
  onChange,
  idPrefix,
  children,
}: {
  draft: ExpenseDraft
  errors: DraftErrors
  /** The user's category list; managed on the Expenses tab. */
  categories: readonly Category[]
  onChange: (next: ExpenseDraft) => void
  idPrefix?: string
  children?: React.ReactNode
}) {
  const generated = useId()
  const prefix = idPrefix ?? generated
  // A draft can still name a category the list no longer has (an old form left
  // open while it was deleted); show it rather than silently re-filing it.
  const options = categories.includes(draft.category) ? categories : [draft.category, ...categories]
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${prefix}-date`}>Date</label>
        <input
          id={`${prefix}-date`}
          type="date"
          value={draft.date}
          aria-invalid={Boolean(errors.date)}
          aria-describedby={errors.date ? `${prefix}-date-error` : undefined}
          onChange={(e) => onChange({ ...draft, date: e.target.value })}
        />
        {errors.date ? (
          <span className="error-text" id={`${prefix}-date-error`}>
            {errors.date}
          </span>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-shop`}>Shop or merchant</label>
        <input
          id={`${prefix}-shop`}
          type="text"
          value={draft.shop}
          placeholder="e.g. Meena Bazar"
          aria-invalid={Boolean(errors.shop)}
          aria-describedby={errors.shop ? `${prefix}-shop-error` : undefined}
          onChange={(e) => onChange({ ...draft, shop: e.target.value })}
        />
        {errors.shop ? (
          <span className="error-text" id={`${prefix}-shop-error`}>
            {errors.shop}
          </span>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-amount`}>Amount (৳)</label>
        <input
          id={`${prefix}-amount`}
          type="text"
          inputMode="decimal"
          value={draft.amount}
          placeholder="1250.75"
          aria-invalid={Boolean(errors.amount)}
          aria-describedby={errors.amount ? `${prefix}-amount-error` : undefined}
          onChange={(e) => onChange({ ...draft, amount: e.target.value })}
        />
        {errors.amount ? (
          <span className="error-text" id={`${prefix}-amount-error`}>
            {errors.amount}
          </span>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-category`}>Category</label>
        <select
          id={`${prefix}-category`}
          value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
        >
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {children}
    </div>
  )
}

export function ExpenseForm({
  initial,
  submitLabel,
  categories,
  onSubmit,
  onCancel,
}: {
  initial: ExpenseDraft
  submitLabel: string
  categories: readonly Category[]
  onSubmit: (draft: ExpenseDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ExpenseDraft>(initial)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateDraft(draft)
    setErrors(found)
    setSubmitted(true)
    if (Object.keys(found).length === 0) onSubmit(draft)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <ExpenseFields
        draft={draft}
        errors={submitted ? errors : {}}
        categories={categories}
        onChange={(next) => {
          setDraft(next)
          if (submitted) setErrors(validateDraft(next))
        }}
      />
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
