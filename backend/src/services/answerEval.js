import { scoreAnswer, summarizeAnswers } from './answerMetrics.js';

// Runs golden questions one at a time through `ask` (the real assistant, in production use) and
// scores each answer. A question that throws is recorded as a failed question, never as a crash,
// so one bad call cannot hide the rest of the run.
export async function runAnswerEval({ cases, ask, groundTruth = async () => '', throttleMs = 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onProgress }) {
  const results = [];
  for (let i = 0; i < cases.length; i += 1) {
    const testCase = cases[i];
    try {
      const response = await ask(testCase);
      results.push(scoreAnswer({ testCase, response, groundTruthText: await groundTruth(testCase) }));
    } catch (error) {
      results.push({ id: testCase.id, category: testCase.category, question: testCase.question, answer: '', refused: false, checks: {}, pass: false, reasons: [`error: ${error.message}`] });
    }
    onProgress?.(i + 1, cases.length);
    if (throttleMs && i < cases.length - 1) await sleep(throttleMs);
  }
  return { report: summarizeAnswers(results), results };
}
