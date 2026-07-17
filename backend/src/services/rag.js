import PolicyChunk from '../models/PolicyChunk.js';
import Document from '../models/Document.js';
import { anthropic, MODEL, parseJsonResponse } from './anthropicClient.js';
import { missingDocuments } from './verification.js';

// POC retrieval: the whole policy corpus (~30 small chunks) fits in Claude's
// context, so we ground on ALL of it and require citations. The scale-up path
// (thousands of chunks) swaps this for embeddings + vector search without
// touching the rest of the pipeline.
async function policyContext() {
  const chunks = await PolicyChunk.find({}).sort({ sourceDoc: 1, chunkIndex: 1 }).lean();
  return chunks.map((c) => `[${c.sourceDoc}]\n${c.text}`).join('\n\n');
}

function applicationStateSummary(application, documents) {
  const missing = missingDocuments(application, documents);
  return {
    applicant: application.applicantName,
    product: application.productType,
    status: application.status,
    statedMonthlyIncome: application.statedMonthlyIncome,
    requiredDocuments: application.requiredDocTypes,
    receivedDocuments: documents.map((d) => ({
      docType: d.docType,
      verificationResult: d.verification?.overall,
      flaggedChecks: (d.verification?.checks || [])
        .filter((c) => c.status !== 'match')
        .map((c) => `${c.field}: ${c.explanation}`),
    })),
    missingDocuments: missing,
  };
}

export async function answerQuestion({ question, application, role }) {
  const documents = await Document.find({ applicationId: application._id }).lean();
  const context = await policyContext();

  const system = `You are LoanLens, a loan assistant for First Community Bank (a fictional demo bank).
You are talking to a ${role === 'officer' ? 'loan officer reviewing this application' : 'borrower asking about their own application'}.

STRICT RULES:
- Answer ONLY from the policy excerpts and the application state below. If the answer is not there, say you don't have that information and suggest contacting the bank.
- Never invent policy, rates, or timelines. Never quote interest rates.
- Be concise and friendly.
${role !== 'officer' ? '- Do not reveal internal review details beyond what concerns the borrower directly.' : ''}

Respond with STRICT JSON only (no markdown fences):
{"answer": "your answer text", "sources": ["exact title of each policy document you used", ...]}
Use "Application state" as a source name when you used the application data.

POLICY EXCERPTS:
${context}

APPLICATION STATE:
${JSON.stringify(applicationStateSummary(application, documents), null, 2)}`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: question }],
  });

  const raw = res.content[0].text;
  try {
    const parsed = parseJsonResponse(raw);
    return {
      answer: parsed.answer,
      sources: (parsed.sources || []).map((doc) => ({ doc })),
    };
  } catch {
    // Model didn't return valid JSON — degrade gracefully rather than erroring.
    return { answer: raw, sources: [] };
  }
}
