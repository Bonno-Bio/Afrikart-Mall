# Afrikart Mall — Master Execution Framework v1.1

**Status:** The operating system. Every element here has an owner, an artifact, a cadence and a gate.
**Companions:** `000-founding-decisions.md` (the business case) · `001-platform-architecture.md` (the build) ·
`003-production-stack.md` · `004-build-readiness.md` · **`005-build-phases.md` (the execution spine)** ·
`registers/` (the living truth) · `templates/` (the rituals)

**v1.1 revision:** gate dates moved. A contracted professional build takes 13 weeks, so G1 lands in
**month 5**, not month 3 — see `005-build-phases.md`. The four fights and their evidence are unchanged;
only the calendar is honest now.

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
| COD share of orders | ≤ 60% | ≤ 45% | ≤ 30% | Finance |
| Refund cycle (hours) | 96 | 72 | 48 | Support |
| Stockout on top 100 SKUs | ≤ 10% | ≤ 7% | ≤ 5% | Merchandising |
| Cash conversion cycle | ≤ 25d | ≤ 20d | ≤ 15d | Finance |
| NPS | — | 35 | 45 | Support |

### 3.3 The four numbers that kill us (reviewed every single week)

1. **Contribution per order** — if negative, nothing else matters.
2. **First-attempt success** — a failed drop costs the trip twice and the customer once.
3. **AOV** — the cheapest lever we have and the one we will neglect.
4. **Cash conversion cycle** — profitable companies in this market die of cash, not margin.

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
| Registered entity, tax, PSP, data-protection registration filed | Written confirmation from each counterparty |

**Decision at G1:** continue to Q2, change the category, or stop. Stopping here costs ~P370k. Stopping
at M12 costs ~P2m and a reputation. (`005` §5 reconciles this against the original P250k estimate -
the difference is the contracted build.)

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

### Q4 — "It works somewhere else" (Months 10–13)
**Must-win:** the model is a system, not a founder's habit.

| Deliverables | Gate G4 evidence |
|---|---|
| Ops manual written from real logs, not imagination | A new hire runs a route unsupervised for 2 weeks |
| Second city selected and launched (Palapye or Francistown) | City 2 breaks even on contribution per order by day 90 |
| B2B pilot: 10 spazas/salons on a weekly standing order | B2B basket ≥ P1,800, repeat ≥ 60% |
| Fulfilment service offered to 3 non-competing retailers | Third-party parcels ≥ 5% of route volume |
| 12-month audited P&L, board or advisory review | Signed off |

### 4.1 What we will not do in year one

Stated explicitly, because focus is defined by refusal:

- No mobile app (a PWA is enough until 5,000 monthly orders)
- No fulfilment centre (one storage unit)
- No private label
- No second country
- No advertising product
- No wallet or stored-value account
- No same-day delivery (next-day is the promise; same-day is a promise we cannot keep at this density)
- No AI chatbot (a human on WhatsApp beats a bot in this market for at least a year)
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
| 4 | Product & category | Merchandising | Category plan: 60 SKUs, price bands, bundle map | Monthly | AOV, attach rate |
| 5 | Seller ecosystem | Seller success | KYC checklist, onboarding kit, scorecard | Weekly | 3P share of GMV |
| 6 | Customer experience | Support | WhatsApp playbook, SLA board, refund SOP | Daily | NPS, refund days |
| 7 | Technology | Tech lead | `001`, gate roadmap, incident log | Sprint (2wk) | Uptime, order error rate |
| 8 | Payments | Finance | PSP agreement, settlement ledger, reconciliation | Daily | Cash cycle, COD % |
| 9 | Logistics | Ops | Route sheet, reason codes, cost/drop model | Daily | 1st-attempt %, cost/drop |
| 10 | Financial model | Finance | `model/afrikart-unit-economics.xlsx` | Monthly | Contribution/route |
| 11 | Legal & compliance | CEO + counsel | Compliance calendar, contract register | Quarterly | Zero lapses |
| 12 | Marketing | Growth | Payday calendar, channel P&L, content library | Weekly | CAC, repeat 30d |
| 13 | People | CEO | Org plan, role scorecards, 1:1s | Monthly | Regretted attrition |
| 14 | AI & automation | Tech lead | Automation backlog, ordered by hours saved | Monthly | Manual touches/order |
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

**Treasury policy (non-negotiable, from day one):**
- Rider cash float capped per rider per day; deposit within 24 hours of route close.
- Two signatories on any payment above P25,000.
- 8 weeks of fixed costs held in cash at all times. Below that, growth spending stops immediately.
- No inventory purchase without a written sell-through expectation.
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
| M6 | Finance (part-time → full) | Reconciliation, VAT, payouts | Cash cycle |
| M9 | Seller success | Onboarding, scorecards | 3P share of GMV |

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

---

## 10. Risk (layer 5) — the pre-mortem

It is 18 months from now and Afrikart has failed. The five most likely causes, in order:

1. **Delivery never got cheap enough.** We grew orders without growing density, cost per drop stayed
   above P35, and every order lost money. *Mitigation: cost per drop is a gate metric, reviewed weekly,
   with a hard stop if it does not fall by month 4.*
2. **We were disintermediated.** Customers found sellers through us and bought from them on WhatsApp.
   *Mitigation: we hold payment and delivery; sellers never get customer contact details.*
3. **The basket never grew.** Cheap single items, one delivery each. *Mitigation: AOV is a gate metric
   with bundling as a standing workstream, not a campaign.*
4. **Cash ran out while profitable on paper.** Receivables from sellers, COD float, inventory.
   *Mitigation: 13-week cash forecast, 8-week buffer, weekly cash review.*
5. **The founder did everything and nothing was written down.** *Mitigation: SOPs by day 90, ops
   manual by month 10, one unsupervised route by month 11.*

Full register with triggers and owners: `registers/risks.md`.

---

## 11. The Botswana trading calendar

Retail demand here is not evenly distributed, and the marketing calendar must be built around it or
we will spend money in dead weeks.

| Period | What happens | What we do |
|---|---|---|
| **Last week of month → first week of next** | Salaries land; the largest spending pulse of the month | Push bundles, subscriptions, restock reminders. Front-load ad spend here. |
| **January** | School uniforms, household resets, new-year budgets | Uniform and household-bundle campaigns; hold uniform pricing |
| **March / April** | Post-salary squeeze before the next pulse | Retention only — protect the base, cut acquisition spend |
| **June / July** | Highveld winter: blankets, heaters, electric blankets, solar for outages | Winter assortment campaign, the year's highest-margin window |
| **August** | Mid-year, quieter | Seller recruitment push (a slow season is a good time to onboard) |
| **November / December** | Festive; disposable spend peaks, but many customers travel to villages | Extend delivery to village pickup points; hamper bundles; cut-off dates published early |

Two rules: **never discount below contribution to chase a calendar moment**, and **publish cut-off
dates for December delivery in November** — the fastest way to lose a customer is a gift that arrives
on the 27th.

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

A company that does those five things in a 2.4-million-person market will beat a better-funded company
that does none of them. That is the whole strategy.

---

## Revision log

| Version | Change | Why |
|---|---|---|
| 1.0 | Created as the operating framework for the first 12 months | — |
| 1.1 | Gate dates shifted (G1 month 3 → month 5); linked to `005-build-phases.md`; capital at G1 restated to P370k | A contracted professional build takes 13 weeks. The framework and the build plan must not contradict each other. |

*Next scheduled revision: gate G1, with the assumption register and the first 45 days of real data in
hand.*
