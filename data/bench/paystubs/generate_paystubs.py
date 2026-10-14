#!/usr/bin/env python3
"""
Synthetic pay-stub benchmark generator (deterministic).

Writes 25 documents to ./files (paystub_01..21 = PNG, paystub_22..25 = PDF with a
real text layer) plus ./ground_truth.json.  Every person / company is fictional.

Run:  python generate_paystubs.py            (re-creates everything, same output each run)

Design: one data model (Stub) -> one of 10 layout functions -> one of two drawing
back-ends (Pillow for PNG, reportlab for PDF).  Layout functions only talk to the
tiny Canvas API (text / rect / line / ellipse), so the same layout renders to both.
All money is held in integer cents.
"""
import copy
import datetime as dt
import io
import json
import os
import random
import sys
from decimal import Decimal, ROUND_HALF_UP

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as rl_canvas

SEED = 20260614
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "files")
GT_PATH = os.path.join(HERE, "ground_truth.json")

# --------------------------------------------------------------------------------------
# money helpers (integer cents)
# --------------------------------------------------------------------------------------


def rnd(x):
    return int(Decimal(x).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def M(c):
    return f"{c / 100:,.2f}"


def D(c):
    return "$" + M(c)


GRAY = (105, 105, 105)
LGRAY = (205, 205, 205)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)

# --------------------------------------------------------------------------------------
# drawing back-ends
# --------------------------------------------------------------------------------------

FONT_FILES = {
    ("sans", False): "arial.ttf", ("sans", True): "arialbd.ttf",
    ("calibri", False): "calibri.ttf", ("calibri", True): "calibrib.ttf",
    ("verdana", False): "verdana.ttf", ("verdana", True): "verdanab.ttf",
    ("tahoma", False): "tahoma.ttf", ("tahoma", True): "tahomabd.ttf",
    ("serif", False): "times.ttf", ("serif", True): "timesbd.ttf",
    ("georgia", False): "georgia.ttf", ("georgia", True): "georgiab.ttf",
    ("mono", False): "cour.ttf", ("mono", True): "courbd.ttf",
}
PDF_FONTS = {
    "sans": ("Helvetica", "Helvetica-Bold"), "calibri": ("Helvetica", "Helvetica-Bold"),
    "verdana": ("Helvetica", "Helvetica-Bold"), "tahoma": ("Helvetica", "Helvetica-Bold"),
    "serif": ("Times-Roman", "Times-Bold"), "georgia": ("Times-Roman", "Times-Bold"),
    "mono": ("Courier", "Courier-Bold"),
}


class PilCanvas:
    """y grows downward, units are points; `scale` pixels per point."""

    def __init__(self, w, h, scale, bg=WHITE):
        self.w, self.h, self.s = w, h, scale
        self.img = Image.new("RGB", (round(w * scale), round(h * scale)), bg)
        self.d = ImageDraw.Draw(self.img)
        self._fc = {}

    def _font(self, face, bold, size):
        key = (face, bold, round(size * self.s * 4))
        if key not in self._fc:
            self._fc[key] = ImageFont.truetype(FONT_FILES[(face, bold)], size * self.s)
        return self._fc[key]

    def text(self, x, y, t, size=9, face="sans", bold=False, color=BLACK, align="l"):
        anchor = {"l": "ls", "r": "rs", "c": "ms"}[align]
        self.d.text((x * self.s, y * self.s), t, font=self._font(face, bold, size), fill=color, anchor=anchor)

    def measure(self, t, size=9, face="sans", bold=False):
        return self._font(face, bold, size).getlength(t) / self.s

    def rect(self, x, y, w, h, fill=None, stroke=None, lw=0.5):
        s = self.s
        self.d.rectangle([x * s, y * s, (x + w) * s, (y + h) * s], fill=fill, outline=stroke,
                         width=max(1, round(lw * s)))

    def rrect(self, x, y, w, h, r, fill=None, stroke=None, lw=0.5):
        s = self.s
        self.d.rounded_rectangle([x * s, y * s, (x + w) * s, (y + h) * s], radius=r * s, fill=fill,
                                 outline=stroke, width=max(1, round(lw * s)))

    def ellipse(self, x, y, w, h, fill=None, stroke=None, lw=0.5):
        s = self.s
        self.d.ellipse([x * s, y * s, (x + w) * s, (y + h) * s], fill=fill, outline=stroke,
                       width=max(1, round(lw * s)))

    def line(self, x1, y1, x2, y2, color=BLACK, lw=0.5, dash=None):
        s = self.s
        w = max(1, round(lw * s))
        if not dash:
            self.d.line([x1 * s, y1 * s, x2 * s, y2 * s], fill=color, width=w)
            return
        length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        n = int(length // (dash[0] + dash[1])) + 1
        ux, uy = (x2 - x1) / length, (y2 - y1) / length
        for i in range(n):
            a = i * (dash[0] + dash[1])
            b = min(a + dash[0], length)
            self.d.line([(x1 + ux * a) * s, (y1 + uy * a) * s, (x1 + ux * b) * s, (y1 + uy * b) * s],
                        fill=color, width=w)

    def image(self):
        return self.img


class PdfCanvas:
    def __init__(self, w, h, path):
        self.w, self.h = w, h
        self.c = rl_canvas.Canvas(path, pagesize=(w, h), invariant=1)
        self.c.setTitle("Pay statement")
        self.c.setAuthor("Synthetic pay-stub benchmark")

    def _font(self, face, bold):
        return PDF_FONTS[face][1 if bold else 0]

    def text(self, x, y, t, size=9, face="sans", bold=False, color=BLACK, align="l"):
        c = self.c
        c.setFont(self._font(face, bold), size)
        c.setFillColorRGB(*(v / 255 for v in color))
        Y = self.h - y
        if align == "l":
            c.drawString(x, Y, t)
        elif align == "r":
            c.drawRightString(x, Y, t)
        else:
            c.drawCentredString(x, Y, t)

    def measure(self, t, size=9, face="sans", bold=False):
        return stringWidth(t, self._font(face, bold), size)

    def _style(self, fill, stroke, lw):
        c = self.c
        if fill is not None:
            c.setFillColorRGB(*(v / 255 for v in fill))
        if stroke is not None:
            c.setStrokeColorRGB(*(v / 255 for v in stroke))
        c.setLineWidth(lw)
        return (1 if fill is not None else 0), (1 if stroke is not None else 0)

    def rect(self, x, y, w, h, fill=None, stroke=None, lw=0.5):
        f, s = self._style(fill, stroke, lw)
        self.c.rect(x, self.h - y - h, w, h, stroke=s, fill=f)

    def rrect(self, x, y, w, h, r, fill=None, stroke=None, lw=0.5):
        f, s = self._style(fill, stroke, lw)
        self.c.roundRect(x, self.h - y - h, w, h, r, stroke=s, fill=f)

    def ellipse(self, x, y, w, h, fill=None, stroke=None, lw=0.5):
        f, s = self._style(fill, stroke, lw)
        self.c.ellipse(x, self.h - y - h, x + w, self.h - y, stroke=s, fill=f)

    def line(self, x1, y1, x2, y2, color=BLACK, lw=0.5, dash=None):
        c = self.c
        c.setStrokeColorRGB(*(v / 255 for v in color))
        c.setLineWidth(lw)
        c.setDash(*([list(dash)] if dash else [[]]))
        c.line(x1, self.h - y1, x2, self.h - y2)
        c.setDash([])

    def save(self):
        self.c.showPage()
        self.c.save()


# --------------------------------------------------------------------------------------
# fictional data pools
# --------------------------------------------------------------------------------------

STREETS = ["Alder Court", "Birchwood Lane", "Harlan Avenue", "Quarry Street", "Sycamore Drive", "Tern Way",
           "Wexford Road", "Linden Terrace", "Marlow Place", "Cedar Hollow Road", "Foxglove Circle", "Pike Street"]
CITIES = [("Fairhaven", "WA", "98225"), ("Dayton", "OH", "45402"), ("Tulsa", "OK", "74103"),
          ("Asheville", "NC", "28801"), ("Boise", "ID", "83702"), ("Duluth", "MN", "55802"),
          ("Savannah", "GA", "31401"), ("Reno", "NV", "89501"), ("Albany", "NY", "12207"),
          ("Lubbock", "TX", "79401"), ("Provo", "UT", "84601"), ("Mobile", "AL", "36602")]
BIZ_STREETS = ["Commerce Park Drive", "Industrial Parkway", "Harbor Boulevard", "Meridian Road", "Foundry Row",
               "Corporate Circle", "Depot Street"]

PEOPLE = {  # file number -> (name, employer)
    1: ("Dorothea Vance", "Brightwater Logistics LLC"),
    2: ("Marcus A. Delgado", "Cobalt Ridge Staffing Inc."),
    3: ("Anneliese Kowalczyk", "Tallgrass Analytics, Inc."),
    4: ("Jamal Tran-Whitfield", "Halcyon Freight Systems"),
    5: ("Fiona R. Castellano", "Orchard Lane Bakery Co."),
    6: ("Oluwaseun Adebayo", "Vantor Cloud Labs"),
    7: ("Ronnie Dale Pruitt", "Northgate Fabrication Ltd."),
    8: ("Mei-Ling Hartwell", "Juniper Bay Marine Services"),
    9: ("Gideon P. Lindqvist", "Lumen Harbor Health Partners"),
    10: ("Esperanza Quill", "Copperleaf Foods Corporation"),
    12: ("Tobias Ng", "Sablewood Hospitality Group"),
    13: ("Calista Brannigan", "Pinecrest Veterinary Partners"),
    14: ("Raghav Mehta-Sloan", "Ironbridge Builders Inc."),
    15: ("Winifred Oyelaran", "Maple & Vine Cafe LLC"),
    16: ("Dmitri Valcourt", "Zephyrline Couriers"),
    18: ("Harriet J. Pemberton", "Ashgrove Senior Living"),
    19: ("Santiago Ibarra", "Redfern Auto Group"),
    20: ("Kendra Lockridge", "Kestrel Wire & Cable Co."),
    21: ("Bartholomew Nakamura", "Quillfeather Print Works"),
    22: ("Yolanda S. Fairweather", "Stonebrook Dental Associates"),
    23: ("Ignatius Moreau", "Meridian Pines Electric Cooperative"),
    25: ("Beatrix Oduya", "Bluefin Harbor Seafood Inc."),
}

GROSS_L = {"GP": "Gross Pay", "TE": "Total Earnings", "GW": "Gross Wages", "TG": "Total Gross", "ET": "Earnings Total"}
NET_L = {"NP": "Net Pay", "TH": "Take Home", "NA": "Net Amount", "CA": "Check Amount"}
SS_L = {"SS": "Social Security", "SC": "Soc Sec", "OA": "OASDI", "FS": "FICA-SS", "FF": "FED FICA SS"}
MED_L = {"MD": "Medicare", "FM": "FICA-Med", "MT": "Med Tax"}

FIT_LABELS = ["Federal Income Tax", "Fed Income Tax", "Federal W/H", "FITW", "Fed Withholding"]
STATE_LABELS = ["State Income Tax", "State W/H", "State Tax", "ST Withholding"]
S125_LABELS = ["Health Ins (Sec 125)", "Medical - Pre-Tax", "Sect 125 Medical", "Health Premium (Section 125)"]
OTHER_DED = [("Dental Insurance", (500, 2400)), ("Vision Plan", (200, 900)), ("Union Dues", (1500, 4500)),
             ("Parking", (1000, 4000)), ("Optional Life Ins", (300, 1500)), ("Uniform Deduction", (500, 2000))]
BONUS_LABELS = ["Bonus", "Performance Bonus", "Spot Bonus", "Referral Bonus"]
PROVIDERS = ["Paylark Payroll", "Ledgerline Payroll Services", "Tideway Payroll Solutions", "Cinder Payroll"]

# --------------------------------------------------------------------------------------
# the 25 specs.  (labels = gross, net, social-security, medicare keys)
# --------------------------------------------------------------------------------------


def sp(layout, freq, pay, labels, ytd=False, pno=False, ssn=False, addr=False, ot=False, bonus=False,
       deg=None, lowres=False, s125=False, combo=False, dstyle="us", show_freq=True, fmt="natural", ext="png",
       tamper_of=None):
    return dict(layout=layout, freq=freq, pay=pay, labels=labels, ytd=ytd, pno=pno, ssn=ssn, addr=addr, ot=ot,
                bonus=bonus, deg=deg, lowres=lowres, s125=s125, combo=combo, dstyle=dstyle, show_freq=show_freq,
                fmt=fmt, ext=ext, tamper_of=tamper_of)


SPECS = {
    1: sp("classic_table", "weekly", "hourly", ("GP", "NP", "SS", "MD"), ytd=True, ssn=True, addr=True, ot=True),
    2: sp("two_column", "biweekly", "salary", ("TE", "NP", "SC", "MD"), ytd=True, pno=True, addr=True),
    3: sp("dashboard_boxes", "semi-monthly", "salary", ("GW", "TH", "OA", "MD"), ssn=True, bonus=True,
          dstyle="long"),
    4: sp("dense_bureau", "biweekly", "hourly", ("TG", "NP", "FS", "FM"), ytd=True, pno=True, addr=True, ot=True,
          deg="scan", fmt="lastfirst"),
    5: sp("check_stub_bottom", "monthly", "salary", ("GP", "CA", "SS", "MD"), ssn=True, addr=True, show_freq=False,
          fmt="upper"),
    6: sp("minimal_modern", "semi-monthly", "salary", ("ET", "NP", "SC", "MT"), lowres=True, dstyle="long",
          show_freq=False),
    7: sp("dot_matrix_mono", "weekly", "hourly", ("TE", "NP", None, None), ytd=True, pno=True, ssn=True,
          deg="photo", combo=True, fmt="lastfirst"),
    8: sp("landscape_wide", "biweekly", "hourly", ("GW", "NA", "FF", "MT"), ytd=True, addr=True, bonus=True,
          s125=True, dstyle="iso"),
    9: sp("sidebar_ytd_summary", "monthly", "salary", ("GP", "NP", "OA", "MD"), ytd=True, pno=True, ssn=True,
          addr=True),
    10: sp("serif_logo_corner", "semi-monthly", "hourly", ("TE", "TH", None, None), addr=True, ot=True,
           deg="scan", combo=True, dstyle="long"),
    11: sp(None, None, None, None, tamper_of=2),
    12: sp("dashboard_boxes", "weekly", "hourly", ("TG", "NA", "SS", "FM"), ytd=True, ssn=True, addr=True,
           deg="photo", dstyle="long", show_freq=False),
    13: sp("two_column", "semi-monthly", "hourly", ("TE", "NP", "FS", "FM"), addr=True, ot=True, bonus=True,
           s125=True),
    14: sp("dense_bureau", "monthly", "salary", ("GP", "NP", "FF", "MT"), ytd=True, ssn=True, addr=True,
           fmt="lastfirst", show_freq=False),
    15: sp("classic_table", "monthly", "hourly", ("GW", "TH", "SS", "MD"), lowres=True),
    16: sp("minimal_modern", "weekly", "hourly", ("ET", "NA", "SC", "MD"), ytd=True, ssn=True, deg="scan",
           dstyle="long", show_freq=False),
    17: sp(None, None, None, None, tamper_of=9),
    18: sp("landscape_wide", "semi-monthly", "salary", ("TG", "NP", "OA", "MT"), ssn=True, dstyle="iso",
           show_freq=False),
    19: sp("check_stub_bottom", "biweekly", "hourly", ("GP", "CA", "FS", "FM"), ytd=True, pno=True, ssn=True,
           addr=True, ot=True, s125=True, fmt="upper"),
    20: sp("dot_matrix_mono", "biweekly", "salary", ("TE", "NA", "FF", "MD"), addr=True, lowres=True,
           fmt="lastfirst", show_freq=False),
    21: sp("serif_logo_corner", "weekly", "salary", ("GW", "NP", "SS", "MD"), ytd=True, addr=True, deg="photo",
           dstyle="long"),
    22: sp("sidebar_ytd_summary", "semi-monthly", "hourly", ("ET", "TH", "SC", "FM"), ssn=True, ot=True, s125=True,
           show_freq=False, ext="pdf"),
    23: sp("classic_table", "weekly", "salary", ("TG", "NP", None, None), ytd=True, pno=True, bonus=True,
           combo=True, ext="pdf"),
    24: sp(None, None, None, None, tamper_of=14, ext="pdf"),
    25: sp("dashboard_boxes", "monthly", "hourly", ("GP", "NA", "OA", "MD"), bonus=True, ext="pdf", dstyle="long"),
}

FREQ = {  # periods per year, label, monthly factor numerator/denominator
    "weekly": (52, "Weekly", (52, 12)),
    "biweekly": (26, "Bi-Weekly", (26, 12)),
    "semi-monthly": (24, "Semi-Monthly", (2, 1)),
    "monthly": (12, "Monthly", (1, 1)),
}
N_RANGE = {"weekly": (6, 38), "biweekly": (4, 19), "semi-monthly": (6, 19), "monthly": (3, 9)}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def period_dates(freq, n):
    if freq == "weekly":
        st = dt.date(2026, 1, 5) + dt.timedelta(days=7 * (n - 1))
        en = st + dt.timedelta(days=6)
        pay = en + dt.timedelta(days=5)
    elif freq == "biweekly":
        st = dt.date(2026, 1, 5) + dt.timedelta(days=14 * (n - 1))
        en = st + dt.timedelta(days=13)
        pay = en + dt.timedelta(days=5)
    elif freq == "semi-monthly":
        mo = (n - 1) // 2 + 1
        if (n - 1) % 2 == 0:
            st, en = dt.date(2026, mo, 1), dt.date(2026, mo, 15)
        else:
            nxt = dt.date(2026 + (mo == 12), mo % 12 + 1, 1)
            st, en = dt.date(2026, mo, 16), nxt - dt.timedelta(days=1)
        pay = en
    else:
        st = dt.date(2026, n, 1)
        nxt = dt.date(2026 + (n == 12), n % 12 + 1, 1)
        en = nxt - dt.timedelta(days=1)
        pay = en
    while pay.weekday() >= 5:
        pay -= dt.timedelta(days=1)
    return st, en, pay


# --------------------------------------------------------------------------------------
# data model
# --------------------------------------------------------------------------------------


class Stub:
    def n_text(self, tpl):
        return tpl.format(n=self.n, m=self.m)

    def d(self, date):
        st = self.dstyle
        if st == "us":
            return date.strftime("%m/%d/%Y")
        if st == "iso":
            return date.isoformat()
        return f"{MONTHS[date.month - 1]} {date.day}, {date.year}"

    def period_str(self):
        return f"{self.d(self.p_start)} - {self.d(self.p_end)}"

    def person(self, mode=None):
        mode = mode or self.fmt
        parts = self.name.replace(".", "").split()
        first, last = parts[0], parts[-1]
        mid = " ".join(parts[1:-1])
        if mode == "lastfirst":
            return f"{last.upper()}, {(first + (' ' + mid if mid else '')).upper()}"
        if mode == "upper":
            return self.name.upper().replace(".", "")
        return self.name

    @property
    def taxes_total(self):
        return sum(x["amt"] for x in self.ded if x["group"] == "tax")

    def ded_rows(self, groups=None):
        return [x for x in self.ded if groups is None or x["group"] in groups]


def build_stub(num, spec, rng):
    s = Stub()
    s.num = num
    s.layout, s.freq = spec["layout"], spec["freq"]
    s.pay, s.ytd_on, s.show_n = spec["pay"], spec["ytd"], spec["pno"]
    s.show_freq, s.dstyle, s.fmt = spec["show_freq"], spec["dstyle"], spec["fmt"]
    s.s125, s.combo = spec["s125"], spec["combo"]
    s.name, s.employer = PEOPLE[num]
    g, n_, ss_, md_ = spec["labels"]
    s.L = dict(gross=GROSS_L[g], net=NET_L[n_], ss=SS_L[ss_] if ss_ else None, med=MED_L[md_] if md_ else None,
               fica="FICA", fit=rng.choice(FIT_LABELS), state=rng.choice(STATE_LABELS))
    s.provider = rng.choice(PROVIDERS)

    # employer / employee blocks
    cty = rng.choice(CITIES)
    s.emp_addr = [f"{rng.randint(100, 9800)} {rng.choice(BIZ_STREETS)}, Suite {rng.randint(100, 640)}",
                  f"{cty[0]}, {cty[1]} {cty[2]}"]
    s.emp_phone = f"({rng.randint(201, 989)}) 555-{rng.randint(100, 199):04d}"
    cty2 = rng.choice(CITIES)
    apt = f", Apt {rng.randint(1, 48)}" if rng.random() < 0.4 else ""
    a1 = f"{rng.randint(12, 4999)} {rng.choice(STREETS)}{apt}"
    a2 = f"{cty2[0]}, {cty2[1]} {cty2[2]}"
    s.addr_lines = [a1, a2] if spec["addr"] else None
    s.address = f"{a1}, {a2}" if spec["addr"] else None
    s.ssn4 = f"{rng.randint(1000, 9998)}" if spec["ssn"] else None
    s.emp_id = f"{rng.randint(10000, 99999)}"
    s.dept = rng.choice(["Operations", "Admin", "Field Services", "Sales", "Production", "Support", "Warehouse"])
    s.bank4 = f"{rng.randint(1000, 9999)}"

    # period
    s.m, s.freq_label, _ = FREQ[s.freq][0], FREQ[s.freq][1], None
    lo, hi = N_RANGE[s.freq]
    s.n = rng.randint(lo, hi)
    s.p_start, s.p_end, s.pay_date = period_dates(s.freq, s.n)

    # earnings
    earn = []
    periods = FREQ[s.freq][0]
    if s.pay == "hourly":
        rate = rng.randrange(1650, 4800, 5)
        if spec["ot"]:
            reg_h = {"weekly": 4000, "biweekly": 8000, "semi-monthly": 8667, "monthly": 17333}[s.freq]
            ot_h = rng.choice([250, 375, 450, 600, 825, 950]) * (2 if s.freq in ("biweekly", "monthly") else 1)
        else:
            reg_h = rng.choice({"weekly": [3200, 3600, 3750, 4000], "biweekly": [6400, 7200, 7600, 8000],
                                "semi-monthly": [8000, 8667], "monthly": [14000, 16000, 17333]}[s.freq])
            ot_h = 0
        earn.append(dict(label="Regular", rate=rate, hours=reg_h, amt=rnd(Decimal(rate) * reg_h / 100)))
        if ot_h:
            otr = rnd(Decimal(rate) * Decimal("1.5"))
            earn.append(dict(label="Overtime", rate=otr, hours=ot_h, amt=rnd(Decimal(otr) * ot_h / 100)))
        s.sal_hours = None
    else:
        annual = rng.randrange(38000, 152000, 500)
        earn.append(dict(label=rng.choice(["Salary", "Regular Salary", "Base Salary"]), rate=None, hours=None,
                         amt=rnd(Decimal(annual) * 100 / periods)))
        s.sal_hours = {"weekly": 4000, "biweekly": 8000, "semi-monthly": 8667, "monthly": 17333}[s.freq]
        s.annual = annual
    if spec["bonus"]:
        earn.append(dict(label=rng.choice(BONUS_LABELS), rate=None, hours=None, amt=rng.randrange(20000, 150000, 2500)))
    s.earn = earn
    s.gross = sum(e["amt"] for e in earn)

    # deductions
    ded = []
    prem = 0
    if s.s125:
        lo_p, hi_p = {"weekly": (2500, 8000), "biweekly": (5000, 14000), "semi-monthly": (6000, 16000),
                      "monthly": (12000, 32000)}[s.freq]
        prem = min(rng.randrange(lo_p, hi_p, 25), s.gross // 5)
        ded.append(dict(kind="pretax", group="pretax", label=rng.choice(S125_LABELS), amt=prem))
    k401 = 0
    if not s.s125 and rng.random() < 0.45:
        k401 = rnd(Decimal(s.gross) * rng.choice([3, 4, 5, 6]) / 100)
    s.fica_wages = s.gross - prem
    fit_base = s.gross - prem - k401
    fit = rnd(Decimal(fit_base) * Decimal(rng.choice([7, 8, 9, 10, 11, 12, 14, 16])) / 100)
    ssamt = rnd(Decimal(s.fica_wages) * Decimal("0.062"))
    medamt = rnd(Decimal(s.fica_wages) * Decimal("0.0145"))
    ded.append(dict(kind="fit", group="tax", label=s.L["fit"], amt=fit))
    if s.combo:
        ded.append(dict(kind="fica", group="tax", label=s.L["fica"], amt=ssamt + medamt))
    else:
        ded.append(dict(kind="ss", group="tax", label=s.L["ss"], amt=ssamt))
        ded.append(dict(kind="med", group="tax", label=s.L["med"], amt=medamt))
    if rng.random() < 0.7:
        pct = Decimal(rng.choice([25, 30, 35, 40, 45, 50])) / 10
        ded.append(dict(kind="state", group="tax", label=s.L["state"], amt=rnd(Decimal(fit_base) * pct / 100)))
    if k401:
        ded.append(dict(kind="k401", group="other", label=rng.choice(["401(k)", "401K Employee", "Retirement 401(k)"]),
                        amt=k401))
    for lab, (a, b) in rng.sample(OTHER_DED, rng.choice([0, 1, 1, 2])):
        ded.append(dict(kind="other", group="other", label=lab, amt=rng.randrange(a, b, 5)))
    s.ded = ded
    s.total_ded = sum(x["amt"] for x in ded)
    s.net = s.gross - s.total_ded
    assert s.net > 0
    s.ss_amt = None if s.combo else ssamt
    s.med_amt = None if s.combo else medamt
    s.premium = prem

    # YTD = current x period number, stored explicitly (tampering leaves these untouched)
    for e in s.earn:
        e["ytd"] = e["amt"] * s.n
    for x in s.ded:
        x["ytd"] = x["amt"] * s.n
    s.ytd_gross = s.gross * s.n
    s.ytd_ded = s.total_ded * s.n
    s.ytd_net = s.net * s.n
    s.ytd_taxes = s.taxes_total * s.n
    s.tampered = False
    s.degrade = spec["deg"]
    s.lowres = spec["lowres"]
    s.ext = spec["ext"]
    return s


def tamper(base, rng):
    """Copy of a clean stub with the gross pay inflated 25-40%; SS, Medicare and every YTD figure untouched."""
    s = copy.deepcopy(base)
    f = Decimal(rng.randrange(2500, 4001, 25)) / 10000 + 1
    reg = s.earn[0]
    assert len(s.earn) == 1 and reg["rate"] is None  # salary-only sources
    reg["amt"] = rnd(Decimal(reg["amt"]) * f)
    s.gross = sum(e["amt"] for e in s.earn)
    s.net = s.gross - s.total_ded
    s.tampered = True
    s.tampered_from = base.num
    s.orig_gross, s.orig_net = base.gross, base.net
    return s


# --------------------------------------------------------------------------------------
# generic layout helpers
# --------------------------------------------------------------------------------------


def table(c, x0, x1, y, cols, rows, size=9, face="sans", row_h=15, head=None, head_fill=(228, 228, 228),
          head_color=BLACK, rule=(205, 205, 205), head_size=None):
    """cols = [(x, align)], rows = [cells | dict(cells=,bold=,fill=,top=,color=)]. Returns new y."""
    base = row_h - 4.5
    if head:
        if head_fill:
            c.rect(x0, y, x1 - x0, row_h, fill=head_fill)
        for (cx, al), t in zip(cols, head):
            if t:
                c.text(cx, y + base, t, head_size or size - 0.5, face, True, head_color, al)
        y += row_h
    for r in rows:
        if isinstance(r, dict):
            cells, bold, fill, top, col = r["cells"], r.get("bold", False), r.get("fill"), r.get("top"), r.get("color", BLACK)
        else:
            cells, bold, fill, top, col = r, False, None, False, BLACK
        if fill:
            c.rect(x0, y, x1 - x0, row_h, fill=fill)
        if top:
            c.line(x0, y, x1, y, BLACK, 0.8)
        for (cx, al), t in zip(cols, cells):
            if t not in (None, ""):
                c.text(cx, y + base, t, size, face, bold, col, al)
        if rule:
            c.line(x0, y + row_h, x1, y + row_h, rule, 0.4)
        y += row_h
    return y


def stack(c, x, y, lines, size=9, face="sans", gap=12, color=BLACK):
    for ln in lines:
        if isinstance(ln, str):
            ln = (ln, False, color)
        c.text(x, y, ln[0], size, face, ln[1], ln[2] if len(ln) > 2 else color)
        y += gap
    return y


def rate_str(e):
    return f"{e['rate'] / 100:,.2f}" if e["rate"] else ""


def hours_str(e, s=None):
    if e["hours"]:
        return f"{e['hours'] / 100:,.2f}"
    return ""


def earn_rows(s, ytd, rate=True, hours=True, salary_hours=False):
    out = []
    for e in s.earn:
        h = hours_str(e)
        if salary_hours and e["hours"] is None and e["rate"] is None and e is s.earn[0] and s.sal_hours:
            h = f"{s.sal_hours / 100:,.2f}"
        cells = [e["label"]]
        if rate:
            cells.append(rate_str(e))
        if hours:
            cells.append(h)
        cells.append(M(e["amt"]))
        if ytd:
            cells.append(M(e["ytd"]))
        out.append(cells)
    return out


def ssn_txt(s):
    return f"XXX-XX-{s.ssn4}" if s.ssn4 else None


def words(n):
    ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
            "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

    def h(x):
        if x < 20:
            return ones[x]
        if x < 100:
            return tens[x // 10] + ("-" + ones[x % 10] if x % 10 else "")
        return ones[x // 100] + " hundred" + (" " + h(x % 100) if x % 100 else "")

    if n == 0:
        return "zero"
    out = []
    if n >= 1000:
        out.append(h(n // 1000) + " thousand")
        n %= 1000
    if n:
        out.append(h(n))
    return " ".join(out)


# --------------------------------------------------------------------------------------
# layout 1: classic left-aligned table, YTD column beside Current
# --------------------------------------------------------------------------------------


def L_classic(c, s):
    F, X0, X1 = "sans", 40, 572
    c.text(X0, 62, s.employer, 16, F, True)
    for i, l in enumerate(s.emp_addr):
        c.text(X0, 78 + 11 * i, l, 9, F, color=GRAY)
    c.text(X1, 58, "EARNINGS STATEMENT", 13, F, True, align="r")
    y = 73
    c.text(X1, y, f"Pay Date: {s.d(s.pay_date)}", 9.5, F, align="r")
    y += 12
    if s.show_freq:
        c.text(X1, y, f"Pay Frequency: {s.freq_label}", 9.5, F, align="r")
        y += 12
    if s.show_n:
        c.text(X1, y, s.n_text("Pay Period #{n}"), 9.5, F, align="r")
    c.line(X0, 112, X1, 112, BLACK, 1.2)
    c.rect(X0, 120, X1 - X0, 80, stroke=LGRAY, lw=0.8)
    c.text(X0 + 8, 134, "EMPLOYEE", 7.5, F, True, GRAY)
    lines = [(s.person(), True)]
    if s.addr_lines:
        lines += s.addr_lines
    if s.ssn4:
        lines.append(f"SSN: {ssn_txt(s)}")
    stack(c, X0 + 8, 148, lines, 10, F, 12)
    c.text(330, 134, "PAY PERIOD", 7.5, F, True, GRAY)
    c.text(330, 148, s.period_str(), 10, F)
    c.text(330, 166, "EMPLOYEE ID / DEPARTMENT", 7.5, F, True, GRAY)
    c.text(330, 180, f"{s.emp_id}  /  {s.dept}", 10, F)
    y = 214
    if s.ytd_on:
        cols = [(X0 + 6, "l"), (300, "r"), (362, "r"), (462, "r"), (566, "r")]
        head = ["Earnings", "Rate", "Hours", "Current", "YTD"]
        tot = ["", "", "", M(s.gross), M(s.ytd_gross)]
    else:
        cols = [(X0 + 6, "l"), (330, "r"), (430, "r"), (566, "r")]
        head = ["Earnings", "Rate", "Hours", "Current"]
        tot = ["", "", "", M(s.gross)]
    rows = earn_rows(s, s.ytd_on)
    if not s.ytd_on:
        rows = [[r[0], r[1], r[2], r[3]] for r in rows]
    tot[0] = s.L["gross"]
    rows.append(dict(cells=tot, bold=True, top=True, fill=(244, 244, 244)))
    y = table(c, X0, X1, y, cols, rows, 9.5, F, 16, head)
    y += 16
    if s.ytd_on:
        cols = [(X0 + 6, "l"), (462, "r"), (566, "r")]
        head = ["Deductions", "Current", "YTD"]
    else:
        cols = [(X0 + 6, "l"), (566, "r")]
        head = ["Deductions", "Current"]
    rows = []
    for x in s.ded:
        rows.append([x["label"], M(x["amt"])] + ([M(x["ytd"])] if s.ytd_on else []))
    tr = ["Total Deductions", M(s.total_ded)] + ([M(s.ytd_ded)] if s.ytd_on else [])
    rows.append(dict(cells=tr, bold=True, top=True, fill=(244, 244, 244)))
    y = table(c, X0, X1, y, cols, rows, 9.5, F, 16, head)
    y += 18
    c.rect(X0, y, X1 - X0, 34, fill=(30, 30, 30))
    c.text(X0 + 10, y + 22, s.L["net"].upper(), 12, F, True, WHITE)
    c.text(X1 - 10, y + 22, D(s.net), 14, F, True, WHITE, "r")
    if s.ytd_on:
        c.text(X0 + 190, y + 22, f"YTD  {M(s.ytd_net)}", 9.5, F, False, (210, 210, 210))
    c.text(X0, 738, "This statement is for informational purposes only and is not a negotiable instrument.", 7.5, F,
           color=GRAY)
    c.text(X1, 738, f"Payroll processed by {s.provider}", 7.5, F, color=GRAY, align="r")


# --------------------------------------------------------------------------------------
# layout 2: two-column (earnings left / deductions right), banner header
# --------------------------------------------------------------------------------------


def L_two_col(c, s):
    F = "tahoma"
    NAVY = (24, 54, 94)
    c.rect(0, 0, 612, 74, fill=NAVY)
    c.text(36, 38, s.employer, 16, F, True, WHITE)
    c.text(36, 56, "Pay Statement", 10, F, False, (190, 205, 230))
    c.text(576, 34, s.emp_addr[0], 8, F, False, (220, 228, 240), "r")
    c.text(576, 46, s.emp_addr[1], 8, F, False, (220, 228, 240), "r")
    c.text(576, 58, s.emp_phone, 8, F, False, (220, 228, 240), "r")
    cells = [("EMPLOYEE", s.person()), ("PAY DATE", s.d(s.pay_date)), ("PAY PERIOD", s.period_str())]
    if s.show_n:
        cells.append(("PERIOD", s.n_text("Period {n} of {m}")))
    elif s.show_freq:
        cells.append(("FREQUENCY", s.freq_label))
    xs = [36, 200, 300, 480]
    for (lab, val), x in zip(cells, xs):
        c.text(x, 98, lab, 7, F, True, GRAY)
        c.text(x, 112, val, 9, F, True)
    ly = 126
    if s.addr_lines:
        c.text(36, ly + 4, ", ".join(s.addr_lines), 8.5, F, False, (60, 60, 60))
    if s.ssn4:
        c.text(36, ly + 17, f"SSN {ssn_txt(s)}", 8.5, F, False, (60, 60, 60))
    c.text(480, ly + 4, f"Employee ID {s.emp_id}", 8.5, F, False, (60, 60, 60))
    c.line(36, 156, 576, 156, NAVY, 1)
    y0 = 170
    c.text(36, y0, "EARNINGS", 9, F, True, NAVY)
    c.text(346, y0, "DEDUCTIONS", 9, F, True, NAVY)
    yt = y0 + 6
    if s.ytd_on:
        lc = [(40, "l"), (170, "r"), (250, "r"), (326, "r")]
        lh = ["Description", "Hours", "Current", "YTD"]
        rc = [(350, "l"), (480, "r"), (572, "r")]
        rh = ["Description", "Current", "YTD"]
    else:
        lc = [(40, "l"), (200, "r"), (326, "r")]
        lh = ["Description", "Hours", "Current"]
        rc = [(350, "l"), (572, "r")]
        rh = ["Description", "Current"]
    rows = []
    for e in s.earn:
        lab = e["label"] + (f" @ {rate_str(e)}" if e["rate"] else "")
        r = [lab, hours_str(e), M(e["amt"])] + ([M(e["ytd"])] if s.ytd_on else [])
        rows.append(r)
    rows.append(dict(cells=[s.L["gross"], "", M(s.gross)] + ([M(s.ytd_gross)] if s.ytd_on else []), bold=True,
                     top=True))
    table(c, 36, 330, yt, lc, rows, 8.5, F, 16, lh, (225, 232, 243))
    rows = [[x["label"], M(x["amt"])] + ([M(x["ytd"])] if s.ytd_on else []) for x in s.ded]
    rows.append(dict(cells=["Total Deductions", M(s.total_ded)] + ([M(s.ytd_ded)] if s.ytd_on else []), bold=True,
                     top=True))
    yend = table(c, 346, 576, yt, rc, rows, 8.5, F, 16, rh, (225, 232, 243))
    y = max(yend, yt + 16 * (len(s.earn) + 2)) + 26
    c.rect(36, y, 540, 52, fill=(238, 242, 248), stroke=NAVY, lw=0.8)
    for i, (lab, val) in enumerate([(s.L["gross"], s.gross), ("Total Deductions", s.total_ded)]):
        c.text(52 + i * 150, y + 20, lab, 8, F, False, GRAY)
        c.text(52 + i * 150, y + 38, D(val), 12, F, True)
    c.text(360, y + 20, s.L["net"], 8, F, False, GRAY)
    c.text(360, y + 41, D(s.net), 18, F, True, NAVY)
    if s.ytd_on:
        c.text(570, y + 41, f"YTD {M(s.ytd_net)}", 8.5, F, False, GRAY, "r")
    c.text(36, 740, f"Payroll services by {s.provider}.  Retain this statement for your records.", 7.5, F, color=GRAY)


# --------------------------------------------------------------------------------------
# layout 3: multi-box dashboard / cards; YTD as a separate summary card
# --------------------------------------------------------------------------------------


def L_dashboard(c, s):
    F = "sans"
    TEAL = (0, 118, 130)
    c.rect(0, 0, 612, 792, fill=(238, 242, 244))

    def card(x, y, w, h, title=None):
        c.rrect(x, y, w, h, 5, fill=WHITE, stroke=(214, 222, 226), lw=0.8)
        if title:
            c.text(x + 12, y + 18, title.upper(), 7.5, F, True, TEAL)

    c.rrect(30, 30, 40, 40, 6, fill=TEAL)
    c.text(50, 56, "".join(w[0] for w in s.employer.replace("&", "").split()[:2]).upper(), 14, F, True, WHITE, "c")
    c.text(80, 48, s.employer, 15, F, True, (25, 40, 50))
    c.text(80, 62, f"{s.emp_addr[0]}  |  {s.emp_addr[1]}", 8, F, False, GRAY)
    c.text(582, 48, "Pay Stub", 12, F, True, TEAL, "r")
    c.text(582, 62, f"Paid {s.d(s.pay_date)}", 9, F, False, GRAY, "r")
    # KPI cards
    kp = [(s.L["gross"], s.gross, (25, 40, 50)), ("Total Taxes", s.taxes_total, (25, 40, 50)),
          ("Other Deductions", s.total_ded - s.taxes_total, (25, 40, 50)), (s.L["net"], s.net, TEAL)]
    for i, (lab, val, col) in enumerate(kp):
        x = 30 + i * 138
        card(x, 88, 128, 56)
        c.text(x + 12, 108, lab, 8, F, False, GRAY)
        c.text(x + 12, 132, D(val), 15, F, True, col)
    # employee card
    card(30, 156, 552, 82, "Employee & pay period")
    stack(c, 42, 194, [(s.person(), True)] + ([", ".join(s.addr_lines)] if s.addr_lines else []) +
          ([f"SSN: {ssn_txt(s)}"] if s.ssn4 else []), 9, F, 12)
    x = 340
    c.text(x, 194, "Pay period", 8, F, False, GRAY)
    c.text(x + 70, 194, s.period_str(), 9, F, True)
    c.text(x, 208, "Pay date", 8, F, False, GRAY)
    c.text(x + 70, 208, s.d(s.pay_date), 9, F)
    k = 222
    if s.show_freq:
        c.text(x, k, "Frequency", 8, F, False, GRAY)
        c.text(x + 70, k, s.freq_label, 9, F)
        k += 13
    if s.show_n:
        c.text(x, k, "Pay period", 8, F, False, GRAY)
        c.text(x + 70, k, s.n_text("#{n} of {m}"), 9, F)
    # earnings card
    card(30, 250, 552, 50 + 17 * (len(s.earn) + 2), "Earnings")
    rows = earn_rows(s, False, rate=True, hours=True)
    rows.append(dict(cells=[s.L["gross"], "", "", M(s.gross)], bold=True, top=True))
    cols = [(42, "l"), (330, "r"), (420, "r"), (570, "r")]
    yy = table(c, 36, 576, 280, cols, rows, 9, F, 17, ["Description", "Rate", "Hours", "Amount"], None)
    # deductions card
    top = yy + 22
    card(30, top, 552, 36 + 17 * (len(s.ded) + 1), "Taxes & deductions")
    rows = [[x["label"], M(x["amt"])] for x in s.ded]
    rows.append(dict(cells=["Total deductions", M(s.total_ded)], bold=True, top=True))
    yy = table(c, 36, 576, top + 26, [(42, "l"), (570, "r")], rows, 9, F, 17, None, None)
    # ytd card
    top = yy + 24
    if s.ytd_on:
        card(30, top, 552, 78, "Year to date")
        for i, (lab, val) in enumerate([(f"YTD {s.L['gross']}", s.ytd_gross), ("YTD Taxes", s.ytd_taxes),
                                        ("YTD Deductions", s.ytd_ded), (f"YTD {s.L['net']}", s.ytd_net)]):
            xx = 42 + i * 135
            c.text(xx, top + 42, lab, 8, F, False, GRAY)
            c.text(xx, top + 62, D(val), 12, F, True)
    else:
        card(30, top, 552, 50, "Note")
        c.text(42, top + 38, "Year-to-date totals are available in the employee portal.", 8.5, F, False, GRAY)
    c.text(306, 756, f"Powered by {s.provider}", 7.5, F, color=GRAY, align="c")


# --------------------------------------------------------------------------------------
# layout 4: dense small-print payroll-bureau style
# --------------------------------------------------------------------------------------


def L_dense(c, s):
    F, X0, X1 = "tahoma", 28, 584
    c.text(X0, 38, s.employer.upper(), 10.5, F, True)
    c.text(X0, 48, f"{s.emp_addr[0]}  {s.emp_addr[1]}", 6.5, F, color=GRAY)
    c.text(X1, 38, "STATEMENT OF EARNINGS AND DEDUCTIONS", 9, F, True, align="r")
    c.text(X1, 48, f"Company Code {s.emp_id[:3]}  |  Pay Group {s.freq[:2].upper()}1  |  Page 1 of 1", 6.5, F,
           color=GRAY, align="r")
    c.line(X0, 54, X1, 54, BLACK, 1.5)
    cells = [("EMPLOYEE NAME", s.person()), ("EMPLOYEE NO.", s.emp_id), ("DEPARTMENT", s.dept.upper()),
             ("PERIOD BEGIN", s.d(s.p_start)), ("PERIOD END", s.d(s.p_end)), ("PAY DATE", s.d(s.pay_date)),
             ("SOC SEC NO.", ssn_txt(s) or "-"), ("FILING STATUS", "S / 1"), ("PAY CLASS", s.freq_label.upper() if s.show_freq else "REG"),
             ("PAY PERIOD NO.", s.n_text("{n}/{m}") if s.show_n else "-")]
    cw = (X1 - X0) / 5
    for i, (lab, val) in enumerate(cells):
        cx, cy = X0 + (i % 5) * cw, 58 + (i // 5) * 26
        c.rect(cx, cy, cw, 26, stroke=(120, 120, 120), lw=0.4)
        c.text(cx + 3, cy + 8, lab, 5.5, F, False, GRAY)
        c.text(cx + 3, cy + 20, val, 7.5, F, True)
    y = 114
    if s.addr_lines:
        c.rect(X0, y, X1 - X0, 16, stroke=(120, 120, 120), lw=0.4)
        c.text(X0 + 3, y + 6.5, "HOME ADDRESS", 5.5, F, False, GRAY)
        c.text(X0 + 3, y + 13.5, ", ".join(s.addr_lines).upper(), 7, F, True)
        y += 16
    y += 8
    if s.ytd_on:
        cols = [(X0 + 3, "l"), (270, "r"), (330, "r"), (440, "r"), (X1 - 4, "r")]
        head = ["EARNINGS", "RATE", "HOURS", "THIS PERIOD", "YEAR TO DATE"]
    else:
        cols = [(X0 + 3, "l"), (330, "r"), (400, "r"), (X1 - 4, "r")]
        head = ["EARNINGS", "RATE", "HOURS", "THIS PERIOD"]
    rows = []
    for e in s.earn:
        r = [e["label"].upper(), rate_str(e), hours_str(e), M(e["amt"])] + ([M(e["ytd"])] if s.ytd_on else [])
        if not s.ytd_on:
            r = r[:4]
        rows.append(r)
    rows.append(dict(cells=[s.L["gross"].upper(), "", "", M(s.gross)] + ([M(s.ytd_gross)] if s.ytd_on else []),
                     bold=True, top=True))
    y = table(c, X0, X1, y, cols, rows, 7, F, 11.5, head, (215, 215, 215), rule=(170, 170, 170), head_size=6)
    y += 8
    half = (X1 - X0) / 2 - 4
    tax = s.ded_rows({"tax"})
    oth = s.ded_rows({"pretax", "other"})
    if s.ytd_on:
        lc, rc = [(X0 + 3, "l"), (X0 + half - 70, "r"), (X0 + half - 4, "r")], [(X0 + half + 11, "l"), (X1 - 70, "r"), (X1 - 4, "r")]
        h1, h2 = ["STATUTORY / TAXES", "THIS PERIOD", "YTD"], ["OTHER DEDUCTIONS", "THIS PERIOD", "YTD"]
    else:
        lc, rc = [(X0 + 3, "l"), (X0 + half - 4, "r")], [(X0 + half + 11, "l"), (X1 - 4, "r")]
        h1, h2 = ["STATUTORY / TAXES", "THIS PERIOD"], ["OTHER DEDUCTIONS", "THIS PERIOD"]

    def drows(lst):
        return [[x["label"].upper(), M(x["amt"])] + ([M(x["ytd"])] if s.ytd_on else []) for x in lst]

    ya = table(c, X0, X0 + half, y, lc, drows(tax), 7, F, 11.5, h1, (215, 215, 215), rule=(170, 170, 170), head_size=6)
    orows = drows(oth) or [["(NONE)", "0.00"] + (["0.00"] if s.ytd_on else [])]
    yb = table(c, X0 + half + 8, X1, y, rc, orows, 7, F, 11.5, h2, (215, 215, 215), rule=(170, 170, 170), head_size=6)
    y = max(ya, yb) + 8
    # taxable wage bases
    c.rect(X0, y, X1 - X0, 24, stroke=(120, 120, 120), lw=0.4)
    fit_base = s.gross - s.premium - sum(x["amt"] for x in s.ded if x["kind"] == "k401")
    items = [("FED TAXABLE WAGES", fit_base), ("FICA/MEDI WAGES", s.fica_wages), ("TOTAL DEDUCTIONS", s.total_ded),
             ("PRE-TAX DEDUCTIONS", s.premium)]
    for i, (lab, val) in enumerate(items):
        xx = X0 + 4 + i * (X1 - X0) / 4
        c.text(xx, y + 8, lab, 5.5, F, False, GRAY)
        c.text(xx, y + 19, M(val), 7.5, F, True)
    y += 34
    c.rect(X0, y, X1 - X0, 52, stroke=(120, 120, 120), lw=0.4)
    c.text(X0 + 4, y + 9, "OTHER BENEFITS AND INFORMATION", 6, F, True)
    ln = [f"VACATION BAL  {rnd(Decimal(s.n) * 308) / 100:.2f} HRS     SICK BAL  {rnd(Decimal(s.n) * 154) / 100:.2f} HRS",
          f"DIRECT DEPOSIT  CHECKING XXXX{s.bank4}   -   {s.L['net'].upper()} {M(s.net)}",
          "QUESTIONS ABOUT THIS STATEMENT? CONTACT PAYROLL, " + s.emp_phone]
    stack(c, X0 + 4, y + 20, ln, 6.5, F, 10)
    y += 64
    c.line(X0, y, X1, y, BLACK, 0.8, dash=(4, 3))
    c.text(X0, y + 14, s.L["net"].upper(), 11, F, True)
    c.text(300, y + 14, f"(GROSS {M(s.gross)}  -  DEDUCTIONS {M(s.total_ded)})", 7, F, color=GRAY, align="c")
    c.text(X1, y + 14, D(s.net), 12, F, True, align="r")
    c.text(X0, 760, f"{s.provider}  -  CONFIDENTIAL - FOR EMPLOYEE USE ONLY", 6, F, color=GRAY)


# --------------------------------------------------------------------------------------
# layout 5: mock paycheck on top, stub below
# --------------------------------------------------------------------------------------


def L_check(c, s):
    F = "sans"
    c.rect(32, 28, 548, 262, fill=(247, 250, 247), stroke=(70, 110, 80), lw=1.4)
    c.rect(38, 34, 536, 250, stroke=(150, 180, 155), lw=0.5)
    c.text(50, 58, s.employer, 13, F, True)
    c.text(50, 71, s.emp_addr[0], 8, F, color=GRAY)
    c.text(50, 82, s.emp_addr[1], 8, F, color=GRAY)
    bank = ["Lakeshore Trust & Savings", "First Harbor Bank", "Pioneer Valley Credit Union"][s.num % 3]
    c.text(300, 58, bank, 10, F, True, (50, 90, 60), "c")
    c.text(300, 70, "Member institution - Anywhere, USA", 7, F, color=GRAY, align="c")
    c.text(560, 58, f"No. {4000 + s.num * 7 + s.n}", 11, F, True, (170, 30, 30), "r")
    c.text(560, 74, f"DATE  {s.d(s.pay_date)}", 9, F, False, BLACK, "r")
    c.text(50, 126, "PAY TO THE", 7, F, color=GRAY)
    c.text(50, 135, "ORDER OF", 7, F, color=GRAY)
    c.text(110, 135, s.person(), 12, F, True)
    if s.addr_lines:
        c.text(110, 148, ", ".join(s.addr_lines).upper(), 7.5, F, color=GRAY)
    c.rect(430, 120, 130, 24, stroke=BLACK, lw=1)
    c.text(436, 137, "$", 10, F, True)
    c.text(554, 137, f"**{M(s.net)}", 12, F, True, align="r")
    dol, cen = divmod(s.net, 100)
    c.text(50, 176, f"{words(dol).capitalize()} and {cen:02d}/100", 10, F, True)
    c.text(560, 176, "DOLLARS", 8, F, False, BLACK, "r")
    c.line(50, 180, 560, 180, (150, 150, 150), 0.5)
    c.text(50, 214, f"MEMO: Payroll  {s.period_str()}", 8, F, color=GRAY)
    c.line(370, 232, 560, 232, BLACK, 0.7)
    c.text(465, 243, "Authorized Signature", 7, F, color=GRAY, align="c")
    c.text(50, 266, f"A{rng_digits(s.num, 9)}A  C{rng_digits(s.num + 50, 10)}C  {4000 + s.num * 7 + s.n}", 11, "mono")
    c.text(560, 266, "VOID AFTER 90 DAYS", 7, F, color=GRAY, align="r")
    c.line(32, 308, 580, 308, GRAY, 0.8, dash=(5, 3))
    c.text(306, 304, "DETACH BEFORE DEPOSITING - EARNINGS STATEMENT", 7, F, True, GRAY, "c")
    # stub
    c.text(36, 332, s.employer, 10, F, True)
    c.text(576, 332, f"Pay Date {s.d(s.pay_date)}", 9, F, False, BLACK, "r")
    y = 346
    c.text(36, y + 4, f"{s.person()}   (ID {s.emp_id})", 8.5, F, True)
    c.text(576, y + 4, f"Period {s.period_str()}" + (f"   {s.freq_label}" if s.show_freq else ""), 8.5, F, False,
           BLACK, "r")
    if s.addr_lines or s.ssn4:
        c.text(36, y + 17, "   ".join(filter(None, [", ".join(s.addr_lines) if s.addr_lines else None,
                                                     f"SSN {ssn_txt(s)}" if s.ssn4 else None])), 8, F, color=GRAY)
    if s.show_n:
        c.text(576, y + 17, s.n_text("Pay Period {n} of {m}"), 8, F, color=GRAY, align="r")
    y += 30
    if s.ytd_on:
        lc = [(40, "l"), (150, "r"), (200, "r"), (264, "r"), (330, "r")]
        lh = ["EARNINGS", "Rate", "Hours", "Current", "YTD"]
        rc = [(350, "l"), (490, "r"), (576, "r")]
        rh = ["DEDUCTIONS", "Current", "YTD"]
    else:
        lc = [(40, "l"), (170, "r"), (230, "r"), (330, "r")]
        lh = ["EARNINGS", "Rate", "Hours", "Current"]
        rc = [(350, "l"), (576, "r")]
        rh = ["DEDUCTIONS", "Current"]
    rows = earn_rows(s, s.ytd_on)
    rows.append(dict(cells=[s.L["gross"], "", "", M(s.gross)] + ([M(s.ytd_gross)] if s.ytd_on else []), bold=True,
                     top=True))
    table(c, 36, 336, y, lc, rows, 8.5, F, 15, lh, (225, 235, 225))
    rows = [[x["label"], M(x["amt"])] + ([M(x["ytd"])] if s.ytd_on else []) for x in s.ded]
    rows.append(dict(cells=["Total", M(s.total_ded)] + ([M(s.ytd_ded)] if s.ytd_on else []), bold=True, top=True))
    ye = table(c, 346, 580, y, rc, rows, 8.5, F, 15, rh, (225, 235, 225))
    ye = max(ye, y + 15 * (len(s.earn) + 2)) + 12
    c.rect(36, ye, 544, 30, fill=(70, 110, 80))
    c.text(48, ye + 20, s.L["net"], 11, F, True, WHITE)
    c.text(568, ye + 20, D(s.net), 13, F, True, WHITE, "r")
    c.text(36, 760, f"Payroll processed by {s.provider}", 7, F, color=GRAY)


def rng_digits(seed, n):
    r = random.Random(seed * 7919)
    return "".join(str(r.randint(0, 9)) for _ in range(n))


# --------------------------------------------------------------------------------------
# layout 6: minimalist modern startup; YTD in a separate block
# --------------------------------------------------------------------------------------


def L_minimal(c, s):
    F = "calibri"
    INK, SOFT = (30, 30, 36), (125, 125, 135)
    c.text(48, 70, s.employer.lower().replace(".", "").replace(",", ""), 15, F, True, INK)
    c.text(564, 70, f"payslip / {s.d(s.pay_date)}", 11, F, False, SOFT, "r")
    c.text(48, 118, "Hi " + s.name.split()[0] + ", here is your payslip.", 11.5, F, False, SOFT)
    c.text(48, 168, s.L["net"], 12, F, False, SOFT)
    c.text(48, 214, D(s.net), 40, F, True, INK)
    y = 250
    c.line(48, y, 564, y, (225, 225, 230), 1)
    y += 24
    info = [("Employee", s.person())]
    if s.addr_lines:
        info.append(("Address", ", ".join(s.addr_lines)))
    if s.ssn4:
        info.append(("SSN", ssn_txt(s)))
    info.append(("Period", s.period_str()))
    info.append(("Pay date", s.d(s.pay_date)))
    if s.show_freq:
        info.append(("Schedule", s.freq_label))
    for lab, val in info:
        c.text(48, y, lab, 10, F, False, SOFT)
        c.text(200, y, val, 10.5, F, False, INK)
        y += 16
    y += 12
    c.line(48, y, 564, y, (225, 225, 230), 1)
    y += 24
    c.text(48, y, "Earnings", 12, F, True, INK)
    y += 20
    for e in s.earn:
        c.text(48, y, e["label"], 10.5, F, False, INK)
        c.text(564, y, M(e["amt"]), 10.5, F, False, INK, "r")
        if e["hours"]:
            c.text(48, y + 12, f"{e['hours'] / 100:.2f} hrs x ${rate_str(e)}", 9, F, False, SOFT)
            y += 12
        y += 18
    c.text(48, y, s.L["gross"], 10.5, F, True, INK)
    c.text(564, y, M(s.gross), 10.5, F, True, INK, "r")
    y += 30
    c.text(48, y, "Taxes & deductions", 12, F, True, INK)
    y += 20
    for x in s.ded:
        c.text(48, y, x["label"], 10.5, F, False, INK)
        c.text(564, y, "-" + M(x["amt"]), 10.5, F, False, INK, "r")
        y += 17
    y += 10
    c.line(48, y - 8, 564, y - 8, (225, 225, 230), 1)
    c.text(48, y + 6, s.L["net"], 10.5, F, True, INK)
    c.text(564, y + 6, M(s.net), 10.5, F, True, INK, "r")
    y += 40
    if s.ytd_on:
        c.rrect(48, y, 516, 70, 6, fill=(244, 245, 248))
        c.text(62, y + 22, "Year to date", 11, F, True, INK)
        for i, (lab, val) in enumerate([("Gross", s.ytd_gross), ("Taxes", s.ytd_taxes), ("Net", s.ytd_net)]):
            c.text(62 + i * 165, y + 42, lab, 9, F, False, SOFT)
            c.text(62 + i * 165, y + 59, D(val), 12, F, True, INK)
        if s.show_n:
            c.text(552, y + 22, s.n_text("Pay period {n} of {m}"), 9, F, False, SOFT, "r")
    c.text(48, 752, f"{s.employer}  -  {s.emp_addr[0]}, {s.emp_addr[1]}", 8.5, F, False, SOFT)


# --------------------------------------------------------------------------------------
# layout 7 / 20: monospaced dot-matrix on green-bar paper
# --------------------------------------------------------------------------------------


def L_dot(c, s):
    F, SZ, LH, X0 = "mono", 9.5, 12.2, 34
    W = 90
    INK = (30, 40, 70)
    paper = (250, 252, 246)
    c.rect(0, 0, 612, 792, fill=paper)
    y = 18
    while y < 792:
        if int((y - 18) // (LH * 3)) % 2 == 1:
            c.rect(0, y, 612, LH * 3, fill=(218, 238, 220))
        y += LH * 3
    for hy in range(30, 792, 36):
        for hx in (14, 598):
            c.ellipse(hx - 4, hy - 4, 8, 8, fill=(190, 190, 185), stroke=(150, 150, 150), lw=0.5)
    U = lambda t: t.upper()

    def two(a, b):
        return a.ljust(W - len(b)) + b

    L = []
    L.append(two(U(s.employer), "EARNINGS STATEMENT"))
    L.append(U(s.emp_addr[0]))
    L.append(U(s.emp_addr[1]))
    L.append("=" * W)
    L.append(two(f"EMPLOYEE: {U(s.person())}", f"EMP NO: {s.emp_id}"))
    if s.addr_lines:
        L.append(U(", ".join(s.addr_lines)))
    if s.ssn4:
        L.append(f"SSN: {ssn_txt(s)}")
    L.append(two(f"PAY PERIOD: {s.period_str()}", f"PAY DATE: {s.d(s.pay_date)}"))
    extra = []
    if s.show_freq:
        extra.append(f"FREQ: {U(s.freq_label)}")
    if s.show_n:
        extra.append(s.n_text("PERIOD {n} OF {m}"))
    extra.append(f"DEPT: {U(s.dept)}")
    L.append("   ".join(extra))
    L.append("=" * W)
    yt = s.ytd_on
    hd = "EARNINGS".ljust(26) + "RATE".rjust(10) + "HOURS".rjust(10) + "CURRENT".rjust(15) + ("YTD".rjust(15) if yt else "")
    L.append(hd)
    L.append("-" * W)
    for e in s.earn:
        L.append(U(e["label"]).ljust(26) + (rate_str(e)).rjust(10) + hours_str(e).rjust(10) + M(e["amt"]).rjust(15) +
                 (M(e["ytd"]).rjust(15) if yt else ""))
    L.append("-" * W)
    L.append(U(s.L["gross"]).ljust(46) + M(s.gross).rjust(15) + (M(s.ytd_gross).rjust(15) if yt else ""))
    L.append("")
    L.append("DEDUCTIONS".ljust(46) + "CURRENT".rjust(15) + ("YTD".rjust(15) if yt else ""))
    L.append("-" * W)
    for x in s.ded:
        L.append(U(x["label"]).ljust(46) + M(x["amt"]).rjust(15) + (M(x["ytd"]).rjust(15) if yt else ""))
    L.append("-" * W)
    L.append("TOTAL DEDUCTIONS".ljust(46) + M(s.total_ded).rjust(15) + (M(s.ytd_ded).rjust(15) if yt else ""))
    L.append("")
    L.append("=" * W)
    L.append(U(s.L["net"]).ljust(46) + ("$" + M(s.net)).rjust(15) + (M(s.ytd_net).rjust(15) if yt else ""))
    L.append("=" * W)
    L.append("")
    L.append(f"DIRECT DEPOSIT TO CHECKING ACCT XXXX{s.bank4}")
    L.append("*** NON-NEGOTIABLE - THIS IS NOT A CHECK ***")
    L.append(U(f"PROCESSED BY {s.provider}"))
    y = 40
    for ln in L:
        c.text(X0, y, ln, SZ, F, False, INK)
        y += LH


# --------------------------------------------------------------------------------------
# layout 8 / 18: landscape, three columns
# --------------------------------------------------------------------------------------


def L_landscape(c, s):
    F = "verdana"
    BR = (120, 50, 20)
    c.rect(24, 24, 744, 564, stroke=(90, 90, 90), lw=1)
    # logo placeholder + employer top-left, address block top-right
    c.rect(36, 36, 58, 44, fill=(235, 228, 220), stroke=BR, lw=1)
    c.line(36, 36, 94, 80, BR, 0.6)
    c.line(36, 80, 94, 36, BR, 0.6)
    c.text(106, 54, s.employer, 15, F, True, BR)
    c.text(106, 70, "Payroll Earnings Statement", 9, F, False, GRAY)
    for i, l in enumerate(s.emp_addr + [s.emp_phone]):
        c.text(756, 48 + i * 11, l, 8, F, False, GRAY, "r")
    c.line(36, 92, 756, 92, BR, 1.5)
    # employee block / period block
    stack(c, 36, 112, [(s.person(), True)] + (s.addr_lines or []) + ([f"SSN {ssn_txt(s)}"] if s.ssn4 else []) +
          [f"Employee ID {s.emp_id}"], 9, F, 12)
    blk = [("Pay Period", s.period_str()), ("Pay Date", s.d(s.pay_date))]
    if s.show_freq:
        blk.append(("Frequency", s.freq_label))
    if s.show_n:
        blk.append(("Period No.", s.n_text("{n} of {m}")))
    yy = 112
    for lab, val in blk:
        c.text(480, yy, lab + ":", 8.5, F, False, GRAY)
        c.text(560, yy, val, 9, F, True)
        yy += 12
    y0 = 182
    colw, gap = 236, 12
    xs = [36 + i * (colw + gap) for i in range(3)]
    yt = s.ytd_on

    def cols3(x):
        return [(x + 3, "l"), (x + colw - 88, "r"), (x + colw - 4, "r")] if yt else [(x + 3, "l"), (x + colw - 4, "r")]

    head = (["", "Current", "YTD"] if yt else ["", "Current"])
    # earnings
    rows = []
    for e in s.earn:
        lab = e["label"] + (f" {e['hours'] / 100:.2f}h @ {rate_str(e)}" if e["hours"] else "")
        rows.append([lab, M(e["amt"])] + ([M(e["ytd"])] if yt else []))
    rows.append(dict(cells=[s.L["gross"], M(s.gross)] + ([M(s.ytd_gross)] if yt else []), bold=True, top=True))
    h = ["EARNINGS"] + head[1:]
    ya = table(c, xs[0], xs[0] + colw, y0, cols3(xs[0]), rows, 7.5, F, 15, h, (240, 228, 218))
    # taxes
    tax = [[x["label"], M(x["amt"])] + ([M(x["ytd"])] if yt else []) for x in s.ded_rows({"tax"})]
    tax.append(dict(cells=["Total Taxes", M(s.taxes_total)] + ([M(s.ytd_taxes)] if yt else []), bold=True, top=True))
    yb = table(c, xs[1], xs[1] + colw, y0, cols3(xs[1]), tax, 7.5, F, 15, ["TAXES"] + head[1:], (240, 228, 218))
    # other deductions
    o = s.ded_rows({"pretax", "other"})
    orows = [[x["label"], M(x["amt"])] + ([M(x["ytd"])] if yt else []) for x in o] or \
            [["(none)", "0.00"] + (["0.00"] if yt else [])]
    ot = s.total_ded - s.taxes_total
    orows.append(dict(cells=["Total Other", M(ot)] + ([M(ot * s.n)] if yt else []), bold=True, top=True))
    yc = table(c, xs[2], xs[2] + colw, y0, cols3(xs[2]), orows, 7.5, F, 15, ["OTHER DEDUCTIONS"] + head[1:], (240, 228, 218))
    by = max(ya, yb, yc) + 24
    # bottom boxes
    boxes = [(s.L["gross"], s.gross), ("All Deductions", s.total_ded), (s.L["net"], s.net)]
    bw = 170
    for i, (lab, val) in enumerate(boxes):
        x = 36 + i * (bw + 10)
        c.rect(x, by, bw, 54, fill=(240, 228, 218) if i < 2 else BR)
        col = BLACK if i < 2 else WHITE
        c.text(x + 10, by + 18, lab, 8.5, F, False, col)
        c.text(x + 10, by + 44, D(val), 16, F, True, col)
    c.text(596, by + 18, f"Direct deposit: checking XXXX{s.bank4}", 8, F, False, GRAY)
    c.text(596, by + 32, f"Deposited {s.d(s.pay_date)}", 8, F, False, GRAY)
    c.text(36, 574, f"Processed by {s.provider}. Keep for your records.", 7.5, F, False, GRAY)


# --------------------------------------------------------------------------------------
# layout 9 / 22: main body = current only, sidebar = YTD summary block
# --------------------------------------------------------------------------------------


def L_sidebar(c, s):
    F = "tahoma"
    SB = (234, 239, 246)
    X0, X1 = 36, 398
    c.rect(418, 0, 194, 792, fill=SB)
    c.text(X0, 58, s.employer, 15, F, True, (20, 50, 100))
    for i, l in enumerate(s.emp_addr):
        c.text(X0, 74 + 11 * i, l, 8.5, F, color=GRAY)
    c.line(X0, 100, X1, 100, (20, 50, 100), 1.5)
    stack(c, X0, 120, [("Prepared for", False, GRAY), (s.person(), True)] + (s.addr_lines or []) +
          ([f"SSN: {ssn_txt(s)}"] if s.ssn4 else []), 9, F, 12)
    c.text(X0 + 200, 120, "Pay period", 8, F, False, GRAY)
    c.text(X0 + 200, 132, s.period_str(), 9, F, True)
    c.text(X0 + 200, 148, "Pay date", 8, F, False, GRAY)
    c.text(X0 + 200, 160, s.d(s.pay_date), 9, F, True)
    y = 200
    rows = earn_rows(s, False)
    rows.append(dict(cells=[s.L["gross"], "", "", M(s.gross)], bold=True, top=True))
    y = table(c, X0, X1, y, [(X0 + 2, "l"), (252, "r"), (312, "r"), (X1 - 2, "r")], rows, 8.5, F, 15,
              ["Earnings", "Rate", "Hours", "Amount"], (224, 231, 242))
    y += 14
    tr = [[x["label"], M(x["amt"])] for x in s.ded_rows({"tax"})]
    y = table(c, X0, X1, y, [(X0 + 2, "l"), (X1 - 2, "r")], tr, 8.5, F, 15, ["Taxes", "Amount"], (224, 231, 242))
    y += 14
    orw = [[x["label"], M(x["amt"])] for x in s.ded_rows({"pretax", "other"})]
    if orw:
        y = table(c, X0, X1, y, [(X0 + 2, "l"), (X1 - 2, "r")], orw, 8.5, F, 15, ["Other deductions", "Amount"],
                  (224, 231, 242))
        y += 14
    c.rect(X0, y, X1 - X0, 34, fill=(20, 50, 100))
    c.text(X0 + 10, y + 22, s.L["net"], 11, F, True, WHITE)
    c.text(X1 - 10, y + 22, D(s.net), 14, F, True, WHITE, "r")
    # sidebar
    sx = 434
    if s.ytd_on:
        c.text(sx, 70, "YEAR-TO-DATE SUMMARY", 9, F, True, (20, 50, 100))
        items = [(f"{s.L['gross']} YTD", s.ytd_gross), ("Total taxes YTD", s.ytd_taxes),
                 ("Total deductions YTD", s.ytd_ded), (f"{s.L['net']} YTD", s.ytd_net)]
    else:
        c.text(sx, 70, "THIS PERIOD AT A GLANCE", 9, F, True, (20, 50, 100))
        items = [(s.L["gross"], s.gross), ("Total taxes", s.taxes_total), ("Total deductions", s.total_ded),
                 (s.L["net"], s.net)]
    yy = 96
    for lab, val in items:
        c.text(sx, yy, lab, 8, F, False, GRAY)
        c.text(sx, yy + 16, D(val), 12, F, True)
        yy += 42
    yy += 10
    c.line(sx, yy, 596, yy, (20, 50, 100), 0.6)
    yy += 18
    if s.show_n:
        c.text(sx, yy, "Pay period", 8, F, False, GRAY)
        c.text(sx, yy + 14, s.n_text("{n} of {m}"), 10, F, True)
        yy += 36
    if s.show_freq:
        c.text(sx, yy, "Pay schedule", 8, F, False, GRAY)
        c.text(sx, yy + 14, s.freq_label, 10, F, True)
        yy += 36
    c.text(sx, yy, "Employee ID", 8, F, False, GRAY)
    c.text(sx, yy + 14, s.emp_id, 10, F, True)
    c.text(sx, 752, s.provider, 7.5, F, False, GRAY)


# --------------------------------------------------------------------------------------
# layout 10: traditional serif, logo top-right, employer address bottom-left
# --------------------------------------------------------------------------------------


def L_serif(c, s):
    F = "georgia"
    MAROON = (110, 25, 40)
    c.text(40, 70, "Statement of Earnings", 20, F, True, MAROON)
    c.text(40, 88, s.employer, 11, F, False, (60, 60, 60))
    c.ellipse(494, 34, 78, 78, fill=(244, 236, 232), stroke=MAROON, lw=1.6)
    c.text(533, 82, "".join(w[0] for w in s.employer.replace("&", "").split()[:2]).upper(), 24, F, True, MAROON, "c")
    c.text(533, 126, "[ company logo ]", 7, F, False, GRAY, "c")
    c.line(40, 140, 572, 140, MAROON, 1)
    # window-envelope address block
    stack(c, 40, 168, [(s.person(), True)] + (s.addr_lines or []) + ([f"Social Security No. {ssn_txt(s)}"] if s.ssn4 else []),
          10.5, F, 14)
    c.rect(340, 154, 232, 78 if s.show_n else 64, stroke=LGRAY, lw=0.8)
    iy = 172
    for lab, val in [("Pay date", s.d(s.pay_date)), ("Period beginning", s.d(s.p_start)),
                     ("Period ending", s.d(s.p_end))] + ([("Pay frequency", s.freq_label)] if s.show_freq else []) + \
                    ([("Pay period", s.n_text("{n} of {m}"))] if s.show_n else []):
        c.text(350, iy, lab, 8.5, F, False, GRAY)
        c.text(562, iy, val, 9, F, True, BLACK, "r")
        iy += 12
    y = 262
    c.text(40, y, "Hours and Earnings", 11, F, True, MAROON)
    rows = earn_rows(s, False, salary_hours=True)
    rows.append(dict(cells=[s.L["gross"], "", "", M(s.gross)], bold=True, top=True))
    y = table(c, 40, 572, y + 12, [(44, "l"), (330, "r"), (440, "r"), (568, "r")], rows, 9.5, F, 16,
              ["Description", "Rate", "Hours", "Earnings"], (244, 236, 232))
    y += 18
    c.text(40, y, "Taxes", 11, F, True, MAROON)
    rows = [[x["label"], M(x["amt"])] for x in s.ded_rows({"tax"})]
    y = table(c, 40, 572, y + 12, [(44, "l"), (568, "r")], rows, 9.5, F, 16, None, None)
    orw = s.ded_rows({"pretax", "other"})
    if orw:
        y += 14
        c.text(40, y, "Other deductions", 11, F, True, MAROON)
        y = table(c, 40, 572, y + 12, [(44, "l"), (568, "r")], [[x["label"], M(x["amt"])] for x in orw], 9.5, F, 16,
                  None, None)
    y += 6
    c.line(40, y, 572, y, MAROON, 1.2)
    c.text(44, y + 20, f"Total deductions  {M(s.total_ded)}", 10, F, False)
    c.text(572, y + 22, f"{s.L['net']}   {D(s.net)}", 14, F, True, MAROON, "r")
    y += 46
    if s.ytd_on:
        c.rect(40, y, 532, 54, fill=(247, 243, 240), stroke=LGRAY, lw=0.6)
        c.text(50, y + 16, "Year-to-date totals", 9.5, F, True, MAROON)
        items = [("Gross", s.ytd_gross), ("Taxes", s.ytd_taxes), ("Deductions", s.ytd_ded), ("Net", s.ytd_net)]
        for i, (lab, val) in enumerate(items):
            c.text(50 + i * 128, y + 32, lab, 8, F, False, GRAY)
            c.text(50 + i * 128, y + 46, D(val), 10, F, True)
    c.line(40, 730, 572, 730, LGRAY, 0.6)
    c.text(40, 744, f"{s.employer}, {s.emp_addr[0]}, {s.emp_addr[1]}", 8, F, False, GRAY)
    c.text(40, 756, f"Payroll inquiries: {s.emp_phone}  -  Processed by {s.provider}", 8, F, False, GRAY)


LAYOUTS = {
    "classic_table": (L_classic, 612, 792),
    "two_column": (L_two_col, 612, 792),
    "dashboard_boxes": (L_dashboard, 612, 792),
    "dense_bureau": (L_dense, 612, 792),
    "check_stub_bottom": (L_check, 612, 792),
    "minimal_modern": (L_minimal, 612, 792),
    "dot_matrix_mono": (L_dot, 612, 792),
    "landscape_wide": (L_landscape, 792, 612),
    "sidebar_ytd_summary": (L_sidebar, 612, 792),
    "serif_logo_corner": (L_serif, 612, 792),
}

# --------------------------------------------------------------------------------------
# degradation (scan / photo)
# --------------------------------------------------------------------------------------


def degrade(img, kind, rng):
    nrng = np.random.default_rng(rng.randrange(2 ** 32))
    w, h = img.size
    yellow = rng.random() < 0.5
    tint = np.array((250, 243, 214) if yellow else (232, 232, 232), dtype=np.float32) / 255
    arr = np.asarray(img).astype(np.float32) / 255 * tint
    if kind == "photo":  # uneven lighting: linear gradient + vignette
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        gx = 0.80 + 0.25 * (xx / w) if rng.random() < 0.5 else 1.05 - 0.25 * (xx / w)
        r = np.sqrt(((xx - w / 2) / w) ** 2 + ((yy - h / 2) / h) ** 2)
        shade = np.clip(gx * (1 - 0.35 * r ** 1.4), 0.5, 1.1)
        arr = arr * shade[..., None]
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    angle = rng.uniform(0.5, 2.0) * rng.choice([-1, 1])
    bg = (232, 232, 232) if kind == "scan" else (86, 80, 74)
    img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=bg)
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.6, 1.0)))
    a = np.asarray(img).astype(np.float32)
    a += nrng.normal(0, rng.uniform(5, 9), a.shape)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=rng.randint(38, 52))
    buf.seek(0)
    return Image.open(buf).convert("RGB"), round(angle, 2)


# --------------------------------------------------------------------------------------
# ground truth + audit
# --------------------------------------------------------------------------------------


def truth_for(s, filename):
    num, den = FREQ[s.freq][2]
    monthly = rnd(Decimal(s.gross) * num / den) / 100
    ytd_gross = s.ytd_gross / 100 if s.ytd_on else None
    fields = {
        "fullName": s.name, "employerName": s.employer, "grossMonthlyIncome": monthly,
        "payPeriod": s.period_str(), "address": s.address, "ssnLast4": s.ssn4,
        "documentDate": s.pay_date.isoformat(), "businessName": None, "ein": None,
        "annualBusinessRevenue": None, "ownershipPercent": None, "netPay": s.net / 100,
        "recentDepositAmount": None, "recentDepositSource": None, "grossPayPeriod": s.gross / 100,
        "socialSecurityWithheld": None if s.combo else s.ss_amt / 100,
        "medicareWithheld": None if s.combo else s.med_amt / 100,
        "ytdGrossPay": ytd_gross, "payPeriodNumber": s.n if s.show_n else None,
    }
    notes = []
    notes.append(f"{'hourly' if s.pay == 'hourly' else 'salaried'}, {len(s.earn)} earnings line(s)")
    if s.combo:
        notes.append("single combined FICA line printed; SS and Medicare not separately shown")
    if s.s125:
        notes.append(f"Section 125 premium {s.premium / 100:.2f}; FICA wages {s.fica_wages / 100:.2f}")
    if not s.show_freq:
        notes.append("pay frequency word not printed (infer from period dates)")
    if s.lowres:
        notes.append("low-resolution render (~600px wide)")
    if s.degrade:
        notes.append(f"{s.degrade} degradation (rotation {s.degrade_angle} deg, noise, blur, JPEG artefacts, paper tint)")
    if s.tampered:
        notes.append(f"TAMPERED copy of paystub_{s.tampered_from:02d}: gross raised from {s.orig_gross / 100:.2f}; "
                     "SS, Medicare and YTD left unchanged")
    if s.ytd_on and not s.show_n:
        notes.append("YTD printed but period number not printed")
    meta = {
        "layout": s.layout, "frequency": s.freq, "degraded": bool(s.degrade), "tampered": s.tampered,
        "section125": s.s125, "combined_fica": s.combo, "notes": "; ".join(notes),
        "lowres": s.lowres, "format": s.ext,
        "audit": {
            "earnings": [{"label": e["label"], "amount": e["amt"] / 100, "ytd": e["ytd"] / 100} for e in s.earn],
            "deductions": [{"kind": x["kind"], "label": x["label"], "amount": x["amt"] / 100, "ytd": x["ytd"] / 100}
                           for x in s.ded],
            "ficaWages": s.fica_wages / 100, "section125Premium": s.premium / 100 if s.s125 else None,
            "totalDeductions": s.total_ded / 100, "periodsPerYear": FREQ[s.freq][0],
            "periodNumberTrue": s.n, "ytdPrinted": s.ytd_on,
        },
    }
    if s.tampered:
        meta["tamperedFrom"] = f"paystub_{s.tampered_from:02d}.png"
        meta["originalGrossPayPeriod"] = s.orig_gross / 100
        meta["originalNetPay"] = s.orig_net / 100
        meta["grossInflation"] = round(s.gross / s.orig_gross, 4)
    return {"docType": "pay-stub", "fields": fields, "meta": meta}


def render(s, path):
    fn, w, h = LAYOUTS[s.layout]
    if s.ext == "pdf":
        c = PdfCanvas(w, h, path)
        fn(c, s)
        c.save()
        return
    c = PilCanvas(w, h, 2.0)
    fn(c, s)
    img = c.image()
    s.degrade_angle = None
    if s.degrade:
        img, s.degrade_angle = degrade(img, s.degrade, random.Random(SEED + 77 * s.num))
    if s.lowres:
        img = img.resize((600, round(img.height * 600 / img.width)), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for f in os.listdir(OUT_DIR):
        if f.startswith("paystub_"):
            os.remove(os.path.join(OUT_DIR, f))
    stubs = {}
    for num in sorted(SPECS):
        spec = SPECS[num]
        rng = random.Random(SEED * 1000 + num)
        if spec["tamper_of"]:
            s = tamper(stubs[spec["tamper_of"]], rng)
            s.ext = spec["ext"]
            s.degrade, s.lowres = None, False
        else:
            s = build_stub(num, spec, rng)
        stubs[num] = s
    gt = {}
    for num, s in stubs.items():
        fname = f"paystub_{num:02d}.{s.ext}"
        render(s, os.path.join(OUT_DIR, fname))
        gt[fname] = truth_for(s, fname)
    for v in gt.values():  # tampered copies refer to the source file by its real extension
        if v["meta"]["tampered"]:
            src = int(v["meta"]["tamperedFrom"][8:10])
            v["meta"]["tamperedFrom"] = f"paystub_{src:02d}.{stubs[src].ext}"
    with open(GT_PATH, "w", encoding="utf-8") as fh:
        json.dump(gt, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {len(gt)} files to {OUT_DIR} and {GT_PATH}")


if __name__ == "__main__":
    main()
