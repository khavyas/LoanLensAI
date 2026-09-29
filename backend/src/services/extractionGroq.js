import fs from 'node:fs';
import { getGroqClient, GROQ_MODEL, parseJsonResponse } from './groqClient.js';
import { mockClassifyAndExtract } from './mockFixtures.js';

// Groq-backed alternative to extraction.js (Claude) — same exported
// signature, same field contract, so nothing downstream (verification.js,
// documents.js, rag.js) needs to know or care which provider actually ran.
// Selected via EXTRACTION_PROVIDER=groq in extractionProvider.js; kept in
// its own file rather than editing extraction.js so the working
// Claude path is completely untouched while waiting on ANTHROPIC_API_KEY
// approval.
//
// This field list is the exact contract the whole Truth Engine depends on —
// every check below reads specific fields from here:
//   - Name / Employer / SSN / Business name / Ownership % match checks
//     (fullName, employerName, ssnLast4, businessName, ownershipPercent)
//   - Monthly income & annual revenue vs. application, and the requested-
//     amount affordability check (grossMonthlyIncome, annualBusinessRevenue)
//   - Statutory withholding check — Social Security 6.2%, Medicare 1.45%
//     (grossPayPeriod, socialSecurityWithheld, medicareWithheld)
//   - Year-to-date consistency check (ytdGrossPay, payPeriodNumber, grossPayPeriod)
//   - Cross-document bank-deposit-vs-pay-stub check (netPay, recentDepositAmount,
//     recentDepositSource)
// If a future prompt/model change ever drops one of these fields, whichever
// check depends on it just silently stops firing (each check is gated on
// `!= null`) — worth re-running the direct verification.js script tests in
// this session's history after any prompt edit here.
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
    "recentDepositSource": string|null,
    "grossPayPeriod": number|null,
    "socialSecurityWithheld": number|null,
    "medicareWithheld": number|null,
    "ytdGrossPay": number|null,
    "payPeriodNumber": number|null
  }
}
Rules:
- grossMonthlyIncome must be MONTHLY. If the document shows weekly, bi-weekly, or annual pay, convert it and note the original in payPeriod.
- businessName is the legal or DBA business name exactly as printed (e.g. on a business license or tax return) — do not normalize or correct it.
- annualBusinessRevenue is the business's gross annual revenue or receipts as shown on a business tax return, in dollars.
- ownershipPercent is the percentage ownership stake shown on an ownership/beneficial-owner disclosure, 0-100.
- netPay is a pay stub's NET PAY (take-home, after deductions) for the pay period shown, in dollars.
- recentDepositAmount and recentDepositSource are only for bank statements: the dollar amount and transaction description of the most recent transaction that looks like a recurring payroll/salary direct deposit (not a one-off transfer or refund).
- grossPayPeriod is a pay stub's GROSS PAY for the current pay period only (not the monthly-converted figure).
- socialSecurityWithheld and medicareWithheld are the dollar amounts on the DEDUCTIONS lines labeled "Social Security" and "Medicare".
- ytdGrossPay and payPeriodNumber are only present on a pay stub if it explicitly prints a year-to-date gross figure and a pay period number (e.g. "Period 16 of 26") — leave both null if not shown.
- Use null for anything not visible or not applicable to this document type. Never guess.
- confidence reflects how legible/complete the document is, not your certainty about the docType alone.
- Return ONLY the JSON object above — no markdown fences, no explanation before or after it.`;

export async function classifyAndExtractGroq(filePath, mimeType, originalFilename) {
  if (MOCK_AI) return mockClassifyAndExtract(originalFilename);

  // Groq's vision models take images (PNG/JPEG/etc via image_url), not raw
  // PDF bytes the way Anthropic's client does — unlike extraction.js, there
  // is no PDF branch here. Every seeded demo document is a PNG, so this
  // isn't a gap for this project, but a real PDF upload would need
  // rasterizing to an image first.
  if (mimeType === 'application/pdf') {
    throw new Error('Groq extraction does not support PDF input directly — convert to an image first.');
  }

  const data = fs.readFileSync(filePath).toString('base64');

  const res = await getGroqClient().chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } },
        ],
      },
    ],
  });

  return parseJsonResponse(res.choices[0].message.content);
}
