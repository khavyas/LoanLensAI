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

// Every record matching a filter, with its text, in pages (for the keyword side of hybrid search).
export async function getCollectionDocuments(collectionId, where, pageSize = 200) {
  const out = { ids: [], documents: [], metadatas: [] };
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const page = await chromaRequest(`/collections/${encodeURIComponent(collectionId)}/get`, {
      where,
      include: ['documents', 'metadatas'],
      limit: pageSize,
      offset,
    });
    const ids = page.ids || [];
    out.ids.push(...ids);
    out.documents.push(...(page.documents || []));
    out.metadatas.push(...(page.metadatas || []));
    if (ids.length < pageSize) break;
  }
  return out;
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

// Applicants' own document/record chunks live in their own collection.
export async function getOrCreateLoanFileCollection(signal) {
  const payload = await chromaRequest('/collections', {
    name: RAG_CONFIG.chromaLoanFileCollection,
    get_or_create: true,
    metadata: {
      purpose: 'applicant-file-knowledge',
      embedding_provider: RAG_CONFIG.embeddingProvider,
      embedding_model: RAG_CONFIG.embeddingModel,
    },
  }, 'POST', signal);
  if (!payload.id) throw new Error('Chroma did not return a collection ID.');
  if (
    (payload.metadata?.embedding_model && payload.metadata.embedding_model !== RAG_CONFIG.embeddingModel) ||
    (payload.metadata?.embedding_provider && payload.metadata.embedding_provider !== RAG_CONFIG.embeddingProvider)
  ) {
    throw new Error('The loan-file collection uses a different embedding setup. Set a new CHROMA_LOANFILE_COLLECTION name and re-index.');
  }
  return payload.id;
}

// Drops the whole loan-file collection (a full reset re-seeds applications with new IDs).
export async function deleteLoanFileCollection() {
  await chromaRequest(`/collections/${encodeURIComponent(RAG_CONFIG.chromaLoanFileCollection)}`, undefined, 'DELETE');
}

// Drops the policy collection. Only the CI gate uses it, to remove its throwaway collection.
export async function deletePolicyCollection() {
  await chromaRequest(`/collections/${encodeURIComponent(RAG_CONFIG.chromaCollection)}`, undefined, 'DELETE');
}
