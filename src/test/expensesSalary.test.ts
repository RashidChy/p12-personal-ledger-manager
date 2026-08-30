/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Expenses } from '../ui/Expenses'
import { ledger, taka } from './helpers'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('salary input synchronisation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('refreshes standing and month salary drafts when ledger props and month change', () => {
    const initial = ledger({
      salaryPaisa: taka('50000.00'),
      salaryByMonth: { '2026-04': taka('60000.00') },
    })

    act(() => {
      root.render(createElement(Expenses, { state: initial, dispatch: vi.fn(), month: '2026-04' }))
    })

    expect(inputValue('salary-default')).toBe('50000.00')
    expect(inputValue('salary-month')).toBe('60000.00')

    const replaced = ledger({
      salaryPaisa: taka('55000.00'),
      salaryByMonth: { '2026-05': taka('70000.00') },
    })
    act(() => {
      root.render(createElement(Expenses, { state: replaced, dispatch: vi.fn(), month: '2026-05' }))
    })

    expect(inputValue('salary-default')).toBe('55000.00')
    expect(inputValue('salary-month')).toBe('70000.00')

    act(() => {
      root.render(createElement(Expenses, { state: replaced, dispatch: vi.fn(), month: '2026-06' }))
    })
    expect(inputValue('salary-month')).toBe('')
  })

  function inputValue(id: string): string {
    const input = container.querySelector<HTMLInputElement>(`#${id}`)
    if (!input) throw new Error(`Missing input #${id}`)
    return input.value
  }
})
