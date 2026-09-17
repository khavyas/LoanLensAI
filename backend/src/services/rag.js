import PolicyChunk from '../models/PolicyChunk.js';
import Document from '../models/Document.js';
import { anthropic, MODEL, parseJsonResponse } from './anthropicClient.js';
import { currentDocuments, missingDocuments, openExceptions } from './verification.js';

// Same bypass as extraction.js — set MOCK_AI=true to exercise the Assistant
// tab without spending Anthropic API credits. The mock answer is a
// deterministic summary of application state, not a real language-model
// response — it doesn't attempt to actually answer the free-text question,
// only to prove the request/response wiring and UI work end to end.
const MOCK_AI = process.env.MOCK_AI === 'true';

function mockAnswer(application, documents) {
  const state = applicationStateSummary(application, documents);
  const lines = [`[MOCK MODE — ANTHROPIC_API_KEY not active, this is not a real AI answer]`];
  if (state.openExceptions.length) {
    lines.push(`Open items: ${state.openExceptions.join(' ')}`);
  } else {
    lines.push('No open items on this application right now.');
  }
  return { answer: lines.join('\n\n'), sources: [{ doc: 'Mock mode — no real retrieval performed' }] };
}

// POC retrieval: the whole policy corpus (~30 small chunks) fits in Claude's
// context, so we ground on ALL of it and require citations. The scale-up path
// (thousands of chunks) swaps this for embeddings + vector search without
// touching the rest of the pipeline.
async function policyContext() {
  const chunks = await PolicyChunk.find({}).sort({ sourceDoc: 1, chunkIndex: 1 }).lean();
  return chunks.map((c) => `[${c.sourceDoc}]\n${c.text}`).join('\n\n');
}

function applicationStateSummary(application, documents) {
  // Only 'current' documents reflect the application's actual state — a
  // superseded one was already fixed by a later upload, and its old flags
  // must not leak back into an answer as if they were still open.
  const current = currentDocuments(documents);
  return {
    applicant: application.applicantName,
    product: application.productType,
    status: application.status,
    statedMonthlyIncome: application.statedMonthlyIncome,
    requiredDocuments: application.requiredDocTypes,
    receivedDocuments: current.map((d) => ({
      docType: d.docType,
      verificationResult: d.verification?.overall,
      flaggedChecks: (d.verification?.checks || [])
        .filter((c) => c.status !== 'match')
        .map((c) => `${c.field}: ${c.explanation}`),
    })),
    missingDocuments: missingDocuments(application, documents),
    // The same list the UI's "Action needed" card renders — one source of
    // truth, so the assistant's answer never drifts from what's on screen.
    openExceptions: openExceptions(application, documents).map((e) => e.message),
  };
}

export async function answerQuestion({ question, application, role }) {
  const documents = await Document.find({ applicationId: application._id }).lean();
  if (MOCK_AI) return mockAnswer(application, documents);

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
