/**
 * Real Tesseract.js output captured by running the on-device OCR engine over the
 * committed sample receipt images (public/sample-receipts/*). Regenerate with
 * scripts/make-sample-receipts.py followed by a fresh scan in the app.
 *
 * Tests parse this real output, so the parser is exercised against text an OCR
 * engine actually produced rather than hand-written ideal input.
 */
export const OCR_SAMPLES = {
  "meena-bazar.png": {
    "text": "Meena Bazar\nDhanmondi Branch, Dhaka-1209\nTel: 09612-345678 BIN: 000123456-0101\nCASH MEMO\nInvoice No: 4417-2261\nDate: 14/04/2026 Time: 19:24\nBasmati Rice 5kg 1x 850.00 850.00\nFresh Milk 1L 2 x 110.00 220.00\nFarm Eggs (dozen) 1x 160.00 160.00\nSavlon Soap 100g 1x 95.00 95.00\nSub Total 1325.00\nVAT 5% 66.25\nDiscount -50.00\nGRAND TOTAL 1341.25\nCash Received 1500.00\nChange 158.75\nThank you for shopping with us\n",
    "confidence": 93
  },
  "sultans-dine.png": {
    "text": "SULTANS DINE\nGulshan-1, Dhaka\nBill No 8821 Table 12\nDate 17-04-2026 20:42\nKacchi Biriyani Full 2 x 650 1300\nBorhani 2x 60 120\nFirni 1 x 120 120\nSub Total 1540\nService Charge 5% 77\nTOTAL PAYABLE 1617 Tk\nPaid by bKash\n",
    "confidence": 93
  },
  "blurred.png": {
    "text": "Lazz Pharma\nMirpur 10, Dhaka\nMemo 55120\nDate 09/04/2026\nee\nNapa Extra 10s 45.00\nSergel 20mg 14s 210.00\nVitamin D3 320.00\nee\nTOTAL 575.00\n",
    "confidence": 87
  }
} as const
