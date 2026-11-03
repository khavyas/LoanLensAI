import { currentDocuments, missingDocuments } from './verification.js';
import { redactFields } from './redaction.js';

// Officer co-pilot (RAG plan P9-02): "Summarize this file" and "List contradictions", with sources.
//
// The facts are assembled in code from the application, its documents' extracted values, the
// verification checks and the decision assessment, so every figure is exact and nothing is
// invented. RAG supplies the part a rule engine cannot: for each contradiction, the passage of the
// bank's approved policy that governs it, retrieved by search and shown with its source. No
// language model writes any of this text.

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
const docLabel = (type) => DOC_LABEL[type] || titleCase(type);
const money = (n) => `$${Number(n || 0).toLocaleString('en-US')}`;
const words = (key) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const clip = (text, n = 200) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n).trimEnd() + '...' : flat;
};

// Only these values are shown as a document's "key values": enough to recognise it, not everything.
const KEY_FIELDS = ['employerName', 'grossMonthlyIncome', 'netPay', 'licenseExpiry', 'documentDate', 'recentDepositAmount', 'recentDepositSource', 'businessName', 'annualBusinessRevenue', 'ownershipPercent'];

function keyValues(doc) {
  const fields = redactFields(doc.extractedFields);
  return KEY_FIELDS.filter((k) => fields[k] != null && fields[k] !== '[redacted]').map((k) => `${words(k)} ${fields[k]}`);
}

export function collectFindings(documents) {
  const out = [];
  for (const doc of currentDocuments(documents)) {
    for (const c of doc.verification?.checks || []) {
      if (c.status !== 'mismatch' && c.status !== 'warning') continue;
      out.push({
        document: docLabel(doc.docType),
        docType: doc.docType,
        check: c.field,
        severity: c.status,
        expected: c.expected,
        found: c.found,
        explanation: c.explanation,
      });
    }
  }
  // Hard mismatches first, then warnings.
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'mismatch' ? -1 : 1));
}

// policyFor(findingText) -> a policy evidence item { sourceTitle, section, sourceFile, text } or null.
// It is supplied by the route (hybrid or vector search); here it may fail without breaking the brief.
export async function buildCopilotBrief({ action = 'summary', application, documents, assessment, policyFor = async () => null, maxPolicyLookups = 6 }) {
  const findings = collectFindings(documents);
  let lookups = 0;
  for (const f of findings) {
    if (lookups >= maxPolicyLookups) break;
    lookups += 1;
    try {
      const hit = await policyFor(`${f.check}. ${f.explanation}`);
      if (hit) f.policy = { doc: hit.sourceTitle, section: hit.section, source: hit.sourceFile, snippet: clip(hit.text) };
    } catch {
      // The brief is still useful without the policy passage.
    }
  }

  const current = currentDocuments(documents);
  const missing = missingDocuments(application, documents);
  const unmet = (assessment?.parameters || []).filter((p) => p.status !== 'met');
  const lines = [];

  lines.push(`## ${application.applicantName} - ${action === 'contradictions' ? 'contradictions and checks' : 'file summary'}`);
  lines.push(`${titleCase(application.productType)} - ${money(application.requestedAmount)}${application.repaymentTermMonths ? ` over ${application.repaymentTermMonths} months` : ''} - status ${titleCase(application.status)}`);

  if (action === 'summary') {
    const facts = [
      application.statedMonthlyIncome != null ? `stated income ${money(application.statedMonthlyIncome)}/month` : '',
      application.statedAnnualBusinessRevenue != null ? `stated revenue ${money(application.statedAnnualBusinessRevenue)}/year` : '',
      application.employerName ? `employer ${application.employerName}` : '',
      application.businessName ? `business ${application.businessName}` : '',
      application.residencyStatus ? `residency ${titleCase(application.residencyStatus)}` : '',
    ].filter(Boolean);
    if (facts.length) lines.push(`Application states: ${facts.join('; ')}.`);

    const docLines = current.map((d) => {
      const overall = d.verification?.overall || 'pending';
      const marker = overall === 'pass' ? 'x' : '!';
      const values = keyValues(d);
      return `- [${marker}] **${docLabel(d.docType)}** - ${overall}${values.length ? `: ${values.join('; ')}` : ''}`;
    });
    for (const type of missing) docLines.push(`- [ ] **${docLabel(type)}** - not uploaded`);
    lines.push(['**Documents**', ...(docLines.length ? docLines : ['- none uploaded'])].join('\n'));
  }

  if (findings.length) {
    const body = findings.flatMap((f) => {
      const row = `- **${f.document} - ${f.check}** (${f.severity}): expected ${f.expected ?? 'n/a'}; found ${f.found ?? 'n/a'} - ${f.explanation}`;
      return f.policy ? [row, `  Policy: ${f.policy.doc}, ${f.policy.section}: "${f.policy.snippet}"`] : [row];
    });
    lines.push([`**Contradictions and warnings (${findings.length})**`, ...body].join('\n'));
  } else {
    lines.push('> No contradictions found: every check on the current documents matches.');
  }

  if (unmet.length) {
    lines.push(['**Not yet met for approval**', ...unmet.map((p) => `- **${p.label}** - ${p.detail}${p.waivable ? ' (an underwriter can waive this)' : ''}`)].join('\n'));
  }

  let next;
  if (['approved', 'rejected'].includes(application.status)) next = `This application is ${application.status}.`;
  else if (application.status === 'referred') next = 'It is with the underwriter.';
  else if (assessment?.canApprove) next = 'Every parameter is met: a loan officer can approve it.';
  else if (assessment?.canRefer) next = 'It cannot be approved as it stands, but it can be referred to an underwriter for an exception.';
  else next = 'It cannot be approved or referred until the blocking items above are resolved.';
  lines.push(`> Next: ${next}`);

  // Sources: the documents the findings come from, and the policy passages that were retrieved.
  const sources = [];
  const seen = new Set();
  const add = (s) => {
    const key = `${s.kind}|${s.doc}|${s.section}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(s);
    }
  };
  for (const f of findings) add({ kind: 'file', doc: f.document, section: 'Verification checks' });
  for (const f of findings) if (f.policy) add({ kind: 'policy', doc: f.policy.doc, section: f.policy.section, source: f.policy.source, snippet: f.policy.snippet });
  if (!findings.length) add({ kind: 'file', doc: 'Application record', section: 'Verification checks' });

  return { action, text: lines.join('\n\n'), findings, sources, openItems: missing.length + unmet.length };
}
