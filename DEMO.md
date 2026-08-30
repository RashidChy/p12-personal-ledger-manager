# Demo script — Personal Ledger Manager (P12)

**Team BinaryBros · LSH26-T008 · target length 60–90 seconds**

The demo shows the working product. No architecture talk, no code on screen.

**Before you start:** open the live URL in a clean browser window and, if you have used
the app before, press **Reset to sample data → PUB-01 → Reset now** so the opening screen
is the official fixture. Have the Receipt scanner's "Try sample: Supermarket receipt"
button ready — or a real receipt photo on the device.

---

## 0:00–0:20 — The dashboard proves the product is real

> “This is Personal Ledger Manager, running entirely in the browser on the official
> LofiStack P12 fixture. April 2026: salary **৳50,000**, **৳27,083** spent so far,
> **৳22,917** remaining — that's **54.2%** of salary gone.”

Point at, in order:
- the four KPI cards (salary, total spent, remaining, % of salary with its bar);
- the **category breakdown** — exact taka amounts and percentages per category;
- the **largest expenses** list;
- **“Compared with March 2026”** — the change in taka *and* as a percentage.

> “Every one of these numbers is computed from the stored expense records — nothing here
> is hardcoded.”

## 0:20–0:45 — Scan a receipt, on the device

Click **Receipt scanner**. Point at the green privacy banner for one second.

> “Receipt OCR runs on this device. The photo never leaves the browser.”

Click **Try sample: Supermarket receipt** (or drop a real receipt photo).

Show the progress bar, then the review table:

> “Tesseract read it in about a second: merchant **Meena Bazar** at 95% confidence, date
> **14 April 2026** at 90%, total **৳1,341.25** taken from the line labelled *GRAND
> TOTAL* — not the subtotal, and not the ৳1,500 cash tendered. It also lists every other
> amount it found, in case it picked the wrong one.”

## 0:45–0:55 — Correct a field and save

Change the **Shop or merchant** field to `Meena Bazar Dhanmondi` (or correct the
category), then click **Save expense**.

> “Every extracted field is editable, and nothing is stored until I confirm.”

## 0:55–1:10 — The whole dashboard updates

Click **Overview**.

> “Total spent has moved to **৳28,424.25**, remaining salary to **৳21,575.75**, the
> Groceries slice has grown, and the forecast and insights have all recalculated.”

Click **Forecast & insights**.

> “Spending so far, average daily spend, days remaining, expected additional spend,
> expected month-end total, and the expected money left — with the forecast date and the
> exact formula behind it.”

Point at three insights and read the amounts out loud, e.g.:

> “‘Rent is your largest category at ৳16,000, 59% of April spending.’ ‘Groceries spending
> is ৳7,713 lower than March 2026.’ ‘You have spent ৳16,453 less so far in April than in
> all of March.’ Every insight names a real category and a real amount.”

## 1:10–1:25 — Savings pocket and DPS

Click **Savings pockets**, and stay on the first pocket.

> “The Laptop pocket targets **৳1,45,000** with a planned **৳12,000** a month. The
> forecast leaves **৳2,206** disposable this month, so the *effective* affordable
> contribution is ৳2,206, not ৳12,000 — the app says so and pushes the completion month
> out accordingly, instead of pretending the plan is affordable.”

Point at the DPS block:

> “Over that period the DPS projection at the fixture's **8.00%** annual rate shows the
> total principal, the estimated interest, and the maturity value — an illustrative
> estimate, clearly labelled, not financial advice.”

Expand **“Method, contribution timing and month-by-month schedule”** for one second.

## 1:25–1:35 — Methodology (brief)

Click **Methodology**, scroll once.

> “Every formula is written down: the run-rate forecast, the affordability rule, the
> fixture's exact DPS rule, the fixture source, and the privacy behaviour. And if I
> refresh, everything I entered is still here — it's stored on this device.”

Press **F5** to show the data persisting, and finish.

---

## Backup plan if OCR is slow on the venue network

The OCR model is bundled with the app, so the scanner works offline — but if the first
scan is slow on the demo machine, run one warm-up scan before the demo starts. If the
scan still stalls, click **Enter manually instead**: the same review-and-save flow runs,
and the dashboard update in section 0:55 still lands.

## Checklist of what the judges see

- [x] Salary, total spent, remaining balance, % of salary
- [x] Category breakdown with amounts and percentages
- [x] Largest expenses
- [x] Previous-month comparison (amount and percentage)
- [x] Receipt upload with visible OCR progress
- [x] Extracted merchant, date and amount with confidence
- [x] A corrected field saved to the ledger
- [x] Dashboard and forecast updating immediately
- [x] Three or more insights with category names and exact taka amounts
- [x] Savings pocket with affordability, completion month, DPS rate, principal and return
- [x] Methodology panel
- [x] Data surviving a refresh
