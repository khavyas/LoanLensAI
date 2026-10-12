import Document from '../models/Document.js';
import { RAG_CONFIG } from '../config/rag.js';
import { missingDocuments, withCrossDocumentChecks } from './verification.js';
import { embedTexts, generateChatJson } from './ollamaClient.js';
import { getOrCreatePolicyCollection, queryPolicyRecords } from './chromaService.js';
import { classifyLoanQuestion } from './loanQuestionRouter.js';
import { buildRagMessages, parseGroundedAnswer } from './ragPromptBuilder.js';

// Ollama + embedding model + Chroma orchestration. Status-only answers stay
// deterministic from authorized database state; only general loan questions
// invoke retrieval and the language model.

function statusAnswer(application, documents) {
  const status = String(application.status || "unknown").replace(/[-_]/g, " ");
  const missing = missingDocuments(application, documents);
  let answer = "The status recorded for your application is " + status + ".";
  if (missing.length) {
    answer += " Our records show these required documents are still missing: " +
      missing.map((type) => type.replace(/[-_]/g, " ")).join(", ") + ".";
  }
  return { answer, sources: [{ doc: "Application status" }] };
}

function flattenResults(result) {
  const ids = result.ids?.[0] || [];
  const documents = result.documents?.[0] || [];
  const metadatas = result.metadatas?.[0] || [];
  const distances = result.distances?.[0] || [];
  return ids.map((id, index) => ({
    id,
    text: documents[index],
    ...(metadatas[index] || {}),
    distance: distances[index],
  }));
}

export function selectEvidence(result) {
  const seen = new Set();
  return flattenResults(result)
    .filter((item) => typeof item.text === 'string' && Number.isFinite(item.distance) && item.distance <= RAG_CONFIG.maxDistance)
    .filter((item) => {
      const key = item.text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RAG_CONFIG.topK)
    .map((item) => ({
      id: item.id,
      text: item.text,
      sourceTitle: item.sourceTitle || item.sourceFile || 'Approved loan policy',
      sourceFile: item.sourceFile || 'unknown',
      section: item.section || 'General',
      distance: item.distance,
    }));
}

export async function answerQuestionWithOllama({ question, application, role, history = [], documents: existingDocuments, signal }) {
  const safeQuestion = (question || '').slice(0, RAG_CONFIG.maxQuestionChars).trim();
  const priorUserQuestions = Array.isArray(history)
    ? history.filter((turn) => turn?.role === 'user' && typeof turn.content === 'string')
      .map((turn) => ({ role: 'user', content: turn.content.slice(0, 1000) })).slice(-4)
    : [];
  const route = classifyLoanQuestion(safeQuestion, priorUserQuestions);
  if (route.kind === 'clarification') {
    return { answer: 'Could you clarify what you would like to know about your loan or application?', sources: [] };
  }
  if (route.kind === 'unsupported') {
    return { answer: 'I can help with loan products, application steps, required documents, eligibility, repayment, and your current application status.', sources: [] };
  }

  const rawDocuments = existingDocuments || await Document.find({ applicationId: application._id }).select('-fileData -storageKey').lean();
  const documents = existingDocuments ? rawDocuments : withCrossDocumentChecks(application, rawDocuments);
  const needsStatus = route.kind === 'status' || route.kind === 'mixed';
  const needsPolicy = route.kind === 'general' || route.kind === 'mixed';
  if (route.kind === "status") return statusAnswer(application, documents);
  let evidence = [];
  if (needsPolicy) {
    const [queryEmbedding] = await embedTexts([route.effectiveQuestion], signal);
    const collectionId = await getOrCreatePolicyCollection(signal);
    const result = await queryPolicyRecords(collectionId, queryEmbedding, Math.max(RAG_CONFIG.topK * 3, RAG_CONFIG.topK), undefined, signal);
    evidence = selectEvidence(result);
  }
  if (needsPolicy && evidence.length === 0) {
    const unavailable = 'I could not find relevant information in the approved loan policies. Please contact your loan officer for help.';
    if (needsStatus) {
      const status = statusAnswer(application, documents);
      return { answer: status.answer + '\n\n' + unavailable, sources: status.sources };
    }
    return { answer: unavailable, sources: [] };
  }

  const messages = buildRagMessages({
    question: route.effectiveQuestion,
    history: priorUserQuestions,
    role,
    route,
    evidence,
    // In mixed questions, compose the status from DB state below rather than
    // asking the model to paraphrase or decide the application's status.
    applicationStatus: null,
  });

  try {
    let raw = await generateChatJson(messages, signal);
    let answer = parseGroundedAnswer(raw, evidence, { citationsRequired: needsPolicy && evidence.length > 0 });
    if (needsPolicy && evidence.length > 0 && answer.sources.length === 0) {
      // Small local models sometimes omit otherwise valid P1/P2 evidence labels.
      // Give one constrained correction attempt, then keep the safe fallback.
      raw = await generateChatJson([
        ...messages,
        { role: 'assistant', content: raw },
        { role: 'user', content: 'Correct the citations. Return the same grounded answer as JSON, citing one or more exact evidence labels such as P1 or P2 from the supplied evidence. Do not invent labels.' },
      ], signal);
      answer = parseGroundedAnswer(raw, evidence, { citationsRequired: true });
    }
    if (needsPolicy && evidence.length > 0 && answer.sources.length === 0 && needsStatus) {
      // Status remains authoritative; policy explanation is omitted if the model cites invalid source IDs.
      return statusAnswer(application, documents);
    }
    if (needsStatus) {
      const status = statusAnswer(application, documents);
      return {
        answer: status.answer + "\n\n" + answer.answer,
        sources: [...status.sources, ...answer.sources],
      };
    }
    return answer;
  } catch (error) {
    console.error('[ragOllama] request failed:', error.message);
    throw new Error('The loan assistant is temporarily unavailable. Check that Ollama and Chroma are running and their configured models are installed.');
  }
}
