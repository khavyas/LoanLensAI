import test from 'node:test';
import assert from 'node:assert/strict';
import { embedTexts, generateChatJson } from '../../src/services/ollamaClient.js';
import { getOrCreatePolicyCollection, upsertPolicyRecords, queryPolicyRecords } from '../../src/services/chromaService.js';
import { answerQuestionWithOllama, selectEvidence } from '../../src/services/ragOllama.js';

// NEW: Service-level integration tests stub the Ollama/Chroma HTTP boundaries and make no network calls.
test('Ollama embedding and chat clients use documented endpoints and parse responses', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    if (String(url).endsWith('/api/embed')) {
      return new Response(JSON.stringify({ embeddings: calls.at(-1).body.input.map((_, i) => [i + 0.1, 0.2, 0.3]) }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: { content: '{"answer":"Grounded","citations":[]}' } }), { status: 200 });
  };
  try {
    const vectors = await embedTexts(['policy one', 'policy two']);
    assert.equal(vectors.length, 2);
    assert.equal(calls[0].body.model, 'embeddinggemma');
    const json = await generateChatJson([{ role: 'user', content: 'Hello' }]);
    assert.match(json, /Grounded/);
    assert.ok(calls.some((call) => call.url.endsWith('/api/chat')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Chroma adapter creates a collection, upserts vectors, and queries with embeddings', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null });
    const payload = String(url).endsWith('/collections')
      ? { id: 'collection-id', metadata: { embedding_model: 'embeddinggemma' } }
      : { ids: [['chunk-1']], documents: [['policy evidence']], metadatas: [[{ sourceTitle: 'FAQ' }]], distances: [[0.2]] };
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  try {
    const id = await getOrCreatePolicyCollection();
    await upsertPolicyRecords(id, [{ id: 'chunk-1', text: 'policy evidence', embedding: [0.1, 0.2], metadata: { category: 'loan-policy' } }]);
    const query = await queryPolicyRecords(id, [0.1, 0.2], 5);
    assert.equal(id, 'collection-id');
    assert.equal(query.ids[0][0], 'chunk-1');
    assert.ok(calls.some((call) => call.url.endsWith('/upsert')));
    assert.deepEqual(calls.find((call) => call.url.endsWith('/query')).body.query_embeddings, [[0.1, 0.2]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retrieval removes duplicate chunks and rejects results beyond the configured distance threshold', () => {
  const evidence = selectEvidence({
    ids: [['near', 'duplicate', 'far']],
    documents: [['Same policy text with enough detail.', 'Same   policy text with enough detail.', 'Unrelated policy text.']],
    metadatas: [[{ sourceTitle: 'FAQ' }, { sourceTitle: 'FAQ' }, { sourceTitle: 'Other' }]],
    distances: [[0.2, 0.3, 1.5]],
  });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].id, 'near');
});

test('general RAG returns an insufficient-evidence answer without calling the chat model', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).endsWith('/api/embed')) return new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }), { status: 200 });
    if (String(url).endsWith('/collections')) return new Response(JSON.stringify({ id: 'collection-id', metadata: { embedding_model: 'embeddinggemma' } }), { status: 200 });
    return new Response(JSON.stringify({ ids: [[]], documents: [[]], metadatas: [[]], distances: [[]] }), { status: 200 });
  };
  try {
    const result = await answerQuestionWithOllama({
      question: 'What are the fees for a personal loan?',
      application: { _id: 'app1', applicantName: 'Synthetic Applicant', productType: 'personal-loan', status: 'submitted', requiredDocTypes: [] },
      role: 'borrower',
      documents: [],
    });
    assert.match(result.answer, /could not find relevant information/i);
    assert.equal(calls.some((url) => url.endsWith('/api/chat')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('status routing returns database state without calling Ollama or Chroma', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ message: { content: '{"answer":"Incorrect model status","citations":[]}' } }), { status: 200 });
  };
  try {
    const result = await answerQuestionWithOllama({
      question: 'What is the status of my loan application?',
      application: { _id: 'app1', applicantName: 'Synthetic Applicant', productType: 'personal-loan', status: 'submitted', requiredDocTypes: [] },
      role: 'borrower',
      documents: [],
    });
    assert.equal(result.answer, 'The status recorded for your application is submitted.');
    assert.deepEqual(result.sources, [{ doc: 'Application status' }]);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
