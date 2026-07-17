import fs from 'node:fs';
import { openai, CHAT_MODEL } from './openaiClient.js';

const EXTRACTION_PROMPT = `You are a loan document analyst. Look at this document image and return STRICT JSON only (no markdown) with this shape:
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
- grossMonthlyIncome must be MONTHLY. If the document shows bi-weekly or annual pay, convert it and note the original in payPeriod.
- Use null for anything not visible. Never guess.
- confidence reflects how legible/complete the document is, not your certainty about the docType alone.`;

export async function classifyAndExtract(filePath, mimeType) {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      },
    ],
  });
  return JSON.parse(res.choices[0].message.content);
}
