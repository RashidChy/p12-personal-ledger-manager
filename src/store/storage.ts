/**
 * Device-local persistence.
 *
 * Salary, expenses and pockets live in localStorage on the user's own device;
 * nothing is sent anywhere. Writes are guarded so a quota error or a corrupt
 * blob surfaces as a visible warning instead of silently destroying data. A
 * blob that fails to parse is left untouched and, when storage permits it,
 * copied to a separate backup key.
 */
import { validateLedgerState } from './validate'
import type { LedgerState } from '../domain/types'

export const STORAGE_KEY = 'plm.ledger'
export const BACKUP_KEY_PREFIX = 'plm.ledger.backup.'

export interface LoadResult {
  state: LedgerState | null
  issues: string[]
  /** True when something was found in storage (even if it needed repair). */
  hadStoredData: boolean
  error: string | null
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const probe = '__plm_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

export function isStorageAvailable(): boolean {
  return storage() !== null
}

export function loadState(): LoadResult {
  const s = storage()
  if (!s) {
    return {
      state: null,
      issues: [],
      hadStoredData: false,
      error:
        'This browser is blocking local storage (private mode or site settings), so changes will not survive a refresh. Everything else works normally.',
    }
  }
  const raw = s.getItem(STORAGE_KEY)
  if (raw === null) return { state: null, issues: [], hadStoredData: false, error: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const backupKey = `${BACKUP_KEY_PREFIX}${Date.now()}`
    let backupCreated = false
    try {
      s.setItem(backupKey, raw)
      backupCreated = true
    } catch {
      /* backup is best-effort; the original key is left untouched either way */
    }
    return {
      state: null,
      issues: [],
      hadStoredData: true,
      error: backupCreated
        ? `Saved data could not be read (it is not valid JSON). The unreadable copy was kept at "${backupKey}" and the app has started from the official sample data. Nothing was deleted.`
        : 'Saved data could not be read (it is not valid JSON). The original stored value was left untouched, but the browser would not allow a separate backup copy. The app has started from the official sample data.',
    }
  }

  const { state, issues } = validateLedgerState(parsed)
  if (!state) {
    return {
      state: null,
      issues,
      hadStoredData: true,
      error: 'Saved data did not match any known schema, so the app started from the official sample data. The stored copy was left untouched.',
    }
  }
  return { state, issues, hadStoredData: true, error: null }
}

export function saveState(state: LedgerState): { ok: boolean; error: string | null } {
  const s = storage()
  if (!s) {
    return {
      ok: false,
      error: 'Local storage is unavailable, so this change was not saved to the device. It will be lost on refresh.',
    }
  }
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(state))
    return { ok: true, error: null }
  } catch (err) {
    const isQuota = err instanceof Error && /quota|exceeded/i.test(err.message)
    return {
      ok: false,
      error: isQuota
        ? 'The browser storage quota is full, so this change was not saved. Your existing saved data is untouched - delete some expenses or clear other site data and try again.'
        : `The change could not be saved to this device (${err instanceof Error ? err.message : 'unknown error'}). Your existing saved data is untouched.`,
    }
  }
}

export function clearState(): void {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(STORAGE_KEY)
  } catch {
    /* nothing further to do: the caller re-seeds state in memory regardless */
  }
}
