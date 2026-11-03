import { currentDocuments, missingDocuments, openExceptions } from './verification.js';

// "What did the officer say about my application?" A borrower asking this wants to know whether a
// person has looked at the file and what they said, not the application status or a policy passage.
// The answer comes from the application record: the decision, the review steps a borrower may see,
// and what is still missing (a loan officer does not open a file until every required document is in).
// Internal notes, referral notes and credit scores never appear here.

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
const label = (type) => DOC_LABEL[type] || String(type || '').replace(/-/g, ' ');

const OFFICER = /\b(officer|underwriter|reviewer|loan\s+team|bank\s+staff)\b/i;
const FEEDBACK = /\b(say|said|says|comment\w*|feedback|remark\w*|notes?|decid\w*|decision|reviewed|looked|opened|seen|respond\w*|repl(?:y|ied)|told|think|thought)\b/i;
const MINE = /\b(my|me|our|us)\b/i;

export const isOfficerFeedbackQuestion = (question) => {
  const q = String(question || '');
  return OFFICER.test(q) && FEEDBACK.test(q) && MINE.test(q);
};

export function officerFeedbackAnswer(question, application, documents = [], role = 'borrower') {
  if (role !== 'borrower' || !isOfficerFeedbackQuestion(question)) return null;
  const status = application.status;
  const history = application.reviewHistory || [];
  const sources = [{ doc: 'Application state' }];

  if (status === 'approved') {
    const conditions = application.decision?.conditions || [];
    return { answer: `Your loan officer has made a decision: your loan was approved.${conditions.length ? ` Conditions: ${conditions.join('; ')}.` : ''} They will contact you about the next steps.`, sources };
  }
  if (status === 'rejected') {
    const reason = application.decision?.reason;
    return { answer: `Your loan officer has made a decision: we are unable to approve your application at this time.${reason ? ` Reason: ${reason}` : ''} If you have questions, please contact your loan officer.`, sources };
  }
  if (status === 'referred' || history.some((e) => e.action === 'refer')) {
    return { answer: 'Your loan officer has reviewed your file and sent it to a senior underwriter. There are no written comments for you, and nothing is needed from you right now.', sources };
  }
  if (history.some((e) => e.action === 'return')) {
    return { answer: 'Your loan officer has reviewed your file and is continuing the review. There are no written comments for you.', sources };
  }

  const missing = missingDocuments(application, documents);
  if (missing.length) {
    const names = missing.map(label).join(', ');
    return {
      answer: `No loan officer has commented on your application yet. A loan officer only opens a file once every required document is uploaded, and you have not uploaded your ${names.toLowerCase()} yet. Please upload it from the Documents tab, and the review can start.`,
      sources,
    };
  }
  const open = openExceptions(application, documents).filter((e) => e.type !== 'missing');
  if (open.length) {
    const names = [...new Set(open.map((e) => label(e.docType)))].join(', ');
    return {
      answer: `No loan officer has commented on your application yet. The review starts once the items that need fixing are resolved: ${names}. Please see the Action Needed tab.`,
      sources,
    };
  }
  const count = currentDocuments(documents).length;
  return {
    answer: `No loan officer has commented on your application yet. Your file is complete (${count} document${count === 1 ? '' : 's'} received and checked) and is waiting for a loan officer to review it.`,
    sources,
  };
}
