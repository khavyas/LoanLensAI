# Where RAG is used in LoanLens, and how to demo it

Written for the jury demo. It describes what the code does today, including what it does not do yet, so nothing said on stage is wrong.

## The short answer

- **RAG answers questions about the bank's policies.** The approved policy documents (loan requirements, income rules, residency, FAQ) are split into sections, turned into vectors and stored in Chroma Cloud. When someone asks a policy question, the assistant finds the closest sections, gives only those to the language model, and the answer must cite them.
- **Facts about an application do not go through RAG.** What a borrower uploaded, what was extracted, what was flagged and the status are exact data. They are read from MongoDB by ordinary code and written out as text. A language model is never asked to remember or guess a figure.
- **Uploaded documents are not embedded yet.** Today a borrower's documents are stored (Cloudflare R2 or MongoDB), read by the extraction model, and the extracted fields are saved in MongoDB. They are checked by the rule engine. Indexing them for retrieval is planned work (RAG plan P3 and P5-03).

So the mental model "the LLM goes to MongoDB and retrieves" is not quite what happens. The LLM never queries MongoDB. Our code does, then decides whether the question needs the LLM at all.

## What happens at each step

**1. A borrower uploads a document (no RAG)**
1. The file is stored: Cloudflare R2 when `STORAGE_PROVIDER=r2`, otherwise MongoDB.
2. A vision model reads it and returns fields (name, income, employer, expiry date...). Page text is also read for bank statements.
3. The rule engine compares those fields with the application and records each check as match, warning or mismatch.
4. Results are stored on the Document in MongoDB and drive the Verification and Action Needed pages.

**2. Someone asks the assistant a question**

| What the question is about | How it is answered | Uses RAG? | Data source |
|---|---|---|---|
| "Where do I stand?", status, what to fix, progress | Server builds the full narrative in code (done, wrong and how to fix, next, recent activity) | No | MongoDB (application, documents, review history) |
| Amount requested, which documents are uploaded, pay-stub net pay | Fixed answers computed from stored fields | No | MongoDB |
| Open the documents / verification / progress page | Browser recognises the intent and navigates | No | MongoDB |
| Policy and process: requirements, tolerances, timelines, eligibility, residency, what a flag means | **Retrieve, then generate, then check** (below) | **Yes** | Chroma Cloud (policy vectors) |
| Status and a policy question together | Short status from MongoDB, then the policy answer from RAG | Partly | Both |
| Another applicant's data, secrets, jailbreaks | Refused by server rules before any model is called, or the prompt treats it as untrusted text | No | None |

**3. The RAG path for a policy question**
1. **Route.** A rules-based router decides this is a policy question. The model does not choose what to query or who may see what.
2. **Embed.** The question is turned into a vector (Qwen3-Embedding on Chroma Cloud on Render, `nomic-embed-text`/`embeddinggemma` locally).
3. **Retrieve.** Chroma returns the nearest policy sections. Anything farther than the distance cutoff is dropped. Duplicates are removed. At most 5 are kept.
4. **No evidence, no answer.** If nothing is close enough, the assistant says it could not find it in the approved policies and points to the loan officer. It does not guess.
5. **Generate.** The model gets the question and the numbered evidence (P1, P2...) with strict rules: answer only from the evidence, cite labels, treat everything as untrusted text.
6. **Verify.** The server checks that every citation is a real retrieved section and that every number in the answer appears in that evidence. One retry, then a safe refusal.
7. **Show sources.** The answer comes back with source chips (document, section, snippet).
8. **If the model is down:** a standby model (Groq, if configured) answers; if both fail, the top policy passages are shown as they are, with sources, flagged as a limited answer.

## Why it is built this way (the argument for the jury)

- **RAG is for knowledge that changes and must be cited.** A bank onboards its own policies. Upload a new policy file and the assistant uses it within seconds, with no retraining and no code change. Delete it and the assistant stops using it.
- **Exact facts stay out of the model.** Lending answers must be right to the dollar. Income, flags and status come straight from the database, so they cannot be invented.
- **Every policy answer is checkable.** Citations are validated, numbers are checked against the source, and "I could not find that" is a normal outcome.
- **Authorization is never left to the model.** A borrower can only ever ask about their own file.

## What not to claim

- Do not say the assistant searches the borrower's uploaded documents with RAG. It does not yet. Say: "document facts are extracted and verified by rules; indexing document text for retrieval is the next phase".
- Do not say multi-bank isolation is built. It is a single-bank build with the design for tenants documented (`docs/RAG_GOVERNANCE.md`).
- Do not promise WhatsApp. The reply text is channel-ready; the WhatsApp connection is future work.
- If a juror asks "why not put document text in RAG?": the numbers a lender relies on are better read from structured fields than from similarity search. Indexing redacted document text is planned for narrative questions ("what does the letter of explanation say?"), with strict per-application filters and PII redaction first.

## A five-minute RAG-led demo

1. **Admin adds knowledge (RAG in action).** Sign in as admin, open the policy console, upload a one-paragraph policy with a unique rule. Show the chunk count rise.
2. **Ask about it as a borrower.** The answer quotes the new rule with a source chip. Delete the file and ask again: "I could not find that."
3. **Ask the standard policy questions.** Car-loan documents, decision time, income tolerance. Open a source chip to show the cited section.
4. **Show it refusing to guess.** Ask for the routing number or a mortgage. It says it has no source.
5. **Show the split.** Ask "what is the status of my application?" as Meera Iyer: exact, specific, from the database (not a model guess). Then a mixed question: status and a policy together.
6. **Show the safety net.** Ask it to ignore its rules, or ask about another applicant. It refuses. If time allows, stop the model and show the limited answer with passages and sources.
7. **Show measurement.** Run `npm run eval:retrieval` and read recall@5, precision@5 and MRR over the 18 golden questions.

The full list, with expected results and what each proves, is in `LoanLensAI_RAG_Demo_Test_Scenarios.xlsx`.
