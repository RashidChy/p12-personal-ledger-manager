/**
 * Money is stored as an integer number of paisa (1 taka = 100 paisa).
 *
 * Every amount that comes from the official fixture is a fixed 2-decimal string
 * ("2475.00"), so integer paisa represents it exactly and totals never drift the
 * way float taka would. Forecast maths deliberately keeps fractional paisa as a
 * float and only rounds at the display boundary.
 */

export type Paisa = number

const AMOUNT_RE = /^-?\d+(\.\d+)?$/

/** Parses a decimal taka string ("2475.00", "1,234.5") into exact paisa. */
export function parseTakaToPaisa(input: string | number): Paisa {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`Invalid amount: ${input}`)
    const paisa = roundHalfUp(input * 100)
    if (!Number.isSafeInteger(paisa)) throw new Error(`Amount is outside the safe supported range: ${input}`)
    return paisa
  }
  const cleaned = input.trim().replace(/[,\s৳]/g, '').replace(/^(BDT|Tk\.?|TK\.?)/i, '')
  if (!AMOUNT_RE.test(cleaned)) throw new Error(`Invalid amount: ${JSON.stringify(input)}`)
  const negative = cleaned.startsWith('-')
  const [whole, frac = ''] = cleaned.replace('-', '').split('.')
  const paisaFrac = (frac + '00').slice(0, 2)
  // A third decimal place would be sub-paisa; round it half up rather than truncate.
  const remainder = frac.slice(2)
  let paisa = Number(whole) * 100 + Number(paisaFrac)
  if (remainder.length > 0 && Number(remainder[0]) >= 5) paisa += 1
  const signedPaisa = negative ? -paisa : paisa
  if (!Number.isSafeInteger(signedPaisa)) {
    throw new Error(`Amount is outside the safe supported range: ${JSON.stringify(input)}`)
  }
  return signedPaisa
}

/** Rounds half away from zero, the convention the fixture's DPS rule specifies. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

export function paisaToTaka(paisa: Paisa): number {
  return paisa / 100
}

export function sumPaisa(values: readonly Paisa[]): Paisa {
  let total = 0
  for (const value of values) {
    if (!isValidPaisa(value)) throw new Error(`Invalid paisa value: ${value}`)
    total += value
    if (!Number.isSafeInteger(total)) throw new Error('Money total exceeds the safe supported range.')
  }
  return total
}

/** True when the value is a whole number of paisa that JavaScript can represent exactly. */
export function isValidPaisa(value: unknown): value is Paisa {
  return typeof value === 'number' && Number.isSafeInteger(value)
}
