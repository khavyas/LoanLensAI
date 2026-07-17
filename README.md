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
| AI | Anthropic Claude — vision extraction + RAG-grounded chat (full policy corpus in context; embeddings/vector search is the scale-up path) |

## Repo layout

```
backend/   Express API — auth, applications, document extraction, verification, RAG chat
frontend/  Expo React Native app (runs on web + mobile)
data/      Synthetic dataset: policy docs, seed applications (NO real data, ever)
docs/      Roadmap, demo script
```

## Quick start

```bash
# backend
cd backend
cp .env.example .env       # fill MONGODB_URI + ANTHROPIC_API_KEY
npm install
npm run seed               # demo users + applications
npm run ingest             # index policy docs for RAG
npm run dev                # http://localhost:4000

# frontend (separate terminal — or GitHub Codespaces)
cd frontend
npm install
cp .env.example .env       # point EXPO_PUBLIC_API_URL at your Render backend
npx expo start             # press 'w' for web
```

Demo logins (after seed): `officer@loanlens.demo` / `demo1234`, `borrower@loanlens.demo` / `demo1234`.

## No-local-Node workflow 

Local machines with firewall restrictions never run Node — everything runs in the cloud:

1. **Code** lives on GitHub; edit locally or in **GitHub Codespaces** (Node preinstalled).
2. **Backend** deploys on Render from this repo ([render.yaml](render.yaml)): root dir `backend`, build `npm install`, start `npm start`. Set `MONGODB_URI`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `SETUP_SECRET` in the Render dashboard.
3. **First-time setup without a shell** — call once after deploy (replace host + secret):
   - `POST https://<app>.onrender.com/admin/seed?secret=<SETUP_SECRET>`
   - `POST https://<app>.onrender.com/admin/ingest?secret=<SETUP_SECRET>`
   - `GET  https://<app>.onrender.com/admin/status?secret=<SETUP_SECRET>` to verify counts
4. **Atlas**: Network Access → allow `0.0.0.0/0` (Render free tier has no static IP; demo DB holds synthetic data only).
5. **Frontend** deploys on Render as a **Static Site**: root dir `frontend`, build `npm install && npx expo export --platform web`, publish directory `dist`, env var `EXPO_PUBLIC_API_URL` = the backend URL. Add a rewrite rule `/*` → `/index.html`. Static sites are free and never cold-start.
6. **Demo day**: open the backend's `/health` ~5 minutes early — free-tier web services cold-start after 15 idle minutes (the static frontend does not).

## Rules

- **Synthetic data only.** No client documents, schemas, or screenshots.
- All AI answers must carry citations; low-confidence extractions route to human review.
