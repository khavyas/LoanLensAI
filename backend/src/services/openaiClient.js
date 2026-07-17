import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
export const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

export async function embed(texts) {
  const input = Array.isArray(texts) ? texts : [texts];
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input });
  return res.data.map((d) => d.embedding);
}
