# Policy update demo: change a document, get a different answer

This shows what RAG gives that a fixed model cannot: the assistant answers from whatever the bank's documents say today. Change the document, upload it again, and the same question gets a different answer, with no retraining and no code change. (Tracker scenarios D01 to D03.) All files are synthetic.

## Files

| File | What it is |
| --- | --- |
| `v1/demo-grace-period.md` | A new late-payment policy. Says the grace period is **10 days**. |
| `v2/demo-grace-period.md` | The same file with one sentence changed: the grace period is **15 days**. |

**Both files have the same name on purpose.** The system identifies a document by its file name, so uploading `v2` replaces `v1` and removes the old text. Keep them in their separate folders and never rename them.

## Who does what, in order

The administrator already has the bank's eight real policies in the policy console. None of them covers late payments, so the assistant has nothing to answer a late-payment question from. That is the starting point.

| # | Who | What they do | What happens |
| --- | --- | --- | --- |
| 1 | **Jordan** (borrower@loanlens.demo) | Asks: **What is the grace period for late payments?** | It says it could not find that in the approved policies. |
| 2 | **Administrator** (admin@loanlens.demo, from "Administrator sign in") | Uploads **v1** `demo-grace-period.md` in the policy console. | The console lists the file with 4 chunks. |
| 3 | **Jordan** | Asks the same question as step 1 again. | **10 days**, with a source chip naming `demo-grace-period.md`. |
| 4 | **Jordan** | Asks: **How many days can I be late without a fee?** | **10 days**, and a $25 fee after that. |
| 5 | **Administrator** | Uploads **v2** `demo-grace-period.md` (same name, now 15 days). | Still 4 chunks; the old text is replaced. |
| 6 | **Jordan** | Asks the question from step 1 again: **What is the grace period for late payments?** | **15 days**. No trace of 10. |
| 7 | **Jordan** | Asks the question from step 4 again: **How many days can I be late without a fee?** | **15 days**, and a $25 fee after that. |
| 8 | **Administrator** | Deletes `demo-grace-period.md` in the console. | The file disappears from the list. |
| 9 | **Jordan** | Asks the grace-period question once more. | It could not find that again. |

Upload **v1** at step 2, after Jordan has seen "could not find". Upload **v2** at step 5, after Jordan has seen the 10-day answer and the $25 fee. Steps 8 and 9 are the clean-up and are optional.

If the Chroma Cloud dashboard is open in another tab, refresh it after steps 2, 5 and 8: the records carry `sourceFile: demo-grace-period.md`, the text changes from 10 to 15 days after step 5, and the records are gone after step 8.

## What to say

- "Same question, same assistant, different answer, because the document changed. We did not retrain anything or touch the code."
- "Every answer shows its source, so the officer can see which document it came from."
- "Deleting the document removes the knowledge. The assistant does not remember it."

## If something looks wrong

- **Step 1 gives an answer instead of "could not find":** the file is already uploaded from an earlier rehearsal. Delete `demo-grace-period.md` in the console and ask again.
- **After uploading v2, the old answer appears:** check the file name is exactly `demo-grace-period.md` (a download may have been renamed to `demo-grace-period (1).md`), and that the console shows the new text.
- **It says it cannot find it right after uploading:** wait a few seconds and ask again.
