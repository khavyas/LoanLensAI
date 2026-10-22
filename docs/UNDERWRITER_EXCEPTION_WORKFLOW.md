# Underwriter Exception Workflow

Added 2026-10-22. A bank-side role that can approve a loan that misses the bank's parameters
(for example a low credit score) when a loan officer refers it with a justification — the
"person who knows the borrower vouches for them" case.

## Why it was needed

Before this change the app had **no decision step at all**: nothing set an application to
`approved` or `rejected`. This adds the decision pipeline and, on top of it, the exception path.

## Roles

| Role | Can do |
|---|---|
| Borrower | Apply, upload documents, see the outcome and plain-language reasons or conditions |
| Loan officer | Enter the credit score; **approve** (only if every parameter is met), **decline** (with reasons), or **refer** to an underwriter |
| Underwriter (new) | On referred files only: **approve** (may waive waivable parameters with a written justification), **decline**, or **return** to the officer. Read-only on documents |
| Admin | Manages policy documents only |

The underwriter cannot self-register; `underwriter@loanlens.demo` is created by the seed script
and the admin reset route. Password for all demo accounts is in the login screen.

## Flow

```
Submitted -> documents + automated checks -> Loan officer review
   |- all parameters met ..................... officer approves  -> Approved
   |- only waivable parameters short ......... officer refers    -> With Underwriter
   |       |- underwriter approves (exception) -> Approved
   |       |- underwriter declines ............ -> Rejected
   |       '- underwriter returns ............. -> back to loan officer
   '- officer declines ........................ -> Rejected
```

## The parameters (`services/decisionRules.js`)

| Parameter | Waivable by underwriter? |
|---|---|
| Required documents all received | No |
| Identity and entity consistency (name, SSN, document type, ownership %, business name) | No |
| Stated income matches documents | No |
| Credit score at or above the product minimum | **Yes** (a missing score blocks everything until entered) |
| Requested amount within the affordability estimate | **Yes** |

Non-waivable items are compliance and fraud guardrails: an exception is for "the numbers are
short but the borrower is sound", never for "the documents disagree about who the borrower is".

**Demo defaults to confirm:** minimum scores are 620 (auto), 660 (personal), 680 (business) in
`config/underwriting.js`. No policy document states them yet — replace with the bank's real
cut-offs, and add the "Credit Checks & Credit Score Policy" document
(see `POLICY_COVERAGE_AND_QUESTIONS.md`).

## Guardrails enforced on the server

- Officer cannot approve while a parameter is unmet; underwriter cannot approve past a non-waivable one.
- A referral needs a real justification (20+ characters); an exception needs compensating factors
  and must name every waived parameter; a decline needs stated reasons (these go to the borrower).
- Only whoever holds the file can change the credit score (officer before referral, underwriter after).
- Documents are locked (no upload or delete) while a file is referred or decided.
- A decided application cannot be changed.
- Every action is appended to `reviewHistory` (who, role, when, note, details).
- Borrowers never receive the credit score, the audit trail, the exception rationale or the
  relationship note — only `decisionNotice` (outcome, reasons or conditions).

## Where it lives

- Backend: `config/roles.js`, `config/underwriting.js`, `services/decisionRules.js`,
  `routes/decisions.js` (`PUT /applications/:id/credit-score`, `POST /applications/:id/decision`),
  fields on `models/Application.js` (`creditProfile`, `decision`, `reviewHistory`, status `referred`).
- Frontend: staff-only **Decision** page at `/applications/:id/decision`, "With Underwriter" status,
  Underwriter Portal heading, chat questions for staff ("Why was this referred?").
- Tests: `backend/test/decisions/` (21 tests).

## US compliance notes (template wording, not legal advice)

- The decline notice includes generic Equal Credit Opportunity Act wording. Have compliance review
  it; a real adverse-action notice also needs the creditor's details, the credit-bureau disclosure
  when a report was used, and delivery within the regulatory deadline.
- If the exception relies on another person's income or liability, that person is a **co-signer or
  guarantor** — a different, borrower-side role that is not built (see tracker section 14).

## Not built yet

- Email/notification when a file is referred or decided.
- Credit-bureau pull (the score is entered by hand).
- A queue view for underwriters (they currently see all applications; referred ones show "With Underwriter").
- Per-underwriter approval limits (for example loan amount above which a second approver is needed).
- Re-opening a decided application (appeals).
