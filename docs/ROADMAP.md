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

- No separate OCR service: gpt-4o-mini vision classifies + extracts in one call. Upgrade path: Azure Document Intelligence.
- No separate vector DB: embeddings stored in Mongo `policychunks`, cosine similarity in Node (~50 chunks). Upgrade path: Atlas Vector Search.
- Verification is deterministic rules, NOT LLM — auditability talking point.
- Chat grounding = retrieved policy chunks + live application state JSON; answers must cite sources.
