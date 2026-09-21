# LoanLens AI — Build Roadmap

Decisions (2026-07-17): Expo + web · single OpenAI key · MongoDB Atlas M0.

| Phase | Scope | Est. | Exit criteria |
|---|---|---|---|
| 0 | Env + scaffolding (Node LTS, repo, Expo app, Express server, .env) | 0.5–1d | Both apps boot; backend connects to Mongo |
| 1 | Auth & shell (JWT login, officer/borrower roles, nav: Login → Applications → Detail tabs) | 1d | Log in as either role, browse seeded app |
| 2 | Synthetic dataset (policy docs, 3 seed applications, fake pay stubs w/ planted mismatches, 15–20 Q&A tests) | 0.5d | One-command seed of clean demo DB |
| 3 | Screen 1: upload → LLM vision classify+extract → fields card | 1.5–2d | Drop fake pay stub, fields appear |
| 4 | Screen 2: deterministic cross-verification rules + missing-doc checklist + exceptions UI | 1d | $4,200 vs $5,000 red flag renders |
| 5 | Screen 3: RAG assistant (chunk→embed→Mongo, cosine top-k, cited answers + app state) | 1.5–2d | All test Q&A answered w/ correct citations |
| 6 | Demo polish (reset script, branding, 3-min demo script) | 1d | Full rehearsal, zero manual DB work |
| 7 | Stretch: Render deploy, Expo web hosting, WhatsApp Cloud API, PDF report | — | — |

Suggested split: Khavya → app + extraction (Ph 1,3,4) · Souvik → dataset + RAG (Ph 2,5).

## Architecture notes

- No separate OCR service: Claude vision classifies + extracts in one call (MOCK_AI=true bypasses this with canned fixtures when there's no API budget).
- No separate vector DB: embeddings stored in Mongo `policychunks`, cosine similarity in Node (~50 chunks). Upgrade path: Atlas Vector Search.
- Verification is deterministic rules, NOT LLM — auditability talking point.
- Chat grounding = retrieved policy chunks + live application state JSON; answers must cite sources.

## Document Truth & Verification Architecture (2026-09-21)

The panel's central question — "how do you know the borrower didn't just
edit their pay stub?" — splits into four layers. Two are real and shipped;
two are roadmap that need a funded vendor relationship, not more engineering
time. Being explicit about which is which is itself a stronger answer than
overclaiming.

| Layer | What it catches | Status |
|---|---|---|
| 1. Digital/visual forensics (PDF metadata, font/glyph analysis, Error Level Analysis) | Pixel- or file-level editing traces | **Not built.** Our demo docs are generated PNGs with nothing to forensically inspect; even against real files this is a weak, easily-defeated signal (screenshot/re-export wipes it) and font-template detection needs a reference library we don't have. See Task Tracker Section 16. |
| 2. Statutory & mathematical logic | Numbers that don't hold together internally | **Built.** Social Security (6.2%) and Medicare (1.45%) withholding must match gross pay; year-to-date gross must be consistent with the pay period number shown. Both are flat, well-defined federal rates — not brackets — which is exactly what makes them checkable without a tax-bracket model. `backend/src/services/verification.js`. |
| 3. Cross-document triangulation | A pay stub not backed by real money movement | **Built.** The current pay-stub's net pay and employer must be corroborated by the current bank statement's most recent deposit amount and description. `crossDocumentChecks()` / `withCrossDocumentChecks()` in `backend/src/services/verification.js`. |
| 4. External grounding (employer registry, direct-from-source payroll APIs, IRS transcripts) | Fabricated employers, shell companies, documents that were never real to begin with | **Not built — needs a funded vendor relationship**, not a code change. See Task Tracker Section 16 for specific vendors (Argyle/Pinwheel/Plaid Income, Persona/Onfido, Middesk, IRS IVES) and Section 17 for KYC/address/credit items, several of which (OFAC screening, USPS address validation) are free and buildable without funding. |

**Every check is deterministic (no LLM) and carries a human-readable
`explanation` string** — this is what already powers the "Explainable
reasoning, not a black box" pitch point; nothing new needed there.

**Confidence score, for panel Q&A:** `doc.confidence` is the AI's own
self-reported estimate of how legible/complete the document image was
(0.0–1.0) — it answers "could I read this clearly?", not "is this genuine?".
A low score (<70%) routes the document to human review regardless of what
the extracted numbers say. It is a distinct signal from `verification.overall`
(the deterministic pass/fail/needs-review from Layers 2–3 above) — the UI
labels it "Extraction confidence" specifically to avoid the two being
conflated as one "trust score."
