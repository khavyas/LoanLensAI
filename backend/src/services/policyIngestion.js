import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAG_CONFIG } from '../config/rag.js';
import { embedTexts } from './embeddingClient.js';
import { deletePolicyRecords, getCollectionRecords, getOrCreatePolicyCollection, upsertPolicyRecords } from './chromaService.js';
import { chunkPolicyMarkdown } from './policyChunker.js';

// NEW: Idempotently indexes the repository's approved Markdown policy corpus into Chroma.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(__dirname, '../../../data/policies');

export async function ingestPolicyText({ text, fileName, modifiedAt = new Date().toISOString() }) {
  const normalizedText = String(text || '').replace(/\u0000/g, '').trim();
  if (normalizedText.length < 80) throw new Error('The document has too little readable text to index.');
  const chunks = chunkPolicyMarkdown(normalizedText, fileName, modifiedAt);
  if (!chunks.length) throw new Error('No usable policy sections were found in this document.');

  const collectionId = await getOrCreatePolicyCollection();
  const oldRecords = await getCollectionRecords(collectionId, { documentId: { $eq: chunks[0].metadata.documentId } });
  const records = [];
  const batchSize = Math.max(1, RAG_CONFIG.embeddingBatchSize);
  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const embeddings = await embedTexts(batch.map((chunk) => chunk.text));
    const embeddedBatch = batch.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));
    await upsertPolicyRecords(collectionId, embeddedBatch);
    records.push(...embeddedBatch);
  }
  const currentIds = new Set(records.map((record) => record.id));
  const staleIds = (oldRecords.ids || []).filter((id) => !currentIds.has(id));
  await deletePolicyRecords(collectionId, staleIds);
  return {
    documentId: chunks[0].metadata.documentId,
    sourceFile: fileName,
    sourceTitle: chunks[0].metadata.sourceTitle,
    chunks: records.length,
    modifiedAt,
  };
}

export async function ingestApprovedPolicies() {
  const collectionId = await getOrCreatePolicyCollection();
  const files = (await fs.readdir(POLICY_DIR)).filter((name) => name.endsWith('.md')).sort();
  let indexedFiles = 0;
  let indexedChunks = 0;

  for (const fileName of files) {
    const fullPath = path.join(POLICY_DIR, fileName);
    const [markdown, stat] = await Promise.all([fs.readFile(fullPath, 'utf8'), fs.stat(fullPath)]);
    const chunks = chunkPolicyMarkdown(markdown, fileName, stat.mtime.toISOString());
    if (!chunks.length) continue;

    const oldRecords = await getCollectionRecords(collectionId, { documentId: { $eq: chunks[0].metadata.documentId } });
    const oldIds = oldRecords.ids || [];
    const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
    const records = chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));
    await upsertPolicyRecords(collectionId, records);
    const currentIds = new Set(records.map((record) => record.id));
    const staleIds = oldIds.filter((id) => !currentIds.has(id));
    await deletePolicyRecords(collectionId, staleIds);
    indexedFiles += 1;
    indexedChunks += records.length;
    console.log(`[rag-ingest] ${fileName}: ${records.length} chunks indexed${staleIds.length ? `, ${staleIds.length} stale chunks removed` : ''}`);
  }

  return {
    ok: true,
    collection: RAG_CONFIG.chromaCollection,
    embeddingProvider: RAG_CONFIG.embeddingProvider,
    embeddingModel: RAG_CONFIG.embeddingModel,
    files: indexedFiles,
    chunks: indexedChunks,
  };
}
