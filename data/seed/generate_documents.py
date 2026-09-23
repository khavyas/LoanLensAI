"""
Generates synthetic demo document images for the LoanLens AI 3-min demo.

These are NOT real documents — plain rendered mockups.

Consumer scenario — Jordan Rivera (planted income mismatch: application
states $5,000/mo, pay stub shows $4,200/mo).

Small-business scenario — Dana Whitfield / Whitfield & Co. Bakery LLC
(small-business term loan). Two planted exceptions, modeled on the most
common real-world small-business closing blockers: (1) the business tax
return shows lower annual revenue than stated on the application, and
(2) the business license shows the legal entity name with different
punctuation/formatting than the DBA name on the application — the
"entity name mismatch" pattern that stalls small-business loan closings
in production loan-origination systems.

Additional testing scenarios (not part of the primary pitch, for
QA/breadth):
- Priya Nair (personal loan) — all three documents clean/matching, for
  testing the "everything's fine" happy path.
- Arjun Mehta (auto loan) — income matches exactly, but the pay stub's
  employer ("Falcon Freight Co.") differs from the application's stated
  employer ("Ironwood Manufacturing"). Isolates the warning-tier
  "Employer differs — may be a legitimate job change" check, which no
  other seeded scenario exercises (every other planted exception is a
  harder 'mismatch', not a softer 'warning').

Upload them in the Documents tab during a live demo instead of
hand-drawing something on the spot.

Run: python data/seed/generate_documents.py
Output: data/seed/documents/*.png
"""

import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(OUT_DIR, exist_ok=True)

WHITE = (255, 255, 255)
INK = (16, 24, 40)
MUTED = (102, 112, 133)
LINE = (228, 233, 240)
ACCENT = (10, 37, 64)


def font(size, bold=False):
    name = "arialbd.ttf" if bold else "arial.ttf"
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def hline(draw, x0, y, x1):
    draw.line([(x0, y), (x1, y)], fill=LINE, width=1)


def kv_row(draw, x, y, label, value, w=440, label_font=None, value_font=None):
    label_font = label_font or font(13)
    value_font = value_font or font(15, bold=True)
    draw.text((x, y), label.upper(), font=label_font, fill=MUTED)
    draw.text((x, y + 18), value, font=value_font, fill=INK)


def pay_stub():
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 90], fill=ACCENT)
    d.text((40, 24), "BRIGHTLINE LOGISTICS", font=font(26, bold=True), fill=WHITE)
    d.text((40, 58), "412 Industrial Pkwy, Springfield", font=font(13), fill=(200, 210, 225))
    d.text((W - 260, 32), "EARNINGS STATEMENT", font=font(16, bold=True), fill=WHITE)

    y = 130
    kv_row(d, 40, y, "Employee Name", "Jordan Rivera")
    kv_row(d, 440, y, "Employee ID", "BL-30421")
    y += 60
    kv_row(d, 40, y, "Pay Period", "07/28/2026 - 08/10/2026")
    kv_row(d, 440, y, "Pay Date", "08/14/2026")
    y += 60
    kv_row(d, 40, y, "Home Address", "412 Maple Court, Springfield")
    y += 60
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "EARNINGS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    d.text((40, y), "Description", font=font(12), fill=MUTED)
    d.text((420, y), "Rate", font=font(12), fill=MUTED)
    d.text((560, y), "Hours", font=font(12), fill=MUTED)
    d.text((680, y), "Amount", font=font(12), fill=MUTED)
    y += 26
    hline(d, 40, y, W - 40)
    y += 16
    d.text((40, y), "Regular", font=font(14), fill=INK)
    d.text((420, y), "$24.23 / hr", font=font(14), fill=INK)
    d.text((560, y), "80.0", font=font(14), fill=INK)
    d.text((680, y), "$1,938.46", font=font(14, bold=True), fill=INK)
    y += 50
    hline(d, 40, y, W - 40)
    y += 20

    d.text((40, y), "GROSS PAY (this period)", font=font(14, bold=True), fill=ACCENT)
    d.text((680, y), "$1,938.46", font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "Gross monthly income (biweekly x 26 / 12)", font=font(12), fill=MUTED)
    d.text((680, y), "$4,200.00", font=font(16, bold=True), fill=(180, 35, 24))
    y += 34
    d.text((40, y), "YTD Gross Pay (Period 16 of 26)", font=font(12), fill=MUTED)
    d.text((680, y), "$31,015.36", font=font(15, bold=True), fill=INK)
    y += 46
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "DEDUCTIONS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Federal Tax", "$232.61"), ("State Tax", "$77.54"),
                        ("Social Security", "$120.18"), ("Medicare", "$28.11")]:
        d.text((40, y), label, font=font(13), fill=INK)
        d.text((680, y), amt, font=font(13), fill=INK)
        y += 26

    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "NET PAY", font=font(15, bold=True), fill=ACCENT)
    d.text((680, y), "$1,480.02", font=font(17, bold=True), fill=ACCENT)

    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "jordan-rivera-pay-stub.png"))


def jordan_pay_stub_tampered():
    # Demo asset for the live "fail" moment: a second-attempt forgery after
    # Jordan's genuine pay stub (above) gets flagged for the simple $4,200-
    # vs-$5,000 income mismatch. A borrower who wants to beat that ONE check
    # only needs to edit two headline numbers — gross pay this period and
    # the converted monthly income, bumped to exactly match the $5,000/mo
    # stated on the application — and get the on-paper arithmetic to still
    # foot (gross minus deductions still equals net pay, so a human skimming
    # the page finds nothing wrong).
    #
    # What they can't easily redo: the YTD figure (still the real historical
    # total, now wildly inconsistent with the new higher per-period gross)
    # and the Social Security/Medicare withholding (still computed off the
    # REAL old gross, not the fake new one — statutory withholding is a
    # fixed federal percentage, not something you can eyeball). Those are
    # exactly the checks that don't exist in a basic OCR-and-match tool.
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 90], fill=ACCENT)
    d.text((40, 24), "BRIGHTLINE LOGISTICS", font=font(26, bold=True), fill=WHITE)
    d.text((40, 58), "412 Industrial Pkwy, Springfield", font=font(13), fill=(200, 210, 225))
    d.text((W - 260, 32), "EARNINGS STATEMENT", font=font(16, bold=True), fill=WHITE)

    y = 130
    kv_row(d, 40, y, "Employee Name", "Jordan Rivera")
    kv_row(d, 440, y, "Employee ID", "BL-30421")
    y += 60
    kv_row(d, 40, y, "Pay Period", "07/28/2026 - 08/10/2026")
    kv_row(d, 440, y, "Pay Date", "08/14/2026")
    y += 60
    kv_row(d, 40, y, "Home Address", "412 Maple Court, Springfield")
    y += 60
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "EARNINGS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    d.text((40, y), "Description", font=font(12), fill=MUTED)
    d.text((420, y), "Rate", font=font(12), fill=MUTED)
    d.text((560, y), "Hours", font=font(12), fill=MUTED)
    d.text((680, y), "Amount", font=font(12), fill=MUTED)
    y += 26
    hline(d, 40, y, W - 40)
    y += 16
    d.text((40, y), "Regular", font=font(14), fill=INK)
    d.text((420, y), "$28.85 / hr", font=font(14), fill=INK)
    d.text((560, y), "80.0", font=font(14), fill=INK)
    d.text((680, y), "$2,307.69", font=font(14, bold=True), fill=INK)
    y += 50
    hline(d, 40, y, W - 40)
    y += 20

    d.text((40, y), "GROSS PAY (this period)", font=font(14, bold=True), fill=ACCENT)
    d.text((680, y), "$2,307.69", font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "Gross monthly income (biweekly x 26 / 12)", font=font(12), fill=MUTED)
    d.text((680, y), "$5,000.00", font=font(16, bold=True), fill=ACCENT)
    y += 34
    # Left untouched — the real historical YTD total, now inconsistent with
    # the bumped-up per-period gross above.
    d.text((40, y), "YTD Gross Pay (Period 16 of 26)", font=font(12), fill=MUTED)
    d.text((680, y), "$31,015.36", font=font(15, bold=True), fill=INK)
    y += 46
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "DEDUCTIONS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    # Left untouched — still computed off the real $1,938.46 gross, not the
    # fake $2,307.69, so the statutory-rate check catches it even though
    # the arithmetic on this page still foots.
    for label, amt in [("Federal Tax", "$232.61"), ("State Tax", "$77.54"),
                        ("Social Security", "$120.18"), ("Medicare", "$28.11")]:
        d.text((40, y), label, font=font(13), fill=INK)
        d.text((680, y), amt, font=font(13), fill=INK)
        y += 26

    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "NET PAY", font=font(15, bold=True), fill=ACCENT)
    d.text((680, y), "$1,849.25", font=font(17, bold=True), fill=ACCENT)

    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "jordan-rivera-pay-stub-tampered.png"))


def drivers_license():
    W, H = 900, 560
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=24, outline=LINE, width=3)

    d.rectangle([0, 0, W, 110], fill=ACCENT)
    d.rounded_rectangle([0, 0, W - 1, 110], radius=24, fill=ACCENT)
    d.rectangle([0, 60, W, 110], fill=ACCENT)
    d.text((36, 26), "STATE OF SPRINGFIELD", font=font(24, bold=True), fill=WHITE)
    d.text((36, 60), "DRIVER LICENSE", font=font(15), fill=(200, 210, 225))
    d.text((W - 180, 40), "CLASS D", font=font(18, bold=True), fill=WHITE)

    d.rounded_rectangle([36, 140, 236, 400], radius=10, outline=LINE, width=2, fill=(240, 243, 247))
    d.text((70, 250), "PHOTO", font=font(16), fill=MUTED)

    x = 270
    y = 150
    kv_row(d, x, y, "License No.", "SP-849213-J")
    y += 60
    kv_row(d, x, y, "Full Name", "Jordan Rivera")
    y += 60
    kv_row(d, x, y, "Address", "412 Maple Court, Springfield")
    y += 60
    kv_row(d, x, y, "Date of Birth", "03/12/1994")
    kv_row(d, x + 300, y, "Sex", "M")
    y += 60
    kv_row(d, x, y, "Issue Date", "05/01/2024")
    kv_row(d, x + 300, y, "Expires", "03/12/2032")

    d.text((36, H - 40), "Synthetic document — demo purposes only.", font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "jordan-rivera-drivers-license.png"))


def bank_statement():
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.text((40, 36), "FIRST COMMUNITY BANK", font=font(22, bold=True), fill=ACCENT)
    d.text((40, 68), "Monthly Account Statement", font=font(14), fill=MUTED)

    y = 120
    kv_row(d, 40, y, "Account Holder", "Jordan Rivera")
    kv_row(d, 440, y, "Account Number", "****4821")
    y += 60
    kv_row(d, 40, y, "Statement Period", "07/01/2026 - 07/31/2026")
    kv_row(d, 440, y, "Account Type", "Checking")
    y += 50
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "ACCOUNT SUMMARY", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Beginning Balance", "$2,140.55"), ("Total Deposits", "$2,960.04"),
                        ("Total Withdrawals", "$3,102.10"), ("Ending Balance", "$1,998.49")]:
        d.text((40, y), label, font=font(14), fill=INK)
        d.text((680, y), amt, font=font(14, bold=True), fill=INK)
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

    rows = [
        ("07/14/2026", "Brightline Logistics — Direct Deposit", "+$1,480.02"),
        ("07/15/2026", "Springfield Electric Co.", "-$118.20"),
        ("07/18/2026", "Grocery Mart", "-$96.44"),
        ("07/28/2026", "Brightline Logistics — Direct Deposit", "+$1,480.02"),
        ("07/29/2026", "Auto Insurance Co.", "-$142.00"),
        ("07/30/2026", "Springfield Apartments — Rent", "-$1,150.00"),
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
    img.save(os.path.join(OUT_DIR, "jordan-rivera-bank-statement.png"))


def priya_pay_stub():
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 90], fill=ACCENT)
    d.text((40, 24), "CEDAR HEALTH SYSTEMS", font=font(26, bold=True), fill=WHITE)
    d.text((40, 58), "500 Cedar Ave, Springfield", font=font(13), fill=(200, 210, 225))
    d.text((W - 260, 32), "EARNINGS STATEMENT", font=font(16, bold=True), fill=WHITE)

    y = 130
    kv_row(d, 40, y, "Employee Name", "Priya Nair")
    kv_row(d, 440, y, "Employee ID", "CH-11207")
    y += 60
    kv_row(d, 40, y, "Pay Period", "07/28/2026 - 08/10/2026")
    kv_row(d, 440, y, "Pay Date", "08/14/2026")
    y += 60
    kv_row(d, 40, y, "Home Address", "88 Lakeview Drive, Springfield")
    y += 60
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "EARNINGS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    d.text((40, y), "Description", font=font(12), fill=MUTED)
    d.text((420, y), "Rate", font=font(12), fill=MUTED)
    d.text((560, y), "Hours", font=font(12), fill=MUTED)
    d.text((680, y), "Amount", font=font(12), fill=MUTED)
    y += 26
    hline(d, 40, y, W - 40)
    y += 16
    d.text((40, y), "Regular", font=font(14), fill=INK)
    d.text((420, y), "$41.54 / hr", font=font(14), fill=INK)
    d.text((560, y), "80.0", font=font(14), fill=INK)
    d.text((680, y), "$3,323.08", font=font(14, bold=True), fill=INK)
    y += 50
    hline(d, 40, y, W - 40)
    y += 20

    d.text((40, y), "GROSS PAY (this period)", font=font(14, bold=True), fill=ACCENT)
    d.text((680, y), "$3,323.08", font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "Gross monthly income (biweekly x 26 / 12)", font=font(12), fill=MUTED)
    d.text((680, y), "$7,200.00", font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "YTD Gross Pay (Period 16 of 26)", font=font(12), fill=MUTED)
    d.text((680, y), "$53,169.28", font=font(15, bold=True), fill=INK)
    y += 46
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "DEDUCTIONS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Federal Tax", "$465.23"), ("State Tax", "$149.54"),
                        ("Social Security", "$206.03"), ("Medicare", "$48.18")]:
        d.text((40, y), label, font=font(13), fill=INK)
        d.text((680, y), amt, font=font(13), fill=INK)
        y += 26

    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "NET PAY", font=font(15, bold=True), fill=ACCENT)
    d.text((680, y), "$2,454.10", font=font(17, bold=True), fill=ACCENT)

    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "priya-nair-pay-stub.png"))


def priya_drivers_license():
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

    x = 270
    y = 150
    kv_row(d, x, y, "License No.", "SP-671482-N")
    y += 60
    kv_row(d, x, y, "Full Name", "Priya Nair")
    y += 60
    kv_row(d, x, y, "Address", "88 Lakeview Drive, Springfield")
    y += 60
    kv_row(d, x, y, "Date of Birth", "11/22/1991")
    kv_row(d, x + 300, y, "Sex", "F")
    y += 60
    kv_row(d, x, y, "Issue Date", "02/15/2023")
    kv_row(d, x + 300, y, "Expires", "11/22/2031")

    d.text((36, H - 40), "Synthetic document — demo purposes only.", font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "priya-nair-drivers-license.png"))


def priya_bank_statement():
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.text((40, 36), "FIRST COMMUNITY BANK", font=font(22, bold=True), fill=ACCENT)
    d.text((40, 68), "Monthly Account Statement", font=font(14), fill=MUTED)

    y = 120
    kv_row(d, 40, y, "Account Holder", "Priya Nair")
    kv_row(d, 440, y, "Account Number", "****9034")
    y += 60
    kv_row(d, 40, y, "Statement Period", "07/01/2026 - 07/31/2026")
    kv_row(d, 440, y, "Account Type", "Checking")
    y += 50
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "ACCOUNT SUMMARY", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Beginning Balance", "$4,890.10"), ("Total Deposits", "$4,908.20"),
                        ("Total Withdrawals", "$4,210.55"), ("Ending Balance", "$5,587.75")]:
        d.text((40, y), label, font=font(14), fill=INK)
        d.text((680, y), amt, font=font(14, bold=True), fill=INK)
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

    rows = [
        ("07/14/2026", "Cedar Health Systems — Direct Deposit", "+$2,454.10"),
        ("07/16/2026", "Springfield Utilities", "-$164.20"),
        ("07/20/2026", "Grocery Mart", "-$132.44"),
        ("07/28/2026", "Cedar Health Systems — Direct Deposit", "+$2,454.10"),
        ("07/29/2026", "Auto Insurance Co.", "-$118.00"),
        ("07/30/2026", "Lakeview Apartments — Rent", "-$1,650.00"),
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
    img.save(os.path.join(OUT_DIR, "priya-nair-bank-statement.png"))


def arjun_pay_stub():
    # Planted exception: employer on the pay stub differs from the employer
    # named on the application ("Ironwood Manufacturing") — income matches
    # exactly, so this isolates the "Employer differs — may be a legitimate
    # job change" warning-tier check, which no other seeded scenario exercises
    # (every other planted exception is a harder 'mismatch', not a 'warning').
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 90], fill=ACCENT)
    d.text((40, 24), "FALCON FREIGHT CO.", font=font(26, bold=True), fill=WHITE)
    d.text((40, 58), "9 Depot Street, Springfield", font=font(13), fill=(200, 210, 225))
    d.text((W - 260, 32), "EARNINGS STATEMENT", font=font(16, bold=True), fill=WHITE)

    y = 130
    kv_row(d, 40, y, "Employee Name", "Arjun Mehta")
    kv_row(d, 440, y, "Employee ID", "FF-70213")
    y += 60
    kv_row(d, 40, y, "Pay Period", "07/28/2026 - 08/10/2026")
    kv_row(d, 440, y, "Pay Date", "08/14/2026")
    y += 60
    kv_row(d, 40, y, "Home Address", "17 Birch Street, Springfield")
    y += 60
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "EARNINGS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    d.text((40, y), "Description", font=font(12), fill=MUTED)
    d.text((420, y), "Rate", font=font(12), fill=MUTED)
    d.text((560, y), "Hours", font=font(12), fill=MUTED)
    d.text((680, y), "Amount", font=font(12), fill=MUTED)
    y += 26
    hline(d, 40, y, W - 40)
    y += 16
    d.text((40, y), "Regular", font=font(14), fill=INK)
    d.text((420, y), "$22.50 / hr", font=font(14), fill=INK)
    d.text((560, y), "80.0", font=font(14), fill=INK)
    d.text((680, y), "$1,800.00", font=font(14, bold=True), fill=INK)
    y += 50
    hline(d, 40, y, W - 40)
    y += 20

    d.text((40, y), "GROSS PAY (this period)", font=font(14, bold=True), fill=ACCENT)
    d.text((680, y), "$1,800.00", font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "Gross monthly income (biweekly x 26 / 12)", font=font(12), fill=MUTED)
    d.text((680, y), "$3,900.00", font=font(16, bold=True), fill=ACCENT)
    y += 34
    d.text((40, y), "YTD Gross Pay (Period 16 of 26)", font=font(12), fill=MUTED)
    d.text((680, y), "$28,800.00", font=font(15, bold=True), fill=INK)
    y += 46
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "DEDUCTIONS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Federal Tax", "$216.00"), ("State Tax", "$72.00"),
                        ("Social Security", "$111.60"), ("Medicare", "$26.10")]:
        d.text((40, y), label, font=font(13), fill=INK)
        d.text((680, y), amt, font=font(13), fill=INK)
        y += 26

    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "NET PAY", font=font(15, bold=True), fill=ACCENT)
    d.text((680, y), "$1,374.30", font=font(17, bold=True), fill=ACCENT)

    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "arjun-mehta-pay-stub.png"))


def arjun_drivers_license():
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

    x = 270
    y = 150
    kv_row(d, x, y, "License No.", "SP-902365-M")
    y += 60
    kv_row(d, x, y, "Full Name", "Arjun Mehta")
    y += 60
    kv_row(d, x, y, "Address", "17 Birch Street, Springfield")
    y += 60
    kv_row(d, x, y, "Date of Birth", "05/09/1996")
    kv_row(d, x + 300, y, "Sex", "M")
    y += 60
    kv_row(d, x, y, "Issue Date", "09/01/2022")
    kv_row(d, x + 300, y, "Expires", "05/09/2030")

    d.text((36, H - 40), "Synthetic document — demo purposes only.", font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "arjun-mehta-drivers-license.png"))


def arjun_bank_statement():
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.text((40, 36), "FIRST COMMUNITY BANK", font=font(22, bold=True), fill=ACCENT)
    d.text((40, 68), "Monthly Account Statement", font=font(14), fill=MUTED)

    y = 120
    kv_row(d, 40, y, "Account Holder", "Arjun Mehta")
    kv_row(d, 440, y, "Account Number", "****5567")
    y += 60
    kv_row(d, 40, y, "Statement Period", "07/01/2026 - 07/31/2026")
    kv_row(d, 440, y, "Account Type", "Checking")
    y += 50
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "ACCOUNT SUMMARY", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Beginning Balance", "$1,560.20"), ("Total Deposits", "$2,748.60"),
                        ("Total Withdrawals", "$2,890.15"), ("Ending Balance", "$1,418.65")]:
        d.text((40, y), label, font=font(14), fill=INK)
        d.text((680, y), amt, font=font(14, bold=True), fill=INK)
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

    rows = [
        ("07/14/2026", "Falcon Freight Co. — Direct Deposit", "+$1,374.30"),
        ("07/17/2026", "Springfield Electric Co.", "-$96.20"),
        ("07/21/2026", "Grocery Mart", "-$88.40"),
        ("07/28/2026", "Falcon Freight Co. — Direct Deposit", "+$1,374.30"),
        ("07/29/2026", "Auto Insurance Co.", "-$135.55"),
        ("07/30/2026", "Birch Street Apartments — Rent", "-$970.00"),
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
    img.save(os.path.join(OUT_DIR, "arjun-mehta-bank-statement.png"))


def business_tax_return():
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 90], fill=ACCENT)
    d.text((40, 24), "TAXPREP PRO", font=font(26, bold=True), fill=WHITE)
    d.text((40, 58), "Schedule C Summary — Tax Year 2025", font=font(13), fill=(200, 210, 225))
    d.text((W - 260, 32), "BUSINESS TAX RETURN", font=font(15, bold=True), fill=WHITE)

    y = 130
    kv_row(d, 40, y, "Business Name", "Whitfield & Co. Bakery LLC")
    kv_row(d, 440, y, "EIN", "84-1029384")
    y += 60
    kv_row(d, 40, y, "Business Address", "220 Harborview Ave, Springfield")
    y += 60
    kv_row(d, 40, y, "Principal Business Activity", "Retail Bakery (NAICS 311811)")
    y += 60
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "INCOME", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Gross receipts or sales", "$275,400.00"), ("Returns and allowances", "-$1,200.00")]:
        d.text((40, y), label, font=font(14), fill=INK)
        d.text((680, y), amt, font=font(14), fill=INK)
        y += 30
    y += 10
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "GROSS INCOME (Line 7)", font=font(14, bold=True), fill=ACCENT)
    d.text((680, y), "$274,200.00", font=font(16, bold=True), fill=(180, 35, 24))
    y += 50
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "EXPENSES", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Wages", "$96,500.00"), ("Supplies", "$41,220.00"),
                        ("Rent", "$36,000.00"), ("Utilities", "$9,840.00"),
                        ("Other business expenses", "$18,340.00")]:
        d.text((40, y), label, font=font(13), fill=INK)
        d.text((680, y), amt, font=font(13), fill=INK)
        y += 26

    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "NET PROFIT (Line 31)", font=font(15, bold=True), fill=ACCENT)
    d.text((680, y), "$72,300.00", font=font(17, bold=True), fill=ACCENT)

    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "whitfield-bakery-business-tax-return.png"))


def personal_financial_statement():
    W, H = 850, 1100
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.text((40, 36), "PERSONAL FINANCIAL STATEMENT", font=font(22, bold=True), fill=ACCENT)
    d.text((40, 68), "As of 06/30/2026", font=font(14), fill=MUTED)

    y = 120
    kv_row(d, 40, y, "Full Name", "Dana Whitfield")
    kv_row(d, 440, y, "SSN (last 4)", "6672")
    y += 60
    kv_row(d, 40, y, "Home Address", "14 Crestline Rd, Springfield")
    y += 60
    kv_row(d, 40, y, "Business Affiliation", "Owner, Whitfield & Co. Bakery LLC")
    y += 50
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "ASSETS", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Cash on hand & in banks", "$38,200.00"), ("Real estate owned", "$310,000.00"),
                        ("Retirement accounts", "$64,500.00"), ("Business equity", "$95,000.00")]:
        d.text((40, y), label, font=font(14), fill=INK)
        d.text((680, y), amt, font=font(14), fill=INK)
        y += 30
    y += 10
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "TOTAL ASSETS", font=font(14, bold=True), fill=ACCENT)
    d.text((680, y), "$507,700.00", font=font(15, bold=True), fill=INK)
    y += 50
    hline(d, 40, y, W - 40)
    y += 24

    d.text((40, y), "LIABILITIES", font=font(14, bold=True), fill=ACCENT)
    y += 30
    for label, amt in [("Mortgage(s) on real estate", "$180,000.00"), ("Auto loan(s)", "$14,300.00"),
                        ("Credit card balances", "$6,100.00")]:
        d.text((40, y), label, font=font(13), fill=INK)
        d.text((680, y), amt, font=font(13), fill=INK)
        y += 26

    y += 20
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "NET WORTH", font=font(15, bold=True), fill=ACCENT)
    d.text((680, y), "$307,300.00", font=font(17, bold=True), fill=ACCENT)

    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "whitfield-bakery-personal-financial-statement.png"))


def business_license():
    W, H = 900, 620
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=24, outline=LINE, width=3)

    d.rounded_rectangle([0, 0, W - 1, 110], radius=24, fill=ACCENT)
    d.rectangle([0, 60, W, 110], fill=ACCENT)
    d.text((36, 26), "STATE OF SPRINGFIELD", font=font(24, bold=True), fill=WHITE)
    d.text((36, 60), "CERTIFICATE OF FORMATION — BUSINESS LICENSE", font=font(14), fill=(200, 210, 225))

    y = 150
    x = 40
    # Planted exception: legal entity name differs in punctuation/formatting
    # from the DBA name stated on the loan application ("Whitfield & Co.
    # Bakery LLC") — mirrors the real-world entity-name mismatches that stall
    # small-business loan closings.
    kv_row(d, x, y, "Legal Business Name", "Whitfield And Co Bakery LLC")
    y += 60
    kv_row(d, x, y, "Entity Type", "Limited Liability Company (LLC)")
    kv_row(d, x + 400, y, "License No.", "SB-220984")
    y += 60
    kv_row(d, x, y, "Business Address", "220 Harborview Ave, Springfield")
    y += 60
    kv_row(d, x, y, "Formation Date", "03/14/2019")
    kv_row(d, x + 400, y, "Expires", "03/14/2027")
    y += 60
    kv_row(d, x, y, "Registered Agent", "Dana Whitfield")

    d.text((36, H - 40), "Synthetic document — demo purposes only.", font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "whitfield-bakery-business-license.png"))


def ownership_disclosure():
    W, H = 850, 700
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.text((40, 36), "BENEFICIAL OWNERSHIP CERTIFICATION", font=font(21, bold=True), fill=ACCENT)
    d.text((40, 68), "Whitfield & Co. Bakery LLC", font=font(14), fill=MUTED)

    y = 120
    hline(d, 40, y, W - 40)
    y += 24
    d.text((40, y), "Owner Name", font=font(12), fill=MUTED)
    d.text((420, y), "Title", font=font(12), fill=MUTED)
    d.text((600, y), "Ownership %", font=font(12), fill=MUTED)
    y += 24
    hline(d, 40, y, W - 40)
    y += 20

    d.text((40, y), "Dana Whitfield", font=font(15, bold=True), fill=INK)
    d.text((420, y), "Managing Member", font=font(14), fill=INK)
    d.text((600, y), "100%", font=font(15, bold=True), fill=INK)
    y += 60

    hline(d, 40, y, W - 40)
    y += 30
    d.text((40, y), "I certify the above is a complete and accurate list of individuals who,",
           font=font(13), fill=MUTED)
    y += 20
    d.text((40, y), "directly or indirectly, own 25% or more of this legal entity.",
           font=font(13), fill=MUTED)

    d.text((40, H - 40), "This is a synthetic document generated for demo purposes only.",
           font=font(11), fill=MUTED)
    img.save(os.path.join(OUT_DIR, "whitfield-bakery-ownership-disclosure.png"))


if __name__ == "__main__":
    pay_stub()
    jordan_pay_stub_tampered()
    drivers_license()
    bank_statement()
    business_tax_return()
    personal_financial_statement()
    business_license()
    ownership_disclosure()
    priya_pay_stub()
    priya_drivers_license()
    priya_bank_statement()
    arjun_pay_stub()
    arjun_drivers_license()
    arjun_bank_statement()
    print(f"Wrote 14 demo document images to {OUT_DIR}")
