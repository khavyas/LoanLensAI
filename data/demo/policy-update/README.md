# Policy update demo: change a document, get a different answer

This shows what RAG gives that a fixed model cannot: the assistant answers from whatever the bank's documents say today. Change the document, upload it again, and the same question gets a different answer, with no retraining and no code change. (Tracker scenarios D01 to D03.)

All files are synthetic.

## Files

| File | What it is |
| --- | --- |
| `v1/demo-grace-period.md` | A new late-payment policy. Says the grace period is **10 days**. |
| `v2/demo-grace-period.md` | The same file with one sentence changed: the grace period is **15 days**. |
| `edit-existing/auto-loan-requirements.md` | The real auto loan policy with one sentence changed: decision in **5** business days instead of 2. |

**The file name must stay exactly the same when you upload a new version.** The system identifies a document by its file name, so the same name replaces the old text and removes the old chunks. `v1` and `v2` are in separate folders for that reason.

## Demo A: a new rule appears (about 3 minutes)

The bank has no late-payment policy yet, so the assistant has nothing to answer from.

1. Sign in as the borrower (Jordan) and ask: **What is the late payment grace period?**
   Expected: it says it could not find that in the approved policies.
2. Sign in as the administrator (login page, "Administrator sign in"), open the policy console, upload `v1/demo-grace-period.md`.
   Expected: the console lists the file with **4 chunks**.
3. Back as Jordan, ask the same question.
   Expected: **10 days**, with a source chip naming `demo-grace-period.md`.
4. As administrator, upload `v2/demo-grace-period.md` (same file name, now 15 days). The chunk count stays 4.
5. As Jordan, ask the same question again.
   Expected: **15 days**. No trace of 10.
6. Optional second question that shows the change has consequences: **Is there a late fee if I pay 12 days after the due date?**
   Before step 4 (10-day version): yes, a $25 late fee. After step 4 (15-day version): no fee, because 12 days is inside the grace period.

If you have the Chroma Cloud dashboard open in another tab, refresh it after steps 2 and 4: the records carry `sourceFile: demo-grace-period.md`, and after step 4 the old text is gone.

## Demo B: change a rule that already exists (about 2 minutes)

1. As Jordan ask: **How long until a decision?** Expected: **2 business days**.
2. As administrator upload `edit-existing/auto-loan-requirements.md` (keep the file name).
3. As Jordan ask the same question. Expected: **5 business days**.
4. Put it back: upload the original `data/policies/auto-loan-requirements.md`, or open `/admin/ingest-chroma?secret=...`, which reloads all eight real policies.

## Clean-up (D03)

In the policy console delete `demo-grace-period.md`, then ask the late-payment question again: it says it could not find it. Records for that file also disappear from Chroma.

## What to say

- "Same question, same assistant, different answer, because the document changed. We did not retrain anything or touch the code."
- "Every answer shows its source, so the officer can see which document and which version it came from."
- "Deleting the document removes the knowledge. The assistant does not remember it."

## If something looks wrong

- **Step 1 gives an answer instead of "could not find":** the file is already uploaded from an earlier rehearsal. Delete `demo-grace-period.md` in the console and ask again.
- **After uploading, the old answer appears:** check the file name is exactly `demo-grace-period.md` (a browser may have renamed a download to `demo-grace-period (1).md`), and that the console shows the new chunk text.
- **The assistant says it cannot find it right after uploading:** wait a few seconds and ask again; indexing finishes within seconds.
