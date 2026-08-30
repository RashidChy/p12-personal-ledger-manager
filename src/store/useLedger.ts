/**
 * Ledger state, actions and device-local persistence.
 *
 * Every mutation goes through the reducer and is written straight back to
 * localStorage, so salary, expenses and pockets survive a refresh. A failed
 * write is surfaced to the user instead of being swallowed.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { defaultLedgerState, ledgerStateFromCase, getCase } from '../data/fixture'
import {
  addCategory,
  deleteCategory,
  renameCategory,
  type CategoryResult,
} from '../domain/categories'
import type { IsoDate, MonthKey } from '../domain/dates'
import type { Paisa } from '../domain/money'
import type { Category, Expense, LedgerState, Pocket } from '../domain/types'
import { loadState, saveState, clearState, isStorageAvailable } from './storage'

export type LedgerAction =
  | { type: 'replace'; state: LedgerState }
  | { type: 'setSalary'; paisa: Paisa | null }
  | { type: 'setMonthSalary'; month: MonthKey; paisa: Paisa | null }
  | { type: 'addExpense'; expense: Expense }
  | { type: 'updateExpense'; expense: Expense }
  | { type: 'deleteExpense'; id: string }
  | { type: 'addPocket'; pocket: Pocket }
  | { type: 'updatePocket'; pocket: Pocket }
  | { type: 'deletePocket'; id: string }
  | { type: 'addCategory'; name: string }
  | { type: 'renameCategory'; from: Category; to: string }
  | { type: 'deleteCategory'; name: Category; reassignTo: Category }
  | { type: 'setReferenceDate'; date: IsoDate }
  | { type: 'setDpsRate'; percent: number }

/**
 * Category edits are validated in the UI before they are dispatched; a request
 * the domain rejects here leaves the ledger untouched rather than half-applied.
 */
function applyCategoryChange(state: LedgerState, result: CategoryResult): LedgerState {
  if (!result.ok) return state
  return {
    ...state,
    categories: result.change.categories,
    expenses: result.change.expenses,
    updatedAt: new Date().toISOString(),
  }
}

function reducer(state: LedgerState, action: LedgerAction): LedgerState {
  const touched = (next: LedgerState): LedgerState => ({ ...next, updatedAt: new Date().toISOString() })
  switch (action.type) {
    case 'replace':
      return touched(action.state)
    case 'setSalary':
      return touched({ ...state, salaryPaisa: action.paisa })
    case 'setMonthSalary': {
      const salaryByMonth = { ...state.salaryByMonth }
      if (action.paisa === null) delete salaryByMonth[action.month]
      else salaryByMonth[action.month] = action.paisa
      return touched({ ...state, salaryByMonth })
    }
    case 'addExpense':
      return touched({ ...state, expenses: [...state.expenses, action.expense] })
    case 'updateExpense':
      return touched({
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.expense.id ? action.expense : e)),
      })
    case 'deleteExpense':
      return touched({ ...state, expenses: state.expenses.filter((e) => e.id !== action.id) })
    case 'addPocket':
      return touched({ ...state, pockets: [...state.pockets, action.pocket] })
    case 'updatePocket':
      return touched({
        ...state,
        pockets: state.pockets.map((p) => (p.id === action.pocket.id ? action.pocket : p)),
      })
    case 'deletePocket':
      return touched({ ...state, pockets: state.pockets.filter((p) => p.id !== action.id) })
    case 'addCategory':
      return applyCategoryChange(state, addCategory(state, action.name))
    case 'renameCategory':
      return applyCategoryChange(state, renameCategory(state, action.from, action.to))
    case 'deleteCategory':
      return applyCategoryChange(state, deleteCategory(state, action.name, action.reassignTo))
    case 'setReferenceDate':
      return touched({ ...state, referenceDate: action.date })
    case 'setDpsRate':
      return touched({ ...state, dpsAnnualRatePercent: action.percent })
    default:
      return state
  }
}

export interface StorageStatus {
  available: boolean
  /** Blocking problem with reading or writing local data. */
  error: string | null
  /** Non-fatal repairs applied while loading (migration, dropped records). */
  issues: string[]
  restoredFromDevice: boolean
  lastSavedAt: string | null
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

const initial = (): { state: LedgerState; status: StorageStatus } => {
  const loaded = loadState()
  if (loaded.state) {
    return {
      state: loaded.state,
      status: {
        available: isStorageAvailable(),
        error: loaded.error,
        issues: loaded.issues,
        restoredFromDevice: true,
        lastSavedAt: loaded.state.updatedAt,
      },
    }
  }
  return {
    state: defaultLedgerState(),
    status: {
      available: isStorageAvailable(),
      error: loaded.error,
      issues: loaded.issues,
      restoredFromDevice: false,
      lastSavedAt: null,
    },
  }
}

export function useLedger() {
  const bootstrap = useRef<ReturnType<typeof initial> | null>(null)
  if (bootstrap.current === null) bootstrap.current = initial()
  const [state, dispatch] = useReducer(reducer, bootstrap.current.state)
  const [status, setStatus] = useState<StorageStatus>(bootstrap.current.status)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const result = saveState(state)
    setStatus((prev) => ({
      ...prev,
      error: result.ok ? null : result.error,
      lastSavedAt: result.ok ? state.updatedAt : prev.lastSavedAt,
    }))
  }, [state])

  const resetToSample = useCallback((caseId?: string) => {
    clearState()
    const next = caseId ? ledgerStateFromCase(getCase(caseId)) : defaultLedgerState()
    dispatch({ type: 'replace', state: next })
    setStatus((prev) => ({ ...prev, issues: [], error: null, restoredFromDevice: false }))
  }, [])

  const dismissIssues = useCallback(() => setStatus((prev) => ({ ...prev, issues: [] })), [])

  return useMemo(
    () => ({ state, dispatch, status, resetToSample, dismissIssues }),
    [state, status, resetToSample, dismissIssues],
  )
}
