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

## Opening — apply for a loan from scratch (about 7 minutes)

Start here. Nothing is pre-loaded: you create a borrower, apply, upload three documents live, then
hand the file to the loan officer and show the borrower's result. The applicant is **Nisha Rao**,
a demo-only borrower whose documents are *not* seeded, so every step is real.

**Have ready**

- The three files on the demo machine (Desktop or Downloads), from `data/seed/documents/`:
  `nisha-rao-pay-stub.png`, `nisha-rao-drivers-license.png`, `nisha-rao-bank-statement.png`.
- A fresh reset (see "Before you're on stage"). A reset also removes Nisha's account, so you can rehearse again.
- Document extraction working (Groq, or Anthropic with credits). If it is not, skip steps 6–7 and
  use the pre-loaded **Priya Nair** application, which shows the same screens.

**The pitch (15 seconds)**

> "A borrower applies in minutes. The system tells them exactly what it still needs, reads each
> document, checks it against what they told us, and only then does a person decide."

### Step 1 — Create the borrower (45 s)

1. Open the app. On the login page click **New here? Create a test account**.
2. Fill in: Full name **Nisha Rao** · Email **nisha.rao@example.demo** · Password **demo1234** · role **Borrower**.
3. Click **Create account**. You land on **My Applications**, empty: *"No applications yet — tap New application to apply."*
4. Point at the header: the **Borrower** badge, so everyone knows which screen this is.

*Say:* "A real customer would register once. Everything from here is what they see."

### Step 2 — Choose the product (20 s)

1. Click **New application**. The wizard has four steps: Select Product · Tell Us About Yourself · Tell Us More About Yourself · Disclosures & Submit.
2. Choose **Personal Loan**, click **Continue**.

*Say:* "Three products — auto, personal, small business — each with its own rules and required documents."

### Step 3 — Tell us about yourself (90 s)

| Field | Type |
|---|---|
| Employer name | **Harbor Analytics** |
| Employer phone | **(555) 014-2290** |
| Stated gross monthly income ($) | **6500** |
| Repayment term | **36 mo** |
| Reason for loan | **Home office upgrade** |
| Requested amount ($) | **12000** |

1. *Optional beat (15 s):* first type **40000** as the requested amount and click **Continue**. It is stopped with
   a message that the maximum is about **$25,000**, which is the personal-loan limit. Then change it back to **12000**.
2. Click **Continue**.

*Say:* "The affordability ceiling is checked before anyone uploads a single document, so a typo or an
impossible request never wastes anyone's time. It is a rough estimate, never an automatic decline."

### Step 4 — Tell us more about yourself (60 s)

| Field | Type |
|---|---|
| Address | **27 Garden Street, Springfield** |
| SSN (last 4) | **8842** |
| Date of birth | **1993-02-15** (type it, or pick 15 Feb 1993) |
| Residency status | **U.S. citizen** |

1. Point at the note under residency: *"We do not verify citizenship."*
2. Click **Continue**.

*Say:* "We ask only what lending rules need. Residency is a declared fact the policy applies to the loan
term — we never check citizenship against a government database."

### Step 5 — Disclosures and submit (30 s)

1. Tick the consent box (identity and credit-report authorisation, e-sign) and click **Submit application**.
2. You land on the application's **Documents** tab.
3. Point at **Required documents** (three, all *Pending*) and the **Action needed · 3** card with an **Upload** button for each.

*Say:* "The moment the application is filed, the borrower sees exactly what is outstanding."

### Step 6 — Upload the three documents live (2 min)

1. Click **Upload document**, choose `nisha-rao-pay-stub.png`. While it works the page says *"AI is classifying and extracting…"*.
2. A card appears: **Pay Stub**, extraction confidence, extracted fields, and a **Verification checks** list
   (name, income, employer, payroll-tax math, year-to-date, affordability — all green).
3. Upload `nisha-rao-drivers-license.png`: its card shows four checks — **name, date of birth, address, ID expiry**.
4. Upload `nisha-rao-bank-statement.png`: it adds a cross-document check, **Bank deposit vs. pay stub net pay** ($2,200.50 matches).
5. Point at the **Verification summary**: **3 documents · 14 checks run · 14 matched · 0 flagged**, and
   that **Action needed** has cleared.

*Say:* "One AI call reads each document. Then plain, fixed rules compare it with what she told us — not AI
guessing. The bank deposit proves the pay stub is real money, not just a claim."

### Step 7 — Show where she is (30 s)

1. Click **Progress**. Steps one to four are ticked; **Officer review** shows **You are here**; about 67% complete.
2. Click **Assistant** if you want a quick taste: ask *"What is my application status?"* — the answer is
   formatted and opens the Progress page.

*Say:* "She is never left wondering where her application is."

### Step 8 — Hand over to the loan officer (2 min)

1. In a second window, sign in as **officer@loanlens.demo** / **demo1234**. Point at the **Loan Officer** badge.
2. **Loan Applications** lists **Nisha Rao** first. Open her and go to the **Decision** tab.
3. Show that *Identity verified* and *Sanctions screening* say **Needs entry**, and **Approve** is greyed out.
4. Click **Run identity and credit checks** (the card says **Simulated**): identity verified, sanctions clear,
   **credit score 720**. Every parameter is now **Met**.
5. Click **Approve**, then **Confirm: Approve**. The status becomes **Approved** and the history records who and when.

*Say:* "Nothing can be approved until identity and credit are checked. The documents and decision rules are
real; the credit bureau and ID match are simulated here with test data, and this is where a real provider plugs in."

### Step 9 — The borrower's view (30 s)

1. Back in Nisha's window, refresh and open the **Progress** tab. It starts with **"Your loan has been approved."**
2. Point out what is *not* there: no credit score, no internal notes, no reviewer reasoning.

*Say:* "The borrower gets the outcome. Scores and reasoning stay with the bank."

**Transition:** "That was the happy path. Now what happens when something is wrong?" — continue with
the scenarios below (Jordan Rivera, the small-business case, then Act 2).

**If something goes wrong in the opening**

- *Email already exists* — you did not reset since the last run. Reset, or use another email. Do not reuse
  Nisha's SSN digits and date of birth on a second account: the duplicate check will, correctly, stop it.
- *An upload fails or says extraction is unavailable* — say the extraction service is offline and switch to
  the pre-loaded **Priya Nair** (officer login); every later step still works.
- *Approve is greyed out* — the checks were not run yet. Click **Run identity and credit checks** first.

## Before you're on stage

1. Reset the demo data so it's clean: `npm run reset` (local) or hit
   `POST /admin/reset?secret=<SETUP_SECRET>` (Render — see [README](../README.md)).
2. If deployed on Render free tier, open `/health` ~5 minutes early to wake the backend.
3. Have `data/seed/documents/jordan-rivera-pay-stub.png` easy to reach on the machine
   you're demoing from (Downloads or Desktop) — you'll upload it live.
   For the opening also copy the three `nisha-rao-*.png` files from the same folder.
4. Two browser tabs (or one you'll log out/in on): one for the **officer**, one for the
   **borrower**. Logins: `officer@loanlens.demo` / `demo1234`, `borrower@loanlens.demo` / `demo1234`.
   For Act 2 also have `underwriter@loanlens.demo` / `demo1234` ready (the borrower logins are in
   the table in Act 2).

## The pitch (10s)

> "ThoughtFocus AI can already read a loan document. LoanLens makes it answer back —
> to the officer, to the borrower, and to the auditor."

## Beat 1 — Upload → Classify → Extract (45s)

1. Log in as **officer**. Land on **Loan Applications** — seven applications, synthetic data only.
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
4. Optionally upload the license or bank statement to show clean **Match** rows too. Every
   document card on the **Documents** tab also lists all of its checks (matches as well as
   flags) under "Verification checks", with a summary of fields extracted, checks run,
   matched and flagged — use it if the jury asks "what exactly do you check?".

## Beat 2.5 — Live self-service fix (30-40s) — the headline feature

This is the moment that answers "how is this actually faster, not just prettier."

1. Still in **Verification**, switch to the **Documents** tab. Point at the **Action
   needed** card at the top — it lists the same flagged item(s) in plain language,
   each with its own **Re-upload** button (or **Upload** for anything not yet received).
2. Tap **Re-upload** next to the flagged item (e.g. Business name, for the
   small-business scenario) and pick a corrected document — for a live demo, this can
   be the officer clicking it themselves; the button and flow are identical to what the
   borrower sees on their own login, there's no special officer-only path here.
3. Watch it resolve: the item disappears from **Action needed**, and if that was the
   *last* open item, the application's status pill flips itself from **Needs Review**
   back to normal — with no officer having to manually clear anything.
4. *"Today this loop is an email, a wait, and a re-check — often days. Here it's one
   click and it's instantly reflected for both sides, because officer and borrower are
   reading the exact same live list, not two separate views that drift apart."*
5. Optional curveball proof point: pick a deliberately wrong file type for the fix
   (e.g. a bank statement when a driver's license was requested) — it's caught
   immediately with a specific "wrong document type" message, not a silent failure the
   applicant only discovers days later.

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

## Act 2 — Identity, credit and the exception (about 4 minutes, optional)

Use this when there is time for a second pass, or when the jury asks *"how do you know the
person is who they say they are, and what about a low credit score?"* It is the answer to both.

**Say this first, before showing anything:**

> "The document checks and the decision rules you are about to see are real. The credit
> bureau, the SSN match and the sanctions screening are **simulated with test data**, because
> the real ones need contracts and the borrower's consent. Every simulated result is labelled
> *Simulated* on screen, and this is the one place a real provider plugs in."

**Setup:** run `npm run reset` (or the Render reset) so the seven borrowers and their documents
are loaded. Log in as the **loan officer**. For each borrower open the application, go to the
**Decision** tab and click **Run identity and credit checks** (until you do, every file shows
"Needs entry" and cannot be approved — point that out once: *"nothing is decided on an
unverified identity."*).

All logins use password `demo1234`.

| Order | Borrower (login) | What to do | What the jury sees | Line to say |
|---|---|---|---|---|
| 1 | **Priya Nair** (`priya.nair@example.demo`) | Run the checks | Identity verified, sanctions clear, score 742, every parameter **Met**, Approve enabled | "The happy path: everything is checked, nothing needs a human beyond the sign-off." |
| 2 | **Rohan Desai** (`rohan.desai@example.demo`) | Run the checks | Identity **Failed**, credit report **Skipped**, no referral possible | "His documents are perfect — but the SSN belongs to someone else. This is how a stolen or mistyped identity gets caught, and nobody can override it." |
| 3 | **Meera Iyer** (`meera.iyer@example.demo`) | Open **Action Needed** (no simulation) | Drivers License: **ID expiry** mismatch, Re-upload button | "A real document check: policy does not accept an expired ID, and the borrower is told exactly what to fix." |
| 4 | **Arjun Mehta** (`arjun.mehta@example.demo`) | Run the checks, then refer, then switch user | Score **598** against a 620 minimum: Approve is disabled, Refer is enabled | "A low score is not the end — but only a named senior role can approve outside the rules." |
| 5 | **Kavya Reddy** (`kavya.reddy@example.demo`) | Run the checks | Credit report **No history** (thin file); score stays "Needs entry"; no approve or refer | "No credit history means no score. The system refuses to invent one." |
| 6 | **Anil Kapoor** (`anil.kapoor@example.demo`) | Open **Decision** — *before* running anything | **No duplicate or reused identity: Not Met**, with a link to the earlier application (Priya Nair). Identity verification then fails too | "Same SSN digits and date of birth as an earlier applicant, under a different name. Caught from our own records, no bureau needed — and Priya's file is untouched." |
| 7 | **Lakshmi Pillai** (`lakshmi.pillai@example.demo`) | Run the checks; note the header "Visa holder (until 2028-06-30)" | Everything Met except **Residency status covers the loan term: Not Met** (visa ends 2028-06-30, loan runs to 2029-10). Officer can only refer | "We never verify citizenship — we ask one practical question: will your legal status last as long as the loan? If not, only an underwriter can approve, with a condition like proof of renewal." |

### The exception walk-through (Arjun, about 90 seconds)

1. As the **loan officer**, on Arjun's Decision tab, show Approve greyed out with the reason.
2. Choose **Refer to underwriter**. Fill in:
   - *Why does this borrower deserve an exception?* — for example: "Eight-year customer, never
     missed a payment, stable employer, savings on deposit."
   - *Who knows this borrower, and how?* — for example: "Known to the Springfield branch manager."
   Confirm. The status pill changes to **With Underwriter** and the documents lock.
3. Log out, log in as the **underwriter**. Open Arjun: the review history shows the referral,
   the justification and the relationship note.
4. Choose **Approve**. The screen states what is being waived (**Credit score**). Enter the
   **compensating factors**, optional **conditions** (for example "Autopay required"), confirm.
5. The page now shows **Approved as an exception**, with who decided, what was waived and why.
6. *Optional:* log in as Arjun (`arjun.mehta@example.demo`). He sees only **Approved** and the
   conditions — never the credit score, the internal reasoning or who vouched for him.

**Line to say:** *"Every exception is a named person's decision with a written reason and an
audit trail — and the things that are about fraud, like identity, can never be waived."*

### If the jury asks

- **"Is the credit score real?"** — No, it is a scripted test record. In production it comes from
  Equifax, Experian or TransUnion, with the borrower's consent.
- **"How do you catch the same person applying twice?"** — The SSN's last four digits plus the date of birth are compared across applications. Only the later file is flagged, so a real borrower is never blocked by someone copying their details. Production would compare a keyed hash of the full SSN.
- **"Why not check citizenship or Aadhaar-style government IDs?"** — The US has no single national ID.
  Lenders verify identity (a government photo ID plus the SSN) and apply product policy to
  residency; they do not verify citizenship against a government site. The same applies to
  employment: payroll providers or pay stubs, not a government register.
- **"What would it take to make it real?"** — A contract with a bureau or reseller, a consent and
  disclosure step, secure SSN storage, and an identity-verification vendor. See
  [docs/SIMULATED_VERIFICATION.md](SIMULATED_VERIFICATION.md).
- **"Who can approve an exception?"** — Only the underwriter role, only on files a loan officer
  referred, and only for credit score and affordability. See
  [docs/UNDERWRITER_EXCEPTION_WORKFLOW.md](UNDERWRITER_EXCEPTION_WORKFLOW.md).

## If something breaks

- **Extraction looks wrong / times out** — re-run `npm run reset`, retry the upload;
  don't debug live, move to the pre-verified Verification tab (data persists per
  applicant even without a fresh upload if you seeded a prior demo run).
- **Assistant gives an empty/odd answer** — ask one of the other suggestion chips;
  they're all covered in `data/seed/test-questions.md`.
- **Backend cold-started (Render free tier)** — this is why you open `/health` early;
  if it still happens, narrate the architecture while it wakes up.
- **Everything on the Decision tab says "Needs entry"** — the identity and credit checks have not
  been run yet. Click **Run identity and credit checks**.
- **A borrower shows no documents in Act 2** — the reset was not run; rerun `npm run reset` (it
  pre-loads documents for Priya, Arjun, Rohan, Meera and Kavya).
- **The Run button or Approve is missing** — you are logged in as the wrong role or the file is
  with the other role (a referred file is the underwriter's until they decide or return it).

## Grounding refusal to show off (if there's time / a curveball question)

Ask the assistant *"What interest rate will I get?"* — it should refuse and point to
an officer instead of quoting a number. Good proof point for the "never invents
policy" rule in [data/seed/test-questions.md](../data/seed/test-questions.md).
