import fs from 'node:fs';
import { anthropic, MODEL, parseJsonResponse } from './anthropicClient.js';
import { mockClassifyAndExtract } from './mockFixtures.js';

// Bypass for testing everything downstream of extraction (verification, the
// live-exception flow, status transitions) without spending Anthropic API
// credits — set MOCK_AI=true. Returns canned results for the known seed
// document filenames; anything else comes back as a low-confidence
// "unknown" so the upload flow still completes, same as a real illegible scan.
const MOCK_AI = process.env.MOCK_AI === 'true';

const EXTRACTION_PROMPT = `You are a loan document analyst. Look at this document and return STRICT JSON only (no markdown, no commentary) with this shape:
{
  "docType": "pay-stub" | "w2" | "bank-statement" | "drivers-license" | "business-tax-return" | "personal-financial-statement" | "business-license" | "ownership-disclosure" | "unknown",
  "confidence": 0.0-1.0,
  "fields": {
    "fullName": string|null,
    "employerName": string|null,
    "grossMonthlyIncome": number|null,
    "payPeriod": string|null,
    "address": string|null,
    "ssnLast4": string|null,
    "documentDate": string|null,
    "businessName": string|null,
    "ein": string|null,
    "annualBusinessRevenue": number|null,
    "ownershipPercent": number|null,
    "netPay": number|null,
    "recentDepositAmount": number|null,
    "recentDepositSource": string|null
  }
}
Rules:
- grossMonthlyIncome must be MONTHLY. If the document shows weekly, bi-weekly, or annual pay, convert it and note the original in payPeriod.
- businessName is the legal or DBA business name exactly as printed (e.g. on a business license or tax return) — do not normalize or correct it.
- annualBusinessRevenue is the business's gross annual revenue or receipts as shown on a business tax return, in dollars.
- ownershipPercent is the percentage ownership stake shown on an ownership/beneficial-owner disclosure, 0-100.
- netPay is a pay stub's NET PAY (take-home, after deductions) for the pay period shown, in dollars.
- recentDepositAmount and recentDepositSource are only for bank statements: the dollar amount and transaction description of the most recent transaction that looks like a recurring payroll/salary direct deposit (not a one-off transfer or refund).
- Use null for anything not visible or not applicable to this document type. Never guess.
- confidence reflects how legible/complete the document is, not your certainty about the docType alone.`;

export async function classifyAndExtract(filePath, mimeType, originalFilename) {
  if (MOCK_AI) return mockClassifyAndExtract(originalFilename);

  const data = fs.readFileSync(filePath).toString('base64');

  const fileBlock =
    mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data } };

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: EXTRACTION_PROMPT }] }],
  });

  return parseJsonResponse(res.content[0].text);
}
