# Synthetic pay-stub extraction benchmark

25 fictional pay stubs (21 PNG + 4 PDF) used to measure how accurately the vision-LLM extractor
(`classifyAndExtractGroq`) reads pay stubs from many different employers and payroll providers. All people and
companies are made up. Ground truth is in `ground_truth.json` (keyed by file name).

- `paystub_01..21.png` - images, `paystub_22..25.pdf` - PDFs with a real text layer (reportlab).
- 3 files are **tampered** copies (11, 17, 24): gross pay raised 25-40%, Social Security / Medicare / YTD left
  alone. They are excluded from the accuracy score and reported separately (for the later verification test).

## How the layouts differ

10 layout families, each drawn with different structure (not recolours): `classic_table` (YTD column beside Current),
`two_column` (earnings left / deductions right), `dashboard_boxes` (KPI cards, separate YTD card),
`dense_bureau` (tiny print, many boxes, taxable-wage block), `check_stub_bottom` (mock paycheck over a stub),
`minimal_modern` (big net figure, separate YTD block), `dot_matrix_mono` (Courier on green-bar paper),
`landscape_wide` (landscape, three columns), `sidebar_ytd_summary` (YTD summary sidebar), `serif_logo_corner`
(serif, logo top-right, employer address bottom-left).

Also varied: weekly / biweekly / semi-monthly / monthly; hourly, salaried, overtime and bonus lines; label wording
(gross: Gross Pay / Total Earnings / Gross Wages / Total Gross / Earnings Total; net: Net Pay / Take Home / Net Amount /
Check Amount; Soc Sec / OASDI / FICA-SS / FED FICA SS; Medicare / FICA-Med / Med Tax); date styles (MM/DD/YYYY,
ISO, "Mar 1, 2026"); SSN and address on only some stubs; YTD on 15, "Period N of M" on 8.
Special cases (see `meta` in the ground truth):

- 3 stubs print one combined `FICA` line (`combined_fica: true`, SS and Medicare truth = null).
- 4 stubs have a Section 125 pre-tax health premium, so SS/Medicare are 6.2% / 1.45% of (gross - premium).
- 6 stubs are scan/photo degraded (rotation 0.5-2 deg, noise, blur, JPEG artefacts, paper tint); 3 are ~600px wide.
- `meta.audit` holds the true earnings/deduction lines so arithmetic can be re-checked independently.

## Run the benchmark

```
cd backend
node src/scripts/benchExtraction.js            # live, needs GROQ_API_KEY (backend/.env or environment)
node src/scripts/benchExtraction.js --dry-run  # no API: feeds ground truth through the scorer (expect 100%)
```

Options: `--fake-errors` (with `--dry-run`, injects failures/hallucinations to exercise reporting), `--limit=N`,
`--only=paystub_01.png,paystub_02.png`; env `BENCH_DELAY_MS` (default 2500), `BENCH_RETRY_BASE_MS` (default 8000).
Any result not tagged `extractionSource:'live'` (the extractor silently falls back to mock data on errors) counts as a
failed call, not as an extraction. Output: console table plus `results_<timestamp>.json` / `.md` here
(`results_dryrun_...` for dry runs).

Scorer unit tests: `cd backend && node --test test/bench/*.test.js`
(on Node 24 the bare directory form `node --test test/bench/` is not accepted; use the glob).

## Regenerate

```
python data/bench/paystubs/generate_paystubs.py
```

Deterministic (fixed seed): re-running reproduces identical files and ground truth. Needs Pillow, numpy, reportlab;
Windows fonts (arial, calibri, verdana, tahoma, georgia, times, cour) are loaded by name.
