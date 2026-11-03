import crypto from 'node:crypto';
import { currentDocuments } from './verification.js';
import { redactText, redactFields, isSensitiveLabel } from './redaction.js';
import { borrowerExplanation } from './borrowerWording.js';

// Turns ONE application into the text chunks the assistant may search (RAG plan P3-04, P3-07,
// P5-03). Pure: no database, no network. Everything goes through redaction first, so identifiers
// never reach the embedding service or the vector store.
//
// Each chunk carries its audience. 'borrower' chunks may be shown to the applicant (the same
// facts their own screens show); 'staff' chunks (review notes, referrals, decisions) are only
// retrieved for officers and underwriters. Only CURRENT documents are indexed, so a replaced
// or deleted document disappears from search on the next re-index.

const DOC_LABEL = {
  'pay-stub': 'Pay stub',
  w2: 'W-2',
  'bank-statement': 'Bank statement',
  'drivers-license': "Driver's license",
  'business-tax-return': 'Business tax return',
  'personal-financial-statement': 'Personal financial statement',
  'business-license': 'Business license',
  'ownership-disclosure': 'Ownership disclosure',
};
const titleCase = (s) => String(s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const docLabel = (type) => DOC_LABEL[type] || titleCase(type) || 'Document';
const words = (key) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const money = (n) => `$${Number(n || 0).toLocaleString('en-US')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : '');

const TEXT_CHARS = 1200; // one chunk of document text, about 300 tokens
export const MAX_TEXT_PAGES = 400;

function makeChunk(appId, { kind, audience, doc, docId = '', section, page = 0, n = 0, text }) {
  const id = 'lf_' + crypto.createHash('sha1').update(`${appId}|${docId}|${kind}|${n}`).digest('hex').slice(0, 24);
  return {
    id,
    text,
    metadata: {
      applicationId: appId,
      documentId: String(docId),
      docType: doc?.docType || '',
      kind,
      audience,
      status: 'current',
      page,
      sourceTitle: doc ? docLabel(doc.docType) : 'Application record',
      section,
      sourceFile: doc?.fileName || 'application record',
    },
  };
}

// Groups page texts into chunks of about TEXT_CHARS, remembering which pages each covers.
function textChunks(pageTexts = []) {
  const out = [];
  let buffer = '';
  let first = 0;
  let last = 0;
  const flush = () => {
    if (buffer.trim().length > 40) out.push({ text: buffer.trim(), first, last });
    buffer = '';
  };
  pageTexts.slice(0, MAX_TEXT_PAGES).forEach((raw, i) => {
    const page = i + 1;
    let rest = redactText(raw).replace(/[ \t]+/g, ' ').trim();
    while (rest.length) {
      if (!buffer) first = page;
      const room = TEXT_CHARS - buffer.length;
      let take = rest.slice(0, room);
      if (rest.length > room) {
        const cut = take.lastIndexOf('\n') > room / 2 ? take.lastIndexOf('\n') : take.lastIndexOf(' ');
        if (cut > 0) take = take.slice(0, cut);
      }
      buffer += (buffer ? '\n' : '') + take;
      last = page;
      rest = rest.slice(take.length).trim();
      if (buffer.length >= TEXT_CHARS - 20) flush();
    }
  });
  flush();
  return out;
}

// borrower: true words the finding for the applicant; false keeps the officer's wording.
function checkLine(c, borrower = true) {
  const hide = isSensitiveLabel(c.field);
  const expected = hide ? '[redacted]' : redactText(c.expected ?? '');
  const found = hide ? '[redacted]' : redactText(c.found ?? '');
  const detail = hide ? '' : ` ${redactText(borrower ? borrowerExplanation(c) : c.explanation || '')}`;
  return `${c.field}: ${c.status}. Expected ${expected}; found ${found}.${detail}`.trim();
}

function describeChange(c) {
  const show = (v) => (v == null || v === '' ? 'blank' : c.kind === 'money' ? money(v) : c.kind === 'months' ? `${v} months` : redactText(v));
  return `${redactText(c.label)} changed from ${show(c.from)} to ${show(c.to)}`;
}

function historyLines(application, documents) {
  const borrower = [];
  const staff = [];
  for (const e of application.reviewHistory || []) {
    const when = day(e.at);
    const who = e.actor?.name ? ` by ${redactText(e.actor.name)}` : '';
    const note = e.note ? ` Note: ${redactText(e.note)}` : '';
    switch (e.action) {
      case 'submitted':
        borrower.push(`${when}: application submitted.`);
        break;
      case 'application-edited':
        borrower.push(`${when}: application details corrected${who}. ${(e.details?.changes || []).map(describeChange).join('; ')}.`);
        break;
      case 'refer':
        borrower.push(`${when}: sent for senior review.`);
        staff.push(`${when}: referred to the underwriter${who}.${note}`);
        break;
      case 'return':
        staff.push(`${when}: returned to the loan officer${who}.${note}`);
        break;
      case 'approve':
        staff.push(`${when}: approved${who}.${note}${e.details?.waivedParameters?.length ? ` Waived: ${e.details.waivedParameters.map(titleCase).join(', ')}.` : ''}`);
        break;
      case 'reject':
        staff.push(`${when}: declined${who}.${note}`);
        break;
      case 'credit-score-entered':
        staff.push(`${when}: credit score recorded${who}.`); // the score itself stays in the database
        break;
      case 'verification-run':
        staff.push(`${when}: identity and credit checks run${who}.`);
        break;
      default:
        break;
    }
  }
  for (const d of documents) {
    if ((d.status || 'current') === 'superseded') {
      borrower.push(`${day(d.createdAt)}: ${docLabel(d.docType)} uploaded and later replaced by a newer upload.`);
    }
  }
  return { borrower, staff };
}

export function buildApplicationChunks({ application, documents = [] }) {
  const appId = String(application._id);
  const chunks = [];

  const facts = [
    `${application.applicantName}'s ${titleCase(application.productType)} application, status ${titleCase(application.status)}.`,
    `Requested amount ${money(application.requestedAmount)}${application.repaymentTermMonths ? ` over ${application.repaymentTermMonths} months` : ''}.`,
    application.statedMonthlyIncome != null ? `Stated gross monthly income ${money(application.statedMonthlyIncome)}.` : '',
    application.statedAnnualBusinessRevenue != null ? `Stated annual business revenue ${money(application.statedAnnualBusinessRevenue)}.` : '',
    application.employerName ? `Employer: ${redactText(application.employerName)}.` : '',
    application.businessName ? `Business name: ${redactText(application.businessName)}.` : '',
    application.loanReason ? `Reason for the loan: ${redactText(application.loanReason)}.` : '',
    application.residencyStatus ? `Residency status: ${titleCase(application.residencyStatus)}.` : '',
    `Required documents: ${(application.requiredDocTypes || []).map(docLabel).join(', ') || 'none'}.`,
  ].filter(Boolean).join(' ');
  chunks.push(makeChunk(appId, { kind: 'application', audience: 'borrower', section: 'Application details', text: facts }));

  for (const doc of currentDocuments(documents)) {
    const docId = String(doc._id);
    const label = docLabel(doc.docType);
    const header = `${label} (file ${doc.fileName || 'unnamed'}, uploaded ${day(doc.createdAt)}${doc.pageInfo?.total ? `, ${doc.pageInfo.total} pages` : ''}).`;

    const fields = redactFields(doc.extractedFields);
    const fieldText = Object.entries(fields).map(([k, v]) => `${words(k)}: ${v}`).join('; ');
    if (fieldText) chunks.push(makeChunk(appId, { kind: 'document-fields', audience: 'borrower', doc, docId, section: 'Extracted fields', text: `${header} Values read from this document: ${fieldText}.` }));

    const checks = doc.verification?.checks || [];
    if (checks.length) {
      chunks.push(makeChunk(appId, {
        kind: 'verification', audience: 'borrower', doc, docId, section: 'Verification checks',
        text: `${header} Verification result: ${doc.verification.overall}. ${checks.map((c) => checkLine(c, true)).join(' ')}`,
      }));
      // The officer's own wording for anything flagged, only ever retrieved for staff.
      const flagged = checks.filter((c) => c.status !== 'match');
      if (flagged.length) {
        chunks.push(makeChunk(appId, {
          kind: 'verification-staff', audience: 'staff', doc, docId, section: 'Verification findings (officer wording)',
          text: `${header} Flagged findings for the loan officer: ${flagged.map((c) => checkLine(c, false)).join(' ')}`,
        }));
      }
    }

    const summary = doc.statementSummary;
    if (summary && typeof summary === 'object') {
      const lines = Object.entries(summary)
        .filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v))
        .map(([k, v]) => `${words(k)}: ${redactText(v)}`);
      if (lines.length) chunks.push(makeChunk(appId, { kind: 'statement-summary', audience: 'borrower', doc, docId, section: 'Statement totals', text: `${header} Totals computed from every page: ${lines.join('; ')}.` }));
    }

    textChunks(doc.pageTexts).forEach((t, n) => {
      chunks.push(makeChunk(appId, {
        kind: 'document-text', audience: 'borrower', doc, docId, n, page: t.first,
        section: t.first === t.last ? `Page ${t.first}` : `Pages ${t.first}-${t.last}`,
        text: `${label}, ${t.first === t.last ? `page ${t.first}` : `pages ${t.first}-${t.last}`}:\n${t.text}`,
      }));
    });
  }

  const history = historyLines(application, documents);
  if (history.borrower.length) chunks.push(makeChunk(appId, { kind: 'activity', audience: 'borrower', section: 'Activity', text: `Activity on this application: ${history.borrower.join(' ')}` }));
  if (history.staff.length) chunks.push(makeChunk(appId, { kind: 'review-record', audience: 'staff', section: 'Review record', text: `Internal review record: ${history.staff.join(' ')}` }));

  return chunks;
}
