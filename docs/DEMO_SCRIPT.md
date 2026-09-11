# LoanLens AI — 3-Minute Demo Script

## Which scenario to lead with

**Lead with the small-business scenario (Dana Whitfield / Whitfield & Co. Bakery LLC).**
Small-business and SBA-style loans are where document mismatches genuinely stall real
loan closings — entity-name mismatches and revenue verification are harder, less
commoditized problems than a mortgage pay stub, and they map directly to gaps found in
production support tickets. Use the beats below exactly as written but substitute:

- Applicant: **Dana Whitfield**, product **Small Business Loan**, requested **$110,000**.
- Upload `whitfield-bakery-business-tax-return.png` in Beat 1 → extracted annual
  revenue **$275,400**.
- In Beat 2, point at **three** flagged rows instead of one: **Annual business revenue**
  ($340,000 stated vs. $275,400 documented), **Business name**
  ("Whitfield & Co. Bakery LLC" on the application vs. "Whitfield And Co Bakery LLC" on
  the business license — call out that this name-mismatch pattern is the single most
  common reason small-business loan closings get delayed in the real world, not a
  hypothetical edge case), and **Requested amount vs. affordability** (the $110,000
  ask is about 1.3x the ~$82,620 estimate the system derives from the documented
  $275,400 revenue) — a good moment to explain this is a triage estimate for the
  officer, never an auto-decline.
- In Beat 3, ask *"Why is this application flagged?"* → answer should cite all three
  exceptions — revenue, business-name, and requested-amount — from the
  **Small Business Loan Requirements** policy.

Keep the Jordan Rivera (consumer auto-loan) walkthrough below as the fallback script —
it's simpler to narrate live if something goes wrong with the business-loan upload, and
it's useful to show breadth (the same engine handles both loan types) if you have time
for a second pass.

## Before you're on stage

1. Reset the demo data so it's clean: `npm run reset` (local) or hit
   `POST /admin/reset?secret=<SETUP_SECRET>` (Render — see [README](../README.md)).
2. If deployed on Render free tier, open `/health` ~5 minutes early to wake the backend.
3. Have `data/seed/documents/jordan-rivera-pay-stub.png` easy to reach on the machine
   you're demoing from (Downloads or Desktop) — you'll upload it live.
4. Two browser tabs (or one you'll log out/in on): one for the **officer**, one for the
   **borrower**. Logins: `officer@loanlens.demo` / `demo1234`, `borrower@loanlens.demo` / `demo1234`.

## The pitch (10s)

> "ThoughtFocus AI can already read a loan document. LoanLens makes it answer back —
> to the officer, to the borrower, and to the auditor."

## Beat 1 — Upload → Classify → Extract (45s)

1. Log in as **officer**. Land on **Loan Applications** — three applications, synthetic data only.
2. Open **Jordan Rivera** (Auto Loan · $28,000). Point out the header facts: stated
   income **$5,000/mo**, employer **Brightline Logistics**.
3. On the **Documents** tab, tap **Upload document** and pick
   `jordan-rivera-pay-stub.png`.
4. While it's processing: *"No OCR pipeline, no separate vision service — one Claude
   call classifies the document type and extracts every field."*
5. Card appears: doc type **Pay Stub**, extraction confidence, and the extracted
   fields — gross monthly income **$4,200**.

## Beat 2 — Cross-verification (40s)

1. Switch to the **Verification** tab.
2. Point at the **Monthly income** check: Application **$5,000** vs. Document
   **$4,200**, flagged **Mismatch**, with the plain-English explanation and the
   percentage difference.
3. *"This isn't an LLM guessing whether something looks wrong — it's a deterministic
   rule with a tolerance band. Auditable, explainable, no hallucinated risk calls."*
4. Optionally upload the license or bank statement to show clean **Match** rows too.

## Beat 3 — Ask the loan file (60s)

1. Still as officer, open the **Assistant** tab. Ask (or tap the suggestion):
   *"Why is this application flagged?"*
   → Answer cites the **$4,200 vs $5,000** figures from the application state and
   the **Income Verification Policy**, with source chips shown under the reply.
2. Sign out, log back in as **borrower** (`borrower@loanlens.demo`), open the same
   application, go to **Assistant**, ask:
   *"What documents do I still need to upload?"*
   → Answer lists only the outstanding required docs — grounded in the application's
   own state, not invented.
3. *"Same assistant, two audiences, one grounded source of truth — and it never quotes
   a rate or invents a policy that isn't in the corpus."*

## Close (15s)

> "Officer, borrower, and auditor all get answers from the same evidence — extraction,
> verification, and grounded Q&A, standing on a MISMO-shaped data model so it can plug
> into a real LOS next."

## If something breaks

- **Extraction looks wrong / times out** — re-run `npm run reset`, retry the upload;
  don't debug live, move to the pre-verified Verification tab (data persists per
  applicant even without a fresh upload if you seeded a prior demo run).
- **Assistant gives an empty/odd answer** — ask one of the other suggestion chips;
  they're all covered in `data/seed/test-questions.md`.
- **Backend cold-started (Render free tier)** — this is why you open `/health` early;
  if it still happens, narrate the architecture while it wakes up.

## Grounding refusal to show off (if there's time / a curveball question)

Ask the assistant *"What interest rate will I get?"* — it should refuse and point to
an officer instead of quoting a number. Good proof point for the "never invents
policy" rule in [data/seed/test-questions.md](../data/seed/test-questions.md).
