import { RAG_CONFIG } from '../config/rag.js';

// NEW: Isolated Chroma v2 HTTP adapter. It stores only approved policy text and metadata.
const basePath = () =>
  `${RAG_CONFIG.chromaBaseUrl}/api/v2/tenants/${encodeURIComponent(RAG_CONFIG.chromaTenant)}` +
  `/databases/${encodeURIComponent(RAG_CONFIG.chromaDatabase)}`;

async function chromaRequest(path, body, method = 'POST', externalSignal) {
  let response;
  try {
    response = await fetch(`${basePath()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(RAG_CONFIG.chromaApiKey ? { 'x-chroma-token': RAG_CONFIG.chromaApiKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: externalSignal
        ? AbortSignal.any([AbortSignal.timeout(RAG_CONFIG.chromaTimeoutMs), externalSignal])
        : AbortSignal.timeout(RAG_CONFIG.chromaTimeoutMs),
    });
  } catch (error) {
    const reason = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timed out' : 'is unavailable';
    throw new Error(`Chroma ${reason}. Check CHROMA_BASE_URL and the Chroma server.`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Chroma request failed (HTTP ${response.status}): ${payload.message || payload.error || 'unknown error'}`);
  }
  return payload;
}

export async function getOrCreatePolicyCollection(signal) {
  const payload = await chromaRequest('/collections', {
    name: RAG_CONFIG.chromaCollection,
    get_or_create: true,
    metadata: {
      purpose: 'approved-loan-policy-knowledge',
      embedding_provider: RAG_CONFIG.embeddingProvider,
      embedding_model: RAG_CONFIG.embeddingModel,
    },
  }, 'POST', signal);
  if (!payload.id) throw new Error('Chroma did not return a collection ID.');
  if (
    (payload.metadata?.embedding_model && payload.metadata.embedding_model !== RAG_CONFIG.embeddingModel) ||
    (payload.metadata?.embedding_provider && payload.metadata.embedding_provider !== RAG_CONFIG.embeddingProvider)
  ) {
    throw new Error('This Chroma collection uses a different embedding setup. Set a new CHROMA_COLLECTION name and ingest the policies again.');
  }
  return payload.id;
}

export async function getCollectionRecords(collectionId, where) {
  return chromaRequest(`/collections/${encodeURIComponent(collectionId)}/get`, {
    where,
    include: ['metadatas'],
  });
}

export async function upsertPolicyRecords(collectionId, records) {
  if (!records.length) return;
  const { ids, embeddings, metadatas, documents } = records.reduce(
    (result, record) => {
      result.ids.push(record.id);
      result.embeddings.push(record.embedding);
      result.metadatas.push(record.metadata);
      result.documents.push(record.text);
      return result;
    },
    { ids: [], embeddings: [], metadatas: [], documents: [] }
  );
  await chromaRequest(`/collections/${encodeURIComponent(collectionId)}/upsert`, { ids, embeddings, metadatas, documents });
}

export async function deletePolicyRecords(collectionId, ids) {
  if (ids.length) await chromaRequest(`/collections/${encodeURIComponent(collectionId)}/delete`, { ids });
}

export async function queryPolicyRecords(collectionId, embedding, nResults = RAG_CONFIG.topK, where = { category: { $eq: 'loan-policy' } }, signal) {
  return chromaRequest(`/collections/${encodeURIComponent(collectionId)}/query`, {
    query_embeddings: [embedding],
    n_results: Math.max(1, nResults),
    where,
    include: ['documents', 'metadatas', 'distances'],
  }, 'POST', signal);
}
