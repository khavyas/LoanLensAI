import { RAG_CONFIG } from '../config/rag.js';
import { buildApplicationChunks } from './loanFileChunker.js';

// Keeps the loan-file search index in step with the database. After anything that changes what
// the assistant may say about an application (an upload, a replacement, a delete, an edit, a
// verification run, a decision) the whole application is re-indexed: new chunks are upserted by
// stable ID and any chunk that no longer exists (a replaced or deleted document) is removed in
// the same pass, so an old figure can never be retrieved (RAG plan P3-08).

export const loanFileRagEnabled = () =>
  (process.env.CHAT_PROVIDER || 'anthropic').toLowerCase() === 'ollama' && process.env.LOANFILE_RAG !== 'off';

// deps: { load(appId) -> { application, documents } | null, embed(texts), store: { ids(appId), upsert(records), remove(ids) } }
export function createLoanFileIndexer({ load, embed, store, batchSize = RAG_CONFIG.embeddingBatchSize, log = console }) {
  const running = new Set();
  const rerun = new Set();

  async function index(appId) {
    const id = String(appId);
    const loaded = await load(id);
    const oldIds = await store.ids(id);
    const chunks = loaded ? buildApplicationChunks(loaded) : [];
    const records = [];
    for (let start = 0; start < chunks.length; start += Math.max(1, batchSize)) {
      const batch = chunks.slice(start, start + Math.max(1, batchSize));
      const embeddings = await embed(batch.map((c) => c.text));
      batch.forEach((c, i) => records.push({ id: c.id, text: c.text, metadata: c.metadata, embedding: embeddings[i] }));
    }
    await store.upsert(records);
    const keep = new Set(records.map((r) => r.id));
    const stale = oldIds.filter((x) => !keep.has(x));
    await store.remove(stale);
    return { applicationId: id, chunks: records.length, removed: stale.length };
  }

  // Fire-and-forget for request handlers: never throws, and a burst of changes to the same
  // application collapses into one extra run instead of racing.
  async function schedule(appId) {
    const id = String(appId);
    if (running.has(id)) {
      rerun.add(id);
      return null;
    }
    running.add(id);
    try {
      return await index(id);
    } catch (error) {
      log.error('[loanFileIndexer] indexing failed:', error.message);
      return null;
    } finally {
      running.delete(id);
      if (rerun.delete(id)) schedule(id);
    }
  }

  return { index, schedule };
}

// The real wiring: MongoDB for the source records, the configured embedder and Chroma Cloud.
let defaultIndexer;
async function getDefault() {
  if (defaultIndexer) return defaultIndexer;
  const [{ default: Application }, { default: Document }, { embedTexts }, chroma] = await Promise.all([
    import('../models/Application.js'),
    import('../models/Document.js'),
    import('./embeddingClient.js'),
    import('./chromaService.js'),
  ]);
  let collectionId;
  const collection = async () => (collectionId ||= await chroma.getOrCreateLoanFileCollection());
  defaultIndexer = createLoanFileIndexer({
    load: async (appId) => {
      const application = await Application.findById(appId).lean();
      if (!application) return null;
      const documents = await Document.find({ applicationId: appId }).select('-fileData -storageKey +pageTexts').lean();
      return { application, documents };
    },
    embed: (texts) => embedTexts(texts),
    store: {
      ids: async (appId) => (await chroma.getCollectionRecords(await collection(), { applicationId: { $eq: appId } })).ids || [],
      upsert: async (records) => chroma.upsertPolicyRecords(await collection(), records),
      remove: async (ids) => chroma.deletePolicyRecords(await collection(), ids),
    },
  });
  return defaultIndexer;
}

// Call these from routes. No-ops unless loan-file search is enabled, and never block or fail a request.
export function scheduleIndexApplication(appId) {
  if (!loanFileRagEnabled() || !appId) return;
  getDefault().then((i) => i.schedule(appId)).catch((e) => console.error('[loanFileIndexer]', e.message));
}

export async function indexAllApplications() {
  const [{ default: Application }, indexer] = await Promise.all([import('../models/Application.js'), getDefault()]);
  const ids = (await Application.find({}).select('_id').lean()).map((a) => String(a._id));
  let chunks = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      chunks += (await indexer.index(id)).chunks;
    } catch (error) {
      failed += 1;
      console.error('[loanFileIndexer] could not index', id, error.message);
    }
  }
  return { applications: ids.length, chunks, failed };
}

// After a full reset the old application IDs are gone: start the collection fresh.
export async function resetLoanFileIndex() {
  const chroma = await import('./chromaService.js');
  await chroma.deleteLoanFileCollection().catch(() => {});
  defaultIndexer = undefined;
}
