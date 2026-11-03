// Removes the throwaway policy collection the CI retrieval gate created. Refuses to touch a
// collection whose name does not start with "ci-", so it can never drop the real one.
import 'dotenv/config';
import { RAG_CONFIG } from '../config/rag.js';
import { deletePolicyCollection } from '../services/chromaService.js';

if (!RAG_CONFIG.chromaCollection.startsWith('ci-')) {
  console.error(`Refusing to delete "${RAG_CONFIG.chromaCollection}": CI collections must start with "ci-".`);
  process.exit(1);
}
try {
  await deletePolicyCollection();
  console.log(`[ci] deleted ${RAG_CONFIG.chromaCollection}`);
} catch (error) {
  console.error('[ci] cleanup failed:', error.message);
}
