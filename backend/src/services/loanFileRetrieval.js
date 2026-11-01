import { RAG_CONFIG } from '../config/rag.js';

// Retrieval from one applicant's own file. The filter is built ONLY here, from the application the
// route already authorised and the signed-in role; it never comes from the question or the model.
// A search without an application ID is refused (RAG plan P5-03, edge case E10).

export function buildFileFilter({ applicationId, role }) {
  if (!applicationId) throw new Error('A loan-file search needs an application ID.');
  const audiences = role === 'borrower' ? ['borrower'] : ['borrower', 'staff'];
  return {
    $and: [
      { applicationId: { $eq: String(applicationId) } },
      { status: { $eq: 'current' } },
      { audience: { $in: audiences } },
    ],
  };
}

// deps lets tests supply a fake search; the default talks to Chroma Cloud.
export async function retrieveFileEvidence({ application, role, embedding, signal, topK = 4, deps }) {
  const where = buildFileFilter({ applicationId: application?._id, role });
  const search = deps?.search || (async () => {
    const chroma = await import('./chromaService.js');
    const collectionId = await chroma.getOrCreateLoanFileCollection(signal);
    return chroma.queryPolicyRecords(collectionId, embedding, topK * 3, where, signal);
  });
  const result = await search({ where, embedding, topK });
  const ids = result.ids?.[0] || [];
  return ids
    .map((id, i) => ({
      id,
      text: result.documents?.[0]?.[i],
      distance: result.distances?.[0]?.[i],
      ...(result.metadatas?.[0]?.[i] || {}),
    }))
    .filter((item) => typeof item.text === 'string' && Number.isFinite(item.distance) && item.distance <= RAG_CONFIG.maxDistance)
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
