import 'dotenv/config';
import { ingestApprovedPolicies } from '../services/policyIngestion.js';

// NEW: Standalone command for indexing only the repository's approved policy Markdown files.
try {
  const result = await ingestApprovedPolicies();
  console.log(`[rag-ingest] complete: ${result.files} files, ${result.chunks} chunks in ${result.collection}`);
  process.exit(0);
} catch (error) {
  console.error('[rag-ingest] failed:', error.message);
  process.exit(1);
}
