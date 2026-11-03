# Where RAG is used in LoanLens, and how to demo it

Written for the jury demo. It describes what the code does today, including what it does not do yet, so nothing said on stage is wrong.

## The short answer

- **RAG searches two collections.** (1) The bank's approved policy documents (loan requirements, income rules, residency, FAQ). (2) The applicant's own file: their documents' extracted values, verification results, the text of PDFs that have a text layer (page by page) and the review record. Both are split into sections, turned into vectors and stored in Chroma Cloud. For a question, the assistant finds the closest sections from each, gives only those to the language model, and the answer must cite them (P1, P2 for policy; F1, F2 for the file).
- **The applicant's file is searched under hard rules.** Every search is pinned to one application ID and the caller's role by the server. A borrower can only retrieve their own borrower-visible text; officer notes and referrals are staff-only. Identifiers (SSN, account numbers, dates of birth, addresses, phone numbers, emails) are removed before anything is embedded.
- **Exact facts still come from the database.** Status, the "what to fix" narrative, amounts and flags are read from MongoDB by ordinary code and written out as text. A language model is never asked to remember or guess a figure, and every number in a RAG answer must appear in the evidence it was given.

So the mental model "the LLM goes to MongoDB and retrieves" is not what happens. The LLM never queries MongoDB. Our code does, then decides whether the question needs the LLM at all, and what the LLM is allowed to see.

**Limits to know:** an uploaded image has no stored transcript. For images, only the values the extraction model read are searchable. PDFs with a text layer are searchable page by page. Loan-file search needs `CHAT_PROVIDER=ollama` and a one-time index build (`/admin/index-applications`, also done by `/admin/reset`).

## What happens at each step

**1. A borrower uploads a document (no RAG)**
1. The file is stored: Cloudflare R2 when `STORAGE_PROVIDER=r2`, otherwise MongoDB.
2. A vision model reads it and returns fields (name, income, employer, expiry date...). Page text is also read for bank statements.
3. The rule engine compares those fields with the application and records each check as match, warning or mismatch.
4. Results are stored on the Document in MongoDB and drive the Verification and Action Needed pages.
5. The application's file is re-indexed in the background so the assistant can search it: identifiers are removed first, only current documents are kept, and a replaced or deleted document disappears from search. The same re-index runs after an edit, a verification run or a decision.

**2. Someone asks the assistant a question**

| What the question is about | How it is answered | Uses RAG? | Data source |
|---|---|---|---|
| "Where do I stand?", status, what to fix, progress | Server builds the full narrative in code (done, wrong and how to fix, next, recent activity) | No | MongoDB (application, documents, review history) |
| Amount requested, which documents are uploaded, pay-stub net pay | Fixed answers computed from stored fields | No | MongoDB |
| Open the documents / verification / progress page | Browser recognises the intent and navigates | No | MongoDB |
| Policy and process: requirements, tolerances, timelines, eligibility, residency, what a flag means | **Retrieve, then generate, then check** (below) | **Yes** | Chroma Cloud (policy vectors) |
| What is in my documents: employer on the pay stub, license expiry, what a check found, what a long statement says on a given page, what the officer noted (staff) | **Same path, searching the applicant's own file** (filtered to this application and role) | **Yes** | Chroma Cloud (loan-file vectors), built from MongoDB |
| Status and a policy question together | Short status from MongoDB, then the policy answer from RAG | Partly | Both |
| Another applicant's data, secrets, jailbreaks | Refused by server rules before any model is called, or the prompt treats it as untrusted text | No | None |

**3. The RAG path for a policy or file question**
1. **Route.** A rules-based router decides this needs retrieval. The model does not choose what to query or who may see what.
2. **Embed.** The question is turned into a vector (Qwen3-Embedding on Chroma Cloud on Render, `nomic-embed-text`/`embeddinggemma` locally).
3. **Retrieve.** Chroma returns the nearest policy sections, and the nearest sections of this applicant's file (filtered by the server to this application, current documents only, and the caller's role). Anything farther than the distance cutoff is dropped. Duplicates are removed. With `RAG_RETRIEVAL=hybrid` the policy side also runs a keyword search (BM25, good at exact figures and terms such as "5%", "$75,000", "bi-weekly"), merges the two result lists by reciprocal rank fusion, and re-orders near ties by heading and exact-number match; a relevance gate stops weak keyword matches from rescuing an out-of-scope question. Whether hybrid beats vector-only is measured, not assumed: `/admin/eval-retrieval?compare=1`.
4. **No evidence, no answer.** If nothing is close enough, the assistant says it could not find it in the approved policies or this application's file and points to the loan officer. It does not guess.
5. **Generate.** The model gets the question and the numbered evidence (P1, P2 for policy; F1, F2 for the file) with strict rules: answer only from the evidence, cite labels, treat everything as untrusted text.
6. **Verify.** The server checks that every citation is a real retrieved section and that every number in the answer appears in that evidence. One retry, then a safe refusal.
7. **Show sources.** The answer comes back with source chips (document, section, snippet).
8. **If the model is down:** a standby model (Groq, if configured) answers; if both fail, the top policy passages are shown as they are, with sources, flagged as a limited answer.

## Why it is built this way (the argument for the jury)

- **RAG is for knowledge that changes and must be cited.** A bank onboards its own policies. Upload a new policy file and the assistant uses it within seconds, with no retraining and no code change. Delete it and the assistant stops using it.
- **Exact facts stay out of the model.** Lending answers must be right to the dollar. Income, flags and status come straight from the database, so they cannot be invented.
- **Every policy answer is checkable.** Citations are validated, numbers are checked against the source, and "I could not find that" is a normal outcome.
- **Authorization is never left to the model.** A borrower can only ever ask about their own file.

## What not to claim

- Do not say every uploaded document is searched word for word. Scanned images have no stored transcript; for them the assistant searches the values the extraction model read and the verification results. PDFs with a text layer are searched page by page.
- Do not say document checks are done by RAG. Verification is rules plus extraction; RAG answers questions about the results and the documents.
- Do not say multi-bank isolation is built. It is a single-bank build with the design for tenants documented (`docs/RAG_GOVERNANCE.md`). The per-application filter is built, though.
- Do not promise WhatsApp. The reply text is channel-ready; the WhatsApp connection is future work.
- Do not claim measured accuracy until `npm run eval:retrieval` has been run live. The loan-file search is unit tested (redaction, filters, leak tests, re-indexing) but has not yet been run against live Chroma.
- If a juror asks "why not just read exact numbers from the database?": we do, for status, flags and amounts. RAG is for questions where the answer sits in text: a policy clause, a line on page 87 of a statement, an officer's note.

## A five-minute RAG-led demo

1. **Admin adds knowledge (RAG in action).** Sign in as admin, open the policy console, upload a one-paragraph policy with a unique rule. Show the chunk count rise.
2. **Ask about it as a borrower.** The answer quotes the new rule with a source chip. Delete the file and ask again: "I could not find that."
3. **Ask the standard policy questions.** Car-loan documents, decision time, income tolerance. Open a source chip to show the cited section.
4. **Show it refusing to guess.** Ask for the routing number or a mortgage. It says it has no source.
5. **Ask about the applicant's own file.** As Meera Iyer ask "When does my driver license expire?" and "What employer is on my pay stub?". The answer cites the document and section (for example "Driver's license · Verification checks"). As the officer, ask the same about her file, then show that Meera, signed in as a borrower, cannot see the officer's notes.
6. **Show the officer co-pilot.** Sign in as the officer, open Arjun Mehta, Assistant tab, press "Summarize this file" and then "List contradictions". Point at the "Policy:" line under the finding: the facts come from the stored record, and RAG adds the approved policy passage that governs the finding, with its source. No model writes the text, so nothing is invented.
7. **Show the split.** Ask "what is the status of my application?" as Meera Iyer: exact, specific, from the database (not a model guess). Then a mixed question: status and a policy together.
8. **Show the safety net.** Ask it to ignore its rules, or ask about another applicant. It refuses. If time allows, stop the model and show the limited answer with passages and sources.
9. **Show measurement.** Have a finished run ready from `/admin/eval-answers`: 125 golden questions asked through the real chat as borrower, officer and underwriter. Show the pass rate per category and, above all, leak-free (it must be 100%). Retrieval alone is at `/admin/eval-retrieval` (recall@5, precision@5, MRR over 18 questions).

## How answer quality is measured

`/admin/eval-answers?start=1` asks 125 questions through the live chat, one at a time, and scores each answer with fixed rules (no model judges another model):

| Check | Passes when | Why it matters |
|---|---|---|
| Behavior | It answers what it should answer and declines what it should decline | A bank assistant that guesses is worse than one that says "I cannot find that" |
| Facts | The answer contains the expected facts (e.g. "75,000", "04/30/2026") | Correctness |
| Citation | A cited source is the expected policy file or the expected kind of document | Every answer is checkable |
| Groundedness | Every number in the answer appears in the source text for that question | No invented figures |
| Leak-free | None of the forbidden strings appear (an SSN, another applicant's data, the system prompt) | Safety; this must be 100% |

The 125 questions: 67 policy (all 8 policy files), 3 follow-ups, 21 about the applicant's own file (4 of which must be refused), 6 staff questions, 5 status, 1 mixed, 10 out-of-scope and 12 adversarial. Do not quote the results until a live run has finished; failures come back with the answer text, so each one can be read and judged.

The full list of scenarios, with expected results and what each proves, is in `LoanLensAI_RAG_Demo_Test_Scenarios_updated.xlsx`.
