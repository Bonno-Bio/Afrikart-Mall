# Build Phases v1.1 — the execution spine

**One numbering, from today to regional expansion.** Fourteen phases. Each has an entry condition, a
deliverable, an exit gate, a cash cost and a single metric that must move.

**Two rules govern everything below:**

1. **Phases are sequential.** A phase does not start because the calendar says so. It starts because
   the previous gate passed, with evidence in `docs/registers/`.
2. **One phase in flight at a time.** Maximum one parallel commercial track (the PSP, always the PSP).
   Work-in-progress limit is one. That is the whole discipline.

**A note on dates, honestly:** `002-master-framework.md` placed gate G1 at month 3. With a contracted
professional build, the earliest credible G1 is **month 5**. One of those two statements had to give.
The framework is now v1.2 and agrees with this document. A plan that disagrees with itself is worse
than a late plan.

**v1.1 revision (this version).** `006-amazon-gap-analysis.md` found four things this spine got wrong
and they are corrected here:

- **Third-party fulfilment moves P12 → P10.** It is the only high-margin line available to us, and it
  fills the density gap that makes months 1–6 lose money. Deferring it to month 10 was the single most
  expensive sequencing error in v1.0. `[A4]`
- **A route has a hard daily capacity** and checkout publishes a next-available date. Marketing cannot
  talk a rider into 30 drops. `[A6]`
- **The engineer line is priced, not assumed away.** See §5 — at pilot volumes a P35–55k/month hire
  roughly doubles the funding requirement. `[A5]`
- **The cash trough is part of the plan, not a surprise.** P114,000 between month 1 and month 6. §5 now
  carries it. `[A1]`

`[A#]` references point at the numbered amendments in `006` §5.

---

## 1. The master sequence

| Phase | Name | Build weeks | Calendar | Gate | Cash |
|---|---|---|---|---|---|
| **P0** | Readiness | −3 → 0 | Month 0 | — | P25k |
| **P1** | Foundation | 1–2 | M1 | — | P27k |
| **P2** | Catalogue | 2–3.5 | M1 | — | P27k |
| **P3** | Storefront | 3.5–5 | M2 | — | P27k |
| — | *PSP buffer* | 5–6 | M2 | — | — |
| **P4** | **Money** | 6–8 | M2 | — | P54k |
| **P5** | Fulfilment | 8–9.5 | M3 | — | P18k |
| **P6** | Seller Central | 9.5–11 | M3 | — | P18k |
| **P7** | Admin & Ops | 11–12 | M3 | — | P5k |
| **P8** | Hardening & Launch | 12–13 | M3 | **Launch** | P4k |
| **P9** | **Trading pilot** *(builds nothing)* | — | M3.5–5 | **G1** | P40k |
| **P10** | Retention **+ third-party fulfilment** `[A4]` | — | M5–7 | **G2** | P70k |
| **P11** | Marketplace scale | — | M7–10 | **G3** | P120k |
| **P12** | Distribution & B2B at scale | — | M10–13 | **G4** | P180k |
| **P13** | Regional | — | Year 2 | **G5** | — |

```
Month   0    1    2    3    4    5    6    7    8    9   10   11   12
        │    │    │    │    │    │    │    │    │    │    │    │    │
P0  ████
P1       ████
P2        ████
P3          ████
PSP ~~~~~~~~~~~~~~~~~~~~~~~ (underwriting, started day 2)
P4              ████████
P5                    ████
P6                      ████
P7                        ███
P8                          ███  ◀ LAUNCH
P9                            ████████  ◀ G1
P10                                 ████████  ◀ G2
P11                                        ████████████  ◀ G3
P12                                                  ████████████  ◀ G4
```

### The three parallel tracks (always running)

| Track | Runs for | Never blocks |
|---|---|---|
| **Commercial** — entity, bank, PSP, suppliers, insurance, advisors | P0 → ongoing | Nothing technical waits on it; it waits on nothing |
| **Build** — the phases | P1 → P8, then by gate | The commercial track |
| **Operating habits** — SOPs, registers, cadence | From day 1 | The build |

The build must never be the reason the PSP is late. The PSP starts on day 2 regardless.

---

## 2. The phase catalogue

### P0 · Readiness — *before any code*
**Weeks −3 → 0 · Cost ~P25,000 · Owner: founders**

> **Objective:** make it legal and fundable to build.

**Deliverables**
- CIPA registration, name reserved, TIN obtained, VAT decision taken with the accountant.
- Business bank account opened; two signatories; company email and domain.
- **Three PSP quotes requested on day 2** (`docs/hiring/psp-questions.md`).
- Builder shortlisted and contracted (`docs/hiring/build-brief.md`).
- Supabase + Vercel provisioned under the company account.
- Storage unit deposit paid; accountant appointed; insurance quoted.

**Entry:** nothing. This is where you start.
**Exit evidence:** registration certificate, bank confirmation letter, PSP applications submitted, signed builder contract, staging URL returns 200.
**Hard rule:** do not write application code in P0. Every hour here saves a week later.

---

### P1 · Foundation
**Weeks 1–2 · 15% of build fee · Stories M0-01 → M0-06**

> **Objective:** a skeleton with real authentication, real constraints and real error reporting.

**Deliverables:** repo + CI + preview deploys · migrations from empty · design tokens and layout shell ·
phone-OTP auth with five roles · row-level security proven by test · Sentry and uptime monitoring ·
image upload pipeline.

**Exit evidence**
- A seller logs in on **staging** and creates a product that persists after reload.
- A test proves a seller JWT cannot read another seller's rows.
- A thrown exception appears in Sentry with a trace id.

**Metric that must move:** staging is clickable every single day from here on.

---

### P2 · Catalogue
**Weeks 2–3.5 · 15% · Stories M1-01 → M1-07**

> **Objective:** real products, real photographs, findable.

**Deliverables:** category tree · product and variant CRUD with draft→live · media gallery with approval ·
inventory movements + cached levels · CSV bulk import · public catalogue read · Postgres full-text search
with facets.

**Exit evidence:** **40 real products imported with approved photography**, searchable, with stock that
reconciles movements to `on_hand`.

**Metric:** products live with a real photograph (target ≥ 40).
**Hard rule:** the critical path here is **photography, not code.** If the founder's photos are late,
this phase stalls no matter how good the builder is. Book the shoot in P0.

---

### P3 · Storefront
**Weeks 3.5–5 · 15% · Stories M2-01 → M2-06**

> **Objective:** a customer can browse, search, choose and fill a cart.

**Deliverables:** home with category rails · search and category results with live facets · PDP with
delivery estimate and seller card · cart with **server-side re-pricing** · saved list · reviews with
verified-purchase derivation.

**Exit evidence**
- Cart total cannot be altered from the browser: a test edits the price in devtools and the server
  rejects it.
- **Five real people complete browse → cart unaided**, and you watch all five.

**Metric:** browse-to-cart completion without help (target 5 of 5).
**Hard rule:** no checkout work in this phase. Checkout waits for the PSP contract, without exception.

---

### ⏳ PSP buffer — weeks 5–6
**Cost: none. Purpose: absorb underwriting slippage.**

This week exists on purpose. If the PSP lands early, P4 starts early and you bank a week. If it lands
late, you do not panic-schedule the riskiest phase of the build. **Do not fill this week with features.**

---

### P4 · Money — *the highest-risk phase*
**Weeks 6–8 · 30% of build fee · Stories M3-01 → M3-09**

> **Objective:** take a real Pula, correctly, and be able to prove it.

**Entry:** **PSP contract signed.** Non-negotiable. If it is not signed, this phase does not start —
you would be inventing an interface you must then unpick (`004` §8).

**Deliverables:** address book · delivery quote engine with the COD geographic rule enforced
server-side · PSP integration with hosted fields · **idempotent webhook handler** · atomic order
transaction (reserve stock, snapshot lines, post ledger, issue invoice) · sequential VAT invoices ·
WhatsApp/SMS notifications · refunds · daily reconciliation report.

**Exit evidence**
- One real P1 order captured end to end, with money in the PSP account.
- The ledger transaction **balances to zero** for that order — proven by query, not by assertion.
- Invoice number has no gaps.
- Replaying the same webhook ten times produces exactly one posting.
- A partial refund nets the order's ledger to zero.

**Metric:** ledger variance across all orders = **zero**.
**Hard rule:** nothing else is in flight during P4. This is where focus converts directly into money
you can account for.

---

### P5 · Fulfilment — *where the moat is*
**Weeks 8–9.5 · 10% · Stories M4-01 → M4-06**

> **Objective:** a parcel actually arrives, and when it does not, we know exactly why.

**Deliverables:** pick and pack with scan confirmation · **rider PWA that works offline** · delivery
transitions with **mandatory reason codes** · proof of delivery photo · daily cash reconciliation with
float limits · customer tracking page · **a hard daily capacity per route with a published
next-available date** `[A6]`.

**The capacity rule** `[A6]`. Every route stores `daily_capacity` (default 22) and
`route_capacity_remaining()` is called at checkout. When today's route is full the customer is offered
tomorrow — never silently accepted. Pickup points are the overflow valve. The rule is not a courtesy to
the rider: at 30 drops a route runs past eleven hours, first-attempt success falls, and the second
failure costs more than the order earned. **An order we cannot deliver on time is worse than an order
we did not take.**

**Exit evidence**
- One real delivery completed with a proof photo visible to the customer.
- One **deliberately failed** delivery logged with a reason code — you must test the failure path.
- Rider cash reconciled to the Pula; a variance above the float limit blocks the next assignment.
- The route loads after a reload with the network off.

**Metric:** `delivery.failed` events **all carry a reason code** (target 100%).
**Hard rule:** reason codes are free data and the most valuable thing you will collect. Never let a
failure be logged as "other".

---

### P6 · Seller Central
**Weeks 9.5–11 · 10% · Stories M5-01 → M5-06**

> **Objective:** a seller can run themselves without phoning you.

**Deliverables:** KYC application with document upload · admin verification queue · seller dashboard
derived from the ledger · seller order list with fulfilment · **weekly payout run with line-level
statement** · seller scorecard.

**Exit evidence**
- A real seller completes KYC, is approved, and lists unaided.
- Their payout statement reconciles line by line to `payout_items`, and the lines sum exactly to the
  payout total.
- A test proves a seller cannot read customer contact details through the API.

**Metric:** payout statement reconciliation — **zero unexplained lines**.
**Hard rule:** never store a seller balance as a column. Derive it. A column drifts; a query cannot.

---

### P7 · Admin & Ops
**Weeks 11–12 · 3% · Stories M6-01 → M6-05**

> **Objective:** the founders can run the day without a developer on the phone.

**Deliverables:** platform dashboard reconciling to the ledger · order management with audited actions ·
**route weekly P&L** rendering `route_weekly_pnl` · support lookup by phone or order number ·
moderation.

**Exit evidence:** a full day of operations — orders, one cancellation, one refund, one seller approval —
executed entirely from the dashboard, by a non-developer, unaided.

**Metric:** admin actions requiring a developer = **0**.

---

### P8 · Hardening & Launch readiness
**Weeks 12–13 · 2% · Stories M7-01 → M7-06**

> **Objective:** survive a bad day.

**Deliverables:** 12-journey UAT script signed by the founder · performance budgets measured on
simulated 3G · **backup restore actually performed and timed** · analytics events verified · legal and
trust pages · launch checklist with monitoring alerts routed to a phone someone answers.

**Exit evidence:** UAT signed · restore drill timed and written up · LCP under 2.5s on 3G · alerts
reach a human in under 5 minutes.

**Metric:** restore time recorded, in writing.
**Hard rule:** launching without a tested restore is not a launch, it is a bet on never being unlucky.

---

### P9 · Trading pilot — *this phase builds nothing*
**Months 3.5–5 · Cost ~P40,000 (ops and marketing) · Gate G1**

> **Objective:** evidence. The build is frozen.

**What you do:** run 300+ real orders on one route. Hold the weekly trading review. Close assumptions
in `registers/assumptions.md`. Shoot nothing new, build nothing new, add no features.

**The only permitted exceptions:** a bug that loses money, or a blocker on taking payment.
Everything else goes on a "not now" list.

**Exit evidence for G1**
- Contribution per order positive for three consecutive weeks.
- First-attempt success ≥ 85%.
- 300 completed orders.
- Cash reconciled daily with zero unexplained variance.
- **Cash conversion cycle measured and ≤ 25 days**, with a named owner. Reported from the `cash_cycle`
  view, not from a spreadsheet someone keeps privately. `[A2]`
- **Density climbing week over week** — the absolute number matters less than its direction. `[A1]`
- **Route capacity utilisation ≤ 85%** on the days we want to sell into. `[A6]`
- ≥ 8 of the 15 assumptions in the register closed.

**The decision at G1 — continue / re-scope / stop** `[A10]`. Re-scope is the *expected* outcome, not a
failure: the pilot's job is to find the one wrong variable. Full definitions in `002` Q1.

| Outcome | Trigger | What happens next |
|---|---|---|
| Continue | Contribution > P0 for 3 weeks, 1st-attempt ≥ 85%, density rising | P10 as written |
| **Re-scope** | Directionally right, one variable wrong (category, price band, suburb, bundle) | Change one variable, re-run a 45-day G1 |
| Stop | Contribution negative **and** density flat **and** 1st-attempt < 80% after two cycles | Return capital |

Stopping here costs ~P370k. Stopping at month 12 costs ~P2m and a reputation. **This is the cheapest
exit you will ever be offered.**

---

### P10 · Retention
**Months 5–7 · ~P60,000 · Gate G2**

> **Objective:** prove we get paid twice for one acquisition.

**Build:** cohort tracking and CRM segments · bundles and threshold testing infrastructure ·
subscription billing for nappies and formula · referral programme with two-sided credit ·
three published delivery scorecards · **third-party fulfilment, deliberately small** `[A4]`.

**Third-party fulfilment — why it starts here and not at P12** `[A4]`. At 20 orders a day a route is
running at half capacity, and half an empty route is the most expensive thing we own. Three
non-competing retailers (a pharmacy, a salon supplier, a hardware shop) putting 5–15 parcels a day on
that route does two things at once: it lifts drops/day from 20 to 28 — straight down the density curve,
P15 to P12 per drop — and it earns a per-parcel fee on capacity we have already paid for. This is our
FBA. It is not a fulfilment centre, it is a spreadsheet, a shelf, and a rider with room. Waiting until
month 10 to sell spare capacity was the costliest error in v1.0.

Deliberately small at this stage: fixed collection windows (10:00–12:00), one rate card, no integration,
no seller portal. Three customers, invoiced monthly.

**Exit evidence for G2:** 30-day repeat ≥ 25% · AOV ≥ P350 sustained four weeks · ≥ 15% of new customers
from referral · ≥ 40 active subscriptions · **third-party parcels ≥ 5% of route volume**, priced above
marginal cost.

**The decision at G2:** the repeat number is the verdict on the category, not on the marketing.

---

### P11 · Marketplace scale
**Months 7–10 · ~P120,000 · Gate G3**

> **Objective:** third-party sellers add growth without adding proportional cost.

**Build:** self-serve seller onboarding · seller scorecards with automatic flags · automated weekly
payout runs · pickup-point network (8–10 partner shops) · route 2 · seller analytics.

**Exit evidence for G3:** 10 verified sellers trading · third-party share of GMV ≥ 40% · 12 consecutive
on-time payout runs · pickup ≥ 20% of orders · route 2 contribution-positive within six weeks.

---

### P12 · Distribution & B2B
**Months 10–13 · ~P180,000 · Gate G4**

> **Objective:** prove the model is a system, not a founder's habit.

**Build:** B2B trade accounts with terms and price breaks · standing-order and purchase-order flow ·
**third-party fulfilment scaled from 3 to 10 retailers on standing contracts** (started at P10) · city 2
launch · ops manual written from real logs.

**Exit evidence for G4:** a new hire runs a route unsupervised for two weeks · 10 B2B accounts with
basket ≥ P1,800 and 60% weekly repeat · **third-party parcels ≥ 15% of route volume and ≥ 25% of route
contribution** · city 2 breaks even on contribution per order within 90 days.

**Why this is the important one:** third-party parcels are the first real evidence that the delivery
network is worth renting. That, not the storefront, is the empire thesis — and by P12 it should already
be a line in the P&L, not a pilot.

---

### P13 · Regional
**Year 2+ · Gate G5**

> **Objective:** replicate a proven P&L, never a proven brand.

**Entry:** a city has run profitable for **twelve consecutive months** and the ops manual is good enough
that a new city manager needs no founder.

**Sequence:** Namibia (same customs union, sparse retail, similar income) before South Africa. South
Africa means attacking Takealot on its home turf with the continent's toughest retail competition.

**Build:** multi-currency and multi-country tax rules · cross-border logistics · localised catalogue ·
per-country compliance.

---

## 3. Dependency map

```
P0 ──▶ P1 ──▶ P2 ──▶ P3 ──┐
  │                        │
  └──▶ PSP contract ───────┴──▶ P4 ──▶ P5 ──▶ P6 ──▶ P7 ──▶ P8 ──▶ LAUNCH
                                                                    │
                            photography (P0 booked) ──┘             ▼
                                                        P9 (G1) ──▶ P10 (G2) ──▶ P11 (G3) ──▶ P12 (G4) ──▶ P13 (G5)
```

**The two hard dependencies:**
- **P4 cannot start without the PSP contract.** Everything before it can.
- **P2 cannot finish without photography.** A builder cannot photograph products; the founder must.

Everything else is soft and can be re-sequenced without breaking anything.

---

## 4. Gate evidence — what goes in the registers

A gate is not a feeling. At each gate, these artifacts must exist **before** the review starts.

| Gate | Evidence pack | Register entry required |
|---|---|---|
| **Launch** | UAT signed, restore timed, monitoring live, legal pages up | Decision: launch on this date |
| **G1** | 300 orders, contribution trend, first-attempt trend, cash recon log, **cash cycle ≤ 25d**, **density trend**, **capacity utilisation**, 8 closed assumptions | Decision: continue / re-scope / stop |
| **G2** | Cohort table, AOV trend, referral share, subscription count, 3 scorecards shipped, **third-party parcels ≥ 5% of volume** | Decision: confirm category |
| **G3** | 10 sellers, 3P GMV share, **prepaid ≥ 70%**, payout run log, pickup share, route 2 P&L | Decision: scale marketplace |
| **G4** | Unsupervised route proof, B2B cohort, **third-party ≥ 15% of volume and ≥ 25% of route contribution**, city 2 P&L | Decision: open city 3 or go regional |
| **G5** | 12 months profitable, ops manual, city manager trained | Decision: country 2 |

---

## 5. Cash by phase, and an honest reconciliation

| Phase | Cash out | Cumulative |
|---|---|---|
| P0 Readiness | P25,000 | P25,000 |
| P1–P3 Foundation, Catalogue, Storefront | P81,000 | P106,000 |
| P4 Money | P54,000 | P160,000 |
| P5–P8 Fulfilment, Seller, Admin, Hardening | P45,000 | P205,000 |
| Inventory and working capital float | P80,000 | P285,000 |
| P9 Trading pilot (8 weeks of incremental pilot spend) | P40,000 | **P325,000** |
| Contingency (20%) | P65,000 | **≈ P390,000** |
| **Operating losses absorbed M1–M5 (the cash trough)** `[A1]` | P114,000 | **≈ P504,000** |
| Total if an engineer is hired at M4, low band `[A5]` | +P153,000 of loss | **≈ P657,000** |

**Two lines in that table did not exist in v1.0 and both are real.**

The **P114,000 operating trough** is the cumulative loss the business runs before it turns in month 6
(`model/afrikart-unit-economics.xlsx` → `Ramp`). It is not build cost and it is not covered by the
contingency: contingency pays for things going wrong, the trough pays for the months going *right*. What
makes the pilot expensive is not the software, it is the density we have to buy with time. Read the
number as **≈P500,000 to reach a business that funds itself**, not P390,000 to open the doors.

The **engineer line** is the honest cost of calling ourselves a technology company. From month 4,
P35–55k/month over nine months moves the trough from P114,000 to P267,000–P423,000 and pushes
break-even from month 6 to month 11 — or beyond month 12 at the top of the band. Priced in full on the
`Ramp` sheet. This is decision **D-008** and it is a founders' decision, not a document's: fund the hire
and raise P650–800k, run a 40-hour/month retainer, or drop the pillar from the pitch. All three are
legitimate. Only the unstated version is not.

### The reconciliation you need to see

`000-founding-decisions.md` estimated the 90-day pilot at **P220,000–260,000**. That figure included
operations and working capital, and assumed **no paid developer** — which was correct at the time,
because the recommendation then was to validate before spending on engineering.

With a contracted professional build at P120,000–250,000, the honest number to reach a live,
revenue-taking, ledger-correct platform is:

> **≈ P325,000 to launch, ≈ P390,000 with contingency.**

Three ways to close the gap, and only three:

1. **Raise it** — founder capital plus CEDA/BDC once three months of clean accounts exist.
2. **Founder builds P1–P3** with a senior contractor reviewing weekly, and pays for P4 onward. Saves
   roughly P80,000 and costs 3–4 weeks.
3. **Take the fallback** — single-vendor Shopify store with 20 SKUs, 60 days, ~P40,000, and prove
   demand while you raise. Keeps the whole architecture for later.

What you must not do is reduce the contingency. **P9 is where the plan meets reality, and P9 is where
the money runs out if there is no buffer** — and the trough, not the build, is what empties it.

---

## 6. Rules of execution

1. **One phase at a time.** New features never start before the current gate passes.
2. **Exit evidence lives in `docs/registers/`,** not in a WhatsApp message or a verbal assurance.
3. **The founder signs off the acceptance criteria,** not the builder. A builder demonstrating their
   own work is not a review.
4. **Dates move, scope does not.** If a phase slips, cut from the cut line in `spec/backlog.md` §The
   cut line — never compress P4 or P5.
5. **Four things are never cut:** idempotent webhooks, the atomic order transaction, mandatory failure
   reason codes, the restore drill.
6. **P9 builds nothing.** The single most common way a pilot fails is that the team keeps shipping.
7. **No order is accepted that the route cannot carry.** The capacity cap is a promise, and a promise
   kept late is not kept.
8. **A gate that fails is a result, not a setback.** The framework's tenth commitment applies: we write
   down what we believe and the date we will know we were wrong.

---

## 7. Appendix — phase to backlog mapping

| Phase | Stories | Count |
|---|---|---|
| P1 Foundation | M0-01 … M0-06 | 6 |
| P2 Catalogue | M1-01 … M1-07 | 7 |
| P3 Storefront | M2-01 … M2-06 | 6 |
| P4 Money | M3-01 … M3-09 | 9 |
| P5 Fulfilment | M4-01 … M4-06 | 6 |
| P6 Seller Central | M5-01 … M5-06 | 6 |
| P7 Admin & Ops | M6-01 … M6-05 | 5 |
| P8 Hardening | M7-01 … M7-06 | 6 |
| **v1 total** | | **51** |
| P10 Retention + 3P fulfilment | new stories at G1 | ~11 |
| P11 Marketplace | new stories at G2 | ~12 |
| P12 Distribution & B2B at scale | new stories at G3 | ~14 |
