"""
Builds model/afrikart-unit-economics.xlsx

Everything in the workbook is driven by the Assumptions sheet (blue cells).
Unit Economics and Sensitivity are live formulas, so the user can change a
number and see the answer move. This is the ONE model we need before launch;
the 40-page pro forma can wait.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

BLUE = "1F4E79"      # input cells
GREY = "F2F2F2"
GREEN = "E2EFDA"
AMBER = "FFF2CC"
RED = "FCE4E4"
WHITE = Font(color="FFFFFF", bold=True)
HDR = Font(bold=True, size=11)
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
MONEY = '#,##0.00'
PCT = '0.0%'

wb = Workbook()

# ---------------------------------------------------------------- README
ws = wb.active
ws.title = "README"
ws.column_dimensions["A"].width = 4
ws.column_dimensions["B"].width = 100
kill = [
    "Failed delivery / return above 8% of orders",
    "Contribution margin per order below zero for two consecutive months",
    "AOV below P250 after bundling work",
    "Fewer than 8 orders/day by day 45",
    "Manual re-keying of orders still happening after month 2",
]

rows = [
    ("", "", None),
    ("AFRIKART MALL", "", Font(bold=True, size=18, color=BLUE)),
    ("Unit economics model — v0.1 (pre-launch)", "", Font(italic=True, size=11)),
    ("", "", None),
    ("Purpose", "", HDR),
    ("", "To answer one question before we spend a Pula on software: can a single Gaborone order make money,", None),
    ("", "and how many orders a day do we need before the building pays for itself?", None),
    ("", "", None),
    ("How to use", "", HDR),
    ("", "1. Only edit the BLUE cells on the 'Assumptions' tab. Everything else is a formula.", None),
    ("", "2. 'Unit Economics' is one order. If contribution margin is negative there, no volume fixes it.", None),
    ("", "3. 'Monthly P&L' is the 12-month pilot ramp.", None),
    ("", "4. 'Sensitivity' shows which lever actually moves the answer.", None),
    ("", "", None),
    ("The three numbers that decide this business", "", HDR),
    ("", "AOV — the master variable. Botswana does not need more traffic, it needs bigger baskets.", None),
    ("", "Last-mile cost per drop — must be under P20. Per-parcel courier pricing (~P60-80) makes this model impossible.", None),
    ("", "Returns / failed COD — every failed drop costs the trip twice. This is the silent killer.", None),
    ("", "", None),
    ("Kill criteria (agree these BEFORE launch)", "", HDR),
]
for k in kill:
    rows.append(("", "  - " + k, None))

rows += [
    ("", "", None),
    ("Status of the inputs", "", HDR),
    ("", "All blue inputs are placeholders built from market observation, not our own data. Replace them with real", None),
    ("", "pilot data within 45 days. Treat this file as a hypothesis, not a forecast.", None),
]

for i, (a, b, f) in enumerate(rows, start=1):
    ws.cell(row=i, column=1, value=a)
    c = ws.cell(row=i, column=2, value=b)
    if f is not None:
        c.font = f
    c.alignment = Alignment(wrap_text=True, vertical="top")

# ---------------------------------------------------------------- ASSUMPTIONS
a = wb.create_sheet("Assumptions")
a.column_dimensions["A"].width = 46
a.column_dimensions["B"].width = 14
a.column_dimensions["C"].width = 58

def inp(row, label, value, fmt, note):
    a.cell(row=row, column=1, value=label).font = Font(bold=False)
    c = a.cell(row=row, column=2, value=value)
    c.fill = PatternFill("solid", fgColor=BLUE)
    c.font = Font(color="FFFFFF", bold=True)
    c.number_format = fmt
    c.border = BOX
    a.cell(row=row, column=3, value=note).alignment = Alignment(wrap_text=True, vertical="top")

a["A1"] = "ASSUMPTIONS — edit the blue cells only"
a["A1"].font = Font(bold=True, size=14, color=BLUE)

a["A3"] = "PER-ORDER VARIABLES"; a["A3"].font = HDR
inp(4, "Average order value (AOV), P", 380, MONEY, "Pilot target for a bundled baby + personal care basket.")
inp(5, "Product gross margin %", 0.30, PCT, "Owned/consignment stock. A pure 8% commission pull-through cannot cover the costs below.")
inp(6, "Delivery fee charged to customer, P", 30, MONEY, "Flat fee. Free above a threshold set in the bundle rules.")
inp(7, "Last-mile cost per drop, P", 18, MONEY, "Owned rider on a batched suburb route, ~18-20 drops/day. NOT courier pricing.")
inp(8, "Pick & pack labour per order, P", 9, MONEY, "~3 min per order at warehouse wage rates.")
inp(9, "Packaging per order, P", 6, MONEY, "Mailer + tape + label + branding insert.")
inp(10, "Payment processing % of AOV", 0.025, PCT, "Card / mobile money. Cash on delivery swaps this for cash-handling risk.")
inp(11, "Returns & breakage % of AOV", 0.04, PCT, "Target <4%. Above 8% the model breaks. Watch failed COD drops here.")
inp(12, "Customer support cost % of AOV", 0.03, PCT, "WhatsApp-first support, mostly on delivery exceptions.")
inp(13, "Marketing spend per month, P", 12000, MONEY, "Enough for ~600 orders/month at the implied CAC. Rises with volume.")
inp(14, "Orders per month (planning volume)", 600, MONEY, "= 20 orders/day. The month-6 target for Gaborone only.")
inp(15, "Operating days per month", 26, "0", "Sunday delivery off in the pilot.")

a["A17"] = "FIXED MONTHLY COSTS"; a["A17"].font = HDR
inp(18, "Storage / small warehouse unit, P", 6000, MONEY, "Gaborone industrial unit, 60-80 sqm. Not a fulfilment centre.")
inp(19, "Team salaries (2 people), P", 16000, MONEY, "One picker/packer, one support + ops. Founders unpaid in the pilot.")
inp(20, "Tech, hosting, tools, P", 3000, MONEY, "Off-the-shelf commerce stack. Software is not the moat.")
inp(21, "Admin, compliance, insurance, P", 5500, MONEY, "Accounting, licences, public liability, parcel insurance.")
inp(22, "Founder draw, P", 0, MONEY, "Zero during the pilot. This is deliberate.")

# ---------------------------------------------------------------- UNIT ECONOMICS
u = wb.create_sheet("Unit Economics")
u.column_dimensions["A"].width = 4
u.column_dimensions["B"].width = 44
u.column_dimensions["C"].width = 16
u.column_dimensions["D"].width = 14
u.column_dimensions["E"].width = 4
u.column_dimensions["F"].width = 62

u["B1"] = "ONE ORDER, ONE TRIP"
u["B1"].font = Font(bold=True, size=14, color=BLUE)
u["B2"] = "If this number is negative, we are buying customers we cannot afford to serve."
u["B2"].font = Font(italic=True)

def line(r, label, formula, fmt=MONEY, bold=False, fill=None):
    u.cell(row=r, column=2, value=label).font = Font(bold=bold)
    c = u.cell(row=r, column=3, value=formula)
    c.number_format = fmt
    c.font = Font(bold=bold)
    for col in (2, 3):
        u.cell(row=r, column=col).border = BOX
        if fill:
            u.cell(row=r, column=col).fill = PatternFill("solid", fgColor=fill)

u["C3"] = "P / order"; u["C3"].font = Font(bold=True, italic=True, size=9)

line(5, "Average order value (AOV)", "=Assumptions!B4")
line(6, "Product gross profit", "=Assumptions!B4*Assumptions!B5")
line(7, "Delivery fee collected", "=Assumptions!B6")
line(8, "REVENUE PER ORDER (gross profit + delivery)", "=C6+C7", bold=True, fill=GREY)

line(10, "Last mile", "=-Assumptions!B7")
line(11, "Pick & pack labour", "=-Assumptions!B8")
line(12, "Packaging", "=-Assumptions!B9")
line(13, "Payment processing", "=-Assumptions!B4*Assumptions!B10")
line(14, "Returns & breakage", "=-Assumptions!B4*Assumptions!B11")
line(15, "Customer support", "=-Assumptions!B4*Assumptions!B12")
line(16, "Marketing (CAC)", "=-Assumptions!B13/Assumptions!B14")
line(17, "TOTAL VARIABLE COST", "=SUM(C10:C16)", bold=True, fill=GREY)

line(19, "CONTRIBUTION MARGIN PER ORDER", "=C8+C17", bold=True, fill=GREEN)
line(20, "Contribution margin % of AOV", "=C19/C5", fmt=PCT)

u["F19"] = "This is the Pula left over to pay for the building, the team and everything else."
u["F19"].alignment = Alignment(wrap_text=True, vertical="top")

u["B22"] = "BREAK-EVEN"; u["B22"].font = HDR
line(23, "Total fixed cost per month", "=Assumptions!B18+Assumptions!B19+Assumptions!B20+Assumptions!B21+Assumptions!B22")
line(24, "Orders needed per month to break even", "=C23/C19", fmt='#,##0')
line(25, "Orders needed per DAY to break even", "=C24/Assumptions!B15", fmt='#,##0.0')
line(26, "Revenue at break-even, P per month", "=C24*C5", fmt='#,##0')

u["F24"] = "Read this number out loud every Monday. It is the launch target, not '50 merchants signed'."
u["F24"].alignment = Alignment(wrap_text=True, vertical="top")

u["B28"] = "WARNINGS"; u["B28"].font = HDR
checks = [
    (29, "Contribution check",
     '=IF(C19<0,"STOP: negative contribution. No volume fixes this.","OK: positive contribution.")'),
    (30, "Volume check",
     '=IF(C25>35,"CAUTION: break-even needs >35 orders/day in Gaborone alone. Re-scope or reprice.","Volume requirement looks achievable.")'),
    (31, "Last-mile check",
     '=IF(Assumptions!B7>25,"CAUTION: last-mile above P25/drop. Use batched owned routes, not per-parcel couriers.","Last-mile cost in range.")'),
    (32, "Returns check",
     '=IF(Assumptions!B11>0.08,"STOP: returns above 8% of AOV. Fix delivery confirmation before scaling.","Returns provision within tolerance.")'),
    (33, "Margin check",
     '=IF(Assumptions!B5<0.18,"CAUTION: product margin below 18%. A commission-only model cannot carry last-mile costs.","Product margin sufficient to carry logistics.")'),
]
for r, label, f in checks:
    u.cell(row=r, column=2, value=label).font = Font(bold=True)
    c = u.cell(row=r, column=3, value=f)
    c.font = Font(bold=True, color="C00000")

# ---------------------------------------------------------------- MONTHLY P&L
m = wb.create_sheet("Monthly P&L")
m.column_dimensions["A"].width = 38
for col in range(2, 15):
    m.column_dimensions[get_column_letter(col)].width = 11

m["A1"] = "PILOT P&L — 12 months, Gaborone only"
m["A1"].font = Font(bold=True, size=14, color=BLUE)
m["A2"] = "Ramp assumes we fix the last mile BEFORE we scale marketing. Month 1-2 losses are learning costs, not failures."
m["A2"].font = Font(italic=True)

vol = [120, 200, 320, 440, 520, 600, 680, 760, 840, 920, 1000, 1100]

m["A4"] = "Month"; m["A4"].font = HDR
for i, v in enumerate(vol):
    c = m.cell(row=4, column=2 + i, value=f"M{i+1}")
    c.font = Font(bold=True)

def mrow(r, label, formulas, fmt=MONEY, bold=False):
    m.cell(row=r, column=1, value=label).font = Font(bold=bold)
    for i, f in enumerate(formulas):
        c = m.cell(row=r, column=2 + i, value=f)
        c.number_format = fmt
        c.font = Font(bold=bold)

col = lambda i: get_column_letter(2 + i)
n = len(vol)

mrow(5, "Orders", [f"={vol[i]}" for i in range(n)], fmt='#,##0', bold=True)
mrow(6, "Orders per day", [f"={col(i)}5/Assumptions!$B$15" for i in range(n)], fmt='0.0')
mrow(7, "GMV (P)", [f"={col(i)}5*Assumptions!$B$4" for i in range(n)])
mrow(8, "Product gross profit (P)", [f"={col(i)}5*Assumptions!$B$4*Assumptions!$B$5" for i in range(n)])
mrow(9, "Delivery fees collected (P)", [f"={col(i)}5*Assumptions!$B$6" for i in range(n)])
mrow(10, "Total revenue (P)", [f"={col(i)}8+{col(i)}9" for i in range(n)], bold=True)

mrow(12, "Last mile", [f"=-{col(i)}5*Assumptions!$B$7" for i in range(n)])
mrow(13, "Pick, pack, packaging", [f"=-{col(i)}5*(Assumptions!$B$8+Assumptions!$B$9)" for i in range(n)])
mrow(14, "Payment processing", [f"=-{col(i)}5*Assumptions!$B$4*Assumptions!$B$10" for i in range(n)])
mrow(15, "Returns & breakage", [f"=-{col(i)}5*Assumptions!$B$4*Assumptions!$B$11" for i in range(n)])
mrow(16, "Customer support", [f"=-{col(i)}5*Assumptions!$B$4*Assumptions!$B$12" for i in range(n)])
mrow(17, "Marketing", [f"=-Assumptions!$B$13" for _ in range(n)])
mrow(18, "Fixed costs", ["=-SUM(Assumptions!$B$18:$B$22)" for _ in range(n)])
mrow(19, "Total costs", [f"=SUM({col(i)}12:{col(i)}18)" for i in range(n)], bold=True)

mrow(21, "OPERATING PROFIT (P)", [f"={col(i)}10+{col(i)}19" for i in range(n)], bold=True)
mrow(22, "Operating margin %", [f"={col(i)}21/{col(i)}10" for i in range(n)], fmt=PCT)
mrow(23, "Cumulative profit (P)", ["=B21"] + [f"={col(i-1)}23+{col(i)}21" for i in range(1, n)])
mrow(25, "Cash peak requirement (lowest cumulative point)", "=MIN(B23:M23)")

for r in (10, 19, 21):
    for i in range(n):
        m.cell(row=r, column=2 + i).fill = PatternFill("solid", fgColor=GREY)
for i in range(n):
    m.cell(row=21, column=2 + i).fill = PatternFill("solid", fgColor=GREEN)

# ---------------------------------------------------------------- SENSITIVITY
s = wb.create_sheet("Sensitivity")
s.column_dimensions["A"].width = 30
for col_i in range(2, 10):
    s.column_dimensions[get_column_letter(col_i)].width = 13

s["A1"] = "WHAT ACTUALLY MOVES THE ANSWER"
s["A1"].font = Font(bold=True, size=14, color=BLUE)
s["A2"] = "Monthly operating profit (P). Rows = AOV, columns = orders per day. Green = the business works."
s["A2"].font = Font(italic=True)
s["A4"] = "AOV  \\  orders per day"; s["A4"].font = HDR

days = [10, 15, 20, 25, 30, 40, 50]
for j, d in enumerate(days):
    c = s.cell(row=4, column=2 + j, value=d)
    c.font = Font(bold=True)
    c.alignment = Alignment(horizontal="center")

aovs = [220, 280, 340, 380, 440, 520, 650]
for i, aov in enumerate(aovs):
    r = 5 + i
    s.cell(row=r, column=1, value=aov).number_format = MONEY
    s.cell(row=r, column=1).font = Font(bold=True)
    for j in range(len(days)):
        dcell = f"{get_column_letter(2+j)}$4"
        f = (
            f"=($A{r}*Assumptions!$B$5+Assumptions!$B$6"
            f"-Assumptions!$B$7-Assumptions!$B$8-Assumptions!$B$9"
            f"-$A{r}*Assumptions!$B$10-$A{r}*Assumptions!$B$11-$A{r}*Assumptions!$B$12"
            f"-Assumptions!$B$13/({dcell}*Assumptions!$B$15))*({dcell}*Assumptions!$B$15)"
            f"-SUM(Assumptions!$B$18:$B$22)"
        )
        c = s.cell(row=r, column=2 + j, value=f)
        c.number_format = '#,##0;[Red]-#,##0'
        c.border = BOX

s["A14"] = "READ THIS GRID, NOT THE FORECAST"
s["A14"].font = HDR
notes = [
    "Move along a ROW  -> more orders at the same basket size. Helps, but slowly, and it costs marketing.",
    "Move along a COLUMN -> bigger baskets at the same order count. This is nearly free and compounds.",
    "The bottom-left corner is the trap: cheap single-item orders delivered one at a time. Every Botswana marketplace that died lived here.",
    "The top-right corner is the business. Bundles, minimum order values and category adjacency get us there.",
]
for i, t in enumerate(notes):
    s.cell(row=15 + i, column=1, value=t)

for sheet in wb.worksheets:
    sheet.sheet_view.showGridLines = False

import os
os.makedirs("model", exist_ok=True)
wb.save("model/afrikart-unit-economics.xlsx")
print("saved model/afrikart-unit-economics.xlsx")
