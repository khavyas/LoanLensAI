"""
Synthetic multi-page bank statements (text-layer PDFs) with KNOWN totals, used
to test backend/src/services/statementAnalysis.js on a 150-page / 1000-
transaction file without any real customer data.

Three row layouts, because real banks differ:
  A  signed amounts (+/-) with a running balance column
  B  separate Debit / Credit columns, dates without a year, running balance
     (direction must be inferred from the balance, not from a sign)
  C  parentheses for debits, no balance column (direction from keywords)

Run: python data/bench/statements/generate_statements.py
Writes: statement_A_153p.pdf, statement_B_153p.pdf, statement_C_12p.pdf, truth.json
"""

import json
import os
import random
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = os.path.dirname(os.path.abspath(__file__))
EMPLOYER = "BRIGHTLINE LOGISTICS PAYROLL DIRECT DEP"
NET_PAY = 1480.02

DISCLOSURE = [
    "Overdraft protection: if your account is overdrawn we may charge an overdraft fee as described in",
    "your account agreement. Insufficient funds and returned item fees may also apply. Please review",
    "your statement promptly and report any errors within 60 days of the statement date.",
]


def money(x):
    return f"{x:,.2f}"


def build_transactions(seed, target=1000, with_year=True):
    rng = random.Random(seed)
    txns = []  # (month, day, desc, signed_amount)
    # 26 biweekly pay dates in 2026 starting Jan 2; every 5th one is split in two.
    from datetime import date, timedelta
    d = date(2026, 1, 2)
    n = 0
    while d.year == 2026 and n < 26:
        if n % 5 == 4:
            txns.append((d, EMPLOYER, 1000.00))
            txns.append((d, EMPLOYER, round(NET_PAY - 1000.00, 2)))
        else:
            txns.append((d, EMPLOYER, NET_PAY))
        d += timedelta(days=14)
        n += 1
    for m in range(1, 13):
        txns.append((date(2026, m, 1), "SPRINGFIELD APARTMENTS RENT", -1150.00))
        txns.append((date(2026, m, 15), "SPRINGFIELD ELECTRIC CO BILL PAY", -round(rng.uniform(80, 160), 2)))
    for m in (2, 5, 8):
        txns.append((date(2026, m, 20), "OVERDRAFT FEE", -35.00))
    for m in (6, 11):
        txns.append((date(2026, m, 9), "NSF RETURNED ITEM FEE", -30.00))
    for m in (3, 7, 10):
        txns.append((date(2026, m, 12), "ZELLE FROM A FRIEND CREDIT", round(rng.uniform(40, 200), 2)))
    shops = ["GROCERY MART POS PURCHASE", "COFFEE HOUSE POS PURCHASE", "FUEL STOP POS PURCHASE",
             "ONLINE STORE PURCHASE", "PHARMACY POS PURCHASE", "ATM WITHDRAWAL"]
    while len(txns) < target:
        day = date(2026, 1, 1) + timedelta(days=rng.randint(0, 364))
        txns.append((day, rng.choice(shops), -round(rng.uniform(4, 95), 2)))
    txns.sort(key=lambda t: (t[0], t[1]))
    return txns[:target] if len(txns) > target else txns


def paginate(rows, per_page):
    return [rows[i:i + per_page] for i in range(0, len(rows), per_page)]


def header(c, title, page, total, period):
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, 750, "FIRST COMMUNITY BANK - SYNTHETIC DEMO STATEMENT")
    c.setFont("Helvetica", 9)
    c.drawString(40, 735, f"{title}   Account holder: Jordan Rivera   Page {page} of {total}")
    c.drawString(40, 722, f"Statement Period {period}")


def write_statement(path, layout, txns, total_pages, per_page=7):
    c = canvas.Canvas(path, pagesize=letter)
    start_balance = 2140.55
    bal = start_balance
    period = "01/01/2026 - 12/31/2026"

    rows = []
    for d, desc, amt in txns:
        bal = round(bal + amt, 2)
        rows.append((d, desc, amt, bal))
    ending = rows[-1][3]
    credits = round(sum(a for _, _, a, _ in rows if a > 0), 2)
    debits = round(-sum(a for _, _, a, _ in rows if a < 0), 2)

    pages = paginate(rows, per_page)
    page_no = 1
    # Page 1: account summary, no transactions.
    header(c, f"Layout {layout}", page_no, total_pages, period)
    c.setFont("Helvetica", 10)
    y = 690
    for label, val in [("Beginning Balance", start_balance), ("Total Deposits", credits),
                       ("Total Withdrawals", debits), ("Ending Balance", ending)]:
        c.drawString(40, y, f"{label}  ${money(val)}")
        y -= 16
    c.showPage()

    for chunk in pages:
        page_no += 1
        header(c, f"Layout {layout}", page_no, total_pages, period)
        c.setFont("Helvetica", 9)
        y = 690
        if layout == "B":
            c.drawString(40, y, "Date"); c.drawString(110, y, "Description")
            c.drawRightString(400, y, "Debit"); c.drawRightString(470, y, "Credit"); c.drawRightString(560, y, "Balance")
            y -= 16
        for d, desc, amt, balance in chunk:
            if layout == "A":
                c.drawString(40, y, d.strftime("%m/%d/%Y"))
                c.drawString(120, y, desc)
                c.drawRightString(470, y, ("+$" if amt > 0 else "-$") + money(abs(amt)))
                c.drawRightString(560, y, f"${money(balance)}" if balance >= 0 else f"-${money(-balance)}")
            elif layout == "B":
                c.drawString(40, y, d.strftime("%m/%d"))
                c.drawString(110, y, desc)
                if amt < 0:
                    c.drawRightString(400, y, money(-amt))
                else:
                    c.drawRightString(470, y, money(amt))
                c.drawRightString(560, y, money(balance) if balance >= 0 else f"-{money(-balance)}")
            else:  # C
                c.drawString(40, y, d.strftime("%m/%d/%Y"))
                c.drawString(120, y, desc)
                c.drawRightString(560, y, money(amt) if amt > 0 else f"({money(-amt)})")
            y -= 18
        y -= 20
        c.setFont("Helvetica", 8)
        for line in DISCLOSURE:
            c.drawString(40, y, line)
            y -= 11
        c.showPage()

    while page_no < total_pages:
        page_no += 1
        header(c, f"Layout {layout}", page_no, total_pages, period)
        c.setFont("Helvetica", 8)
        y = 690
        for _ in range(4):
            for line in DISCLOSURE:
                c.drawString(40, y, line)
                y -= 11
            y -= 8
        c.showPage()
    c.save()

    payroll = [r for r in rows if r[1] == EMPLOYER]
    return {
        "pages": total_pages,
        "transactions": len(rows),
        "totalCredits": credits,
        "totalDebits": debits,
        "avgMonthlyCredits": round(credits / 12, 2),
        "endingBalance": ending,
        "overdraftCount": sum(1 for r in rows if "OVERDRAFT" in r[1] or "NSF" in r[1]),
        "payrollDepositRows": len(payroll),
        "payrollDepositTotal": round(sum(r[2] for r in payroll), 2),
        "netPay": NET_PAY,
        "splitPayDates": sum(1 for i in range(len(payroll) - 1)
                             if payroll[i][0] == payroll[i + 1][0]),
    }


def main():
    truth = {}
    big = build_transactions(seed=7, target=1000)
    truth["statement_A_153p.pdf"] = write_statement(os.path.join(OUT, "statement_A_153p.pdf"), "A", big, 153)
    truth["statement_B_153p.pdf"] = write_statement(os.path.join(OUT, "statement_B_153p.pdf"), "B", big, 153)
    small = build_transactions(seed=11, target=70)
    # keep the small one to ~6 months so it fits 12 pages
    truth["statement_C_12p.pdf"] = write_statement(os.path.join(OUT, "statement_C_12p.pdf"), "C", small, 12, per_page=7)
    with open(os.path.join(OUT, "truth.json"), "w") as f:
        json.dump(truth, f, indent=2)
    print(json.dumps(truth, indent=2))


if __name__ == "__main__":
    main()
