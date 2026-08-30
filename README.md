# Personal Ledger Manager

**LofiStack Hackathon 2026 · Team BinaryBros (LSH26-T008) · Problem P12**

A privacy-first, statically hosted personal finance ledger for Bangladeshi taka: set a monthly
salary, record expenses, scan a paper receipt with **on-device OCR**, and see a monthly
dashboard, a transparent month-end forecast, amount-specific written insights, and
savings pockets with a DPS maturity projection.

Nothing is uploaded. Receipt photos, OCR and every calculation happen in your browser,
and your data is stored on your own device.

- **Live application:** https://rashidchy.github.io/lsh26-t008-p12/
- **Repository:** https://github.com/RashidChy/lsh26-t008-p12
- **Demo script:** [`DEMO.md`](DEMO.md) (60–90 seconds)
- **Licences:** [`LICENSES.md`](LICENSES.md)

> Judges should evaluate only the exact 40-character commit SHA entered in the Final Submission Form.

## Requirement verification

| Requirement | Status | Where to verify |
| --- | --- | --- |
| **R1 — salary, expenses and receipt OCR** | Complete | **Expenses** sets salary and records expenses. **Receipt scanner** loads a photo, performs on-device OCR, shows merchant/date/amount and lets the user correct every field before saving. Source: `src/ui/Expenses.tsx`, `src/ui/ReceiptScanner.tsx`, `src/ocr/ocrEngine.ts`. |
| **R2 — monthly dashboard** | Complete | **Overview** shows spend against salary, category totals, largest expenses and prior-month change. Switch the selected month to recalculate it. Source: `src/ui/Overview.tsx`, `src/domain/ledger.ts`. |
| **R3 — forecast and written insights** | Complete | **Forecast & insights** shows expected remaining spend, month-end balance/shortfall and amount-specific category and merchant observations. Source: `src/ui/ForecastView.tsx`, `src/domain/forecast.ts`, `src/domain/insights.ts`. |
| **R4 — savings pockets and DPS** | Complete | **Savings pockets** creates named goals with item details, targets and monthly contributions, then shows forecast-based completion and a stated-rate DPS return and schedule. Source: `src/ui/SavingsView.tsx`, `src/domain/savings.ts`, `src/domain/dps.ts`. |

## Judge fixture workflow

1. Open the live application and select **Import fixture JSON** in the top bar.
2. Choose either the complete P12 Submission Kit JSON file or one case object in the same shape (maximum 5 MB). The file is read and validated locally; it is never uploaded.
3. For a multi-case file, choose the case to load. Review its forecast date, month, salary, expense/pocket counts and DPS rate.
4. Tick the explicit replacement acknowledgement, then select **Replace with _case ID_**. The app opens the recalculated Overview for that case.
5. To restore the bundled data, select **Reset to sample data**, choose PUB-01 through PUB-25 and confirm.

Malformed JSON, a non-P12 fixture, invalid dates/amounts, duplicate IDs, unsupported file types and oversized files are rejected with field-specific messages before any existing ledger data is replaced. Source: `src/ui/FixtureImporter.tsx`, `src/data/fixtureImport.ts`; regression evidence: `src/test/fixtureImport.test.ts`.

---

## Product overview

The app opens on a dashboard that is already populated with the official P12 fixture, so
within a few seconds you can see a configured salary, expenses across two months, this
month's spending, remaining salary (or shortfall), a category breakdown, the previous
month comparison, the forecast, several amount-specific insights, and three active
savings pockets.

Six sections:

| Section | What it does |
| --- | --- |
| **Overview** | Salary, total spent, remaining/overspend, % of salary spent, category breakdown, largest expenses, previous-month comparison, forecast summary, insights, pockets |
| **Expenses** | Set the standing salary or a per-month override; add, edit and delete expenses (with confirmation); search and filter by category and period |
| **Receipt scanner** | Drop or choose a receipt photo, validate it, preview it, run OCR on this device, review extracted merchant/date/amount with confidence, correct every field, save only on confirmation |
| **Forecast & insights** | Spending so far, average daily spend, remaining days, expected additional and month-end spending, expected money left or shortfall, forecast date, assumptions, and every generated insight |
| **Savings pockets** | Create/edit/delete pockets; progress, remaining target, forecast disposable amount, effective affordable contribution, months to completion, completion month, and a full DPS schedule |
| **Methodology** | Every formula, fixture assumption, DPS rule, OCR/privacy behaviour and storage behaviour in one panel |

## Features

**Requirement 1 — salary, expenses and receipt scanning**
- Set and update a monthly salary, plus per-month salary overrides (for a bonus month, or a month with no income).
- Add, edit and delete expenses; deletion always asks for confirmation and names what will be deleted.
- Upload or drag-and-drop a receipt photograph; file type and size are validated before anything runs.
- Real OCR (Tesseract.js/WebAssembly) extracts the text on your device; the parser then works out the merchant, date and total.
- Image preview, live OCR progress, per-field confidence, and the reason each value was chosen.
- Every extracted field is editable, the category can be corrected, other monetary values found on the receipt are offered as one-tap alternatives, and the receipt can be cancelled without saving.
- Handles: unsupported file types, oversized files, empty files, OCR engine failure (retry / manual fallback), missing date, missing merchant, missing amount, multiple monetary values, and low-confidence extraction.

**Requirement 2 — monthly dashboard**
- Monthly salary, total spent, remaining salary, percentage of salary spent, overspending amount.
- Category breakdown with exact taka amounts, percentages and item counts.
- Largest individual expenses with a deterministic ordering.
- Previous-month change as both an amount and a percentage — and an explicit explanation instead of a percentage when the previous month is ৳0.
- Handles a month with no expenses, a month with no salary, expenses exceeding salary, month switching, and immediate recalculation after any add/edit/delete.
- All amounts in taka, e.g. `৳12,500`, `৳1,45,000`, `৳856.50`.

**Requirement 3 — forecast and insights**
- Spending to date, average daily spending, remaining days, expected additional spending, expected month-end total, expected money left or shortfall, the forecast date, and the full assumption list.
- At least three dynamically generated insights, each naming real categories/merchants and exact taka amounts.
- A completed past month uses actual spending rather than projecting extra days.
- When there is not enough data, the app explains why instead of showing a zero.

**Requirement 4 — savings pockets and DPS**
- Create, edit and delete pockets (name, target, item details, current saved, planned monthly contribution).
- Progress, remaining target, forecast disposable amount, effective affordable contribution, whether the forecast supports the plan, months to completion, completion month and year.
- DPS maturity value, total principal, estimated interest and the annual rate in use, with a month-by-month schedule and a methodology panel.
- An unaffordable pocket gets no invented completion date — it gets an explanation of the shortfall in taka.

**Product quality**
- Responsive desktop/mobile layouts; touch targets ≥ 42px.
- Labelled form controls, visible focus rings, keyboard-operable tabs, dialogs with focus trapping and Escape-to-close, ARIA `meter` semantics on every bar, and a skip link.
- No status is communicated by colour alone — every tone carries a text label and a glyph.
- Clear loading, empty, error and retry states; inline validation; confirmation before deletion.
- Search, category filter, period filter, month selection, reset-to-sample-data, and same-shape P12 JSON import with validation, review and explicit replacement confirmation.
- Versioned device-local persistence with migration and per-record validation.

## Technology used

- **React 18 + TypeScript + Vite** — small, fast, statically deployable.
- **Tesseract.js 7 (Apache-2.0)** compiled to WebAssembly for on-device OCR.
- **Vitest** for the deterministic test suite; **ESLint + typescript-eslint** for linting.
- **No charting library, no CSS framework, no UI kit, no backend, no authentication.** Visualisations are hand-written CSS bars; styles are hand-written in `src/styles.css`.

Pure calculation modules live in `src/domain/` and know nothing about React, storage or
the DOM. The UI in `src/ui/` only renders what they return.

```
src/
  domain/     money, dates, formatting, ledger, forecast, insights, savings, dps, receiptParse
  data/       official fixture + loader + same-shape import validator
  ocr/        Tesseract.js wrapper (worker lifecycle, progress, file validation)
  store/      versioned localStorage persistence, migration, reducer/hook
  ui/         React components
  test/       125 automated tests
```

## Problem-solving approach

We translated the four requirements into four visible workflows backed by small,
deterministic domain modules. Money is represented as integer paisa, forecast and DPS
assumptions stay visible to the user, and receipt OCR is a review-first input method—not
an automatic write to the ledger. The official 25-case fixture drives the opening demo
and automated boundary tests; the calculation layer is tested separately from React so
the team can explain and verify every result.

## Team contributions

| Registered member | GitHub username | Major contribution | Evidence |
| --- | --- | --- | --- |
| Mohammed Nafiur Rashid Chowdhury | `rashidchy` | Team leadership, problem selection, work coordination and final-submission preparation | `EVENT.md`, `README.md`, `evaluation-manifest.json`, repository/deployment coordination |
| Md Sayem Hossain | `sakib911` | Ledger, forecast, insights and savings/DPS engine; React interface; receipt-OCR workflow; automated tests and deployment implementation | `src/domain/`, `src/ui/`, `src/ocr/`, `src/test/`, `scripts/` |

## AI usage

OpenAI Codex was used as a disclosed coding assistant for architecture, implementation,
refactoring, test generation, code review and documentation. The team reviewed the
source and verified the output with the 125-test suite, TypeScript, ESLint, production
builds and browser walkthroughs. AI output was not accepted as an authority for ledger,
forecast or DPS results; those behaviours are encoded as deterministic functions and
checked against the published fixture and stated formulas.

## Major design decisions

- **Integer-paisa arithmetic:** ledger totals avoid floating-point drift.
- **Explainable forecasting:** a visible daily-run-rate model is easier for judges and users to audit than an opaque prediction.
- **Review before save:** OCR proposes merchant, date and amount with confidence, while the user retains control of every stored field.
- **On-device OCR and local persistence:** no receipt or personal ledger data is sent to a server.
- **Static React application:** the problem needs no shared account or server database, so GitHub Pages is sufficient and removes backend failure modes.

## Install and run

Requires Node.js 20+.

```bash
git clone https://github.com/RashidChy/lsh26-t008-p12.git
cd lsh26-t008-p12
npm ci             # installs the locked dependency tree
npm run dev        # http://localhost:5173
```

`npm run dev` and `npm run build` first run `npm run setup:ocr`, which copies the
Tesseract worker and WASM core out of `node_modules` into `public/ocr/` and makes sure
`public/ocr/lang/eng.traineddata.gz` exists (it is committed, so the build needs no
network access).

## Build

```bash
npm run build      # type-checks with tsc, then builds to dist/
npm run preview    # serves the production build on http://localhost:4173
```

The output in `dist/` is a static site — deployable to GitHub Pages, Netlify, Vercel,
Cloudflare Pages or any static host. `vite.config.ts` uses `base: './'`, so it works at
a domain root or in a sub-path.

## Tests

```bash
npm test           # 125 tests, deterministic, no network
npm run lint       # ESLint
npm run typecheck  # TypeScript check with no emitted files
```

Coverage of the required areas:

| # | Area | Test file |
| --- | --- | --- |
| 1 | Monthly salary and total spending | `ledger.test.ts` |
| 2 | Remaining salary and overspending | `ledger.test.ts` |
| 3 | Previous-month amount and percentage change | `ledger.test.ts` |
| 4 | Previous month equal to zero | `ledger.test.ts` |
| 5 | Forecast daily run rate | `forecast.test.ts` |
| 6 | Expected additional spending | `forecast.test.ts` |
| 7 | Expected month-end balance / shortfall | `forecast.test.ts` |
| 8 | Completed-month forecast behaviour | `forecast.test.ts` |
| 9 | Category totals and percentages | `ledger.test.ts` |
| 10 | Largest-expense ordering | `ledger.test.ts` |
| 11 | Insights containing real category names and amounts | `insights.test.ts` |
| 12 | Savings completion duration | `savings.test.ts` |
| 13 | Unaffordable savings pocket | `savings.test.ts` |
| 14 | Pocket already at its target | `savings.test.ts` |
| 15 | DPS compounding | `savings.test.ts` |
| 16 | OCR parsing of representative receipt text | `receiptParse.test.ts`, `ocrPipeline.test.ts` |
| 17 | Receipt text with multiple monetary values | `receiptParse.test.ts`, `ocrPipeline.test.ts` |
| 18 | Month and year boundaries | `dates.test.ts`, `forecast.test.ts`, `savings.test.ts` |
| 19 | Local data migration and validation | `storage.test.ts` |
| 20 | Complete-fixture and single-case JSON import, validation and file guards | `fixtureImport.test.ts` |

`ocrPipeline.test.ts` parses **real Tesseract output** captured from the committed sample
receipt images (`src/test/ocrSamples.ts`), so the parser is tested against text an OCR
engine actually produced. No fixture result is hardcoded inside any calculation function;
`fixture.test.ts` recomputes totals independently and checks them against the modules.

## Official fixture source

```
https://live.hackathon.lofistack.com/api/fixtures/P12?teamId=LSH26-T008
```

Fetched during development and stored **unmodified** at:

- `public/data/fixtures/P12.json` — the documented public copy
- `src/data/P12.fixture.json` — byte-identical bundled copy, so the opening screen does
  not depend on the fixture endpoint or browser CORS

Fixture facts (submission-kit schema version 2.2, validated by `fixture.test.ts` over all 25 public cases):

- Each case has `case_id`, `today`, `months {last, this}`, `salary_bdt`, `expenses[]`, `pockets[]`, `dps_annual_rate_percent`, `dps_rule`.
- Expenses: `{ id, date, category, shop, amount_bdt }`; 41–61 per case, spread over exactly the two documented months.
- Pockets: `{ id, name, item, target_bdt, monthly_contribution_bdt }`; 3 per case.
- Amounts are fixed 2-decimal strings; categories are Groceries, Rent, Utilities, Education, Food, Transport, Health, Mobile, Entertainment, Clothing.
- The default demo case is **PUB-01** (salary ৳50,000, `today` = 2026-04-17, DPS 8.00%); any of the 25 cases can be loaded from the “Reset to sample data” dialog.

Judges can also load a complete published/hidden P12 fixture or a single same-shape case through **Import fixture JSON**. The importer validates the P12 identity and every required case, expense and pocket field, presents a case picker and factual review, and requires explicit confirmation before replacing local data.

**Documented assumptions**

1. `today` is the forecast reference date (“forecast as of”). It always falls inside `months.this`, and no expense is dated after it — both verified in tests.
2. Amounts are exact to the paisa, so they are stored internally as integer paisa (1 taka = 100 paisa) and no float drift can occur in totals.
3. The fixture gives pockets **no “already saved” amount**, so pockets are seeded at ৳0 saved. The saved amount is fully editable in the app.
4. `dps_annual_rate_percent` varies per case (7.5%–10%); the app uses the case's own rate and lets the user change it. It is illustrative, not a market quote.
5. The fixture's `dps_rule` is applied exactly (see “DPS formula” below) in preference to the generic annuity formula.

## Data model

```ts
Expense  { id, date: "YYYY-MM-DD", category, shop, amountPaisa, source: 'fixture'|'manual'|'receipt', note? }
Pocket   { id, name, item, targetPaisa, savedPaisa, monthlyContributionPaisa }
Ledger   { schemaVersion, salaryPaisa | null, salaryByMonth: { "YYYY-MM": paisa },
           expenses[], pockets[], dpsAnnualRatePercent, referenceDate, fixtureCaseId, updatedAt }
```

Money is an **integer number of paisa** everywhere in storage and in the ledger maths.
Forecast arithmetic keeps fractional paisa as floats and rounds only for display.
`salaryPaisa: null` means “no salary set” and is never silently treated as ৳0.

## Forecast methodology

```
daily run rate             = spending to date ÷ elapsed days
expected additional spend  = daily run rate × remaining days
expected month-end spend   = spending to date + expected additional spend
forecast month-end balance = salary − expected month-end spending
```

- Elapsed days include the forecast date itself (17 April → 17 elapsed days of 30).
- **Completed month:** if the selected month ended before the forecast date, actual spending *is* the month-end total; nothing extra is projected.
- **Future month:** no projection is attempted; the app explains why.
- **Intermediate values are never rounded.** Only displayed figures are.

### Forecast assumptions

- Spending continues at the same average daily pace: no seasonality, no scheduled bills, no rent timing, no salary change mid-month.
- The forecast date is seeded from the fixture's `today` so the demo is reproducible; it is exposed as an editable “forecast as of” control.
- Where the data cannot support a figure (no expenses yet, no salary, month not started), the app states the reason instead of returning zero.

## Savings affordability method

```
forecast disposable amount     = max(0, forecast month-end balance)
effective monthly contribution = min(planned monthly contribution, forecast disposable amount)
remaining target               = max(0, target amount − current saved)
months to completion           = ceil(remaining target ÷ effective monthly contribution)
```

- Contributions are counted from the selected month, so a 3-month plan starting in April completes in **June** (start month + months − 1).
- If the effective contribution is ৳0 (or the forecast already overspends), **no completion date is invented** — the shortfall is explained in taka.
- If no forecast balance exists (no salary, or no spending yet), the pocket reports “forecast unavailable” rather than assuming zero.
- A pocket already at its target reports 0 months and runs no DPS projection.

## DPS formula and rate

The official fixture states the rule, and the app implements it exactly:

> “Annual rate as stated. Each month: balance = balance + deposit, then interest =
> balance × rate / 12 / 100 rounded half up to the paisa and added to the balance
> (interest joins the balance, so later months earn on it).”

```
monthly rate = annual rate ÷ 12
each month:  balance  = balance + deposit                    (deposit first: annuity due)
             interest = round_half_up(balance × rate ÷ 12 ÷ 100)
             balance  = balance + interest                   (monthly compounding)

total principal      = current saved + (monthly deposit × months)
estimated interest   = maturity value − total principal
```

The deposit used is the **effective affordable contribution**, and the period is the
months-to-completion computed above. The month-by-month schedule (opening, deposit,
interest, closing) is shown in the app under each pocket.

**Rate:** seeded from the case's `dps_annual_rate_percent` — 8.00% for the default
PUB-01 demo, editable in the UI. This is an **illustrative estimate, not financial
advice** and not a quoted product from any bank or scheme. The closed-form ordinary-annuity
formula gives a very close figure, but the fixture specifies deposit-first timing with
per-month paisa rounding, so the schedule is run month by month to match the stated rule
to the paisa.

## Receipt OCR behaviour

1. Choose or drop an image (JPEG, PNG, WebP, BMP; max 10 MB).
2. The file type, size and emptiness are validated with a specific, actionable message.
3. The image preview is shown immediately.
4. OCR progress is displayed live (engine load → model load → recognition), with a cancel button.
5. Tesseract.js extracts the text on the device.
6. The parser finds the merchant, date and total:
   - **Amount** — lines are scored: `GRAND TOTAL` / `NET PAYABLE` / `AMOUNT DUE` score highest; `SUB TOTAL`, `VAT`, `CHANGE`, `CASH`, `DISCOUNT` are penalised; with no labelled total the largest currency-marked value is used at low confidence. Dates, times, phone/invoice numbers and item sizes (`100g`, `5kg`, `10s`) are masked out first, and common OCR digit confusions (`O→0`, `l→1`, `S→5`) are repaired inside numeric tokens only.
   - **Date** — ISO, `dd/mm/yyyy`, `dd-mm-yy`, `17 Apr 2026` and `Apr 17, 2026` are all read. Ambiguous day/month order assumes the Bangladeshi day-first convention and lowers confidence. Dates after the forecast date are flagged.
   - **Merchant** — matched against known merchant names, otherwise inferred from the receipt header while skipping invoice/VAT/phone/address lines.
   - **Category** — suggested from merchant keywords (e.g. Uber → Transport, DESCO → Utilities, Lazz Pharma → Health).
7. Each field shows a confidence percentage and the reason it was chosen; anything below 70% is flagged “check”.
8. Every field is editable, and every other monetary value found on the receipt is offered as a one-tap alternative.
9. Nothing is stored until “Save expense” is pressed. Cancelling discards everything.

Failure paths: unsupported/oversized/empty file, engine load failure, no text recognised,
missing merchant/date/amount, several plausible totals, and low confidence — each with a
retry and a manual-entry fallback.

## Local privacy behaviour

- The receipt image is held in memory as an object URL and is **never uploaded**; it is released as soon as the scanner is closed.
- OCR runs in a web worker in your browser. The worker script, the WASM core and the English model are served from this app's own `/ocr/` directory — there is **no CDN or third-party request**. A scan already opened in a loaded session can continue without a network connection; the app does not install a service worker for cold offline reloads.
- Only the values you confirm are saved, and only to this browser's `localStorage` (`plm.ledger`).
- The stored blob is versioned and validated on load: older schemas are migrated and individually unreadable records are dropped and reported. A blob that cannot be parsed is left untouched and copied to a separate backup key when browser storage permits it. A failed write (quota, private mode) is surfaced as a visible warning — a storage failure never silently destroys data.
- No analytics, no telemetry, no cookies, no accounts, no backend.

## What is illustrative or mocked

- **The DPS rate and projection are illustrative**, following the fixture's stated rule and rate. They are not an offer, a quote, or financial advice.
- **The opening data is the official P12 fixture** (case PUB-01 by default), not real personal spending.
- **The sample receipt images are synthetic**, generated by `scripts/make-sample-receipts.py` for demo purposes; no real person's receipt is included.
- Pocket “current saved” amounts start at ৳0 because the fixture does not provide them.
- The forecast is a deliberately simple, explainable run-rate baseline — not a statistical model.

## Known limitations

- OCR is English-only (`eng.traineddata`); Bangla-script receipts will not be read well. Adding `ben.traineddata` is a drop-in change.
- The parser is tuned for Bangladeshi retail/restaurant receipt layouts; unusual layouts may need a manual correction (which the review step is designed for).
- The forecast assumes a flat daily pace, so a month with one large scheduled bill early on will project high until later days average it down.
- Data lives in one browser profile on one device; there is no sync, export or backup file yet.
- There is no service worker, so opening or reloading the application while fully offline is not guaranteed even though OCR uses only same-origin assets.
- The DPS projection assumes the effective contribution stays constant for the whole period and ignores tax, fees, missed instalments and early withdrawal.
- Each pocket is an independent what-if projection against the same disposable forecast; the app does not allocate that balance across several pockets as a combined savings plan.
- Completion and DPS schedules are capped at 600 months (50 years). Longer scenarios show the minimum contribution needed for a bounded forecast instead of generating an unsafe schedule.
- The first scan fetches the same-origin OCR model and core (about 2 MB) into memory, so it takes a few seconds longer than later scans; no third-party service receives the image.

## What would be built next

1. **Export/import** of the ledger as JSON and CSV, so data can be backed up or moved between devices.
2. **Bangla OCR** (`ben` traineddata) and a bilingual receipt parser.
3. **Recurring expenses and scheduled bills**, feeding a smarter forecast that separates fixed commitments from discretionary run-rate spending.
4. **Budget targets per category** with alerts when the projected category spend exceeds its target.
5. **Multiple DPS scenarios per pocket** (compare rates/tenors side by side) and an amortised “what if I contribute ৳X more” slider.
6. **Receipt line-item extraction** so a single receipt can be split across categories.

## Deployment

- **Live URL:** https://rashidchy.github.io/lsh26-t008-p12/
- **Repository:** https://github.com/RashidChy/lsh26-t008-p12
- **Host:** GitHub Pages (static, public, no login or setup required).

Redeploy after a change:

```bash
npm run deploy:pages     # builds, then adds a normal commit to the gh-pages branch
```

To deploy the same build anywhere else (Netlify, Vercel, Cloudflare Pages, any static host):

```bash
npm ci
npm run build
# then publish the contents of dist/
```

The `dist/` output is ~28 MB, almost entirely the Tesseract WASM core variants and the English
OCR model. That is the price of keeping OCR on-device with no third-party CDN request;
the initial page load itself is ~94 KB gzipped, and the OCR assets are fetched only when
a receipt is actually scanned.

## Licensing

Every dependency, asset and data file is listed in [`LICENSES.md`](LICENSES.md) with its
licence and source. The lockfile was audited package by package: 320 package records (the
root project excluded), all
permissive (MIT, Apache-2.0, ISC, BSD, MIT-0, Python-2.0, BlueOak-1.0.0, CC-BY-4.0), and
**zero** GPL/AGPL/LGPL/MPL/SSPL/non-commercial licences. Tesseract.js was verified as
Apache-2.0 before it was installed, as the problem statement requires.

## Event

See [`EVENT.md`](EVENT.md).
