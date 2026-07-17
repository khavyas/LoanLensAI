import PolicyChunk from '../models/PolicyChunk.js';
import Document from '../models/Document.js';
import { openai, CHAT_MODEL, embed } from './openaiClient.js';
import { missingDocuments } from './verification.js';

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function retrieve(question, k = 4) {
  const [qVec] = await embed(question);
  const chunks = await PolicyChunk.find({}).lean();
  return chunks
    .map((c) => ({ ...c, score: cosine(qVec, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
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
  const chunks = await retrieve(question);

  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.sourceDoc}]\n${c.text}`)
    .join('\n\n');

  const system = `You are LoanLens, a loan assistant for First Community Bank (a fictional demo bank).
You are talking to a ${role === 'officer' ? 'loan officer reviewing this application' : 'borrower asking about their own application'}.

STRICT RULES:
- Answer ONLY from the policy excerpts and the application state below. If the answer is not there, say you don't have that information and suggest contacting the bank.
- Cite every factual claim with its source in brackets, e.g. [Auto Loan Requirements] or [Application state].
- Be concise and friendly. Never invent policy, rates, or timelines.
${role !== 'officer' ? '- Do not reveal internal review details beyond what concerns the borrower directly.' : ''}

POLICY EXCERPTS:
${context}

APPLICATION STATE:
${JSON.stringify(applicationStateSummary(application, documents), null, 2)}`;

  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ],
  });

  return {
    answer: res.choices[0].message.content,
    sources: chunks.map((c) => ({ doc: c.sourceDoc, score: Number(c.score.toFixed(3)) })),
  };
}
