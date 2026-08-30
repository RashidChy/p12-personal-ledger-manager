/** Categories: add, rename and delete the labels expenses are filed under. */
import { useMemo, useState, type FormEvent } from 'react'
import {
  categoryUsage,
  checkCategoryName,
  deleteCategory,
  MAX_CATEGORY_NAME_LENGTH,
  renameCategory,
} from '../domain/categories'
import { formatTaka } from '../domain/format'
import { FALLBACK_CATEGORY, type Category, type LedgerState } from '../domain/types'
import type { LedgerAction } from '../store/useLedger'
import { Badge, ConfirmDialog, Modal } from './common'

export function Categories({
  state,
  dispatch,
  onFlash,
}: {
  state: LedgerState
  dispatch: (action: LedgerAction) => void
  onFlash: (message: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const rows = useMemo(() => {
    const counts = categoryUsage(state.expenses)
    const totals = new Map<Category, number>()
    for (const e of state.expenses) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountPaisa)
    return state.categories.map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      totalPaisa: totals.get(name) ?? 0,
    }))
  }, [state.categories, state.expenses])

  const submitNew = (event: FormEvent) => {
    event.preventDefault()
    const check = checkCategoryName(newName, state.categories)
    if (!check.ok) {
      setAddError(check.error)
      return
    }
    dispatch({ type: 'addCategory', name: check.name })
    setNewName('')
    setAddError(null)
    onFlash(`Added the category "${check.name}".`)
  }

  return (
    <section className="card" aria-labelledby="categories-title">
      <div className="card-title">
        <h2 id="categories-title">Expense categories</h2>
        <Badge tone="info">{state.categories.length} categories</Badge>
      </div>

      <p className="small muted">
        These are the labels every expense, receipt scan, breakdown and insight uses. Renaming one moves the expenses
        filed under it; deleting one moves them to a category you choose, so no expense is ever lost.
      </p>

      <form onSubmit={submitNew} noValidate style={{ marginBottom: '14px' }}>
        <div className="field">
          <label htmlFor="new-category">New category</label>
          <div className="field-row">
            <input
              id="new-category"
              type="text"
              value={newName}
              maxLength={MAX_CATEGORY_NAME_LENGTH}
              placeholder="e.g. Street food"
              aria-invalid={Boolean(addError)}
              aria-describedby={addError ? 'new-category-error' : 'new-category-help'}
              onChange={(e) => {
                setNewName(e.target.value)
                if (addError) setAddError(null)
              }}
            />
            <button type="submit" className="primary">
              + Add category
            </button>
          </div>
          {addError ? (
            <span className="error-text" id="new-category-error" role="alert">
              {addError}
            </span>
          ) : (
            <span className="hint" id="new-category-help">
              Up to {MAX_CATEGORY_NAME_LENGTH} characters. Names are unique, ignoring case.
            </span>
          )}
        </div>
      </form>

      <ul className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((row) => {
          const locked = row.name === FALLBACK_CATEGORY
          return (
            <li className="row" key={row.name}>
              <div className="row-main" style={{ flex: '1 1 240px' }}>
                <span className="row-title">{row.name}</span>
                <span className="row-sub">
                  <span>
                    {row.count === 0
                      ? 'No expenses'
                      : `${row.count} ${row.count === 1 ? 'expense' : 'expenses'} · ${formatTaka(row.totalPaisa)}`}
                  </span>
                  {locked ? <Badge tone="info">Fallback</Badge> : null}
                </span>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="small"
                  disabled={locked}
                  title={locked ? `"${FALLBACK_CATEGORY}" is fixed.` : undefined}
                  onClick={() => setRenaming(row.name)}
                >
                  Rename<span className="visually-hidden"> {row.name}</span>
                </button>
                <button
                  type="button"
                  className="danger small"
                  disabled={locked}
                  title={locked ? `"${FALLBACK_CATEGORY}" is fixed.` : undefined}
                  onClick={() => setDeleting(row.name)}
                >
                  Delete<span className="visually-hidden"> {row.name}</span>
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="small muted">
        "{FALLBACK_CATEGORY}" cannot be renamed or deleted: it is where imported records and unrecognised categories are
        filed.
      </p>

      {renaming !== null ? (
        <RenameDialog
          state={state}
          category={renaming}
          onCancel={() => setRenaming(null)}
          onConfirm={(name) => {
            const preview = renameCategory(state, renaming, name)
            dispatch({ type: 'renameCategory', from: renaming, to: name })
            setRenaming(null)
            if (preview.ok) onFlash(preview.change.message)
          }}
        />
      ) : null}

      {deleting !== null ? (
        <DeleteDialog
          state={state}
          category={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={(reassignTo) => {
            const preview = deleteCategory(state, deleting, reassignTo)
            dispatch({ type: 'deleteCategory', name: deleting, reassignTo })
            setDeleting(null)
            if (preview.ok) onFlash(preview.change.message)
          }}
        />
      ) : null}
    </section>
  )
}

function useAffected(state: LedgerState, category: Category): number {
  return useMemo(
    () => state.expenses.filter((e) => e.category === category).length,
    [state.expenses, category],
  )
}

function RenameDialog({
  state,
  category,
  onCancel,
  onConfirm,
}: {
  state: LedgerState
  category: Category
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(category)
  const [error, setError] = useState<string | null>(null)
  const affected = useAffected(state, category)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const check = checkCategoryName(name, state.categories, { renamingFrom: category })
    if (!check.ok) {
      setError(check.error)
      return
    }
    if (check.name === category) {
      setError('That is the current name. Change it, or cancel.')
      return
    }
    onConfirm(check.name)
  }

  return (
    <Modal
      title={`Rename "${category}"`}
      description={
        affected === 0
          ? 'No expenses use this category yet.'
          : `${affected} ${affected === 1 ? 'expense is' : 'expenses are'} filed here and will move to the new name.`
      }
      onClose={onCancel}
    >
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="rename-category">Category name</label>
          <input
            id="rename-category"
            type="text"
            value={name}
            maxLength={MAX_CATEGORY_NAME_LENGTH}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'rename-category-error' : undefined}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
            }}
          />
          {error ? (
            <span className="error-text" id="rename-category-error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
        <div className="form-actions">
          <button type="submit" className="primary">
            Save name
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteDialog({
  state,
  category,
  onCancel,
  onConfirm,
}: {
  state: LedgerState
  category: Category
  onCancel: () => void
  onConfirm: (reassignTo: Category) => void
}) {
  const affected = useAffected(state, category)
  const targets = state.categories.filter((c) => c !== category)
  const [reassignTo, setReassignTo] = useState<Category>(
    () => targets.find((c) => c === FALLBACK_CATEGORY) ?? targets[0] ?? FALLBACK_CATEGORY,
  )

  if (targets.length === 0) {
    return (
      <ConfirmDialog
        title={`Delete "${category}"?`}
        confirmLabel="Close"
        message="This is the only category left, so it cannot be deleted."
        onCancel={onCancel}
        onConfirm={onCancel}
      />
    )
  }

  return (
    <ConfirmDialog
      title={`Delete "${category}"?`}
      confirmLabel="Delete category"
      message={
        <div className="stack-sm">
          {affected === 0 ? (
            <div>No expenses use this category, so nothing else changes.</div>
          ) : (
            <>
              <div>
                <strong>
                  {affected} {affected === 1 ? 'expense is' : 'expenses are'} filed under "{category}".
                </strong>{' '}
                They will be moved to the category you pick below — no expense is deleted.
              </div>
              <div className="field">
                <label htmlFor="reassign-category">Move those expenses to</label>
                <select
                  id="reassign-category"
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                >
                  {targets.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div>Totals, the breakdown, the forecast and every insight update immediately.</div>
        </div>
      }
      onCancel={onCancel}
      onConfirm={() => onConfirm(reassignTo)}
    />
  )
}
