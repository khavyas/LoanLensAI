# LoanLens AI

AI-powered loan document copilot — FocusNext 2026 POC.

**One-liner:** ThoughtFocus AI can already read loan documents. LoanLens makes them answer back — to the officer, to the borrower, and to the auditor.

## The 3-screen demo

1. **Upload → Classify → Extract** — drop a pay stub, AI classifies it and extracts key fields.
2. **Cross-verification** — extracted income vs. application income; mismatches flagged with explanations.
3. **Ask the loan file (RAG)** — borrower asks "what documents do I still need?", officer asks "why is this flagged?" — grounded, cited answers.

## Stack

| Layer | Tech |
|---|---|
| Mobile/web app | React Native (Expo, web-enabled) |
| Backend | Node.js + Express |
| Database | MongoDB Atlas (M0 free tier) |
| AI | OpenAI — gpt-4o-mini (vision + chat), text-embedding-3-small (RAG) |

## Repo layout

```
backend/   Express API — auth, applications, document extraction, verification, RAG chat
mobile/    Expo React Native app
data/      Synthetic dataset: policy docs, seed applications (NO real data, ever)
docs/      Roadmap, demo script
```

## Quick start

```bash
# backend
cd backend
cp .env.example .env       # fill MONGODB_URI + OPENAI_API_KEY
npm install
npm run seed               # demo users + applications
npm run ingest             # index policy docs for RAG
npm run dev                # http://localhost:4000

# mobile (separate terminal)
cd mobile
npm install
npx expo start             # press 'w' for web
```

Demo logins (after seed): `officer@loanlens.demo` / `demo1234`, `borrower@loanlens.demo` / `demo1234`.

## Rules

- **Synthetic data only.** No client documents, schemas, or screenshots.
- All AI answers must carry citations; low-confidence extractions route to human review.
