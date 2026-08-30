/**
 * Copies the Tesseract.js worker + WASM core out of node_modules into public/ocr/
 * and makes sure the English traineddata file is present.
 *
 * Purpose: the app must never fetch OCR assets from a third-party CDN at runtime,
 * so that receipt OCR works offline and no request is made while a receipt is open.
 * All copied assets are Apache-2.0 (see LICENSES.md).
 */
import { mkdirSync, copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'ocr')
const coreDir = join(outDir, 'core')
const langDir = join(outDir, 'lang')
for (const d of [outDir, coreDir, langDir]) mkdirSync(d, { recursive: true })

copyFileSync(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), join(outDir, 'worker.min.js'))

// Only the LSTM cores are needed (the app never enables `legacyCore`), but all
// three SIMD variants must ship: Tesseract picks relaxed-SIMD, SIMD or plain
// depending on what the visitor's browser supports.
const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm',
]
for (const f of CORE_FILES) {
  const src = join(root, 'node_modules/tesseract.js-core', f)
  if (existsSync(src)) copyFileSync(src, join(coreDir, f))
  else console.warn(`[setup:ocr] missing optional core file ${f}`)
}

const LANG_FILE = join(langDir, 'eng.traineddata.gz')
const LANG_URL = 'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz'
if (existsSync(LANG_FILE) && statSync(LANG_FILE).size > 100_000) {
  console.log(`[setup:ocr] eng.traineddata.gz already present (${statSync(LANG_FILE).size} bytes)`)
} else {
  console.log(`[setup:ocr] downloading ${LANG_URL}`)
  const res = await fetch(LANG_URL)
  if (!res.ok) throw new Error(`Failed to download traineddata: ${res.status}`)
  writeFileSync(LANG_FILE, Buffer.from(await res.arrayBuffer()))
  console.log(`[setup:ocr] saved (${statSync(LANG_FILE).size} bytes)`)
}
console.log('[setup:ocr] done')
