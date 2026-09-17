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
npm run reset               # demo users + applications + policy index (re-run any time before a demo)
npm run dev                # http://localhost:4000

# frontend (separate terminal — or GitHub Codespaces)
cd frontend
npm install
cp .env.example .env       # point EXPO_PUBLIC_API_URL at your Render backend
npx expo start             # press 'w' for web
```

Demo logins (after seed): `officer@loanlens.demo` / `demo1234`, `borrower@loanlens.demo` / `demo1234` (Jordan Rivera), `dana.whitfield@example.demo` / `demo1234` (the small-business flagship scenario).

**Test accounts:** the login screen has a "Create a test account" link (self-registration, no email verification — this is a synthetic-data demo, not a real bank onboarding flow) for spinning up your own officer or borrower logins. A borrower who signs up can apply for a loan from the Applications screen ("New application") — a real intake form (product type, income/business revenue, requested amount, etc.) that creates a real `Application` record with the right required documents for that product, landing them straight on their new application's Documents tab.

Sample documents to upload live — `data/seed/documents/` (regenerate with `python data/seed/generate_documents.py`):
- **Small business (flagship — Dana Whitfield / Whitfield & Co. Bakery LLC):** `whitfield-bakery-business-tax-return.png` plants a revenue mismatch ($275,400 documented vs. $340,000 stated); `whitfield-bakery-business-license.png` plants an entity-name mismatch ("Whitfield And Co Bakery LLC" vs. "Whitfield & Co. Bakery LLC" on the application); `whitfield-bakery-personal-financial-statement.png` and `whitfield-bakery-ownership-disclosure.png` are clean matches.
- **Consumer (Jordan Rivera):** `jordan-rivera-pay-stub.png` plants an income mismatch ($4,200 vs. the $5,000 stated on the application); `jordan-rivera-drivers-license.png`, `jordan-rivera-bank-statement.png` are clean matches.

Full walkthrough: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

**No Anthropic credits? Set `MOCK_AI=true`** in `backend/.env` (or the Render dashboard) to bypass Claude entirely — document upload returns canned, deterministic extraction results for the known seed document filenames (reproducing the exact planted mismatches), and the Assistant tab returns a plain state summary instead of a real answer. Lets you test verification, the live-exception flow, and status transitions without spending API credits. Turn it back off for the real demo — mock answers are clearly labeled and aren't a substitute for the real AI behavior.

## No-local-Node workflow 

Local machines with firewall restrictions never run Node — everything runs in the cloud:

1. **Code** lives on GitHub; edit locally or in **GitHub Codespaces** (Node preinstalled).
2. **Backend** deploys on Render from this repo ([render.yaml](render.yaml)): root dir `backend`, build `npm install`, start `npm start`. Set `MONGODB_URI`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `SETUP_SECRET` in the Render dashboard.
3. **First-time setup (and pre-demo reset) without a shell** — one call, replace host + secret:
   - `POST https://<app>.onrender.com/admin/reset?secret=<SETUP_SECRET>` (seeds users/applications + re-indexes policies)
   - `GET  https://<app>.onrender.com/admin/status?secret=<SETUP_SECRET>` to verify counts
4. **Atlas**: Network Access → allow `0.0.0.0/0` (Render free tier has no static IP; demo DB holds synthetic data only).
5. **Frontend** deploys on Render as a **Static Site**: root dir `frontend`, build `npm install && npx expo export --platform web`, publish directory `dist`, env var `EXPO_PUBLIC_API_URL` = the backend URL. Add a rewrite rule `/*` → `/index.html`. Static sites are free and never cold-start.
6. **Demo day**: open the backend's `/health` ~5 minutes early — free-tier web services cold-start after 15 idle minutes (the static frontend does not).

## Rules

- **Synthetic data only.** No client documents, schemas, or screenshots.
- All AI answers must carry citations; low-confidence extractions route to human review.
