/**
 * The user's expense-category list: naming rules and the three edits.
 *
 * Everything here is pure. A rename or a delete never leaves an expense
 * pointing at a category that no longer exists - the affected expenses are
 * rewritten in the same operation, so totals, breakdowns, forecasts and
 * insights stay consistent with the list the user is looking at.
 */
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, type Category, type Expense } from './types'

export const MAX_CATEGORY_NAME_LENGTH = 32

/** Trims and collapses runs of whitespace, so " Street  food " becomes "Street food". */
export function normalizeCategoryName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Case-insensitive lookup; returns the stored spelling, or null. */
export function findCategory(categories: readonly Category[], name: string): Category | null {
  const needle = normalizeCategoryName(name).toLowerCase()
  return categories.find((c) => c.toLowerCase() === needle) ?? null
}

/** Alphabetical, with the "Other" fallback pinned last so it reads as a catch-all. */
export function sortCategories(categories: readonly Category[]): Category[] {
  return [...categories].sort((a, b) => {
    if (a === FALLBACK_CATEGORY) return b === FALLBACK_CATEGORY ? 0 : 1
    if (b === FALLBACK_CATEGORY) return -1
    return a.localeCompare(b)
  })
}

/**
 * Normalises a list from any source: drops blanks and duplicates (keeping the
 * first spelling), guarantees "Other" is present, and returns display order.
 */
export function canonicalCategories(categories: readonly string[]): Category[] {
  const kept: Category[] = []
  const seen = new Set<string>()
  for (const raw of categories) {
    if (typeof raw !== 'string') continue
    const name = normalizeCategoryName(raw)
    if (!name || name.length > MAX_CATEGORY_NAME_LENGTH) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(name)
  }
  if (!seen.has(FALLBACK_CATEGORY.toLowerCase())) kept.push(FALLBACK_CATEGORY)
  return sortCategories(kept)
}

/** The list a brand-new ledger starts with. */
export function defaultCategories(): Category[] {
  return canonicalCategories(DEFAULT_CATEGORIES)
}

export type NameCheck = { ok: true; name: Category } | { ok: false; error: string }

/**
 * Validates a name the user typed. `renamingFrom` is excluded from the
 * duplicate check so a category can be re-spelled ("food" to "Food").
 */
export function checkCategoryName(
  raw: string,
  categories: readonly Category[],
  options: { renamingFrom?: Category } = {},
): NameCheck {
  const name = normalizeCategoryName(raw)
  if (!name) return { ok: false, error: 'Enter a category name.' }
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { ok: false, error: `Keep the name to ${MAX_CATEGORY_NAME_LENGTH} characters or fewer.` }
  }
  const clash = findCategory(categories, name)
  if (clash !== null && clash !== options.renamingFrom) {
    return { ok: false, error: `"${clash}" already exists. Pick a different name.` }
  }
  return { ok: true, name }
}

/** How many expenses sit in each category, keyed by the stored spelling. */
export function categoryUsage(expenses: readonly Expense[]): Map<Category, number> {
  const counts = new Map<Category, number>()
  for (const e of expenses) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  return counts
}

/** Categories used by an expense but missing from the list (should never happen). */
export function orphanedCategories(
  categories: readonly Category[],
  expenses: readonly Expense[],
): Category[] {
  const known = new Set(categories.map((c) => c.toLowerCase()))
  const missing = new Set<Category>()
  for (const e of expenses) if (!known.has(e.category.toLowerCase())) missing.add(e.category)
  return [...missing].sort((a, b) => a.localeCompare(b))
}

export interface CategoryChange {
  categories: Category[]
  expenses: Expense[]
  /** How many expenses had their category rewritten. */
  movedCount: number
  /** Past-tense description of what happened, suitable for a status message. */
  message: string
}

export type CategoryResult = { ok: true; change: CategoryChange } | { ok: false; error: string }

interface Book {
  categories: readonly Category[]
  expenses: readonly Expense[]
}

function plural(count: number): string {
  return count === 1 ? '1 expense' : `${count} expenses`
}

/** Adds a new category. Rejects blanks, over-long names and duplicates. */
export function addCategory(book: Book, raw: string): CategoryResult {
  const check = checkCategoryName(raw, book.categories)
  if (!check.ok) return { ok: false, error: check.error }
  return {
    ok: true,
    change: {
      categories: sortCategories([...book.categories, check.name]),
      expenses: [...book.expenses],
      movedCount: 0,
      message: `Added the category "${check.name}".`,
    },
  }
}

/**
 * Renames a category and rewrites every expense filed under it. "Other" is
 * fixed, because validation and fixture import both fall back to that name.
 */
export function renameCategory(book: Book, from: Category, raw: string): CategoryResult {
  const existing = findCategory(book.categories, from)
  if (existing === null) return { ok: false, error: `"${from}" is not in the category list.` }
  if (existing === FALLBACK_CATEGORY) {
    return {
      ok: false,
      error: `"${FALLBACK_CATEGORY}" cannot be renamed: it is where imported and unrecognised records are filed.`,
    }
  }
  const check = checkCategoryName(raw, book.categories, { renamingFrom: existing })
  if (!check.ok) return { ok: false, error: check.error }
  if (check.name === existing) {
    return { ok: false, error: `"${existing}" already has that name.` }
  }

  let movedCount = 0
  const expenses = book.expenses.map((e) => {
    if (e.category !== existing) return e
    movedCount += 1
    return { ...e, category: check.name }
  })

  return {
    ok: true,
    change: {
      categories: sortCategories(book.categories.map((c) => (c === existing ? check.name : c))),
      expenses,
      movedCount,
      message:
        movedCount === 0
          ? `Renamed "${existing}" to "${check.name}".`
          : `Renamed "${existing}" to "${check.name}" and moved ${plural(movedCount)}.`,
    },
  }
}

/**
 * Deletes a category, moving anything filed under it to `reassignTo`. Nothing
 * is deleted along with the category: an expense is only ever re-filed.
 */
export function deleteCategory(book: Book, name: Category, reassignTo: Category): CategoryResult {
  const existing = findCategory(book.categories, name)
  if (existing === null) return { ok: false, error: `"${name}" is not in the category list.` }
  if (existing === FALLBACK_CATEGORY) {
    return {
      ok: false,
      error: `"${FALLBACK_CATEGORY}" cannot be deleted: it is where imported and unrecognised records are filed.`,
    }
  }
  if (book.categories.length <= 1) return { ok: false, error: 'At least one category must remain.' }

  const target = findCategory(book.categories, reassignTo)
  if (target === null) return { ok: false, error: `"${reassignTo}" is not in the category list.` }
  if (target === existing) return { ok: false, error: 'Choose a different category to move the expenses to.' }

  let movedCount = 0
  const expenses = book.expenses.map((e) => {
    if (e.category !== existing) return e
    movedCount += 1
    return { ...e, category: target }
  })

  return {
    ok: true,
    change: {
      categories: book.categories.filter((c) => c !== existing),
      expenses,
      movedCount,
      message:
        movedCount === 0
          ? `Deleted the category "${existing}". It had no expenses.`
          : `Deleted "${existing}" and moved ${plural(movedCount)} to "${target}".`,
    },
  }
}

/**
 * Picks a category that certainly exists: the preferred one if the list has it,
 * otherwise the fallback, otherwise the first entry.
 */
export function resolveCategory(categories: readonly Category[], preferred: string): Category {
  return (
    findCategory(categories, preferred) ??
    findCategory(categories, FALLBACK_CATEGORY) ??
    categories[0] ??
    FALLBACK_CATEGORY
  )
}
