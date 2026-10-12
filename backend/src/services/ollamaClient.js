import { RAG_CONFIG } from '../config/rag.js';

// NEW: Small native-fetch client for Ollama's current /api/embed and /api/chat APIs.
async function postJson(url, body, timeoutMs, label, externalSignal) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(RAG_CONFIG.ollamaApiKey ? { Authorization: `Bearer ${RAG_CONFIG.ollamaApiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: externalSignal
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), externalSignal])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`${label} timed out. Check the Ollama service and timeout configuration.`);
    }
    throw new Error(`${label} could not reach Ollama at the configured URL.`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }
  return payload;
}

export async function embedTexts(texts, signal) {
  if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string' || !text.trim())) {
    throw new TypeError('Ollama embedding input must be a non-empty array of text strings.');
  }

  const vectors = [];
  const batchSize = Math.max(1, RAG_CONFIG.embeddingBatchSize);
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const result = await postJson(
      `${RAG_CONFIG.ollamaBaseUrl}/api/embed`,
      { model: RAG_CONFIG.ollamaEmbeddingModel, input: batch, truncate: false },
      RAG_CONFIG.ollamaTimeoutMs,
      'Ollama embeddings',
      signal
    );
    if (!Array.isArray(result.embeddings) || result.embeddings.length !== batch.length) {
      throw new Error('Ollama returned an invalid number of embedding vectors.');
    }
    for (const vector of result.embeddings) {
      if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
        throw new Error('Ollama returned an invalid embedding vector.');
      }
      vectors.push(vector);
    }
  }
  const dimensions = vectors[0]?.length;
  if (vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error('Ollama returned embedding vectors with inconsistent dimensions.');
  }
  return vectors;
}

export async function generateChatJson(messages, signal) {
  const result = await postJson(
    `${RAG_CONFIG.ollamaBaseUrl}/api/chat`,
    {
      model: RAG_CONFIG.ollamaChatModel,
      messages,
      stream: false,
      format: 'json',
      options: { temperature: 0, num_predict: 768 },
    },
    RAG_CONFIG.ollamaTimeoutMs,
    'Ollama chat',
    signal
  );
  const content = result.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama returned an empty chat response.');
  }
  return content;
}
