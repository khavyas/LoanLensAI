import Groq from 'groq-sdk';

// Lazy on purpose: groq-sdk's constructor THROWS immediately if
// GROQ_API_KEY is missing/empty (stricter than @anthropic-ai/sdk, which
// tolerates an empty key until a real call is made). Building the client at
// module load time — the way anthropicClient.js does — would crash the
// entire backend on import alone whenever GROQ_API_KEY isn't set, even if
// EXTRACTION_PROVIDER is left at the default "anthropic" and Groq is never
// actually used. Only construct it the moment something really calls Groq.
let _groq = null;
export function getGroqClient() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// Llama 4 Scout is the vision-capable model on Groq's free developer tier
// (image inputs up to 20MB) — verified against console.groq.com/docs/vision
// on 2026-09-29, since Groq's model lineup and free-tier availability change
// over time. If this model is ever deprecated, check that page before
// swapping to a replacement — not every Groq model accepts image input.
export const GROQ_MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

// Same defensive parse as anthropicClient.js — open-weight models wrap JSON
// in markdown fences just as often as Claude does.
export function parseJsonResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}
