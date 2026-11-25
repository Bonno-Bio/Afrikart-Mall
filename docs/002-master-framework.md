# Afrikart Mall — Master Execution Framework v1.2

**Status:** The operating system. Every element here has an owner, an artifact, a cadence and a gate.
**Companions:** `000-founding-decisions.md` (the business case) · `001-platform-architecture.md` (the build) ·
`003-production-stack.md` · `004-build-readiness.md` · **`005-build-phases.md` (the execution spine)** ·
**`006-amazon-gap-analysis.md` (the critique this version answers)** · `registers/` (the living truth) ·
`templates/` (the rituals)

**v1.1 revision:** gate dates moved. A contracted professional build takes 13 weeks, so G1 lands in
**month 5**, not month 3 — see `005-build-phases.md`. The four fights and their evidence are unchanged;
only the calendar is honest now.

**v1.2 revision — the "how to win" revision.** v1.1 was excellent at not dying and silent about growth.
`006` found three structural faults: **we absorb cash instead of generating it, our density is assumed
rather than earned, and the incumbent's delivery advantage is invisible to us.** Twelve amendments plus two operating policies follow,
each traceable to a numbered amendment in `006` §5 (shown as `[A5]`). The ones that matter most:

- The density curve replaces the P18 constant; month 1 is modelled at P36–40 per drop and the model now
  shows the **P114,000 operating cash trough in month 5** before anything turns. `[A1]`
- **Cash conversion cycle is a G1 gate metric** with a target of ≤25 days, and supplier terms are a
  named strategic objective, not a finance chore. Prepaid share reaches **70% by G3**. `[A2][A3]`
- Third-party fulfilment moves from Q4 to **Q3** — it is our FBA and our only realistic high-margin line. `[A4]`
- **One engineer on payroll from month 4.** Without it we are a shop with a website and should say so. `[A5]`
- G1's outcome set is now **continue / re-scope / stop**, with re-scope as the *expected* result. `[A10]`
- A **second north star with an activation trigger** exists, so a funded competitor triggers a decision
  rather than a panic. `[A7]`
- AI is demoted from pillar to tool in every document. `[A12]`

Where v1.1 asserted, v1.2 attaches a number, an owner and a date.

---

## 0. How to use this document

There are two kinds of document in a company, and confusing them is the most common way execution
falls apart:

| | Framework (this file) | Registers (`registers/`) |
|---|---|---|
| Changes | Rarely — a version, a date, a reason | Weekly |
| Purpose | Decide how we decide and operate | Record what we now know |
| Owner | Founders, jointly | One named person per register |
| If it's stale | Rewrite it deliberately | That is a failure |

**This file is stable. The registers are living.** If the framework and a register disagree, the
register wins and the framework gets a new version.

The framework has seven layers. They are ordered so that each one constrains the one above it —
strategy cannot override the constitution, and tactics cannot override strategy.

```
        ┌─────────────────────────────────────────┐
   7    │  People & capital          (who + what)  │
        ├─────────────────────────────────────────┤
   6    │  Technology & automation   (how it runs) │
        ├─────────────────────────────────────────┤
   5    │  Functional playbooks      (what we do)  │
        ├─────────────────────────────────────────┤
   4    │  Cadence & governance      (how we steer)│
        ├─────────────────────────────────────────┤
   3    │  Operating model           (what we count)│
        ├─────────────────────────────────────────┤
   2    │  Strategy                  (where we play)│
        ├─────────────────────────────────────────┤
   1    │  Constitution              (what we are)  │
        └─────────────────────────────────────────┘
```

---

## 1. Constitution (layer 1) — what we are

Rarely changes. Everything below is negotiable; this is not.

**Purpose.** Make buying anything in Botswana as reliable as walking into a shop you already trust.

**Promise (the one sentence we are judged on).**
> Order today, it arrives tomorrow, and if it is wrong we take it back.

**We win by** being the only place in Botswana where an online order reliably arrives — not by having
the widest catalogue and not by being the cheapest.

**The ten commitments.** These are operational, and each one is auditable:

1. We publish a monthly delivery scorecard — including the months that embarrass us.
2. We never make a customer pay for a seller's mistake.
3. Cash is reconciled daily, to the Pula. A shortfall is investigated the same day.
4. No product goes live without a real photograph.
5. Every decision above P10,000 gets a written record (`registers/decisions.md`).
6. No seller goes live unverified. Not once, not ever, not even for a big one.
7. We will stop a quarter early rather than pretend a number is better than it is.
8. Every customer message gets a human reply within two hours, seven days a week.
9. We manage contribution margin. GMV is a symptom, never a target.
10. We write down what we believe and the date we will know we were wrong.

**What we refuse to become.** A listing site that earns a commission. A discount retailer in a price war
with Choppies. A delivery company that takes any parcel for anyone. A data broker.

---

## 2. Strategy (layer 2) — where we play and how we win

### 2.1 The wedge, the moat, the ladder

| | |
|---|---|
| **Wedge** | Two adjacent, non-discretionary, high-margin, small-parcel categories — **baby & mother** and **hair & beauty** — sold as bundles to the household's primary shopper, delivered next day in Gaborone by us. |
| **Why this wedge** | Weekly-to-six-weekly repurchase (frequency, so we learn fast), 60–100% gross margin on beauty, price-predictable on baby, and both are import-heavy — so local stock beats a three-week parcel from Shenzhen. |
| **Moat** | Route density (P18/drop vs P70), category exclusivity, the returns promise, supplier terms, and the operating data. Software is not the moat and never will be. |
| **Ladder** | Owned marketplace in one city → seller marketplace + B2B wholesale → white-label fulfilment for third-party retailers → regional replication inside SACU. |
| **Catalogue tiers** `[A8]` | **Express** — curated, badged, next-day guaranteed, backed by our stock. **Marketplace** — long-tail third-party listings with an honest 3–5 day estimate and no badge. Selection grows without diluting the promise; the badge is what we are paid for. |
| **Escape category** `[A9]` | If the wedge fails its repeat test, the pre-committed second category is **baby equipment + small solar + household durables** at P600–2,500 AOV — higher ticket, same household, same trust requirement. Named now so the G2 decision is a switch, not a search. |

### 2.2 The five strategic bets, stated as bets

Written this way on purpose. A bet has a resolution date.

| # | We bet that… | We will know on | If wrong |
|---|---|---|---|
| B1 | Botswana households will pay a small premium for certainty (arrival time + returns) over the lowest price | Day 90 | Re-weight toward price leadership and shrink assortment to the 40 fastest SKUs |
| B2 | Bundling lifts AOV above P350 without suppressing conversion | Day 75 | Re-cut the category: move to a higher-ticket basket (baby equipment, solar) |
| B3 | A batched owned rider route can hold cost per drop under P22 at 20+ drops/day | Day 60 | Move to a pure pickup-point model in the pilot suburbs |
| B4 | Local sellers will accept a 12% + 6% structure in exchange for delivery and demand | Day 120 | Reduce to 10% flat and monetise fulfilment only |
| B5 | SACU sourcing gives us a durable landed-cost advantage over importers | Day 150 | Shift to consignment-only to remove inventory risk |

### 2.3 Expansion logic (explicitly not a wish list)

Expansion is triggered by a **proven P&L**, never by a proven brand. Copia raised $123M and died
serving the same customers we want; Jumia exited three markets in two years. The rule:

> A new city opens only when the current city has run contribution-positive for **three consecutive
> months** and route density is **stable or improving**. A new country opens only when a city has
> been profitable for **twelve months** and the playbook is written down well enough that a new city
> manager could run it without the founders.

---

## 3. Operating model (layer 3) — what we actually count

### 3.1 The unit of success is the route, not the company

This is the single most important idea in this framework. Amazon manages by contribution per unit and
inventory turns. Afrikart should manage by **contribution per route per week**, because that number
contains almost everything: demand, basket size, density, delivery quality, fraud, and cash.

If you can make one route profitable, you have a business. You can then copy it. If you cannot, no
amount of marketing or catalogue breadth will save you.

**Route scorecard (weekly):**

| Metric | Definition | Target M3 | Target M12 |
|---|---|---|---|
| Drops | Successful deliveries in the week | 90 | 280 |
| Revenue per route | Item value delivered | P34,000 | P118,000 |
| **Contribution per route** | Revenue − COGS − last mile − pack − PSP − returns − support | **P4,500** | **P17,000** |
| Drops per route hour | Density | 3.5 | 5.0 |
| Cost per drop | All-in | ≤ P22 | ≤ P18 |
| First-attempt success | Delivered on first attempt | ≥ 88% | ≥ 93% |
| Failed-drop reasons logged | % with a reason code | 100% | 100% |
| **Drops/day on the route** | Successful drops ÷ route days | 15 | 28 |
| **Route capacity utilisation** | Drops ÷ route daily capacity | ≤ 85% | ≤ 85% |

**The density curve — read this before believing any cost-per-drop number** `[A1]`

Cost per drop is not a constant; it is a *function of how many drops share one rider's day*. The model
computes it rather than asserting it:

| Drops/day on one route | 5 | 8 | 12 | 18 | 22 | 28 | 32 |
|---|---|---|---|---|---|---|---|
| All-in cost per drop | P64 | P40 | P27 | P18 | P15 | P12 | P10 |

Three consequences, all of them operational rather than analytical:

1. **Month 1–2 will look terrible and that is arithmetic, not failure.** At 5–8 drops/day we lose P100+
   per order no matter how well we buy or sell. The pilot is not judged on cost per drop; it is judged
   on whether the curve is being climbed.
2. **Contribution per order and drops/day must always be quoted together.** "P30 contribution per order"
   at 8 drops/day is a fantasy; the same margin at 22 drops/day is a business.
3. **A second route divides density before it multiplies revenue.** Opening route 2 dropped cost per
   drop from P11 to P19 in the model for a month. That is the price of coverage, and it is why a new
   route opens only at >85% capacity on the old one for two consecutive weeks.

### 3.2 The metric tree

One north star, five engines, one number each that a person owns.

```
                 CONTRIBUTION PER ROUTE PER WEEK  ── CEO
                                │
     ┌──────────────┬───────────┴───────────┬──────────────┐
     ▼              ▼                       ▼              ▼
  DEMAND         BASKET                 DELIVERY        MONEY
  orders/day     AOV (P)                cost/drop (P)   cash cycle (days)
  ── Growth      ── Merchandising       ── Ops          ── Finance
     │              │                       │              │
     ├ sessions     ├ items/order           ├ drops/route-hr ├ COD share
     ├ conv. %      ├ bundle attach %       ├ 1st-attempt %  ├ refund days
     ├ repeat 30d   └ free-ship threshold   └ fail reasons   └ settlement lag
     └ CAC
                                │
                                ▼
                        TRUST (the multiplier)
                        NPS · dispute rate · review volume · on-time %
```

**The second north star — and its activation trigger** `[A7]`

Contribution per route is the right north star *for us*. It is the wrong north star *in a land war*:
it optimises for margin while a funded competitor buys share. So a second star exists, dormant, with a
written trigger:

| | Primary (default) | Secondary (activated) |
|---|---|---|
| North star | Contribution per route per week | Orders per day in the defended suburbs |
| Gate discipline | Hard stops at every gate | Slower stops, wider loss budget |
| Loss budget | None beyond the gate | **P150,000 of contribution over 90 days**, then a written review |
| Activates when | — | A competitor with >P5m of funding offers a delivery promise we cannot match, or takes >15% of our repeat customers in one quarter |

Activation is a **recorded decision in `registers/decisions.md`**, with the date and the amount. It is
never a drift. Switching stars without writing it down is how companies discover they have been
subsidising growth for a year with no plan to stop.

**Year-one targets, by month.** These are the numbers in the weekly review. If a number is missing,
the review is not finished.

| Metric | M3 | M6 | M12 | Owner |
|---|---|---|---|---|
| Orders / day | 15 | 25 | 45 | Growth |
| AOV | P320 | P380 | P420 | Merchandising |
| Contribution / order | ≥ P30 | ≥ P45 | ≥ P60 | CEO |
| Contribution / route / week | ≥ P1,800 | ≥ P4,500 | ≥ P17,000 | Ops |
| First-attempt success | 88% | 91% | 93% | Ops |
| Cost per drop | ≤ P24 | ≤ P22 | ≤ P18 | Ops |
| 30-day repeat rate | — | 25% | 35% | Growth |
| **Prepaid share of orders** `[A3]` | ≥ 40% | ≥ 55% | **≥ 70%** | Finance |
| COD share of orders | ≤ 60% | ≤ 45% | ≤ 30% | Finance |
| Refund cycle (hours) | 96 | 72 | 48 | Support |
| Stockout on top 100 SKUs | ≤ 10% | ≤ 7% | ≤ 5% | Merchandising |
| **Cash conversion cycle** `[A2]` | ≤ 25d | ≤ 5d | ≤ −5d | Finance |
| Supplier payment terms won (days) | 0 | 14 | 30 | CEO |
| **Route capacity utilisation** | ≤ 70% | ≤ 85% | ≤ 85% | Ops |
| NPS | — | 35 | 45 | Support |

### 3.3 The four numbers that kill us (reviewed every single week)

1. **Contribution per order** — if negative, nothing else matters.
2. **First-attempt success** — a failed drop costs the trip twice and the customer once.
3. **AOV** — the cheapest lever we have and the one we will neglect.
4. **Cash conversion cycle** — profitable companies in this market die of cash, not margin.

And the number that decides whether any of the four can improve: **drops per day on the densest route.**
It is the denominator of three of the four above.

---

## 4. The 12-month battle plan (layer 3) — four quarters, four fights

One fight per quarter. Each has a gate. **A gate is passed on evidence, not on effort.**

### Q1 — "One order makes money" (Months 3.5–5)
**Must-win:** a single Gaborone route where contribution per order is positive and delivery is
reliable enough that we would recommend it to our own family.

| Deliverables | Gate G1 evidence |
|---|---|
| One 60–80 m² unit, one rider, one picker | 45 consecutive days of operations |
| WhatsApp + hosted storefront live | ≥ 300 completed orders |
| 5–8 suppliers signed, 40–60 SKUs live with real photos | Contribution per order > P0 for 3 consecutive weeks |
| Delivery reason codes captured on 100% of failures | First-attempt success ≥ 85% |
| Daily cash reconciliation to the Pula | Zero unexplained cash variances at month end |
| **Cash conversion cycle measured, not estimated** `[A2]` | CCC ≤ 25 days with a named owner (`cash_cycle` view in `db/schema.sql`) |
| Registered entity, tax, PSP, data-protection registration filed | Written confirmation from each counterparty |

**Decision at G1 — continue / re-scope / stop** `[A10]`

Three outcomes, and the middle one is the *expected* one. A gate that can only say "go" is not a gate;
a gate whose default is "go" is a formality.

| Outcome | When | What it means |
|---|---|---|
| **Continue** | Contribution per order > P0 for 3 weeks, 1st-attempt ≥ 85%, density climbing week over week | The wedge works as designed. Proceed to Q2 unchanged. |
| **Re-scope** *(default expectation)* | Numbers are directionally right but the category, price band, bundle or suburb is wrong | **Change one variable, keep the machine.** Most likely moves: the escape category (`002` §2.1), a tighter geography, or a higher price band. Re-run a 45-day G1. |
| **Stop** | Contribution still negative *and* density not climbing *and* first-attempt below 80% after two 45-day cycles | Return capital. Stopping at G1 costs ~P370k; stopping at M12 costs ~P2m and a reputation. |

(`005` §5 reconciles the P370k against the original P250k estimate — the difference is the contracted build.)

### Q2 — "They come back" (Months 5–7)
**Must-win:** proof that we acquire a customer once and get paid again without paying to acquire them
again.

| Deliverables | Gate G2 evidence |
|---|---|
| Bundles, minimum order value, free-delivery threshold tested | AOV ≥ P350 sustained 4 weeks |
| CRM: segments by first order, cohort tracking live | 30-day repeat ≥ 25% |
| Referral programme (P50 both sides) | ≥ 15% of new customers from referral |
| Subscription for nappies/formula | ≥ 40 active subscriptions |
| First 3 published monthly delivery scorecards | Scorecard shipped on time, 3 for 3 |

**Decision at G2:** the repeat number is the verdict on the category. If 30-day repeat is below 15%
with a consumable basket, the assortment is wrong, not the marketing.

### Q3 — "Sellers carry half the growth" (Months 7–10)
**Must-win:** the marketplace earns its name — third-party sellers add GMV without adding proportional
cost or support load.

| Deliverables | Gate G3 evidence |
|---|---|
| Seller onboarding kit: KYC checklist, photo standard, price band, SLA | 10 verified sellers trading |
| Seller scorecard: fill rate, cancellation, response time | Third-party share of GMV ≥ 40% |
| Seller payout run automated, weekly, with statements | 12 consecutive on-time payout runs |
| Second route opened (densest adjacent suburb) | Route 2 contribution-positive by week 6 |
| Pickup points live (8–10 partner shops) | Pickup = ≥ 20% of orders |
| **Third-party fulfilment offered to 3 non-competing retailers** `[A4]` | **Third-party parcels ≥ 5% of route volume** |
| Prepaid incentives: wallet top-up bonus, discount on prepay | **Prepaid share ≥ 70%** `[A3]` |

### Q4 — "It works somewhere else" (Months 10–13)
**Must-win:** the model is a system, not a founder's habit.

| Deliverables | Gate G4 evidence |
|---|---|
| Ops manual written from real logs, not imagination | A new hire runs a route unsupervised for 2 weeks |
| Second city selected and launched (Palapye or Francistown) | City 2 breaks even on contribution per order by day 90 |
| B2B pilot: 10 spazas/salons on a weekly standing order | B2B basket ≥ P1,800, repeat ≥ 60% |
| Fulfilment service scaled to 10 retailers on standing contracts | Third-party contribution ≥ 25% of route contribution |
| 12-month audited P&L, board or advisory review | Signed off |

### 4.1 What we will not do in year one

Stated explicitly, because focus is defined by refusal:

- No mobile app (a PWA is enough until 5,000 monthly orders)
- No fulfilment centre (one storage unit) — but *selling* spare route capacity to third-party retailers
  is not a fulfilment centre and starts at P10, not P12 `[A4]`
- No private label
- No second country
- No advertising product
- No wallet or stored-value account
- No same-day delivery (next-day is the promise; same-day is a promise we cannot keep at this density)
- No AI chatbot (a human on WhatsApp beats a bot in this market for at least a year) — and no AI
  presented as a pillar of the business. AI is a tool we buy or a script we run, not a reason to invest `[A12]`
- No grocery cold chain
- No sale event that requires discounting below contribution

---

## 5. Functional playbooks (layer 5) — the 15 areas, operationalised

Every area gets an owner, the artifact it produces, and the rhythm it runs on. **If an area has no
artifact, it is a hobby.**

| # | Area | Owner | Artifact in this repo / system | Cadence | Primary metric |
|---|---|---|---|---|---|
| 1 | Vision & identity | CEO | `000` §1, brand sheet, tone of voice | Annual | — |
| 2 | Market research | CEO | Assumption register + monthly customer interviews (5) | Monthly | Assumptions closed |
| 3 | Business model | CEO | `000` §3, decision log | Quarterly | Contribution/order |
| 4 | Product & category | Merchandising | Category plan: 60 Express SKUs + long-tail Marketplace, price bands, bundle map, tier rules | Monthly | AOV, attach rate, Express share |
| 5 | Seller ecosystem | Seller success | KYC checklist, onboarding kit, scorecard | Weekly | 3P share of GMV |
| 6 | Customer experience | Support | WhatsApp playbook, SLA board, refund SOP | Daily | NPS, refund days |
| 7 | Technology | Tech lead | `001`, gate roadmap, incident log | Sprint (2wk) | Uptime, order error rate |
| 8 | Payments & procurement | Finance | PSP agreement, settlement ledger, reconciliation, **supplier terms register** `[A2]` | Daily | Cash cycle, prepaid % |
| 9 | Logistics | Ops | Route sheet, reason codes, cost/drop model | Daily | 1st-attempt %, cost/drop |
| 10 | Financial model | Finance | `model/afrikart-unit-economics.xlsx` | Monthly | Contribution/route |
| 11 | Legal & compliance | CEO + counsel | Compliance calendar, contract register | Quarterly | Zero lapses |
| 12 | Marketing | Growth | Payday calendar, channel P&L, content library | Weekly | CAC, repeat 30d |
| 13 | People | CEO | Org plan, role scorecards, 1:1s | Monthly | Regretted attrition |
| 14 | Automation (AI is a tool, not a pillar) `[A12]` | Tech lead | Automation backlog, ordered by hours saved | Monthly | Manual touches/order |
| 15 | Expansion | CEO | City playbook (written at Q3, used at Q4) | Quarterly | Gate evidence |

### 5.1 The eight standard operating procedures that must exist by day 90

Written down, one page each, with the trigger and the escalation path. Not for bureaucracy — because
these are the eight things that will happen while the founder is asleep:

1. **Failed delivery.** Reason code → customer message → reschedule or refund → route re-plan.
2. **Cash reconciliation.** Rider float → count → deposit within 24h → variance investigation.
3. **Damaged or wrong item.** Photo evidence → replace or refund within 48h → seller chargeback.
4. **Seller stockout after order.** Substitute (with consent) or refund → seller scorecard hit.
5. **Out-of-stock on a top-20 SKU.** Reorder trigger, supplier contact, customer communication.
6. **Payment not received but order placed.** Hold, verify, release — never ship on a promise.
7. **Fraud suspicion on COD.** Velocity rule, first-order cap, blacklist process.
8. **Data incident.** Contain, assess, notify under the Data Protection Act, record.

---

## 6. Cadence & governance (layer 4) — how we steer

Rhythm beats intensity. Five rituals, none longer than they need to be.

| Ritual | When | Length | Attendees | Input | Output |
|---|---|---|---|---|---|
| **Ops standup** | Daily 07:30 | 15 min | Ops, support, rider lead | Yesterday's drops, failures, stockouts | Today's plan + escalations |
| **Trading review** | Monday 09:00 | 45 min | Founders + all leads | Metric tree | Three actions, one owner each |
| **Monthly business review** | First Tuesday | 90 min | Founders + leads + advisor | Full P&L, route P&Ls, gate progress | Gate decision or course correction |
| **Quarterly strategy review** | Quarter end | Half day | Founders + advisor | Framework, registers, market | Next quarter's one fight |
| **Customer call** | Every Friday | 20 min | CEO + any customer | — | One insight into the assumption register |

Templates: `templates/weekly-trading-review.md`, `templates/monthly-business-review.md`.

**Rules of the room.**
1. Numbers before opinions. The metric tree is filled in before the meeting starts or the meeting does not happen.
2. Every action has one named owner and a date. Two owners means no owner.
3. Bad news first, and it is never punished. Concealed bad news is the only fireable offence.
4. A decision that is not written in `registers/decisions.md` did not happen.

### 6.1 Decision rights

For a team of three to nine, clarity beats process.

| Decision | Decides | Consults | Must inform |
|---|---|---|---|
| Category, pricing bands, assortment | CEO | Merchandising | Finance |
| Any purchase commitment > P50,000 | CEO | Finance | — |
| Seller approval / rejection | Seller success | CEO | — |
| New city or new country | CEO + advisor | All leads | — |
| Route design, delivery windows | Ops | Growth | CEO |
| Marketing spend within monthly budget | Growth | CEO | Finance |
| Marketing spend above budget | CEO | Finance | — |
| Hiring | CEO | Function lead | Finance |
| Technology architecture | Tech lead | CEO | Ops |
| Refund above P2,000 | Support | Finance | CEO |
| Changing a gate metric | CEO + lead | Advisor | — |

### 6.2 The four registers (the living truth)

| Register | Contains | Owner | Reviewed |
|---|---|---|---|
| `registers/decisions.md` | Every decision above P10,000, with the alternatives considered | CEO | Weekly |
| `registers/assumptions.md` | Every belief, with the test that resolves it and the date | CEO | Weekly |
| `registers/risks.md` | Top risks, triggers, mitigations, owner | Ops | Monthly |
| `registers/compliance.md` *(to create at G1)* | Every licence, filing, renewal date | Finance | Monthly |

### 6.3 Advisory

From month one — not because we need permission, but because a founder with no external check
optimises for the story rather than the number. Three people, meeting quarterly, paid in a small
retainer or advisory equity:

1. **A retail operator** who has run FMCG distribution in Botswana — for supplier terms and pricing.
2. **An accountant with BURS experience** — for VAT, import duty and the compliance calendar.
3. **A logistics operator** — for route economics and labour.

---

## 7. Capital & finance (layer 7) — the cheapest money first

The order matters more than the amount. Each rung is only climbed when the one below is exhausted.

| Rung | Source | Amount | When | Cost |
|---|---|---|---|---|
| 1 | Founder capital | P250k | Now | 100% ownership |
| 2 | Customer cash (COD + prepaid) | working capital | Day 1 | Free — but watch the float |
| 3 | Supplier terms (30–60 days) | P100–400k of float | At 10+ SKUs with real velocity | Free — negotiate hard |
| 4 | CEDA / BDC / Youth Development Fund | P500k–2m | After 3 months of clean accounts | Cheap debt, citizen-owned advantage |
| 5 | Bank SME facility (invoice/stock) | P500k–1.5m | After 12 months of accounts | Moderate, secured |
| 6 | Strategic partner (distributor, retailer) | P2–5m | When the model is proven in 2 cities | Equity or margin share |
| 7 | Institutional equity | P10m+ | Only to replicate, never to discover | Most expensive capital |

**The cash we absorb before we generate any** `[A1]`

Rung 2 is written as a source of capital. At pilot volumes it is the opposite: cash-upfront supplier
payment, post-delivery seller payout and a COD-heavy order book mean **we fund the business from our own
pocket through the whole ramp.** The model quantifies it — `Ramp` sheet, peak-to-trough:

| | |
|---|---|
| Operating cash trough | **P114,000, reached in month 5** |
| Month operating break-even | Month 6 (22 orders/day, contribution +P4.05/order) |
| Cumulative cash positive | Month 11 |
| Cash in riders' hands at month-12 volumes | ~P28,000 at 60% COD |

That P114,000 is *on top of* the P390k build-and-launch plan, and it is not optional — it is the
distance between "the model works" and "we ran out in the good month". Any capital plan that does not
carry it is wrong.

**Treasury policy (non-negotiable, from day one):**
- Rider cash float capped per rider per day; deposit within 24 hours of route close.
- Two signatories on any payment above P25,000.
- 8 weeks of fixed costs held in cash at all times. Below that, growth spending stops immediately.
- No inventory purchase without a written sell-through expectation.
- **Supplier terms are a target with a number and a date** `[A2]`: 0 days today → 14 days by G2 → 30
  days by G3. Thirty days of terms moves the cash cycle from +22 to −8 days and frees roughly P300,000
  of working capital at month-12 volumes. The `supplier_payables` and `cash_cycle` views in
  `db/schema.sql` report it monthly.
- **Prepaid share is a weekly number, not a preference** `[A3]`: ≥40% / ≥55% / ≥70% at M3 / M6 / M12.
  Prepaid is what halves the physical cash in riders' hands, and that cash is the only money in the
  company that can simply disappear.
- Every month closes with a reconciled P&L by day 5.

**Financial artifacts:** the unit-economics model (monthly rebuild with actuals), a 13-week cash flow,
route P&Ls, and a one-page monthly board pack.

---

## 8. People (layer 7) — the first nine

Hire for the constraint, not for the org chart. Each role is added when a metric is failing.

| When | Role | Why it exists | Unlocks |
|---|---|---|---|
| M0 | Founder / CEO | Capital, buying, sellers, strategy | — |
| M0 | Ops lead | Warehouse, routes, riders, cash | First-attempt % |
| M0 | Growth lead | Content, WhatsApp, ads, photography | Orders/day |
| M0 | Rider (contract) | Delivery | Route density |
| M1 | Picker/packer | Accuracy, speed, damage rate | Orders/day capacity |
| M2 | Customer support | WhatsApp SLA, refunds | NPS, refund days |
| M4 | Merchandiser/photographer | Catalogue quality, bundles | AOV, attach rate |
| **M4** | **Software engineer (payroll, ~P35–55k/month)** `[A5]` | The platform is a business asset, not a delivered project. Without an owner it decays from the day the contractor invoices. | Speed of every later gate; the ability to call ourselves a technology company |
| M6 | Finance (part-time → full) | Reconciliation, VAT, payouts | Cash cycle |
| M9 | Seller success | Onboarding, scorecards | 3P share of GMV |

**On the engineer specifically.** This is the single most-skipped line in every lean plan, and skipping
it has a price: every change becomes a project, every bug a negotiation, every gate waits for a
quote. The alternatives are honest but narrower — (a) hire at M4 as above; (b) contract a retainer of
≥40 hours/month from the build partner and call it what it is; (c) do neither and **strike "technology
company" from all external material**, including the pitch. What is not available is (d) claim the
thesis and fund none of it. The choice is recorded in `registers/decisions.md` (D-008).

**Comp philosophy.**
- Cash slightly below market, with a documented band per role and a clear path to market rate at a gate.
- **Variable pay is tied to contribution margin, never to GMV.** Paying on revenue buys unprofitable growth — this is the single most common way marketplaces destroy themselves.
- Rider pay: base + per-successful-drop, with a quality adjustment for first-attempt success. Never per-attempt.
- Everyone has a one-page scorecard with three numbers. Reviewed monthly in 30 minutes.

---

## 9. Technology (layer 6) — gated, not aspirational

Detail in `001-platform-architecture.md` §5. The sequencing rule:

> Build the thing that blocks revenue, in the order it blocks revenue.

| Gate | Build | Blocks | Effort |
|---|---|---|---|
| G1 | Live PSP (card + Orange Money + MyZaka), settlement ledger, idempotency | Taking money | 2–3 wk |
| G2 | Rider PWA: route list, reason codes, proof of delivery | Delivery quality | 3 wk |
| G3 | Notifications (WhatsApp/SMS), photo upload + CDN, seller KYC workflow | Trust, catalogue scale | 2–3 wk |
| G4 | Postgres migration, real search index, payout runs, VAT report | Operational scale | 4–6 wk |
| G5 | Event bus, forecasting, route optimisation, B2B accounts | Multi-city | 8+ wk |

**Automation, in order of hours saved per Pula spent:**
1. Order → seller → rider routing (rules, not AI)
2. Customer notifications at four moments
3. Cash reconciliation sheet
4. Refund workflow
5. Stock reorder triggers
6. *then* demand forecasting per SKU per route
7. *then* delivery exception triage
8. *last* anything customer-facing and generative

Reason for that order: you cannot forecast without 90 days of clean order data, and you cannot have
clean data if a human is still re-keying orders. **Automation buys the data that makes AI possible.**

**Why AI is not a pillar** `[A12]`. At 16,000 orders a year, the entire addressable value of a
recommendation engine, a demand model and a support bot is a few thousand Pula a year — less than the
electricity to run them. Amazon's AI pays because it sits on 300 million SKUs and a million sellers.
Ours would sit on 60 SKUs and a WhatsApp queue. The honest position: **we are a retail and logistics
operator that uses software well.** That is a fine thing to be. It is the thing that survives here —
Artify had a platform and no delivery, and it closed. We will revisit AI at 5,000 monthly orders, and
not before, because below that it is a costume.

---

## 10. Risk (layer 5) — the pre-mortem

It is 18 months from now and Afrikart has failed. The five most likely causes, in order:

1. **Delivery never got cheap enough.** We grew orders without growing density, cost per drop stayed
   above P35, and every order lost money. *Mitigation: cost per drop is a gate metric, reviewed weekly,
   with a hard stop if it does not fall by month 4.*
2. **The incumbent used our own trick better than we did.** Choppies has 100+ stores, Shoprite and
   Pick n Pay have national footprints, and *a store is a forward warehouse with free rent already
   paid.* One of them switches on store-pickup-within-2-hours in Gaborone and our entire "next day"
   promise becomes the second-best option in the customer's mind. Disintermediation by a seller is the
   small version of this risk; this is the large one. *Mitigation: (a) sellers never get customer
   contact details and we hold payment; (b) the incumbent question is a standing monthly review item
   (§10.1); (c) our defensible ground is the long tail and the delivery-to-the-door of things a
   supermarket does not stock — not price, not speed, not breadth.*
3. **The basket never grew.** Cheap single items, one delivery each. *Mitigation: AOV is a gate metric
   with bundling as a standing workstream, not a campaign.*
4. **Cash ran out while profitable on paper.** Receivables from sellers, COD float, inventory.
   *Mitigation: 13-week cash forecast, 8-week buffer, weekly cash review.*
5. **The founder did everything and nothing was written down.** *Mitigation: SOPs by day 90, ops
   manual by month 10, one unsupervised route by month 11.*

### 10.1 The standing incumbent question `[A11]`

First item in every monthly business review, answered in writing before the P&L is discussed:

> *What did Choppies, Shoprite, Pick n Pay and Sefalana do about online ordering or delivery this month?*

The answer is usually "nothing", and writing "nothing" twelve times a year takes ten minutes. The year
it is not "nothing", the strategy changes that week — not at the next gate, not after the next fundraise.
Recorded in `registers/risks.md` as R-08 with an escalated trigger: an incumbent launching same-day
store fulfilment in Gaborone is a **board-level event**, not a competitive note.

Full register with triggers and owners: `registers/risks.md`.

---

## 11. The Botswana trading calendar

Retail demand here is not evenly distributed, and the marketing calendar must be built around it or
we will spend money in dead weeks.

| Period | What happens | What we do |
|---|---|---|
| **Last week of month → first week of next** | Salaries land; the largest spending pulse of the month | Push bundles, subscriptions, restock reminders — **but acquire before payday and deliver after it** `[A6]` |
| **January** | School uniforms, household resets, new-year budgets | Uniform and household-bundle campaigns; hold uniform pricing |
| **March / April** | Post-salary squeeze before the next pulse | Retention only — protect the base, cut acquisition spend |
| **June / July** | Highveld winter: blankets, heaters, electric blankets, solar for outages | Winter assortment campaign, the year's highest-margin window |
| **August** | Mid-year, quieter | Seller recruitment push (a slow season is a good time to onboard) |
| **November / December** | Festive; disposable spend peaks, but many customers travel to villages | Extend delivery to village pickup points; hamper bundles; cut-off dates published early |

Two rules: **never discount below contribution to chase a calendar moment**, and **publish cut-off
dates for December delivery in November** — the fastest way to lose a customer is a gift that arrives
on the 27th.

**The capacity rule that constrains the calendar** `[A6]`. A route carries 22 drops, and no marketing
plan can talk it into 30. So the payday pulse is not a demand problem, it is a *scheduling* problem:

- **Acquire in the 5 days before payday** (when attention is high and cash is not yet available), and
  let the basket land in the 3 days after. Spend aimed at the 48 hours *after* salaries land buys
  orders we cannot deliver on the day the customer wants them.
- **Every route has a published next-available date.** When today is full, checkout offers tomorrow —
  it never silently accepts an order it cannot keep. `route_capacity_remaining()` in `db/schema.sql`
  is the guard, and the delivery promise is generated from it.
- **Pickup points are the overflow valve, not a downgrade.** Free, faster, and the only way to serve
  a suburb a route cannot reach this week.
- **Subscriptions are the anti-pulse.** They move volume into the quiet weeks, which is exactly where
  spare route capacity sits. A subscription is worth more to the route than a bigger basket.

---

## 12. The first 100 days, in order

Weeks, not months, because the first 100 days set the operating habits for years.

| Week | Focus | Exit condition |
|---|---|---|
| 1 | Register entity, open bank account, appoint accountant, draft constitution & commitments | Entity exists, signatories set |
| 2 | Ground truth: 20 customer interviews, 15 supplier meetings, mystery-shop 5 competitors | Assumption register has 10+ entries with tests |
| 3 | Secure the storage unit, hire rider and picker, buy packaging | Unit keys in hand |
| 4 | PSP application, delivery reason-code sheet, cash policy signed | PSP in review, policy written |
| 5 | 40 SKUs photographed, priced, loaded | Catalogue live with real photos |
| 6 | Soft launch to 50 hand-recruited customers | First 50 orders delivered |
| 7 | First failed-drop review; fix the top reason | Reason codes logged at 100% |
| 8 | Bundles launched; free-delivery threshold tested | AOV measured, not guessed |
| 9 | WhatsApp broadcast + local Facebook/Instagram + rider branding | CAC benchmarked per channel |
| 10 | First weekly trading review with the real metric tree | Three actions with owners |
| 11 | First seller onboarded through the full KYC flow | Seller live, verified |
| 12 | First monthly business review; gate G1 evidence pack assembled | G1 decision drafted |
| 13 | First published delivery scorecard | Public post shipped |
| 14 | First sop review: which of the eight SOPs was missing this fortnight? | SOPs updated |

---

## 13. What "excellence" means here

Not polish. Not deck quality. Five things, in order:

1. **We close the loop.** Every failure has a reason code, an owner, and a fix that ships.
2. **We measure the truth, including the parts that hurt** — and we publish some of it.
3. **We write it down** so the second person can do it without the first.
4. **We decide fast and record why** — with the alternative we rejected and the date we would reverse.
5. **We stop when the evidence says stop**, and we say so out loud.

**One policy that keeps rule 2 survivable: the published scorecard is not a debating society.** We
publish first-attempt success and failed-drop reasons monthly because the number only means something if
customers can see it. The corollary is a threshold: a customer who raises a delivery problem gets a
resolution worth up to P300 in goodwill **without argument, without escalation, and without a manager**.
No complaint is ever allowed to cost more in staff time than the thing it is complaining about. The
scorecard exists to make us better, not to make us defensive.

A company that does those five things in a 2.4-million-person market will beat a better-funded company
that does none of them. That is the whole strategy.

---

## Revision log

| Version | Change | Why |
|---|---|---|
| 1.0 | Created as the operating framework for the first 12 months | — |
| 1.1 | Gate dates shifted (G1 month 3 → month 5); linked to `005-build-phases.md`; capital at G1 restated to P370k | A contracted professional build takes 13 weeks. The framework and the build plan must not contradict each other. |
| 1.2 | Density curve replaces the P18 constant (§3.1); cash cycle joins the G1 pack and the metric tree (§3.2, §7, Q1); prepaid ≥70% by G3; supplier terms become a dated objective; third-party fulfilment Q4 → Q3 (P12 → P10); engineer on payroll from M4 (§8); route capacity cap + next-available date + pickup overflow + pre-payday acquisition (§11); second north star with activation trigger (§3.2); Express/Marketplace tiers (§2.1); escape category named (§2.1); G1 outcomes renamed continue/re-scope/stop with re-scope default (Q1); incumbent question made a standing monthly item (§10.1, R-08); AI demoted from pillar to tool (§4.1, §5, §9). Model rebuilt as v2 (`Density`, `Ramp`, `Cash cycle` sheets). | `006-amazon-gap-analysis.md`. v1.1 was strong on survival and silent on growth; the twelve amendments in `006` §5 are the difference between a disciplined operator that stays small and one that compounds. |

*Next scheduled revision: gate G1, with the assumption register and the first 45 days of real data in
hand. v1.3 will be a data revision, not a structural one: the structure now says explicitly what it is
betting on and what would make it wrong.*
