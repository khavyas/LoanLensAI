import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { runAnswerEval } from './answerEval.js';
import { buildApplicationChunks } from './loanFileChunker.js';

// Runs the golden questions through the REAL chat endpoint of this server, signed in as the same
// kinds of people who use it (a borrower on their own file, an officer, an underwriter). That
// exercises routing, authorization, retrieval, the model, citation checks and the rate limit
// together, which is what a jury demo exercises. A run takes several minutes (one question at a
// time, spaced under the per-user rate limit), so it runs in the background and is polled.

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.resolve(here, '../../../data/eval/golden-questions-v2.json');
const POLICY_DIR = path.resolve(here, '../../../data/policies');

const state = { running: false, startedAt: null, finishedAt: null, done: 0, total: 0, error: null, report: null, results: null, filter: null };

async function loadModels() {
  const [{ default: User }, { default: Application }, { default: Document }] = await Promise.all([
    import('../models/User.js'),
    import('../models/Application.js'),
    import('../models/Document.js'),
  ]);
  return { User, Application, Document };
}

function makeAsk({ User, Application }) {
  const base = `http://127.0.0.1:${process.env.PORT || 4000}`;
  const apps = new Map();
  const users = new Map();
  return async (testCase) => {
    const { role, applicant } = testCase.persona;
    if (!apps.has(applicant)) apps.set(applicant, await Application.findOne({ applicantName: applicant }).sort({ createdAt: -1 }).lean());
    const application = apps.get(applicant);
    if (!application) throw new Error(`No application for ${applicant} (run /admin/reset first)`);
    const userKey = role === 'borrower' ? application.applicantEmail : role;
    if (!users.has(userKey)) users.set(userKey, await (role === 'borrower' ? User.findOne({ email: application.applicantEmail }) : User.findOne({ role })).lean());
    const user = users.get(userKey);
    if (!user) throw new Error(`No ${role} user found`);
    const token = jwt.sign({ sub: String(user._id), role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '10m' });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await fetch(`${base}/chat/${application._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: testCase.question, history: testCase.history || [] }),
      });
      if (res.status === 429) {
        const wait = Math.min(Number(res.headers.get('retry-after') || 10), 70);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error || 'request failed'}`);
      return body;
    }
    throw new Error('Rate limited after 4 attempts');
  };
}

// The text the answer is allowed to draw numbers from: the expected policy files, or this
// applicant's own indexed file.
function makeGroundTruth({ Application, Document }) {
  return async (testCase) => {
    const e = testCase.expect || {};
    if (e.sources?.length) {
      const texts = await Promise.all(e.sources.map((f) => fs.readFile(path.join(POLICY_DIR, f), 'utf8').catch(() => '')));
      return texts.join('\n');
    }
    if (e.fileSource) {
      const application = await Application.findOne({ applicantName: testCase.persona.applicant }).sort({ createdAt: -1 }).lean();
      if (!application) return '';
      const documents = await Document.find({ applicationId: application._id }).select('-fileData -storageKey +pageTexts').lean();
      return buildApplicationChunks({ application, documents }).map((c) => c.text).join('\n');
    }
    return '';
  };
}

export function getAnswerEvalState() {
  const { results, ...rest } = state;
  return { ...rest, resultsAvailable: Boolean(results) };
}

export function getAnswerEvalResults() {
  return state.results;
}

export async function startAnswerEval({ category, limit } = {}) {
  if (state.running) return { alreadyRunning: true, ...getAnswerEvalState() };
  let cases = JSON.parse(await fs.readFile(GOLDEN, 'utf8'));
  if (category) cases = cases.filter((c) => c.category === category);
  if (limit) cases = cases.slice(0, limit);
  Object.assign(state, { running: true, startedAt: new Date().toISOString(), finishedAt: null, done: 0, total: cases.length, error: null, report: null, results: null, filter: { category: category || null, limit: limit || null } });

  (async () => {
    try {
      const models = await loadModels();
      const { report, results } = await runAnswerEval({
        cases,
        ask: makeAsk(models),
        groundTruth: makeGroundTruth(models),
        throttleMs: Number(process.env.EVAL_THROTTLE_MS || 3500),
        onProgress: (done) => { state.done = done; },
      });
      state.report = report;
      state.results = results;
    } catch (error) {
      state.error = error.message;
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
  })();
  return getAnswerEvalState();
}
