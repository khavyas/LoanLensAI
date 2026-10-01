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

// Llama 4 Scout (docs' advertised vision model) turned out NOT to be
// enabled on this account in practice — a live call returned 404
// model_not_found. Confirmed the actual available model list directly via
// GET https://api.groq.com/openai/v1/models with the real key on
// 2026-10-01: qwen/qwen3.8-27b was the ONLY model in that account-specific
// list with "image" in input_modalities (also supports json_mode, which
// this code relies on). Docs describe the general catalog; this endpoint
// is the one source of truth for what a specific account can actually call
// — re-check it before ever changing this default.
export const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

// Same defensive parse as anthropicClient.js — open-weight models wrap JSON
// in markdown fences just as often as Claude does.
export function parseJsonResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}
