# Demo files

Synthetic files to upload live. Regenerate with `python data/demo/generate_demo_files.py` (needs Pillow and reportlab).

| File | Use | Expected |
|---|---|---|
| `data/seed/documents/meera-iyer-drivers-license.png` | The seeded, **expired** licence (04/30/2026) | Meera's application shows "Action needed" |
| `meera-iyer-renewed-drivers-license.png` | The **renewed** licence (05/02/2026 to 04/30/2031) | Upload to replace the expired one (scenario L08) |
| `jordan-rivera-long-bank-statement.pdf` | 29-page statement with a text layer | Largest deposit is $6,250.00 on page 16 (answer key in the `.truth.json`) |

Other seeded documents for every demo applicant are in `data/seed/documents/` (pay stub, licence, bank statement per person).
