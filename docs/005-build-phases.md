# Build Phases v2.0 — the execution spine, remapped to start

**One plan, from this Monday to regional expansion.** §1 is the **Route One** sequence: eight weeks to a
paying customer, ≈P270,000, on a deliberately reduced scope. §2 keeps the full phase catalogue as the
detail library — the scope we build *after* the evidence, in the order the evidence justifies.

**v2.0 (this version) is a re-map, not a rewrite.** `007-hinderings-last-run.md` found twelve things that
would stop us operating like Amazon — no addresses, a route limited by weight not drops, no supply chain,
regulated wedge categories, mobile money that cannot be debited. Every one is now in a named artefact,
and the build order changed to match: **the till before the catalogue, the route before the marketplace,
and Seller Central behind the gate instead of in front of it.** G1 therefore lands at **≈ month 4**, not
month 5.

**Two rules govern everything below:**

1. **A phase starts on an entry condition and ends on evidence.** Not on the calendar, and not on
   enthusiasm. The exit evidence lives in `docs/registers/`, not in a status update.
2. **One build track, one commercial track.** The builder never runs two phases at once; the founder's
   track (suppliers, photography, licences, PSP) runs alongside the build because it waits on the world,
   not on the code. Work-in-progress limit on code is one. That is the whole discipline.

**A note on dates, honestly:** `002-master-framework.md` first placed gate G1 at month 3. With the full
13-week scope, the earliest credible G1 was month 5 — and v1.1 said so. Trimming the scope to Route One
brings it back to **≈ month 4** (week 8 launch, 45-day pilot). **This document owns the calendar; `002`
owns the targets.** Where the two name different months, this one is right.

**v1.1 revision (kept for the record).** `006-amazon-gap-analysis.md` found four things the spine got wrong
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

## 1. The master sequence — Route One

**v2.0 remaps the order of the build, not the strategy.** v1.x built the platform of a company with
sellers, subscriptions and a marketplace — then hoped to become that company. We are not that company on
day one. **We are a shop with a route**, and the only thing that has to work in week eight is: *a customer
pays, a rider delivers, the money reconciles, the customer comes back.*

So the build starts with the till, not the catalogue. Money is the critical path (the PSP takes six weeks
of underwriting and is the one thing we cannot compress), it is the highest-risk code we will write, and
nothing else in the platform matters if it does not work.

| Order | Build | Weeks | Why it is in this position | Cash |
|---|---|---|---|---|
| **S0** | **Sprint Zero** — no code | 0 | Entity, PSP quotes, suppliers, licences, demand test. Everything here has a lead time longer than a sprint. | P22k |
| **B1** | **The Till** — money | 1–2 | Critical path, highest risk. Card + two mobile money, idempotent webhooks, atomic order transaction, double-entry ledger, VAT invoice, refunds. | P30k |
| **B2** | **The Shelf** — 40 SKUs, editorial storefront | 1–3 | Runs in parallel with B1 and is mostly *founder* work: photography, copy, bin locations. | P35k |
| **B3** | **The Route** — fulfilment, rider, capacity | 3–4 | The moat. Route sheet, offline PWA, reason codes, POD, cash recon, three-way capacity, address grading. | P25k |
| **B4** | **Trust** — the promises made visible | 5 | Refund channels, tracking page, published scorecard, DPA consent, T&Cs, licence gates. | P10k |
| **B5** | **Hardening** — the boring week | 6 | UAT, timed restore, monitoring, load test at 3× expected volume. The four never-cut items. | P8k |
| **B6** | **Soft launch** — 20 orders/day cap, one route, waitlist | 7–8 | Real money, small blast radius. | P10k |
| **B7** | **Pilot → G1** — 45 days, builds nothing | 8–15 | Evidence. **G1 now lands at ≈ month 4, not month 5.** | P40k |
| — | *Everything else* | post-G1 | Seller Central, payouts, search, reviews, subscriptions, marketplace, B2B, city 2. Funded by trading, not capital. | — |

```
Week  0    1    2    3    4    5    6    7    8 ──────── 15
      │    │    │    │    │    │    │    │    │          │
S0  ████
B1       ████████  ◀ the till works end to end
B2       █████████████
B3                 ████████
B4                           ████
B5                               ████
B6                                   ████  ◀ SOFT LAUNCH
B7                                       ████████████████  ◀ G1
PSP ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  (quotes day 2, underwriting in parallel)
```

**What this buys.** Seven weeks and roughly P55,000 of build cost, and G1 arrives seven weeks earlier than
v1.1 planned. What it costs is everything that is not needed to take one order and deliver it correctly —
listed in §1.3, with the reason each one moved.

### 1.1 The eight weeks, in detail

| Week | Build exits when… | Commercial track (parallel, never blocks) |
|---|---|---|
| **0** | Three PSP quotes in hand; builder contracted; 50 pilot addresses graded; 40 SKUs priced and photographed | CIPA filed, bank account opened, storage unit deposit paid, supplier run booked, licence check started |
| **1** | PSP sandbox: a test card and a test mobile-money payment both create an order, a payment and two balanced ledger entries | PSP application submitted; opening inventory ordered |
| **2** | Webhooks are idempotent (replayed ten times, one order); refunds create a reversal; VAT invoice renders a legal PDF | Insurance quoted; rider shortlisted |
| **3** | 40 SKUs live with photographs, bin locations and correct prices; a stranger can find one in two clicks | Rider hired + relief rider identified; shelving built |
| **4** | A delivery can be created, assigned, failed with a reason code, rescheduled and completed with proof; cash reconciles to the Pula | Stock received, counted, binned; price labels on shelves |
| **5** | Address grading enforced at checkout; tracking page shows every state; scorecard page publishes | Scorecard month 1 drafted; legal pages reviewed |
| **6** | Timed restore from backup; monitoring alarms fire; 90 test orders pass UAT; DPA consent captured at checkout | Launch list of 200 WhatsApp contacts assembled |
| **7–8** | 20 real orders delivered, ≤2 failed, cash reconciled daily, zero unexplained variance | Demand test results folded into the bundle and price decisions |

### 1.2 What is deliberately not in the launch

Every line below is a real feature we will need. None of them is needed to take a correct order and
deliver it. Each has a date, and the date is not "later".

| Deferred | Was | Now | Why |
|---|---|---|---|
| **Seller Central** (onboarding, KYC workflow, seller dashboard, CSV import) | P6, pre-launch | **post-G1** | D-001 says self-service sellers come after delivery works. Building seller tooling before there are sellers is the most expensive kind of speculation. |
| **Seller payouts + statements** | P6/P7 | **post-G1** | Launch stock is owned and consigned. One payout run per month, done by hand, is correct at 5 suppliers. |
| **Search** (index, facets, suggestions, sorting) | P2/P3 | **post-G1** | 40 SKUs do not need a search engine; they need three editorial rails and a category page. Keyword `ILIKE` until 200 SKUs. |
| **Reviews, saved items, wishlists, recommendations** | P3 | **post-G1** | No reviews exist on day one (H10). Publishing a scorecard is the honest substitute. |
| **Subscriptions UI + billing** | P10 | **post-G1** | Mobile money cannot be debited (H5); a subscription at launch would be a reminder service with no orders. |
| **Pickup points** | P11 | **post-G1** | Overflow valve; needed at 25 orders/day, not at 10. |
| **B2B accounts, standing orders, price breaks** | P12 | **post-G1** | Needs a P&L to price against. |
| **Multilingual, mobile app, loyalty, coupons engine** | various | **post-G1** | A PWA and one discount code (`LAUNCH10`) are enough. |
| **Full admin console** | P7 | **trimmed** | Orders list, pack, refund, product CRUD. That is the console. |

**What is never cut, at any scope** (`005` §6): idempotent webhooks · the atomic order transaction ·
mandatory failure reason codes · the timed restore drill. And now a fifth: **the analytics events**
(H8) — because instrumentation added later is instrumentation never added.

### 1.3 Where the old phases went

Nothing has been thrown away; the detail lives in §2 and the work moves to a date justified by evidence.

| v1.0 phase | v2.0 destination |
|---|---|
| P0 Readiness | **S0 Sprint Zero** |
| P1 Foundation | **B1** (same work, week 1) |
| P2 Catalogue | **B2**, trimmed to 40 SKUs, manual entry |
| P3 Storefront | **B2**, trimmed to home / category / product / cart / checkout |
| P4 Money | **B1 — moved to the front of the queue** |
| P5 Fulfilment | **B3**, plus three-way capacity and address grading |
| P6 Seller Central | **Deferred to post-G1** |
| P7 Admin & Ops | Split: order admin in B1–B2, the rest deferred |
| P8 Hardening | **B4 + B5** |
| P9 Trading pilot | **B7**, unchanged in intent, earlier in the calendar |
| P10 Retention + 3P fulfilment | Post-G1 (G2) |
| P11 Marketplace scale | Post-G1 (G3) |
| P12 Distribution & B2B | Post-G1 (G4) |
| P13 Regional | Year 2 (G5) |

### The three parallel tracks (always running)

| Track | Runs for | Never blocks |
|---|---|---|
| **Commercial** — entity, bank, PSP, suppliers, insurance, advisors | S0 → ongoing | Nothing technical waits on it; it waits on nothing |
| **Build** — B1 → B5 | 6 weeks | The commercial track |
| **Operating habits** — SOPs, registers, cadence | From day 1 | The build |

The build must never be the reason the PSP is late. The PSP starts on day 2 regardless.

---

## 1.4 The cash to get started

| Line | Cash |
|---|---|
| Sprint Zero (entity, licences, insurance, legal, photography brief) | P22,000 |
| Build contract — 7 weeks (card + mobile money + ledger + storefront + delivery + hardening) | P105,000 |
| Photography, 40 SKUs | P8,000 |
| Storage fit-out (shelving, bins, scanner, printer, scale) | P14,000 |
| Rider setup (scooter deposit, insurance, phone) | P12,000 |
| Opening inventory, 40 SKUs | P55,000 |
| Launch marketing | P10,000 |
| **Subtotal** | **P226,000** |
| Contingency (20%) | P45,000 |
| **To take the first order** | **≈ P271,000** |

Then the thing v1.0 forgot: **≈P114,000 of operating loss absorbed before month 6** (`Ramp` sheet). So:

> **≈ P270,000 to open the doors. ≈ P385,000 to a business that funds itself.**
> v1.1 said P325,000 and P504,000 for the same two milestones. The difference is scope, not optimism:
> about P55,000 of build moved behind revenue, where it can be paid for by customers.

---

## 2. The phase catalogue

> **How to read this section in v2.0.** These are the full phase definitions, kept because the scope has
> not changed — only the *order*. Where a phase is deferred or trimmed at launch, the heading says so and
> §1.2 gives the date. Anything marked **POST-G1** is built when there is evidence to build it against.

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

### P6 · Seller Central — **POST-G1 in v2.0**
**Weeks 9.5–11 in the v1.0 plan · 10% · Stories M5-01 → M5-06**

> **Why it moved.** D-001 already says self-service sellers come after delivery works. Building seller
> onboarding, KYC and a seller dashboard before there are sellers is the most expensive speculation in
> the original plan. At launch we have five suppliers and consignment; one monthly payout run, done by
> hand, is the correct system. Seller Central starts after G1, funded by trading.

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
S0 ──▶ B1 (till) ──┬──▶ B3 (route) ──▶ B4 ──▶ B5 ──▶ B6 LAUNCH ──▶ B7 (G1)
 │                 │                                                │
 │                 └──▶ B2 (shelf, parallel)                        ▼
 └──▶ PSP contract ──────────────────────────────▶  P6 (G2) ──▶ P11 (G3) ──▶ P12 (G4) ──▶ P13 (G5)
```

**The three hard dependencies, restated for the new order:**
- **B1 cannot finish without the PSP contract.** It is the only true critical path, and its underwriting
  runs in parallel from day 2. Everything else is buffered by the sprint, not by hope.
- **B2 cannot finish without photography and supplier prices.** Both are founder work with a two-week
  lead time. A builder cannot photograph a product or negotiate a wholesale price.
- **B3 cannot ship orders B1 cannot take.** Delivery before payment is a refund queue.

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

## 5. Cash to get started, and an honest reconciliation

| Build | Cash | Cumulative |
|---|---|---|
| S0 Sprint Zero (entity, licences, insurance, legal, photography brief) | P22,000 | P22,000 |
| B1 The Till | P30,000 | P52,000 |
| B2 The Shelf (incl. photography) | P35,000 | P87,000 |
| B3 The Route | P25,000 | P112,000 |
| B4 Trust + B5 Hardening | P18,000 | P130,000 |
| Storage fit-out (shelving, bins, scanner, printer, scale) | P14,000 | P144,000 |
| Rider setup (scooter deposit, insurance, phone) | P12,000 | P156,000 |
| Opening inventory, 40 SKUs | P55,000 | P211,000 |
| B6 Soft launch (marketing, packaging, float) | P15,000 | P226,000 |
| Contingency (20%) | P45,000 | **≈ P271,000** |
| **Operating losses absorbed M1–M5 (the cash trough)** `[A1]` | P114,000 | **≈ P385,000** |
| If an engineer is hired at M4, low band `[A5]` | +P153,000 of loss | **≈ P538,000** |

**Three lines in this table are the whole plan.**

The **P114,000 trough** is the cumulative operating loss before the business turns in month 6
(`model/afrikart-unit-economics.xlsx` → `Ramp`, and the engineer scenarios below the ramp). It is not
build cost and the contingency does not cover it: contingency pays for things going wrong, the trough pays
for the months going *right*. Read the total as **≈P385,000 to a business that funds itself**, not
P270,000 to open the doors.

The **engineer line** is the price of the technology pillar. P35–55k/month from month 4 moves the trough
to P267,000–P423,000 and pushes break-even from month 6 to month 11 or beyond. Decision **D-008**, and it
is the founders' to make: fund the hire, run a 40-hour/month retainer, or drop the pillar from the pitch.

The **contingency** is 20% and it is not a cushion for scope creep. **B6 is where the plan meets reality,
and B6 is where the money runs out if there is no buffer.**

### The reconciliation you need to see

`000-founding-decisions.md` estimated the 90-day pilot at **P220,000–260,000**, including operations and
working capital, assuming no paid developer. v1.0 of this document, with a full 13-week contracted build,
restated that as **P325,000 to launch and P390,000 with contingency** — and v1.2 of the framework added the
P114,000 trough on top.

v2.0 brings it back down by removing scope rather than by pretending:

> **≈ P270,000 to open the doors. ≈ P385,000 to a self-funding business.**

That is within P10,000 of the founders' original estimate — which is a good sign, not a coincidence: the
original number was roughly right for a *shop with a route*, and the 13-week plan was right for a
*marketplace*. We are building the shop first.

Three ways to close any remaining gap, and only three:

1. **Raise it** — founder capital plus CEDA/BDC once three months of clean accounts exist.
2. **Founder builds B2** (opening stock at cost, P10,000) and pays for the rest. Saves roughly P60,000 on
   the build contract and costs 3–4 weeks.
3. **Take the fallback** — single-vendor Shopify store with 20 SKUs, 60 days, ~P40,000, prove demand while
   you raise, and keep the architecture.

What you must not do is reduce the contingency or skip Sprint Zero. **S0 is P22,000 that decides whether
the other P249,000 is spent well.**

---

## 6. Rules of execution

1. **One build phase at a time.** The founder's commercial and catalogue track (S0, B2) runs in parallel by design; two *builders* on two phases at once is how both finish late.
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
| P1 Foundation | M0-01 … M0-07 | 7 |
| P2 Catalogue | M1-01 … M1-07 | 7 |
| P3 Storefront | M2-01 … M2-06 | 6 |
| P4 Money | M3-01 … M3-09 | 9 |
| P5 Fulfilment | M4-01 … M4-07 | 7 |
| P6 Seller Central | M5-01 … M5-06 | 6 |
| P7 Admin & Ops | M6-01 … M6-05 | 5 |
| P8 Hardening | M7-01 … M7-06 | 6 |
| **v1 total** | | **53** |
| *of which at Route One launch (B1–B6)* | M0-01…M0-07, M1-01…M1-05, M2-01…M2-04, M3-01…M3-09, M4-01…M4-07, M7-01…M7-06 | **38** |
| *of which post-G1* | M1-06/07, M2-05/06, M5-01…M5-06, M6-01…M6-05 | **15** |
| P10 Retention + 3P fulfilment | new stories at G1 | ~11 |
| P11 Marketplace | new stories at G2 | ~12 |
| P12 Distribution & B2B at scale | new stories at G3 | ~14 |
