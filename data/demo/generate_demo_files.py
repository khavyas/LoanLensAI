"""
Files to upload during the demo (synthetic, no real data). Run: python data/demo/generate_demo_files.py

  meera-iyer-renewed-drivers-license.png
      Meera Iyer's licence after renewal: same person and number, expires 04/30/2031. The seeded licence
      (data/seed/documents/meera-iyer-drivers-license.png) expired on 04/30/2026, which is the planted problem.
      Scenario L08: delete or replace the old one, upload this, ask "When does my driver license expire?".

  jordan-rivera-long-bank-statement.pdf  (+ .truth.json)
      A 28-page bank statement with a real text layer for Jordan Rivera. One deposit is clearly the largest
      (a one-off bonus), on a known page, so "What is the largest deposit and on which page?" has one answer.
"""
import importlib.util
import json
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def renewed_license():
    sys.path.insert(0, os.path.join(ROOT, "data", "seed"))  # generate_persona_documents imports its sibling
    persona = load("persona_docs", os.path.join(ROOT, "data", "seed", "generate_persona_documents.py"))
    persona.OUT_DIR = HERE
    meera = next(p for p in persona.PERSONAS if p["slug"] == "meera-iyer") if hasattr(persona, "PERSONAS") else None
    if meera is None:
        raise SystemExit("could not find the persona list in generate_persona_documents.py")
    renewed = dict(meera, slug="meera-iyer-renewed", issued="05/02/2026", expires="04/30/2031")
    persona.drivers_license(renewed)
    print("wrote meera-iyer-renewed-drivers-license.png")


def long_statement():
    stm = load("statements", os.path.join(ROOT, "data", "bench", "statements", "generate_statements.py"))
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    txns = stm.build_transactions(seed=21, target=190)
    bonus = (date(2026, 7, 17), "ACME CORP ANNUAL BONUS DIRECT DEP", 6250.00)
    txns.append(bonus)
    txns.sort(key=lambda t: (t[0], t[1]))

    per_page = 7
    start = 2140.55
    bal = start
    rows = []
    for d, desc, amt in txns:
        bal = round(bal + amt, 2)
        rows.append((d, desc, amt, bal))
    credits = round(sum(a for _, _, a, _ in rows if a > 0), 2)
    debits = round(-sum(a for _, _, a, _ in rows if a < 0), 2)
    pages = [rows[i:i + per_page] for i in range(0, len(rows), per_page)]
    total_pages = len(pages) + 1  # page 1 is the account summary

    path = os.path.join(HERE, "jordan-rivera-long-bank-statement.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    period = "01/01/2026 - 12/31/2026"
    stm.header(c, "Layout A", 1, total_pages, period)
    c.setFont("Helvetica", 10)
    y = 690
    for label, val in [("Beginning Balance", start), ("Total Deposits", credits), ("Total Withdrawals", debits), ("Ending Balance", rows[-1][3])]:
        c.drawString(40, y, f"{label}  ${stm.money(val)}")
        y -= 16
    c.showPage()

    bonus_page = None
    for n, chunk in enumerate(pages, start=2):
        stm.header(c, "Layout A", n, total_pages, period)
        c.setFont("Helvetica", 9)
        y = 690
        for d, desc, amt, balance in chunk:
            if desc == bonus[1]:
                bonus_page = n
            c.drawString(40, y, d.strftime("%m/%d/%Y"))
            c.drawString(120, y, desc)
            c.drawRightString(470, y, ("+$" if amt > 0 else "-$") + stm.money(abs(amt)))
            c.drawRightString(560, y, f"${stm.money(balance)}" if balance >= 0 else f"-${stm.money(-balance)}")
            y -= 18
        y -= 20
        c.setFont("Helvetica", 8)
        for line in stm.DISCLOSURE:
            c.drawString(40, y, line)
            y -= 11
        c.showPage()
    c.save()

    # The largest deposit must be unique, otherwise the question has no single answer.
    deposits = sorted((a for _, _, a, _ in rows if a > 0), reverse=True)
    assert deposits[0] == 6250.00 and deposits[1] < 6250.00, "largest deposit is not unique"
    truth = {
        "file": "jordan-rivera-long-bank-statement.pdf",
        "pages": total_pages,
        "transactions": len(rows),
        "largestDeposit": 6250.00,
        "largestDepositDescription": bonus[1],
        "largestDepositDate": bonus[0].strftime("%m/%d/%Y"),
        "largestDepositPage": bonus_page,
        "totalDeposits": credits,
        "totalWithdrawals": debits,
        "endingBalance": rows[-1][3],
    }
    with open(os.path.join(HERE, "jordan-rivera-long-bank-statement.truth.json"), "w") as f:
        json.dump(truth, f, indent=2)
    print(json.dumps(truth, indent=2))


NULLS = {k: None for k in (
    "employerName", "grossMonthlyIncome", "payPeriod", "address", "ssnLast4", "documentDate", "businessName", "ein",
    "annualBusinessRevenue", "ownershipPercent", "netPay", "recentDepositAmount", "recentDepositSource", "grossPayPeriod",
    "socialSecurityWithheld", "medicareWithheld", "ytdGrossPay", "payPeriodNumber")}


def write_fixtures():
    """What a reader of these two files would extract. The backend uses this when no extraction AI is available
    (MOCK_AI, or a failed provider call), keyed by file name exactly like the seeded documents, so the demo
    files are recognised instead of coming back as 'Unknown, 30%'."""
    license_fields = dict(NULLS, fullName="Meera Iyer", address="9 Willow Court, Springfield", dateOfBirth="09/21/1990",
                          licenseNumber="SP-415509-M", licenseExpiry="04/30/2031")
    license_fx = {"docType": "drivers-license", "confidence": 0.97, "fields": license_fields}
    statement_fx = {
        "docType": "bank-statement", "confidence": 0.93,
        "fields": dict(NULLS, fullName="Jordan Rivera", documentDate="12/31/2026", recentDepositAmount=1480.02,
                       recentDepositSource="Brightline Logistics - Direct Deposit"),
    }
    fixtures = {
        "meera-iyer-renewed-drivers-license": license_fx,
        "meera-iyer-drivers-license-renewed": license_fx,
        "jordan-rivera-long-bank-statement": statement_fx,
    }
    with open(os.path.join(HERE, "demo-fixtures.json"), "w") as f:
        json.dump(fixtures, f, indent=2)
    print("wrote demo-fixtures.json")


if __name__ == "__main__":
    renewed_license()
    long_statement()
    write_fixtures()
