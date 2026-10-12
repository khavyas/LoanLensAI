import PolicyChunk from '../models/PolicyChunk.js';
import { currentDocuments, missingDocuments, openExceptions } from './verification.js';
import { getGroqClient, GROQ_MODEL, parseJsonResponse } from './groqClient.js';

// Optional Groq-backed version of the loan-file assistant. It is selected
// only when CHAT_PROVIDER=groq; rag.js keeps Anthropic as its default path.
async function policyContext() {
  const chunks = await PolicyChunk.find({}).sort({ sourceDoc: 1, chunkIndex: 1 }).lean();
  return chunks.map((chunk) => `[${chunk.sourceDoc}]\n${chunk.text}`).join('\n\n');
}

function applicationStateSummary(application, documents) {
  const current = currentDocuments(documents);
  return {
    applicant: application.applicantName,
    product: application.productType,
    status: application.status,
    statedMonthlyIncome: application.statedMonthlyIncome,
    requiredDocuments: application.requiredDocTypes,
    receivedDocuments: current.map((document) => ({
      docType: document.docType,
      verificationResult: document.verification?.overall,
      flaggedChecks: (document.verification?.checks || [])
        .filter((check) => check.status !== 'match')
        .map((check) => `${check.field}: ${check.explanation}`),
    })),
    missingDocuments: missingDocuments(application, documents),
    openExceptions: openExceptions(application, documents).map((exception) => exception.message),
  };
}

export async function answerQuestionWithGroq({ question, application, role, documents }) {
  const context = await policyContext();
  const system = `You are LoanLens, a loan assistant for First Community Bank (a fictional demo bank).
You are talking to a ${role === 'officer' ? 'loan officer reviewing this application' : 'borrower asking about their own application'}.

STRICT RULES:
- Answer ONLY from the policy excerpts and application state below. If the answer is not there, say you do not have that information and suggest contacting the bank.
- Never invent policy, rates, or timelines. Never quote interest rates.
- Be concise and friendly.
${role !== 'officer' ? '- Do not reveal internal review details beyond what concerns the borrower directly.' : ''}

Respond with a JSON object containing exactly these keys: "answer" (string) and "sources" (array of exact policy document titles, using "Application state" when application data supports the answer). Do not include markdown.

POLICY EXCERPTS:
${context}

APPLICATION STATE:
${JSON.stringify(applicationStateSummary(application, documents), null, 2)}`;

  const response = await getGroqClient().chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ],
  });

  const raw = response.choices[0]?.message?.content || '';
  try {
    const parsed = parseJsonResponse(raw);
    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : raw,
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.filter((source) => typeof source === 'string').map((doc) => ({ doc }))
        : [],
    };
  } catch {
    return { answer: raw, sources: [] };
  }
}
