import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Claude often wraps JSON in markdown fences — parse defensively.
export function parseJsonResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}
