import { RAG_CONFIG } from '../config/rag.js';
import { fileAudiences, mayReadStaffContent } from './authz.js';

// Retrieval from one applicant's own file. The filter is built ONLY here, from the application the
// route already authorised and the signed-in role; it never comes from the question or the model.
// A search without an application ID is refused (RAG plan P5-03, edge case E10). Which audiences a
// role may read is decided in authz.js (P2-05).

export function buildFileFilter({ applicationId, role }) {
  if (!applicationId) throw new Error('A loan-file search needs an application ID.');
  const audiences = fileAudiences(role); // refuses an unknown role
  return {
    $and: [
      { applicationId: { $eq: String(applicationId) } },
      { status: { $eq: 'current' } },
      { audience: { $in: audiences } },
    ],
  };
}

// Questions about what the officers did or wrote ("what note was recorded?") are about the review
// record, a short chunk that a plain nearest-neighbour search can rank below longer document chunks.
// For staff, those questions also fetch the review record directly. Borrowers never get it: the
// audience filter below is applied to this extra search as well.
const REVIEW_INTENT = /\b(notes?|referr\w*|review\s+(?:record|history)|waiv\w*|underwriter|approved|declined|rejected|returned|who\s+(?:reviewed|approved|referred))\b/i;
export const focusedKinds = (question, role) => (mayReadStaffContent(role) && REVIEW_INTENT.test(String(question || '')) ? ['review-record'] : []);

// deps lets tests supply a fake search; the default talks to Chroma Cloud.
export async function retrieveFileEvidence({ application, role, question = '', embedding, signal, topK = 4, deps }) {
  const where = buildFileFilter({ applicationId: application?._id, role });
  const search = deps?.search || (async () => {
    const chroma = await import('./chromaService.js');
    const collectionId = await chroma.getOrCreateLoanFileCollection(signal);
    return chroma.queryPolicyRecords(collectionId, embedding, topK * 3, where, signal);
  });
  const rows = (result) => (result.ids?.[0] || []).map((id, i) => ({
    id,
    text: result.documents?.[0]?.[i],
    distance: result.distances?.[0]?.[i],
    ...(result.metadatas?.[0]?.[i] || {}),
  }));
  const found = rows(await search({ where, embedding, topK }))
    .filter((item) => typeof item.text === 'string' && Number.isFinite(item.distance) && item.distance <= RAG_CONFIG.maxDistance);

  // The extra search keeps the same server-built filter and only narrows it to the review record.
  const kinds = focusedKinds(question, role);
  let focused = [];
  if (kinds.length) {
    const focusedWhere = { $and: [...where.$and, { kind: { $in: kinds } }] };
    const extra = deps?.search
      ? await deps.search({ where: focusedWhere, embedding, topK: 1 })
      : await (async () => {
        const chroma = await import('./chromaService.js');
        const collectionId = await chroma.getOrCreateLoanFileCollection(signal);
        return chroma.queryPolicyRecords(collectionId, embedding, 1, focusedWhere, signal);
      })();
    focused = rows(extra).filter((item) => typeof item.text === 'string');
  }
  const seen = new Set();
  return [...focused, ...found]
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .slice(0, topK)
    .map((item) => ({
      id: item.id,
      kind: 'file',
      text: item.text,
      sourceTitle: item.sourceTitle || 'Application record',
      sourceFile: item.sourceFile || 'application record',
      section: item.section || 'Application',
      docType: item.docType || '',
      distance: item.distance,
    }));
}
