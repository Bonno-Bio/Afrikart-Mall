"""
Builds model/afrikart-unit-economics.xlsx   (v2)

v2 changes, all of them responses to docs/006-amazon-gap-analysis.md:

  1. Cost per drop is now a FUNCTION of drops on the route and riders employed,
     not a constant P18. V1 flattered months 1-6 by assuming mature density.
  2. New 'Ramp' sheet: months 1-12 with real density, so the model stops
     describing month 7 as if it were month 1.
  3. New 'Cash cycle' sheet: DIO + DSO - DPO, and the working capital required
     at each stage. This is the difference between a cash generator and a
     treadmill.
  4. Route-split cliff is modelled explicitly: opening a second route halves
     density and cost per drop jumps. You grow into it, not out of it.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import os

BLUE = "1F4E79"
GREY = "F2F2F2"
GREEN = "E2EFDA"
AMBER = "FFF2CC"
RED = "FCE4E4"
HDR = Font(bold=True, size=11)
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
MONEY = '#,##0.00'
MONEY0 = '#,##0'
PCT = '0.0%'

wb = Workbook()

# ---------------------------------------------------------------- README
ws = wb.active
ws.title = "README"
ws.column_dimensions["A"].width = 3
ws.column_dimensions["B"].width = 104

rows = [
    ("AFRIKART MALL", "", Font(bold=True, size=18, color=BLUE)),
    ("Unit economics model — v2", "", Font(italic=True, size=11)),
    ("", "", None),
    ("WHAT CHANGED IN V2, AND WHY", "", HDR),
    ("", "v1 of this model used a constant P18 cost per drop. That was arithmetically tidy and", None),
    ("", "operationally wrong. Cost per drop is rider day cost divided by drops that day:", None),
    ("", "        8 drops per route  ->  P40 per drop", Font(bold=True, color="C00000")),
    ("", "       18 drops per route  ->  P18 per drop", None),
    ("", "       26 drops per route  ->  P12 per drop", Font(bold=True, color="0C7A5C")),
    ("", "", None),
    ("", "We start at 4-6 drops a day. So months 1-4 run at two to three times the modelled cost,", None),
    ("", "and v1 hid that. The 'Ramp' sheet now shows every month at its real density.", None),
    ("", "", None),
    ("THE FOUR NUMBERS THAT DECIDE THIS BUSINESS", "", HDR),
    ("", "1. Drops per route per day  ->  the only thing that moves cost per drop. Not marketing.", None),
    ("", "2. AOV                       ->  the only thing that moves contribution per order for free.", None),
    ("", "3. Routes                    ->  a second route HALVES density. Open one late, not early.", None),
    ("", "4. Supplier payment terms    ->  the difference between funding growth and financing it.", None),
    ("", "", None),
    ("HOW TO READ THE SHEETS", "", HDR),
    ("", "Density        what one drop costs at every level of route density", None),
    ("", "Unit Economics one order, once the route is mature (22 drops)", None),
    ("", "Ramp           months 1-12 at real density — the honest version", None),
    ("", "Cash cycle     why a profitable company can still run out of money", None),
    ("", "Sensitivity    AOV against orders per day", None),
    ("", "", None),
    ("STATUS OF THE INPUTS", "", HDR),
    ("", "Every blue cell is a hypothesis, not data. Replace with pilot actuals within 45 days.", None),
]
for i, (a, b, f) in enumerate(rows, start=1):
    ws.cell(row=i, column=1, value=a)
    c = ws.cell(row=i, column=2, value=b)
    if f is not None:
        c.font = f
    if a and f is None:
        ws.cell(row=i, column=1).font = HDR if a.isupper() and len(a) > 12 else Font()
    c.alignment = Alignment(wrap_text=False, vertical="top")

# ---------------------------------------------------------------- ASSUMPTIONS
a = wb.create_sheet("Assumptions")
a.column_dimensions["A"].width = 48
a.column_dimensions["B"].width = 15
a.column_dimensions["C"].width = 60

def inp(row, label, value, fmt, note):
    a.cell(row=row, column=1, value=label)
    c = a.cell(row=row, column=2, value=value)
    c.fill = PatternFill("solid", fgColor=BLUE)
    c.font = Font(color="FFFFFF", bold=True)
    c.number_format = fmt
    c.border = BOX
    a.cell(row=row, column=3, value=note).alignment = Alignment(wrap_text=True, vertical="top")

a["A1"] = "ASSUMPTIONS — edit the blue cells only"
a["A1"].font = Font(bold=True, size=14, color=BLUE)

a["A3"] = "DEMAND"; a["A3"].font = HDR
inp(4, "Average order value (AOV), P", 380, MONEY, "Pilot target for a bundled baby + personal care basket.")
inp(5, "Product gross margin %", 0.30, PCT, "Owned/consignment stock. Never below 18% or last mile cannot be carried.")
inp(6, "Delivery fee collected per order, P", 30, MONEY, "Average across express/standard/pickup. Free above P400.")
inp(7, "Operating days per month", 26, "0", "Sunday delivery off in the pilot.")

a["A9"] = "DELIVERY — THE COST THAT IS NOT CONSTANT"; a["A9"].font = HDR
inp(10, "Rider day cost, all-in, P", 320, MONEY, "Rider + scooter + fuel + insurance + depreciation. NOT per parcel.")
inp(11, "Comfortable drops per route per day", 22, "0", "Above this, first-attempt success falls and the route runs past 11 hours.")
inp(12, "Stretch ceiling per route per day", 30, "0", "We will run here for a few weeks before splitting a route.")
inp(13, "Drops per route hour (steady state)", 4.5, "0.0", "Density metric from the route scorecard.")

a["A15"] = "PER-ORDER VARIABLES (independent of density)"; a["A15"].font = HDR
inp(16, "Pick & pack labour per order, P", 9, MONEY, "~3 minutes at warehouse wage rates.")
inp(17, "Packaging per order, P", 6, MONEY, "Mailer + tape + label + insert.")
inp(18, "Payment processing % of AOV", 0.025, PCT, "Card / mobile money. COD trades this for cash risk.")
inp(19, "Returns & breakage % of AOV", 0.04, PCT, "Target <4%. Above 8% the model breaks.")
inp(20, "Customer support % of AOV", 0.03, PCT, "WhatsApp-first support.")
inp(21, "Marketing spend per month, P", 12000, MONEY, "Held flat so CAC dilutes as volume grows — that is the point.")

a["A23"] = "FIXED MONTHLY COSTS"; a["A23"].font = HDR
inp(24, "Storage / small warehouse unit, P", 6000, MONEY, "Gaborone industrial unit, 60-80 sqm. Not a fulfilment centre.")
inp(25, "Team salaries (2 people), P", 16000, MONEY, "Picker/packer + support/ops. Founders unpaid in the pilot.")
inp(26, "Tech, hosting, tools, P", 3000, MONEY, "Off-the-shelf stack. Software is not the moat.")
inp(27, "Admin, compliance, insurance, P", 5500, MONEY, "Accounting, licences, liability, parcel insurance.")

a["A29"] = "CASH CYCLE"; a["A29"].font = HDR
inp(30, "Supplier payment terms, days", 0, "0", "THE most important negotiable number in the business. Target 30 by month 6.")
inp(31, "Inventory days held", 21, "0", "Weeks of cover on best sellers, balanced against cash.")
inp(32, "Prepaid share of orders %", 40, PCT, "Card / mobile money. Target 70% by G3. COD is acquisition, not a permanent cost.")
inp(33, "PSP settlement lag, days", 1, "0", "T+1 or better required from the provider.")

# ---------------------------------------------------------------- DENSITY
d = wb.create_sheet("Density")
d.column_dimensions["A"].width = 4
d.column_dimensions["B"].width = 20
d.column_dimensions["C"].width = 16
d.column_dimensions["D"].width = 18
d.column_dimensions["E"].width = 18
d.column_dimensions["F"].width = 56

d["B1"] = "THE DENSITY CURVE"
d["B1"].font = Font(bold=True, size=14, color=BLUE)
d["B2"] = "Cost per drop = rider day cost ÷ drops on that route. Everything else in the business depends on this line."
d["B2"].font = Font(italic=True)

heads = ["Drops per route per day", "Cost per drop (P)", "Contribution per order (P)", "Route contribution / day (P)"]
for i, h in enumerate(heads):
    c = d.cell(row=4, column=2 + i, value=h)
    c.font = Font(bold=True, size=9)
    c.alignment = Alignment(wrap_text=True, vertical="bottom")
    c.border = BOX
d.row_dimensions[4].height = 30

for i, drops in enumerate(range(4, 33)):
    r = 5 + i
    d.cell(row=r, column=2, value=drops).border = BOX
    c = d.cell(row=r, column=3, value=f"=Assumptions!$B$10/B{r}")
    c.number_format = MONEY
    c.border = BOX
    # contribution per order at this density
    f = (f"=Assumptions!$B$4*Assumptions!$B$5+Assumptions!$B$6-C{r}"
         f"-Assumptions!$B$16-Assumptions!$B$17"
         f"-Assumptions!$B$4*Assumptions!$B$18-Assumptions!$B$4*Assumptions!$B$19"
         f"-Assumptions!$B$4*Assumptions!$B$20"
         f"-Assumptions!$B$21/(B{r}*Assumptions!$B$7)")
    cc = d.cell(row=r, column=4, value=f)
    cc.number_format = MONEY
    cc.border = BOX
    rc = d.cell(row=r, column=5, value=f"=D{r}*B{r}")
    rc.number_format = MONEY0
    rc.border = BOX
    if drops == 22:
        for col in range(2, 6):
            d.cell(row=r, column=col).fill = PatternFill("solid", fgColor=AMBER)
        d.cell(row=r, column=6, value="◀ the comfortable design point. This is what v1 assumed from day one.").font = Font(bold=True, size=9)
    if drops == 6:
        for col in range(2, 6):
            d.cell(row=r, column=col).fill = PatternFill("solid", fgColor=RED)
        d.cell(row=r, column=6, value="◀ roughly month 1. This is the trough you have to survive, not a verdict.").font = Font(bold=True, size=9, color="C00000")

d["B41"] = "READ IT LIKE THIS"
d["B41"].font = HDR
notes = [
    "At 6 drops a day, each parcel costs P53 to deliver and the order loses money no matter how good the marketing is.",
    "At 18 drops it costs P18 and the order is roughly self-funding.",
    "At 26 drops it costs P12 and the order contributes enough to pay for the building.",
    "The job of months 1-4 is not profit. It is adding drops per route, one suburb at a time.",
    "This is why 'orders per day' is the leading indicator and 'cost per drop' is the result.",
]
for i, t in enumerate(notes):
    d.cell(row=42 + i, column=2, value=t)

# ---------------------------------------------------------------- UNIT ECONOMICS
u = wb.create_sheet("Unit Economics")
u.column_dimensions["A"].width = 3
u.column_dimensions["B"].width = 46
u.column_dimensions["C"].width = 16
u.column_dimensions["D"].width = 58

u["B1"] = "ONE ORDER — at mature density (22 drops per route)"
u["B1"].font = Font(bold=True, size=14, color=BLUE)
u["B2"] = "The steady state. If this is negative, nothing later in the plan can rescue it."
u["B2"].font = Font(italic=True)

def line(r, label, formula, fmt=MONEY, bold=False, fill=None, note=None):
    u.cell(row=r, column=2, value=label).font = Font(bold=bold)
    c = u.cell(row=r, column=3, value=formula)
    c.number_format = fmt
    c.font = Font(bold=bold)
    for col in (2, 3):
        u.cell(row=r, column=col).border = BOX
        if fill:
            u.cell(row=r, column=col).fill = PatternFill("solid", fgColor=fill)
    if note:
        u.cell(row=r, column=4, value=note).alignment = Alignment(wrap_text=True, vertical="top")

u["C3"] = "P / order"
u["C3"].font = Font(bold=True, italic=True, size=9)

line(5, "Average order value", "=Assumptions!B4")
line(6, "Product gross profit", "=Assumptions!B4*Assumptions!B5")
line(7, "Delivery fee collected", "=Assumptions!B6")
line(8, "REVENUE PER ORDER", "=C6+C7", bold=True, fill=GREY)
line(10, "Last mile (at 22 drops/route)", "=-Assumptions!B10/Assumptions!B11",
     note="Not a constant. This is the number the Ramp sheet shows month by month.")
line(11, "Pick & pack", "=-Assumptions!B16")
line(12, "Packaging", "=-Assumptions!B17")
line(13, "Payment processing", "=-Assumptions!B4*Assumptions!B18")
line(14, "Returns & breakage", "=-Assumptions!B4*Assumptions!B19")
line(15, "Customer support", "=-Assumptions!B4*Assumptions!B20")
line(16, "Marketing (CAC at steady volume)", "=-Assumptions!B21/(Assumptions!B11*Assumptions!B7)")
line(17, "TOTAL VARIABLE", "=SUM(C10:C16)", bold=True, fill=GREY)
line(19, "CONTRIBUTION PER ORDER", "=C8+C17", bold=True, fill=GREEN)
line(20, "Contribution % of AOV", "=C19/C5", fmt=PCT)

u["B22"] = "BREAK-EVEN AT STEADY STATE"; u["B22"].font = HDR
line(23, "Fixed cost per month", "=SUM(Assumptions!B24:B27)")
line(24, "Orders per month to break even", "=C23/C19", fmt=MONEY0)
line(25, "Orders per day to break even", "=C24/Assumptions!B7", fmt='#,##0.0')
line(26, "Revenue at break-even, P/month", "=C24*C5", fmt=MONEY0)

u["B28"] = "CAUTION"; u["B28"].font = HDR
u["B29"] = "This break-even assumes 22 drops on the route. At 8 drops the same business needs roughly three times the orders."
u["B29"].font = Font(bold=True, color="C00000")
u["B30"] = "Never quote this number without the density it assumes. That is precisely the mistake v1 made."
u["B30"].font = Font(italic=True, color="C00000")

# ---------------------------------------------------------------- RAMP
m = wb.create_sheet("Ramp")
m.column_dimensions["A"].width = 40
for col in range(2, 15):
    m.column_dimensions[get_column_letter(col)].width = 11
m.column_dimensions["O"].width = 46

m["A1"] = "THE RAMP — months 1-12 at REAL density"
m["A1"].font = Font(bold=True, size=14, color=BLUE)
m["A2"] = "This is the sheet v1 was missing. Month 1 is not month 7 with fewer customers — it is a different cost structure."
m["A2"].font = Font(italic=True)

orders = [5, 8, 12, 15, 18, 22, 26, 30, 34, 38, 42, 46]
routes = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2]

m["A4"] = "Month"; m["A4"].font = HDR
for i in range(12):
    c = m.cell(row=4, column=2 + i, value=f"M{i+1}")
    c.font = Font(bold=True)

def mrow(r, label, formulas, fmt=MONEY, bold=False, note=None):
    m.cell(row=r, column=1, value=label).font = Font(bold=bold)
    for i, f in enumerate(formulas):
        c = m.cell(row=r, column=2 + i, value=f)
        c.number_format = fmt
        c.font = Font(bold=bold)
    if note:
        m.cell(row=r, column=15, value=note).alignment = Alignment(wrap_text=True, vertical="top")

col = lambda i: get_column_letter(2 + i)

mrow(5, "Orders per day", [f"={o}" for o in orders], fmt='#,##0', bold=True)
mrow(6, "Routes running", [f"={rt}" for rt in routes], fmt='0',
     note="Route 2 opens in M9, not at 23 orders. Opening early halves density and doubles cost per drop.")
mrow(7, "Drops per route per day", [f"={col(i)}5/{col(i)}6" for i in range(12)], fmt='0.0', bold=True,
     note="THE leading indicator. Everything else follows it.")
mrow(8, "Cost per drop (P)", [f"=Assumptions!$B$10/{col(i)}7" for i in range(12)], bold=True,
     note="Falls from P64 to P11, then jumps back to P19 when route 2 opens. That jump is real and expected.")
mrow(9, "Orders per month", [f"={col(i)}5*Assumptions!$B$7" for i in range(12)], fmt=MONEY0)
mrow(10, "GMV (P)", [f"={col(i)}9*Assumptions!$B$4" for i in range(12)])
mrow(11, "Product gross profit (P)", [f"={col(i)}9*Assumptions!$B$4*Assumptions!$B$5" for i in range(12)])
mrow(12, "Delivery fees collected (P)", [f"={col(i)}9*Assumptions!$B$6" for i in range(12)])
mrow(13, "Revenue (P)", [f"={col(i)}11+{col(i)}12" for i in range(12)], bold=True)

mrow(15, "Last mile", [f"=-{col(i)}9*{col(i)}8" for i in range(12)])
mrow(16, "Pick, pack, packaging", [f"=-{col(i)}9*(Assumptions!$B$16+Assumptions!$B$17)" for i in range(12)])
mrow(17, "Payment processing", [f"=-{col(i)}9*Assumptions!$B$4*Assumptions!$B$18" for i in range(12)])
mrow(18, "Returns & breakage", [f"=-{col(i)}9*Assumptions!$B$4*Assumptions!$B$19" for i in range(12)])
mrow(19, "Customer support", [f"=-{col(i)}9*Assumptions!$B$4*Assumptions!$B$20" for i in range(12)])
mrow(20, "Marketing", ["=-Assumptions!$B$21" for _ in range(12)])
mrow(21, "Fixed costs", ["=-SUM(Assumptions!$B$24:$B$27)" for _ in range(12)])
mrow(22, "Total costs", [f"=SUM({col(i)}15:{col(i)}21)" for i in range(12)], bold=True)

mrow(24, "CONTRIBUTION PER ORDER (P)", [f"=({col(i)}13+{col(i)}22)/{col(i)}9" for i in range(12)], bold=True,
     note="Negative for the first months. That is the cost of building density, not a broken business.")
mrow(25, "MONTHLY OPERATING PROFIT (P)", [f"={col(i)}13+{col(i)}22" for i in range(12)], bold=True)
mrow(26, "Cumulative profit (P)", ["=B25"] + [f"={col(i-1)}26+{col(i)}25" for i in range(1, 12)], bold=True,
     note="The trough is the real funding requirement. Note when it turns.")
mrow(28, "Peak cash requirement (lowest cumulative point)", "=MIN(B26:M26)")
m["B28"].font = Font(bold=True, color="C00000")
m["B28"].number_format = MONEY0

m["A30"] = "READ THIS, NOT THE FORECAST"
m["A30"].font = HDR
ramp_notes = [
    "M1-M4 are loss-making on purpose. At 5-12 drops a day a parcel costs P26-64 to move. No marketing fixes that; only density does.",
    "M5-M7 is the turn: cost per drop falls below the revenue per order and contribution goes positive.",
    "M9 is a deliberate dip. Opening route 2 halves density and pushes cost per drop back to P19 — then you grow into it again.",
    "The peak funding requirement on this line is what you must have in the bank before you start, not after.",
    "If the trough is deeper than your cash, the plan is not wrong — the capital is.",
]
for i, t in enumerate(ramp_notes):
    m.cell(row=31 + i, column=1, value=t)

# ---- the one hire that decides whether this is a software company
m["A38"] = "THE ENGINEER DECISION — what the fifth pillar actually costs"
m["A38"].font = Font(bold=True, size=12, color=BLUE)
m["A39"] = ("An engineer on payroll from month 4 is the difference between a technology company and a shop "
            "with a website. It is also, at these volumes, the largest single line in the plan. Priced below.")
m["A39"].font = Font(italic=True)

hdr = ["Option", "Monthly cost", "Peak cash requirement", "Break-even month", "Month-12 cumulative"]
for j, h in enumerate(hdr):
    cell = m.cell(row=41, column=1 + j, value=h)
    cell.font = Font(bold=True); cell.border = BOX
    cell.alignment = Alignment(wrap_text=True, vertical="top")

# Computed with the same arithmetic as rows 5-26, months 4-12 carrying the extra cost.
_orders = [5, 8, 12, 15, 18, 22, 26, 30, 34, 38, 42, 46]
_routes = [1] * 8 + [2] * 4
_days, _fixed = 26, 6000 + 16000 + 3000 + 5500
_mkt, _rider = 12000, 320
_aov, _gm, _fee = 380, 0.30, 30
_pp, _pkg, _psp, _ret, _sup = 9, 6, 0.025, 0.04, 0.03

def _scenario(extra, start_month=4):
    cum, trough, be, pos = 0, 0, None, None
    for i, (o, rt) in enumerate(zip(_orders, _routes), 1):
        dpr = o / rt
        n = o * _days
        rev = n * (_aov * _gm + _fee)
        cost = (n * (_rider / dpr) + n * (_pp + _pkg)
                + n * _aov * (_psp + _ret + _sup) + _mkt + _fixed
                + (extra if i >= start_month else 0))
        p = rev - cost
        cum += p
        trough = min(trough, cum)
        if be is None and p > 0:
            be = i
        if pos is None and cum > 0:
            pos = i
    return trough, be, cum

opts = [
    ("No engineer (current plan)", 0, "the platform decays from the day the contractor invoices"),
    ("Retainer, 40h/month", 20000, "the honest middle: an owner, not a full-time hire"),
    ("Engineer on payroll, low band", 35000, "amendment 5 as written"),
    ("Engineer on payroll, high band", 55000, "amendment 5 as written"),
]
for i, (label, cost, note) in enumerate(opts):
    r = 42 + i
    trough, be, cum = _scenario(cost)
    m.cell(row=r, column=1, value=label).border = BOX
    c = m.cell(row=r, column=2, value=cost if cost else 0)
    c.number_format = MONEY0; c.border = BOX
    c = m.cell(row=r, column=3, value=trough)
    c.number_format = MONEY0; c.border = BOX
    c.font = Font(bold=True, color="C00000")
    m.cell(row=r, column=4, value=f"M{be}" if be else "not in 12 months").border = BOX
    c = m.cell(row=r, column=5, value=cum)
    c.number_format = MONEY0; c.border = BOX

m["A47"] = ("Read the third column. At pilot volumes a P35-55k engineer roughly doubles the funding requirement "
            "and pushes break-even from M6 to M11 or beyond. That is not an argument against hiring him - ")
m["A48"] = ("it is an argument for deciding deliberately. Either fund him and call the raise P690-800k, or run the "
            "retainer and call the platform a tool. What is not available is claiming the pillar and funding nothing.")
m["A47"].font = Font(bold=True)
m["A48"].font = Font(bold=True)

for r in (38, 39, 41, 42, 43, 44, 45, 47, 48):
    m.row_dimensions[r].height = 30 if r >= 47 else None

# ---------------------------------------------------------------- CASH CYCLE
c = wb.create_sheet("Cash cycle")
c.column_dimensions["A"].width = 3
c.column_dimensions["B"].width = 46
c.column_dimensions["C"].width = 16
c.column_dimensions["D"].width = 58

c["B1"] = "THE CASH CYCLE — why a profitable company still runs out"
c["B1"].font = Font(bold=True, size=14, color=BLUE)
c["B2"] = "Amazon's flywheel runs on float: customers pay in days, suppliers in 60-90. That gap IS the capital."
c["B2"].font = Font(italic=True)

def cline(r, label, formula, fmt=MONEY, bold=False, fill=None, note=None):
    c.cell(row=r, column=2, value=label).font = Font(bold=bold)
    cell = c.cell(row=r, column=3, value=formula)
    cell.number_format = fmt
    cell.font = Font(bold=bold)
    for cc_ in (2, 3):
        c.cell(row=r, column=cc_).border = BOX
        if fill:
            c.cell(row=r, column=cc_).fill = PatternFill("solid", fgColor=fill)
    if note:
        c.cell(row=r, column=4, value=note).alignment = Alignment(wrap_text=True, vertical="top")

c["B4"] = "THE THREE COMPONENTS"; c["B4"].font = HDR
cline(5, "Inventory days held (DIO)", "=Assumptions!B31", fmt="0",
      note="How long stock sits before it sells. Shorter is better, but too short causes stockouts.")
cline(6, "Customer receipt days (DSO)",
      "=(1-Assumptions!B32)*1+Assumptions!B32*Assumptions!B33", fmt="0.0",
      note="Prepaid settles at PSP lag; COD settles at the door. Raising prepaid share is a cash lever, not just a payment preference.")
cline(7, "Supplier payment terms (DPO)", "=Assumptions!B30", fmt="0", fill=GREEN,
      note="The most important negotiable number in the business. Every 30 days of terms is free working capital.")
cline(8, "CASH CONVERSION CYCLE (days)", "=C5+C6-C7", fmt="0.0", bold=True, fill=GREY,
      note="Positive = we fund growth ourselves. Negative = suppliers fund it. Amazon lives at strongly negative.")

c["B10"] = "WHAT IT COSTS US TO GROW"; c["B10"].font = HDR
cline(11, "Annual GMV at month 12 run rate, P", "=Ramp!M10*12", fmt=MONEY0,
      note="Month 12 monthly GMV annualised. A planning figure, not a forecast.")
cline(12, "Cost of goods sold, P", "=C11*(1-Assumptions!B5)")
cline(13, "Working capital tied up, P", "=C12/365*C8", fmt=MONEY0, bold=True, fill=AMBER,
      note="Every Pula of GMV consumes this. It is not a one-off investment — it scales.")
cline(14, "Working capital if we win 30-day terms, P",
      "=C12/365*(C5+C6-30)", fmt=MONEY0, bold=True, fill=GREEN,
      note="The single highest-return negotiation available to us.")

c["B16"] = "CASH IN TRANSIT WITH RIDERS — a risk, not a cycle"; c["B16"].font = HDR
c["B17"] = "Cash on delivery puts physical money in a rider's pocket for up to a day. It does not lengthen the"
c["B18"] = "cash cycle much, because the PSP settles T+1 anyway. What it does is concentrate risk: it is the"
c["B19"] = "only part of the business where cash can simply go missing, and no ledger entry can find it."
for r in (17, 18, 19):
    c.cell(row=r, column=2).font = Font(italic=True)

c.cell(row=21, column=2, value="Daily GMV at month-12 run rate, P").border = BOX
c.cell(row=21, column=3, value="=Ramp!M10/Assumptions!B7").number_format = MONEY0
c.cell(row=21, column=3).border = BOX
c.cell(row=22, column=2, value="COD share of orders").border = BOX
c.cell(row=22, column=3, value="=1-Assumptions!B32").number_format = PCT
c.cell(row=22, column=3).border = BOX
c.cell(row=23, column=2, value="Cash in riders' hands at any time, P").border = BOX
cc23 = c.cell(row=23, column=3, value="=C21*C22*1.5")
cc23.number_format = MONEY0
cc23.font = Font(bold=True, color="C00000")
cc23.border = BOX
c.cell(row=23, column=4, value="At 60% COD this is real money sitting in other people's pockets. Hence float limits, daily reconciliation and deposit within 24h.").alignment = Alignment(wrap_text=True, vertical="top")

c["B25"] = "THE PATH — what each negotiation is actually worth"; c["B25"].font = HDR
c.cell(row=26, column=2, value="Scenario").font = Font(bold=True)
c.cell(row=26, column=3, value="Working capital (P)").font = Font(bold=True)
c.cell(row=26, column=4, value="Cash at risk with riders (P)").font = Font(bold=True)

path = [
    ["Today: 0-day terms, 40% prepaid", "=C12/365*C8", "=C21*0.6*1.5"],
    ["Win 30-day supplier terms", "=C12/365*(C5+C6-30)", "=C21*0.6*1.5"],
    ["Terms + 70% prepaid", "=C12/365*(C5+(0.3*1+0.7*Assumptions!B33)-30)", "=C21*0.3*1.5"],
]
for i, (label, wc_f, risk_f) in enumerate(path):
    r = 27 + i
    c.cell(row=r, column=2, value=label).border = BOX
    wc = c.cell(row=r, column=3, value=wc_f); wc.number_format = MONEY0; wc.border = BOX
    rk = c.cell(row=r, column=4, value=risk_f); rk.number_format = MONEY0; rk.border = BOX

c["B32"] = "THE POINT"
c["B32"].font = HDR
c["B33"] = "Supplier terms are the cash lever: 30 days of terms swings the cycle from +22 days to -8 and frees roughly P300,000 of working capital at month-12 volumes."
c["B33"].font = Font(bold=True)
c["B34"] = "Prepaid share is the risk lever: it halves the cash physically in riders' hands, which is the only cash that can vanish."
c["B34"].font = Font(bold=True)
c["B35"] = "Neither is a finance chore. Both get a named owner and a monthly target from month one, and both appear in the G1 evidence pack."
c["B35"].font = Font(italic=True)

# ---------------------------------------------------------------- SENSITIVITY
s = wb.create_sheet("Sensitivity")
s.column_dimensions["A"].width = 26
for col_i in range(2, 10):
    s.column_dimensions[get_column_letter(col_i)].width = 13

s["A1"] = "AOV AGAINST DROPS PER ROUTE"
s["A1"].font = Font(bold=True, size=14, color=BLUE)
s["A2"] = "Monthly operating profit (P). Rows = AOV. Columns = drops per route per day. Green means the route works."
s["A2"].font = Font(italic=True)
s["A4"] = "AOV  \\  drops/route/day"; s["A4"].font = HDR

drops_axis = [8, 12, 16, 20, 24, 28, 30]
for j, dep in enumerate(drops_axis):
    cell = s.cell(row=4, column=2 + j, value=dep)
    cell.font = Font(bold=True)
    cell.alignment = Alignment(horizontal="center")

aovs = [240, 300, 350, 380, 440, 520, 650]
for i, aov in enumerate(aovs):
    r = 5 + i
    s.cell(row=r, column=1, value=aov).number_format = MONEY
    s.cell(row=r, column=1).font = Font(bold=True)
    for j in range(len(drops_axis)):
        dcell = f"{get_column_letter(2+j)}$4"
        f = (f"=($A{r}*Assumptions!$B$5+Assumptions!$B$6"
             f"-Assumptions!$B$10/{dcell}"
             f"-Assumptions!$B$16-Assumptions!$B$17"
             f"-$A{r}*Assumptions!$B$18-$A{r}*Assumptions!$B$19-$A{r}*Assumptions!$B$20"
             f"-Assumptions!$B$21/({dcell}*Assumptions!$B$7))*({dcell}*Assumptions!$B$7)"
             f"-SUM(Assumptions!$B$24:$B$27)")
        cell = s.cell(row=r, column=2 + j, value=f)
        cell.number_format = '#,##0;[Red]-#,##0'
        cell.border = BOX

s["A14"] = "READ THE GRID"
s["A14"].font = HDR
sens_notes = [
    "Move right: density. Costs nothing but time and route discipline, and it is the biggest lever in the model.",
    "Move up: basket. Nearly free, compounds, and it lifts every drop on the route at once.",
    "Bottom-left is the graveyard where Botswana marketplaces go: small baskets, single drops, one at a time.",
    "Top-right is the business. Bundles and suburb-by-suburb density both push you there.",
]
for i, t in enumerate(sens_notes):
    s.cell(row=15 + i, column=1, value=t)

for sheet in wb.worksheets:
    sheet.sheet_view.showGridLines = False

os.makedirs("model", exist_ok=True)
wb.save("model/afrikart-unit-economics.xlsx")
print("saved model/afrikart-unit-economics.xlsx (v2)")
