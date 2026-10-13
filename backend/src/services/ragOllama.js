import Document from '../models/Document.js';
import { RAG_CONFIG } from '../config/rag.js';
import { missingDocuments, withCrossDocumentChecks } from './verification.js';
import { embedTexts } from './embeddingClient.js';
import { generateChatText } from './ollamaClient.js';
import { getOrCreatePolicyCollection, queryPolicyRecords } from './chromaService.js';
import { classifyLoanQuestion } from './loanQuestionRouter.js';
import { buildRagMessages, parseGroundedAnswer } from './ragPromptBuilder.js';

// Ollama + embedding model + Chroma orchestration. Status-only answers stay
// deterministic from authorized database state; only general loan questions
// invoke retrieval and the language model.

function statusAnswer(application, documents, role = 'borrower') {
  const status = String(application.status || "unknown").replace(/[-_]/g, " ");
  const missing = missingDocuments(application, documents);
  const subject = role === 'officer'
    ? `${application.applicantName}'s application`
    : 'your application';
  let answer = `The status recorded for ${subject} is ${status}.`;
  if (missing.length) {
    answer += " Our records show these required documents are still missing: " +
      missing.map((type) => type.replace(/[-_]/g, " ")).join(", ") + ".";
  }
  return { answer, sources: [{ doc: "Application status" }] };
}

const PRODUCT_LABELS = {
  'auto-loan': 'auto loan',
  'personal-loan': 'personal loan',
  'small-business-loan': 'small business loan',
};
const DOCUMENT_LABELS = {
  'pay-stub': 'Pay stub',
  w2: 'W-2',
  'bank-statement': 'Bank statement',
  'drivers-license': "Driver's license",
  'business-tax-return': 'Business tax return',
  'personal-financial-statement': 'Personal financial statement',
  'business-license': 'Business license',
  'ownership-disclosure': 'Ownership disclosure',
  unknown: 'Unclassified document',
};

function mentionedProduct(question) {
  const text = question.toLowerCase();
  if (/\b(?:personal[- ]loan)\b/.test(text)) return 'personal-loan';
  if (/\b(?:auto[- ]loan|car[- ]loan|vehicle[- ]loan)\b/.test(text)) return 'auto-loan';
  if (/\b(?:small[- ]business[- ]loan|business[- ]loan)\b/.test(text)) return 'small-business-loan';
  return null;
}

function applicationQuestionAnswer(question, application, documents) {
  const text = question.toLowerCase().replace(/[\u2019']/g, ' ');
  const currentDocuments = (documents || []).filter((doc) => (doc.status || 'current') === 'current');
  const product = application.productType;
  const productLabel = PRODUCT_LABELS[product] || String(product || 'loan').replace(/-/g, ' ');
  const requestedProduct = mentionedProduct(text);
  const mismatch = requestedProduct && requestedProduct !== product;
  const requestedArticle = requestedProduct === 'auto-loan' ? 'an' : 'a';
  const mismatchPrefix = mismatch
    ? `This chat is for your ${productLabel} application, not ${requestedArticle} ${PRODUCT_LABELS[requestedProduct]} application. `
    : '';
  const source = (doc = 'Application record') => [{ doc }];
  const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const asksNetPay = /\bnet\s*pay\b|\btake[- ]home pay\b/.test(text)
    && /\b(?:pay\s*stub|stub|paycheck|monthly)\b/.test(text);
  if (asksNetPay) {
    const payStub = currentDocuments
      .filter((doc) => doc.docType === 'pay-stub')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    const netPay = payStub?.extractedFields?.netPay;
    if (netPay == null) {
      return {
        answer: mismatchPrefix + (payStub
          ? 'A current pay stub is on file, but its net-pay amount is not available in the extracted records.'
          : 'I do not see a current pay stub on this application, so I cannot report a net-pay amount.'),
        sources: source('Pay stub / application records'),
      };
    }
    const period = payStub.extractedFields?.payPeriod;
    return {
      answer: `${mismatchPrefix}The current pay stub shows net pay of ${money(netPay)}${period ? ` for the pay period ${period}` : ' for the listed pay period'}. This is the pay-stub period amount, not necessarily a monthly amount.`,
      sources: source('Pay stub'),
    };
  }

  const asksSubmittedDocuments = /\b(?:submit(?:ted)?|uploaded|provided)\b/.test(text)
    && /\b(?:documents?|paperwork|bank statement|pay\s*stub|license)\b/.test(text);
  if (asksSubmittedDocuments) {
    const specificType = /\bbank statement\b/.test(text) ? 'bank-statement'
      : /\bpay\s*stub|paycheck\b/.test(text) ? 'pay-stub'
        : /\b(?:driver'?s? license|license)\b/.test(text) ? 'drivers-license' : null;
    const found = specificType
      ? currentDocuments.some((doc) => doc.docType === specificType)
      : currentDocuments.length > 0;
    if (specificType) {
      const label = DOCUMENT_LABELS[specificType];
      return {
        answer: mismatchPrefix + (found
          ? `Yes, a ${label.toLowerCase()} is recorded as submitted for this ${productLabel} application.`
          : `No, I do not see a ${label.toLowerCase()} recorded as submitted for this ${productLabel} application.`),
        sources: source('Application documents'),
      };
    }
    const labels = [...new Set(currentDocuments.map((doc) => DOCUMENT_LABELS[doc.docType] || String(doc.docType || 'Document').replace(/-/g, ' ')))];
    return {
      answer: mismatchPrefix + (labels.length
        ? `The documents currently recorded for this ${productLabel} application are: ${labels.join(', ')}.`
        : `I do not see any current documents submitted for this ${productLabel} application.`),
      sources: source('Application documents'),
    };
  }

  const asksAmount = /\b(?:how much|what(?:'s| is))\b/.test(text)
    && /\b(?:loan\s+)?amount\b/.test(text)
    && /\b(?:claimed|requested|applied|account|loan|borrow)\b/.test(text);
  if (asksAmount) {
    return {
      answer: mismatchPrefix + (application.requestedAmount != null
        ? `The requested amount on this ${productLabel} application is ${money(application.requestedAmount)}.`
        : `I do not see a requested amount recorded for this ${productLabel} application.`),
      sources: source(),
    };
  }

  const asksAppliedProduct = /\b(?:did i apply|have i applied|what (?:is|was) (?:the )?(?:loan )?(?:type|product)|which (?:loan|product))\b/.test(text)
    && /\b(?:apply|applied|application|loan|product)\b/.test(text);
  if (asksAppliedProduct) {
    const answer = mismatch
      ? `${mismatchPrefix}The application open here is for a ${productLabel}. I can only confirm the application currently selected in this chat.`
      : `Yes. The application open here is for a ${productLabel}.`;
    return { answer, sources: source() };
  }

  return null;
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
  const rawDocuments = existingDocuments || await Document.find({ applicationId: application._id }).select('-fileData -storageKey').lean();
  const documents = existingDocuments ? rawDocuments : withCrossDocumentChecks(application, rawDocuments);
  const recordAnswer = applicationQuestionAnswer(safeQuestion, application, documents);
  if (recordAnswer) return recordAnswer;
  if (route.kind === 'clarification') {
    return { answer: 'Could you clarify what you would like to know about your loan or application?', sources: [] };
  }
  if (route.kind === 'unsupported') {
    return { answer: 'I can help with loan products, application steps, required documents, eligibility, repayment, and your current application status.', sources: [] };
  }

  const needsStatus = route.kind === 'status' || route.kind === 'mixed';
  const needsPolicy = route.kind === 'general' || route.kind === 'mixed';
  if (route.kind === "status") return statusAnswer(application, documents, role);
  let evidence = [];
  if (needsPolicy) {
    const [queryEmbedding] = await embedTexts([route.effectiveQuestion], signal);
    const collectionId = await getOrCreatePolicyCollection(signal);
    const result = await queryPolicyRecords(collectionId, queryEmbedding, Math.max(RAG_CONFIG.topK * 3, RAG_CONFIG.topK), undefined, signal);
    evidence = selectEvidence(result);
  }
  if (needsPolicy && evidence.length === 0) {
    console.warn('[ragOllama] retrieval returned no usable policy evidence', {
      collection: RAG_CONFIG.chromaCollection,
      embeddingProvider: RAG_CONFIG.embeddingProvider,
      embeddingModel: RAG_CONFIG.embeddingModel,
    });
    const unavailable = 'I could not find relevant information in the approved loan policies. Please contact your loan officer for help.';
    if (needsStatus) {
      const status = statusAnswer(application, documents, role);
      return { answer: status.answer + '\n\n' + unavailable, sources: status.sources };
    }
    return { answer: unavailable, sources: [] };
  }

  const messages = buildRagMessages({
    question: route.effectiveQuestion,
    // Keep unrelated earlier turns out of a self-contained policy question.
    // The classifier marks history only when the current turn needs context.
    history: route.usedHistory ? priorUserQuestions : [],
    role,
    route,
    evidence,
    // In mixed questions, compose the status from DB state below rather than
    // asking the model to paraphrase or decide the application's status.
    applicationStatus: null,
  });

  try {
    let raw = await generateChatText(messages, signal);
    let answer = parseGroundedAnswer(raw, evidence, { citationsRequired: needsPolicy && evidence.length > 0 });
    if (needsPolicy && evidence.length > 0 && answer.sources.length === 0) {
      console.warn('[ragOllama] answer validation failed; requesting one citation correction', {
        reason: answer.validationError,
        evidenceCount: evidence.length,
        model: RAG_CONFIG.ollamaChatModel,
      });
      // Ask for plain text plus exact evidence labels. Ollama Cloud currently
      // does not support structured outputs, so JSON mode is not reliable there.
      raw = await generateChatText([
        ...messages,
        { role: 'assistant', content: raw },
        { role: 'user', content: 'Keep the same evidence-grounded answer, but return plain text and add one or more exact evidence labels in square brackets, such as [P1] or [P2]. Use only labels from the supplied evidence. Do not return JSON.' },
      ], signal);
      answer = parseGroundedAnswer(raw, evidence, { citationsRequired: true });
    }
    if (needsPolicy && evidence.length > 0 && answer.validationError) {
      console.warn('[ragOllama] answer rejected after citation correction', {
        reason: answer.validationError,
        evidenceCount: evidence.length,
        model: RAG_CONFIG.ollamaChatModel,
      });
    }
    if (needsPolicy && evidence.length > 0 && answer.sources.length === 0 && needsStatus) {
      // Status remains authoritative; policy explanation is omitted if the model cites invalid source IDs.
      return statusAnswer(application, documents, role);
    }
    if (needsStatus) {
      const status = statusAnswer(application, documents, role);
      return {
        answer: status.answer + "\n\n" + answer.answer,
        sources: [...status.sources, ...answer.sources],
      };
    }
    const { validationError: _validationError, ...verifiedAnswer } = answer;
    return verifiedAnswer;
  } catch (error) {
    console.error('[ragOllama] request failed:', error.message);
    throw new Error('The loan assistant is temporarily unavailable. Check the configured Ollama endpoint, API key, model access, and Chroma Cloud settings.');
  }
}
