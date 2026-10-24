"""
Generates the documents for the three *identity / credit test borrowers* used to
demo the simulated verification (see docs/SIMULATED_VERIFICATION.md):

  Rohan Desai  - documents are clean, but his SSN belongs to a different
                 person in the simulated bureau  -> identity fails.
  Meera Iyer   - everything checks out except her driver's license EXPIRED
                 on 04/30/2026                    -> rejected document.
  Kavya Reddy  - a recent graduate: documents are clean, but the simulated
                 bureau has no credit history     -> thin file, manual review.

Each borrower gets a pay stub, driver's license and bank statement. The same
script writes data/seed/persona-fixtures.json: what a reader of each image
would extract (used by MOCK_AI mode and by the seed script), so the fixtures
can never drift from the pictures.

These are NOT real documents or real people.

Run: python data/seed/generate_persona_documents.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw

from generate_documents import ACCENT, INK, LINE, MUTED, OUT_DIR, WHITE, font, hline, kv_row

PERSONAS = [
    {
        "slug": "rohan-desai",
        "name": "Rohan Desai",
        "employer": "Northgate Logistics",
        "employer_addr": "500 North Street, Springfield",
        "address": "23 Orchard Lane, Springfield",
        "dob": "03/14/1988",
        "license_no": "SP-338120-R",
        "issued": "06/10/2023",
        "expires": "03/14/2031",
        "monthly": 6000.00,
        "ssn_last4": "7301",
    },
    {
        "slug": "meera-iyer",
        "name": "Meera Iyer",
        "employer": "Brookfield Dental Group",
        "employer_addr": "12 Brookfield Road, Springfield",
        "address": "9 Willow Court, Springfield",
        "dob": "09/21/1990",
        "license_no": "SP-415509-M",
        "issued": "05/02/2019",
        "expires": "04/30/2026",  # expired — the planted problem
        "monthly": 5400.00,
        "ssn_last4": "2218",
    },
    {
        "slug": "kavya-reddy",
        "name": "Kavya Reddy",
        "employer": "Greenleaf Pharmacy",
        "employer_addr": "75 Greenleaf Plaza, Springfield",
        "address": "61 Sunrise Avenue, Springfield",
        "dob": "07/09/2003",
        "license_no": "SP-557731-K",
        "issued": "08/01/2021",
        "expires": "07/09/2029",
        "monthly": 3200.00,
        "ssn_last4": "4410",
    },
]

NULL_FIELDS = {
    "fullName": None, "employerName": None, "grossMonthlyIncome": None, "payPeriod": None,
    "address": None, "ssnLast4": None, "documentDate": None, "businessName": None, "ein": None,
    "annualBusinessRevenue": None, "ownershipPercent": None, "netPay": None,
    "recentDepositAmount": None, "recentDepositSource": None, "grossPayPeriod": None,
    "socialSecurityWithheld": None, "medicareWithheld": None, "ytdGrossPay": None,
    "payPeriodNumber": None, "dateOfBirth": None, "licenseNumber": None, "licenseExpiry": None,
}


def money(n):
    return f"${n:,.2f}"


def pay_figures(monthly):
    gross = round(monthly * 12 / 26, 2)
    ss = round(gross * 0.062, 2)
    med = round(gross * 0.0145, 2)
    fed = round(gross * 0.14, 2)
    state = round(gross * 0.05, 2)
    net = round(gross - ss - med - fed - state, 2)
    return {"gross": gross, "ss": ss, "med": med, "fed": fed, "state": state,
            "net": net, "ytd": round(gross * 16, 2)}


def pay_stub(p):
    f = pay_figures(p["monthly"])
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 90], fill=ACCENT)
    d.text((40, 24), p["employer"].upper(), font=font(26, bold=True), fill=WHITE)
    d.text((40, 58), p["employer_addr"], font=font(13), fill=(200, 210, 225))
    d.text((W - 260, 32), "EARNINGS STATEMENT", font=font(16, bold=True), fill=WHITE)

    y = 130
    kv_row(d, 40, y, "Employee Name", p["name"])
    kv_row(d, 440, y, "Employee ID", "EM-" + p["ssn_last4"])
    y += 60
    kv_row(d, 40, y, "Pay Period", "07/28/2026 - 08/10/2026")
    kv_row(d, 440, y, "Pay Date", "08/14/2026")
    y += 60
    kv_row(d, 40, y, "Home Address", p["address"])
    y += 60
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "EARNINGS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for x, t in ((40, "Description"), (420, "Rate"), (560, "Hours"), (680, "Amount")):
        d.text((x, y), t, font=font(12), fill=MUTED)
    y += 26
    hline(d, 40, y, W - 40)
    y += 16
    d.text((40, y), "Regular", font=font(14), fill=INK)
    d.text((420, y), f"${f['gross'] / 80:,.2f} / hr", font=font(14), fill=INK)
    d.text((560, y), "80.0", font=font(14), fill=INK)
    d.text((680, y), money(f["gross"]), font=font(14, bold=True), fill=INK)
    y += 50
    hline(d, 40, y, W - 40)
    y += 20
    d.text((40, y), "GROSS PAY (this period)", font=font(14, bold=True), fill=ACCENT)
    d.text((680, y), money(f["gross"]), font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "Gross monthly income (biweekly x 26 / 12)", font=font(12), fill=MUTED)
    d.text((680, y), money(p["monthly"]), font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "YTD Gross Pay (Period 16 of 26)", font=font(12), fill=MUTED)
    d.text((680, y), money(f["ytd"]), font=font(15, bold=True), fill=INK)
    y += 46
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "DEDUCTIONS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in (("Federal Tax", f["fed"]), ("State Tax", f["state"]),
                       ("Social Security", f["ss"]), ("Medicare", f["med"])):
        d.text((40, y), label, font=font(13), fill=INK)
        d.text((680, y), money(amt), font=font(13), fill=INK)
        y += 26
    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "NET PAY", font=font(15, bold=True), fill=ACCENT)
    d.text((680, y), money(f["net"]), font=font(17, bold=True), fill=ACCENT)
    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, f"{p['slug']}-pay-stub.png"))

    fields = dict(NULL_FIELDS)
    fields.update({
        "fullName": p["name"], "employerName": p["employer"], "grossMonthlyIncome": p["monthly"],
        "payPeriod": "bi-weekly (07/28/2026 - 08/10/2026)", "address": p["address"],
        "documentDate": "08/14/2026", "netPay": f["net"], "grossPayPeriod": f["gross"],
        "socialSecurityWithheld": f["ss"], "medicareWithheld": f["med"],
        "ytdGrossPay": f["ytd"], "payPeriodNumber": 16,
    })
    return {"docType": "pay-stub", "confidence": 0.95, "fields": fields}


def drivers_license(p):
    W, H = 900, 560
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=24, outline=LINE, width=3)
    d.rounded_rectangle([0, 0, W - 1, 110], radius=24, fill=ACCENT)
    d.rectangle([0, 60, W, 110], fill=ACCENT)
    d.text((36, 26), "STATE OF SPRINGFIELD", font=font(24, bold=True), fill=WHITE)
    d.text((36, 60), "DRIVER LICENSE", font=font(15), fill=(200, 210, 225))
    d.text((W - 180, 40), "CLASS D", font=font(18, bold=True), fill=WHITE)
    d.rounded_rectangle([36, 140, 236, 400], radius=10, outline=LINE, width=2, fill=(240, 243, 247))
    d.text((70, 250), "PHOTO", font=font(16), fill=MUTED)

    x, y = 270, 150
    kv_row(d, x, y, "License No.", p["license_no"])
    y += 60
    kv_row(d, x, y, "Full Name", p["name"])
    y += 60
    kv_row(d, x, y, "Address", p["address"])
    y += 60
    kv_row(d, x, y, "Date of Birth", p["dob"])
    kv_row(d, x + 300, y, "Sex", "M" if p["slug"].startswith("rohan") else "F")
    y += 60
    kv_row(d, x, y, "Issue Date", p["issued"])
    kv_row(d, x + 300, y, "Expires", p["expires"])
    d.text((36, H - 40), "Synthetic document — demo purposes only.", font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, f"{p['slug']}-drivers-license.png"))

    fields = dict(NULL_FIELDS)
    fields.update({
        "fullName": p["name"], "address": p["address"], "dateOfBirth": p["dob"],
        "licenseNumber": p["license_no"], "licenseExpiry": p["expires"],
    })
    return {"docType": "drivers-license", "confidence": 0.97, "fields": fields}


def bank_statement(p):
    f = pay_figures(p["monthly"])
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.text((40, 36), "FIRST COMMUNITY BANK", font=font(22, bold=True), fill=ACCENT)
    d.text((40, 68), "Monthly Account Statement", font=font(14), fill=MUTED)
    y = 120
    kv_row(d, 40, y, "Account Holder", p["name"])
    kv_row(d, 440, y, "Account Number", "****" + p["ssn_last4"])
    y += 60
    kv_row(d, 40, y, "Statement Period", "07/01/2026 - 07/31/2026")
    kv_row(d, 440, y, "Account Type", "Checking")
    y += 50
    hline(d, 40, y, W - 40)
    y += 24
    deposits = round(f["net"] * 2, 2)
    begin = 3120.40
    withdrawals = round(deposits * 0.82, 2)
    ending = round(begin + deposits - withdrawals, 2)
    d.text((40, y), "ACCOUNT SUMMARY", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in (("Beginning Balance", begin), ("Total Deposits", deposits),
                       ("Total Withdrawals", withdrawals), ("Ending Balance", ending)):
        d.text((40, y), label, font=font(14), fill=INK)
        d.text((680, y), money(amt), font=font(14, bold=True), fill=INK)
        y += 30
    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "RECENT TRANSACTIONS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    d.text((40, y), "Date", font=font(12), fill=MUTED)
    d.text((160, y), "Description", font=font(12), fill=MUTED)
    d.text((620, y), "Amount", font=font(12), fill=MUTED)
    y += 24
    hline(d, 40, y, W - 40)
    y += 14
    source = f"{p['employer']} — Direct Deposit"
    rows = [
        ("07/14/2026", source, f"+{money(f['net'])}"),
        ("07/16/2026", "Springfield Utilities", "-$142.60"),
        ("07/20/2026", "Grocery Mart", "-$118.30"),
        ("07/28/2026", source, f"+{money(f['net'])}"),
        ("07/29/2026", "Auto Insurance Co.", "-$96.00"),
        ("07/30/2026", "Rent Payment", "-$1,200.00"),
    ]
    for date, desc, amt in rows:
        d.text((40, y), date, font=font(13), fill=INK)
        d.text((160, y), desc, font=font(13), fill=INK)
        color = (2, 122, 72) if amt.startswith("+") else INK
        d.text((620, y), amt, font=font(13, bold=True), fill=color)
        y += 32
        hline(d, 40, y - 6, W - 40)
    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, f"{p['slug']}-bank-statement.png"))

    fields = dict(NULL_FIELDS)
    fields.update({
        "fullName": p["name"], "documentDate": "07/31/2026",
        "recentDepositAmount": f["net"], "recentDepositSource": source,
    })
    return {"docType": "bank-statement", "confidence": 0.95, "fields": fields}


if __name__ == "__main__":
    fixtures = {}
    for persona in PERSONAS:
        fixtures[f"{persona['slug']}-pay-stub"] = pay_stub(persona)
        fixtures[f"{persona['slug']}-drivers-license"] = drivers_license(persona)
        fixtures[f"{persona['slug']}-bank-statement"] = bank_statement(persona)
    path = os.path.join(os.path.dirname(__file__), "persona-fixtures.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(fixtures, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"Wrote {len(fixtures)} persona documents to {OUT_DIR} and fixtures to {path}")
