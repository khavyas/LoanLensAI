import { APPLICATIONS, DOCUMENT_FILES } from '../seedData.js';
import { mockClassifyAndExtract } from '../mockFixtures.js';
import { verifyDocument, withCrossDocumentChecks } from '../verification.js';

// The clean starting points for forgeries: the seeded applicants whose own documents raise no flag at
// all. Built from the same fixtures and the same checks a real upload goes through, and held in memory
// only. Nothing here reads or writes the database.

export function loadPersona(name) {
  const application = APPLICATIONS.find((a) => a.applicantName === name);
  const files = DOCUMENT_FILES[name];
  if (!application || !files) return null;
  const docs = files.map((fileName) => {
    const e = mockClassifyAndExtract(fileName);
    return { docType: e.docType, fileName, fields: e.fields, confidence: e.confidence };
  });
  return { name, application: { ...application, _id: `arena-${name}`, createdAt: new Date('2026-10-01') }, docs };
}

// Everything the checks say about a set of documents: per-document checks, the cross-document checks
// (pay stub against bank deposit), and the duplicate-identity lookup.
export function flagsFor({ application, docs, others = [] }, findDuplicateMatches) {
  const documents = docs.map((d, i) => ({
    _id: `arena-d${i}`,
    docType: d.docType,
    fileName: d.fileName,
    status: 'current',
    confidence: d.confidence,
    extractedFields: d.fields,
    verification: verifyDocument(application, { docType: d.docType, fields: d.fields, confidence: d.confidence }, d.options || {}),
  }));
  const checked = withCrossDocumentChecks(application, documents);
  const fired = checked.flatMap((d) => d.verification.checks
    .filter((c) => c.status !== 'match')
    .map((c) => ({ doc: d.docType, field: c.field, status: c.status })));
  const duplicates = findDuplicateMatches(application, others);
  return { fired, duplicates };
}

let cache = null;
export function cleanBases(findDuplicateMatches) {
  if (cache) return cache;
  cache = Object.keys(DOCUMENT_FILES)
    .map(loadPersona)
    .filter(Boolean)
    .filter((base) => {
      const { fired, duplicates } = flagsFor(base, findDuplicateMatches);
      return fired.length === 0 && duplicates.length === 0;
    });
  return cache;
}
