import { RAG_CONFIG } from '../config/rag.js';

const CHROMA_INSTRUCTIONS = 'Represent this text for semantic retrieval in an approved loan policy knowledge base.';

function validateEmbeddings(embeddings, expectedCount, provider) {
  if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
    throw new Error(`${provider} returned an invalid number of embedding vectors.`);
  }
  for (const vector of embeddings) {
    if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
      throw new Error(`${provider} returned an invalid embedding vector.`);
    }
  }
  const dimensions = embeddings[0]?.length;
  if (embeddings.some((vector) => vector.length !== dimensions)) {
    throw new Error(`${provider} returned embedding vectors with inconsistent dimensions.`);
  }
  return embeddings;
}

async function requestOllamaEmbeddings(batch, signal) {
  let response;
  try {
    response = await fetch(`${RAG_CONFIG.ollamaBaseUrl}/api/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(RAG_CONFIG.ollamaApiKey ? { Authorization: `Bearer ${RAG_CONFIG.ollamaApiKey}` } : {}),
      },
      body: JSON.stringify({ model: RAG_CONFIG.ollamaEmbeddingModel, input: batch, truncate: false }),
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(RAG_CONFIG.ollamaTimeoutMs), signal])
        : AbortSignal.timeout(RAG_CONFIG.ollamaTimeoutMs),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('Ollama embeddings timed out. Check the Ollama service and timeout configuration.');
    }
    throw new Error('Ollama embeddings could not reach the configured URL.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Ollama embeddings failed: ${payload.error || `HTTP ${response.status}`}`);
  }
  return validateEmbeddings(payload.embeddings, batch.length, 'Ollama');
}

async function requestChromaCloudEmbeddings(batch, signal) {
  let response;
  try {
    response = await fetch(RAG_CONFIG.chromaEmbeddingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chroma-token': RAG_CONFIG.chromaApiKey,
        'x-chroma-embedding-model': RAG_CONFIG.chromaEmbeddingModel,
      },
      body: JSON.stringify({ texts: batch, instructions: CHROMA_INSTRUCTIONS, fetch_labels: false }),
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(RAG_CONFIG.chromaEmbeddingTimeoutMs), signal])
        : AbortSignal.timeout(RAG_CONFIG.chromaEmbeddingTimeoutMs),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('Chroma Cloud embeddings timed out. Check CHROMA_EMBEDDING_TIMEOUT_MS.');
    }
    throw new Error('Chroma Cloud embeddings could not reach CHROMA_EMBEDDING_URL.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Chroma Cloud embeddings failed (HTTP ${response.status}): ${payload.error || 'unknown error'}`);
  }
  return validateEmbeddings(payload.embeddings, batch.length, 'Chroma Cloud');
}

export async function embedTexts(texts, signal) {
  if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string' || !text.trim())) {
    throw new TypeError('Embedding input must be a non-empty array of text strings.');
  }

  if (RAG_CONFIG.embeddingProvider === 'chroma-cloud' && !RAG_CONFIG.chromaApiKey) {
    throw new Error('CHROMA_API_KEY is required when EMBEDDING_PROVIDER=chroma-cloud.');
  }
  if (!['ollama', 'chroma-cloud'].includes(RAG_CONFIG.embeddingProvider)) {
    throw new Error('EMBEDDING_PROVIDER must be "ollama" or "chroma-cloud".');
  }

  const embeddings = [];
  const batchSize = Math.max(1, RAG_CONFIG.embeddingBatchSize);
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const batchEmbeddings = RAG_CONFIG.embeddingProvider === 'chroma-cloud'
      ? await requestChromaCloudEmbeddings(batch, signal)
      : await requestOllamaEmbeddings(batch, signal);
    embeddings.push(...batchEmbeddings);
  }
  return embeddings;
}
