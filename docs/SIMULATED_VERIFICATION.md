# Simulated Identity and Credit Verification

Added 2026-10-24. Scoped for the jury demo: it shows *what the system does* with identity and
credit results, while being honest that the bureau and ID network are simulated.

## Duplicate identity and residency (added 2026-10-24, not simulated)

Both run on your own data, so both are real:

- **Duplicate identity** (`services/duplicateCheck.js`): an application is flagged when an *earlier* one has the same SSN
  last-4 **and** date of birth under a different name (possible identity reuse), or when the same person has another
  *open* application (policy: one at a time). Only the later application is flagged. Never waivable.
  The key is a proxy: last-4 + date of birth. Production should compare a keyed hash of the full SSN (tracker task).
- **Residency** (`services/residency.js`): the applicant declares U.S. citizen, permanent resident or visa holder (with the
  visa expiry date). Citizens and permanent residents meet the rule; a visa holder meets it only if the visa outlasts the
  loan term. Otherwise an underwriter may waive it with a condition. We never verify citizenship against a government site.
- Policy text: `data/policies/residency-and-identity-policy.md`. It must be ingested into the policy store
  (`npm run ingest`, or `/admin/ingest-chroma`) before the assistant can quote it.

## What is real and what is simulated

| Real (works on any upload) | Simulated (scripted test data) |
|---|---|
| Driver's licence **expiry** check | **SSN / name / date-of-birth match** against "records" |
| Licence **date of birth** vs the application | **Sanctions screening** |
| Licence **address** vs the application (a mismatch is only a warning: people move) | **Credit report and score** |
| Name, income, employer, cross-document checks (existing) | |

Everything simulated is labelled **Simulated** on screen and in the audit trail
(`verification-run`). A real provider replaces `runSimulatedChecks()` in
`backend/src/services/simulatedBureau.js` — one call — and nothing else changes.

## How a loan officer uses it

Decision page → **Identity and credit checks** → *Run identity and credit checks*. Until the checks have
been run, nothing can be approved or referred (the identity, sanctions and credit parameters read
"Needs entry"). The credit score from the check feeds the existing exception workflow
(`UNDERWRITER_EXCEPTION_WORKFLOW.md`); a score can still be typed in by hand when none is returned.

## The seven jury stories (password `demo1234`; run `npm run reset` first)

| Borrower | Login | What the jury sees |
|---|---|---|
| **Priya Nair** — clean | `priya.nair@example.demo` | Documents and bureau all pass, score 742. The loan officer can approve. |
| **Arjun Mehta** — low score | `arjun.mehta@example.demo` | Score 598 against a 620 minimum. Officer cannot approve, refers; underwriter approves as an exception. |
| **Rohan Desai** — SSN mismatch | `rohan.desai@example.demo` | Documents look fine, but the SSN is on file for a different person: identity **fails**, credit is skipped, and no one can waive it. |
| **Meera Iyer** — expired ID | `meera.iyer@example.demo` | Her licence expired 04/30/2026: rejected as a document, shown in Action Needed with a Re-upload button. Real check, not simulated. |
| **Kavya Reddy** — no credit history | `kavya.reddy@example.demo` | Documents fine, but a "thin file": no score exists, so the file needs manual review (enter a score by hand, or decline). |
| **Anil Kapoor** — reused identity | `anil.kapoor@example.demo` | Same SSN last-4 and date of birth as Priya Nair, under a different name. The **duplicate-identity** check stops his file *before any bureau call* and links to the earlier record; the bureau then also says the SSN is Priya's. Priya's own file is unaffected. Cannot be waived. |
| **Lakshmi Pillai** — visa ends before the loan | `lakshmi.pillai@example.demo` | Everything clean (score 730), but her visa runs to 2028-06-30 and a 36-month loan runs to 2029-10. **Residency** is Not Met, so the officer cannot approve; the underwriter can approve with a condition such as proof of renewal. |

Also seeded: Jordan Rivera (income mismatch) and Dana Whitfield (business loan) as plain clean bureau
records. Any other SSN (for example a teammate's new account) behaves like a clean borrower and is
labelled "no scripted test record".

Test-only records (not seeded): last-4 `0911` = name resembles a sanctions-list entry,
`0912` = credit freeze. They are used in the unit tests.

## Suggested demo order

1. Priya: run the checks, approve. (The happy path.)
2. Rohan: run the checks, show the identity failure. (The system catches a stolen or mistyped identity.)
3. Meera: Action Needed shows the expired ID. (A real document check.)
4. Arjun: run the checks, refer with a reason, switch to the underwriter, approve as an exception.
5. Kavya: run the checks, show "no history". (The system refuses to guess.)

## What to say when asked "is this real?"

"The document checks and the decision rules are real. The credit bureau, the SSN match and the
sanctions screening are simulated with test data, because they need contracts and consent. This is
the exact point where each real provider plugs in."

## How production would differ

| Check | Production provider (needs contract) |
|---|---|
| Credit report and score | Equifax, Experian or TransUnion, directly or via a reseller; needs the borrower's written consent and an FCRA permissible purpose |
| SSN / identity match | An identity-verification network, or the Social Security Administration's consent-based service for approved companies |
| Sanctions | The US Treasury OFAC list (free to download) or a screening vendor |
| Employment / income | A payroll data provider, or pay stubs and W-2s as today |

## Files

- Data: `backend/src/config/testPersonas.js` (the scripted records, keyed by SSN last-4)
- Provider: `backend/src/services/simulatedBureau.js`; route `POST /applications/:id/verify`
- Document checks: `backend/src/services/verification.js` (ID expiry, date of birth, address)
- Assessment: `backend/src/services/decisionRules.js` (identity-verification, sanctions, credit-score)
- Seed: `backend/src/services/seedData.js`; documents from `data/seed/generate_persona_documents.py`
- Duplicates and residency: `services/duplicateCheck.js`, `services/residency.js`
- Tests: `backend/test/simulated/personas.test.js`, `backend/test/simulated/residencyAndDuplicates.test.js`

## Not built

ID photo-and-selfie check, address deliverability (USPS), employment verification through a payroll
provider, and storing the full SSN securely (needed to replace the last-4 + date-of-birth duplicate key).
