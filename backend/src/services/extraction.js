import fs from 'node:fs';
import { anthropic, MODEL, parseJsonResponse } from './anthropicClient.js';

const EXTRACTION_PROMPT = `You are a loan document analyst. Look at this document and return STRICT JSON only (no markdown, no commentary) with this shape:
{
  "docType": "pay-stub" | "w2" | "bank-statement" | "drivers-license" | "unknown",
  "confidence": 0.0-1.0,
  "fields": {
    "fullName": string|null,
    "employerName": string|null,
    "grossMonthlyIncome": number|null,
    "payPeriod": string|null,
    "address": string|null,
    "ssnLast4": string|null,
    "documentDate": string|null
  }
}
Rules:
- grossMonthlyIncome must be MONTHLY. If the document shows weekly, bi-weekly, or annual pay, convert it and note the original in payPeriod.
- Use null for anything not visible. Never guess.
- confidence reflects how legible/complete the document is, not your certainty about the docType alone.`;

export async function classifyAndExtract(filePath, mimeType) {
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
