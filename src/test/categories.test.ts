import { describe, expect, it } from 'vitest'
import {
  addCategory,
  canonicalCategories,
  categoryUsage,
  checkCategoryName,
  defaultCategories,
  deleteCategory,
  findCategory,
  normalizeCategoryName,
  orphanedCategories,
  renameCategory,
  resolveCategory,
  sortCategories,
  MAX_CATEGORY_NAME_LENGTH,
} from '../domain/categories'
import { defaultLedgerState } from '../data/fixture'
import { FALLBACK_CATEGORY } from '../domain/types'
import { expense } from './helpers'

const book = () => ({
  categories: ['Food', 'Rent', 'Other'],
  expenses: [
    expense('2026-04-02', 'Food', 'Sultans Dine', '900.00'),
    expense('2026-04-03', 'Food', 'Street stall', '120.00'),
    expense('2026-04-05', 'Rent', 'Landlord', '16000.00'),
  ],
})

describe('category names', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeCategoryName('  Street   food  ')).toBe('Street food')
    expect(normalizeCategoryName('\t\n')).toBe('')
  })

  it('matches case-insensitively and returns the stored spelling', () => {
    expect(findCategory(['Food', 'Rent'], 'food')).toBe('Food')
    expect(findCategory(['Food', 'Rent'], '  FOOD ')).toBe('Food')
    expect(findCategory(['Food'], 'Fuel')).toBeNull()
  })

  it('rejects blank, over-long and duplicate names', () => {
    const list = ['Food', 'Other']
    expect(checkCategoryName('   ', list)).toEqual({ ok: false, error: 'Enter a category name.' })
    const long = checkCategoryName('x'.repeat(MAX_CATEGORY_NAME_LENGTH + 1), list)
    expect(long.ok).toBe(false)
    const dupe = checkCategoryName('food', list)
    expect(dupe.ok).toBe(false)
    expect(dupe.ok === false && dupe.error).toMatch(/"Food" already exists/)
    expect(checkCategoryName(' Fuel ', list)).toEqual({ ok: true, name: 'Fuel' })
  })

  it('allows a re-spelling of the category being renamed', () => {
    expect(checkCategoryName('FOOD', ['Food', 'Other'], { renamingFrom: 'Food' })).toEqual({
      ok: true,
      name: 'FOOD',
    })
  })

  it('sorts alphabetically with the fallback pinned last', () => {
    expect(sortCategories(['Other', 'Rent', 'Food'])).toEqual(['Food', 'Rent', 'Other'])
  })

  it('canonicalises any list: drops blanks and duplicates, guarantees the fallback', () => {
    expect(canonicalCategories(['Rent', 'rent', '  ', 'Food'])).toEqual(['Food', 'Rent', 'Other'])
    expect(canonicalCategories(['x'.repeat(MAX_CATEGORY_NAME_LENGTH + 1)])).toEqual([FALLBACK_CATEGORY])
    expect(defaultCategories()).toContain(FALLBACK_CATEGORY)
  })
})

describe('adding a category', () => {
  it('adds a normalised name in display order and leaves expenses alone', () => {
    const before = book()
    const result = addCategory(before, '  Street food ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.change.categories).toEqual(['Food', 'Rent', 'Street food', 'Other'])
    expect(result.change.movedCount).toBe(0)
    expect(result.change.expenses).toEqual(before.expenses)
  })

  it('refuses a duplicate regardless of case', () => {
    expect(addCategory(book(), 'rent').ok).toBe(false)
  })
})

describe('renaming a category', () => {
  it('renames the category and every expense filed under it', () => {
    const result = renameCategory(book(), 'Food', 'Eating out')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.change.categories).toEqual(['Eating out', 'Rent', 'Other'])
    expect(result.change.movedCount).toBe(2)
    expect(result.change.expenses.filter((e) => e.category === 'Eating out')).toHaveLength(2)
    expect(result.change.expenses.some((e) => e.category === 'Food')).toBe(false)
    expect(result.change.message).toMatch(/moved 2 expenses/)
  })

  it('leaves no expense pointing at a category that no longer exists', () => {
    const result = renameCategory(book(), 'Rent', 'Housing')
    if (!result.ok) throw new Error(result.error)
    expect(orphanedCategories(result.change.categories, result.change.expenses)).toEqual([])
  })

  it('refuses an unknown category, a duplicate name and a no-op rename', () => {
    expect(renameCategory(book(), 'Fuel', 'Petrol').ok).toBe(false)
    expect(renameCategory(book(), 'Food', 'Rent').ok).toBe(false)
    expect(renameCategory(book(), 'Food', ' Food ').ok).toBe(false)
  })

  it('refuses to rename the fallback category', () => {
    const result = renameCategory(book(), FALLBACK_CATEGORY, 'Misc')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/cannot be renamed/)
  })
})

describe('deleting a category', () => {
  it('moves the affected expenses instead of deleting them', () => {
    const before = book()
    const result = deleteCategory(before, 'Food', 'Other')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.change.categories).toEqual(['Rent', 'Other'])
    expect(result.change.expenses).toHaveLength(before.expenses.length)
    expect(result.change.movedCount).toBe(2)
    expect(result.change.expenses.filter((e) => e.category === 'Other')).toHaveLength(2)
    expect(result.change.message).toMatch(/moved 2 expenses to "Other"/)
  })

  it('keeps the total spend unchanged', () => {
    const before = book()
    const total = before.expenses.reduce((acc, e) => acc + e.amountPaisa, 0)
    const result = deleteCategory(before, 'Rent', 'Other')
    if (!result.ok) throw new Error(result.error)
    expect(result.change.expenses.reduce((acc, e) => acc + e.amountPaisa, 0)).toBe(total)
  })

  it('says so when the category was empty', () => {
    const result = deleteCategory({ categories: ['Food', 'Fuel', 'Other'], expenses: [] }, 'Fuel', 'Other')
    if (!result.ok) throw new Error(result.error)
    expect(result.change.movedCount).toBe(0)
    expect(result.change.message).toMatch(/had no expenses/)
  })

  it('refuses an unknown category, an unknown target and moving onto itself', () => {
    expect(deleteCategory(book(), 'Fuel', 'Other').ok).toBe(false)
    expect(deleteCategory(book(), 'Food', 'Nowhere').ok).toBe(false)
    expect(deleteCategory(book(), 'Food', 'food').ok).toBe(false)
  })

  it('refuses to delete the fallback category', () => {
    const result = deleteCategory(book(), FALLBACK_CATEGORY, 'Food')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/cannot be deleted/)
  })
})

describe('category helpers', () => {
  it('counts usage per category', () => {
    expect(categoryUsage(book().expenses).get('Food')).toBe(2)
    expect(categoryUsage(book().expenses).get('Rent')).toBe(1)
  })

  it('reports expenses pointing at a missing category', () => {
    expect(orphanedCategories(['Rent', 'Other'], book().expenses)).toEqual(['Food'])
  })

  it('always resolves to a category that exists', () => {
    expect(resolveCategory(['Food', 'Other'], 'Food')).toBe('Food')
    expect(resolveCategory(['Food', 'Other'], 'Groceries')).toBe('Other')
    expect(resolveCategory(['Food'], 'Groceries')).toBe('Food')
  })
})

describe('on the real fixture ledger', () => {
  it('seeds every category the sample expenses use', () => {
    const state = defaultLedgerState()
    expect(orphanedCategories(state.categories, state.expenses)).toEqual([])
    expect(state.categories).toContain(FALLBACK_CATEGORY)
  })

  it('renames and deletes without losing an expense or a taka', () => {
    const state = defaultLedgerState()
    const total = state.expenses.reduce((acc, e) => acc + e.amountPaisa, 0)

    const renamed = renameCategory(state, 'Groceries', 'Bazar')
    if (!renamed.ok) throw new Error(renamed.error)
    expect(renamed.change.movedCount).toBeGreaterThan(0)

    const deleted = deleteCategory(renamed.change, 'Bazar', 'Food')
    if (!deleted.ok) throw new Error(deleted.error)

    expect(deleted.change.expenses).toHaveLength(state.expenses.length)
    expect(deleted.change.expenses.reduce((acc, e) => acc + e.amountPaisa, 0)).toBe(total)
    expect(deleted.change.categories).not.toContain('Bazar')
    expect(orphanedCategories(deleted.change.categories, deleted.change.expenses)).toEqual([])
  })
})
