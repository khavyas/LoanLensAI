// NEW: Deterministic routing; the model never chooses a database query or authorization scope.
const STATUS_PATTERN = /\b(?:my|this)\s+(?:loan|application)\b.*\b(?:status|approved|rejected|pending|review|progress|next step|documents?)\b|\b(?:application|loan)\s+(?:status|progress)\b|\b(?:status|progress)\b.*\b(?:my|this)\s+(?:loan|application)\b|\b(?:application|loan)\b.*\b(?:pending|under review|approved|rejected|flagged)\b|\b(?:has my|am i|did my)\b.*\b(?:approved|rejected|pending|review)\b|\bwhat documents do i still need\b/i;
// Keep generic product words ("loan", "application") out of this pattern:
// otherwise every status question is misrouted as mixed and a model can
// paraphrase authoritative database state.
const GENERAL_PATTERN = /\b(?:policy|policies|apply|application process|application.{0,30}required|requirements? (?:for|to)|document requirements|required documents|documents? (?:are )?required|documents? (?:do i need|to apply|needed for)|income(?: verification| proof)?|self[- ]employed|employment verification|proof of employment|eligibility|eligible|qualify|interest|rate|emi|repayment|repay|fees?|charges?|foreclosure|prepayment|terms?|timeline|decision|approval process|business days|co[- ]?signer|collateral|credit score)\b/i;
const UNRELATED_PATTERN = /\b(?:weather|recipe|football|movie|music|stock price|politics|joke)\b/i;
const FOLLOW_UP_PATTERN = /\b(?:it|that|those|them|there|they|what about|how about|and then|why is that|tell me more)\b/i;

function rawKind(text) {
  const status = STATUS_PATTERN.test(text);
  const general = GENERAL_PATTERN.test(text);
  if (status && general) return 'mixed';
  if (status) return 'status';
  if (general) return 'general';
  if (UNRELATED_PATTERN.test(text)) return 'unsupported';
  return 'clarification';
}

export function classifyLoanQuestion(question, history = []) {
  const current = (question || '').trim();
  if (!current) return { kind: 'clarification', effectiveQuestion: '', usedHistory: false };

  const priorUserQuestions = Array.isArray(history)
    ? history.filter((turn) => turn?.role === 'user' && typeof turn.content === 'string')
      .map((turn) => turn.content.trim()).filter(Boolean).slice(-4)
    : [];
  // Carry context only for an actual follow-up or an otherwise ambiguous
  // fragment. Short, self-contained questions (for example, "documents
  // required for a personal loan") must stand on their own so an earlier
  // application-status question cannot override their intent or retrieval.
  const currentKind = rawKind(current);
  const needsContext = currentKind === 'clarification'
    && (current.split(/\s+/).length <= 7 || FOLLOW_UP_PATTERN.test(current));
  const usedHistory = needsContext && priorUserQuestions.length > 0;
  const effectiveQuestion = usedHistory
    ? `${priorUserQuestions.slice(-2).join('\n')}\n${current}`.slice(-2000)
    : current;

  let kind = currentKind;
  if (kind === 'clarification' && usedHistory) kind = rawKind(effectiveQuestion);
  if (kind === 'clarification' && !usedHistory && current.split(/\s+/).length < 3) {
    return { kind: 'clarification', effectiveQuestion, usedHistory };
  }
  if (kind === 'clarification') kind = 'unsupported';
  return { kind, effectiveQuestion, usedHistory };
}
