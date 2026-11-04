// Gathers the retrieved part of the courtroom's evidence pool: the applicant's own file chunks and the
// approved policy passages that bear on what was flagged. The filter for the file search is built by the
// same server-side code as in chat (loanFileRetrieval.js, roles from authz.js), never from the model.
// Either search may fail or be unavailable; the review then runs on the database facts alone.

const clip = (text, n) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n).trimEnd() : flat;
};

export async function gatherEvidence({ application, findings = [], enabled, embed, searchPolicy, searchFile, signal, log = console }) {
  if (!enabled) return { fileEvidence: [], policyEvidence: [] };
  const query = clip(['Review of a loan file.', ...findings.map((f) => `${f.check}. ${f.explanation || ''}`)].join(' '), 800);
  try {
    const [embedding] = await embed([query], signal);
    const [policy, file] = await Promise.allSettled([
      searchPolicy({ question: query, embedding, signal }),
      // Role 'officer': this review is staff-only, so staff content in the file is in scope.
      searchFile({ application, role: 'officer', question: 'review record notes and checks', embedding, signal, topK: 6 }),
    ]);
    if (policy.status === 'rejected') log.warn?.('[courtroom] policy search failed:', policy.reason?.message);
    if (file.status === 'rejected') log.warn?.('[courtroom] file search failed:', file.reason?.message);
    return {
      policyEvidence: policy.status === 'fulfilled' ? policy.value.slice(0, 5) : [],
      fileEvidence: file.status === 'fulfilled' ? file.value.slice(0, 6) : [],
    };
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
    log.warn?.('[courtroom] evidence search failed:', error.message);
    return { fileEvidence: [], policyEvidence: [] };
  }
}
