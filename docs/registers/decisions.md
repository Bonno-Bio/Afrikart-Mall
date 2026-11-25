# Decision Register

**Rule:** a decision that is not written here did not happen.
**Threshold:** every decision above P10,000, every irreversible decision, and every decision that
changes a gate metric.
**Owner:** CEO · **Reviewed:** weekly, Monday, before the trading review.

A good record has four parts: what we decided, what we rejected, why, and **the date we would reverse
it**. The last one is what separates a decision from a preference.

---

## D-001 · Business model: the Owned Marketplace (C′)

| | |
|---|---|
| **Status** | Proposed — awaiting sign-off |
| **Date** | 2025-11 |
| **Decided by** | Founders |
| **Reversal date** | Gate G2 (month 6) |

**Decision.** Launch as a curated managed marketplace: 5–8 verified suppliers, but Afrikart holds the
payment, the delivery, the returns promise and the customer relationship. Consignment and selected
owned stock. Open to self-service third-party sellers only after delivery works reliably.

**Rejected.**
- *Pure marketplace (A):* hands the transaction to the seller. Artify Botswana closed in 2024 for
  exactly this reason — buyers browsed online and completed the sale offline, so the commission never
  materialised.
- *Traditional retailer (B):* caps the company as a small retailer with all the inventory risk and
  none of the network effects.
- *Hybrid as originally framed (C):* correct in shape but silent on who holds the transaction, which
  is the only part that decides whether the model survives.

**Why.** A 5–8% commission cannot fund a last mile that costs 15–20% of the basket. The take rate has
to go up because we do more work, or the arithmetic never closes.

**What would reverse it.** If third-party sellers routinely deliver better than we do at lower cost
(measured: their first-attempt success vs ours), move to a lighter model and monetise fulfilment only.

---

## D-002 · Commission and fulfilment fee structure

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2025-11 |
| **Reversal date** | Gate G3 (month 9) |

**Decision.** 12% commission on item value. Plus 6% fulfilment fee where Afrikart stores, packs and
delivers. Zero listing fee, zero monthly subscription for the first 12 months.

**Rejected.** 15% flat (too high to recruit the first 10 sellers), 8% + delivery charged at cost to the
seller (makes sellers responsible for a cost they cannot control, and they will route around us).

**Why.** The fulfilment fee is the seed of the actual moat. It teaches sellers to hand us their
inventory, which is what makes the network worth renting to third parties later.

**What would reverse it.** Seller acquisition stalling below 3 per month for two months.

---

## D-003 · Cash on delivery is geo-fenced, and carries a fee

| | |
|---|---|
| **Status** | Decided |
| **Date** | 2025-11 |
| **Reversal date** | When COD share falls below 30% |

**Decision.** COD available in Gaborone, Tlokweng and Mogoditshane only, with a P15 handling fee.
Enforced server-side, not in the interface.

**Rejected.** Nationwide COD (a failed cash drop costs the trip twice and we cannot recover it);
no COD at all (removes the only payment option many first-time buyers trust).

**Why.** COD is a trust feature, not a payment feature. Confining it to the one area we can control
keeps the failure rate measurable while still converting first-time buyers.

---

## D-004 · Platform stack: React + Vite SPA, Express API, JSON store

| | |
|---|---|
| **Status** | Decided (supersede at Gate G4) |
| **Date** | 2025-11 |
| **Reversal date** | Postgres migration at Gate G4 |

**Decision.** Single Node process serving a built SPA and a JSON API. No database, no external
services, one command to run.

**Rejected.** Shopify/WooCommerce (cannot model route-level P&L or seller settlement); a microservice
split (operationally indefensible at 25 orders/day); a native app (a PWA is enough below 5,000 monthly
orders).

**Why.** The domain model is the deliverable at this stage, and a boring stack keeps the founders on
the business, not on infrastructure.

**What would reverse it.** Any of: more than one server process, the first payout run, or the first
reconciliation query.

---

## D-005 · Production stack: Next.js + Postgres (Supabase) + licensed PSP

| | |
|---|---|
| **Status** | Recommended — awaiting sign-off |
| **Date** | 2025-11 |
| **Decided by** | Founders |
| **Reversal date** | If no competent builder is contracted within 30 days |

**Decision.** Build production on server-rendered React (Next.js) against PostgreSQL on Supabase,
with payments through a Bank of Botswana licensed provider using hosted fields. Own the ledger,
inventory and delivery routing; buy payments, auth, hosting, email and search. Full reasoning,
comparison and migration plan in `docs/003-production-stack.md`; the data model is committed as
`db/schema.sql`.

**Rejected.**
- *WordPress + WooCommerce + Dokan:* cheapest and fastest, but the two things that make this business
  worth anything — seller settlement accounting and route-level delivery — are exactly what it cannot
  do well. We would write custom PHP for our moat, on the most attacked CMS in the internet, with a
  plugin stack that breaks on update.
- *Shopify + multivendor app:* excellent single-seller store, poor marketplace. No Shopify Payments in
  Botswana means every transaction carries an extra gateway fee on an already thin margin.
- *Medusa / Saleor:* good foundations, second choice. An opinionated model we would fight on
  settlements, plus a learning curve we cannot afford in a four-week migration.
- *Client-rendered SPA (the prototype's runtime):* serves an empty div to a crawler and no preview at
  all to WhatsApp. In a market where the product link is shared in a WhatsApp group before it is
  googled, that is a distribution failure.

**Why.** Money needs transactions and constraints; a marketplace needs SEO and link previews; and the
moat must be ours. See `003` §3 for the scoring.

**What would reverse it.** If no senior full-stack engineer can be contracted in 30 days, open a
single-vendor Shopify store with 20 SKUs to buy demand evidence cheaply — and still do not put seller
settlements on plugins.

---

## D-006 · Position: we are company A, and we say so

| | |
|---|---|
| **Status** | Decided |
| **Date** | 2026-11 |
| **Decided by** | Founders |
| **Reversal date** | 5,000 orders/month, or a raise above P5m |

**Decision.** Afrikart is a **disciplined retail and logistics operator** (company A): ~P390–500k of
capital, contribution per route as the north star, hard stops at every gate, one city, cash-positive
before city two. Amazon is not one business, it is three — retail at 2–4% margin, logistics at 20–30%,
and cloud/ads at 30–70%. We are building the first one, and the honest name for it is a very good shop
with its own delivery.

**Rejected.**
- *Company B, the infrastructure play:* raise P5–15m, build the platform and the network first, chase
  third-party volume before own-brand demand. It is a real strategy — it is just a **different company**,
  and it needs a different founder profile, a different raise and a different risk appetite.
- *A as a phase of B:* the most dangerous option on the table. Company A does not become company B by
  doing well; it becomes B by deciding to, raising, and re-hiring. Assuming the transition is free is how
  a P390k business ends up with a P3m cost base and no raise.

**Why.** Copia raised ~$123m serving these same customers and was liquidated with $20,300 against $45.5m
of liabilities. Jumia left three markets. Artify Botswana closed because it had a platform and no
delivery. In this market the scarce resource is not software, it is density and cash.

**What would reverse it.** Sustained contribution-positive trading in two cities **and** third-party
parcels above 25% of route volume — that is a network, not a shop, and it would justify the
infrastructure raise. See `006` §4.

---

## D-007 · North star: contribution per route, with a dormant second star

| | |
|---|---|
| **Status** | Decided |
| **Date** | 2026-11 |
| **Decided by** | Founders |
| **Reversal date** | Reviewed at every monthly business review |

**Decision.** The north star is **contribution per route per week**. A second star — **orders per day in
the defended suburbs** — exists but is dormant. It activates only on a written trigger: a competitor with
more than P5m of funding offers a delivery promise we cannot match, or takes more than 15% of our repeat
customers in a quarter. When it activates, we carry a **P150,000 contribution loss budget over 90 days**,
after which there is a written review.

**Rejected.** *Single north star forever:* optimises for margin in a land war and loses the market while
looking efficient. *Two north stars at once:* no organisation can optimise for both, and the ambiguity
is always resolved in favour of whichever number is currently worse.

**Why.** A north star is a promise about what we will sacrifice. Contribution per route sacrifices growth
for durability — correct for us, wrong in a price war, and we should not have to invent a new strategy
at 3am on the day a competitor launches.

**What would reverse it.** Activation never firing across 18 months would suggest the competitor threat
was overstated; activation firing twice would suggest we are in company B's market and should revisit D-006.

---

## D-008 · The technology pillar is either funded or withdrawn

| | |
|---|---|
| **Status** | **Proposed — founders must choose before P9** |
| **Date** | 2026-11 |
| **Decided by** | Founders |
| **Reversal date** | G1, with the first 45 days of trading data |

**Decision.** Three funded options, one of which must be picked and written here before the pilot ends:

| Option | Cost | Peak cash need | Break-even | Honest label |
|---|---|---|---|---|
| No engineer | P0 | P114,000 | M6 | "A retailer with a good website" |
| Retainer, 40h/month | ~P20,000/mo from M4 | P180,000 | M8 | "A retailer that owns its tools" |
| Engineer on payroll | P35–55k/mo from M4 | P267,000–423,000 | M11–beyond | "A technology company" |

**Rejected.** *Hire and hope:* hiring at M4 without the extra P150–310k is a plan to run out of money in
month 8 instead of month 12. *Never hire:* leaves every future change as a quoted project and quietly
falsifies the pitch.

**Why.** The five-pillar thesis includes "Tech & AI". At 16,000 orders a year that pillar produces
almost no revenue and costs a third of the annual burn. Numbers from the `Ramp` sheet, `005` §5.

**What would reverse it.** G1 showing contribution above P10/order at 20+ drops/day, which would let
trading fund the hire without extra capital.

---

## D-009 · Two catalogue tiers, and third-party fulfilment at P10

| | |
|---|---|
| **Status** | Decided |
| **Date** | 2026-11 |
| **Decided by** | Founders |
| **Reversal date** | G3 |

**Decision.** Two tiers from launch: **Express** (curated, badged, next-day, our stock or a seller's
verified stock) and **Marketplace** (long-tail, unbadged, honest 3–5 day estimate). Separately,
third-party fulfilment for 3 non-competing retailers starts at **P10 (month 5–7)**, not P12.

**Rejected.** *One tier:* forces a choice between a promise we cannot keep on long-tail goods and a
catalogue too thin to be worth visiting. Shipping Express on 3,000 SKUs would make the badge meaningless
within a month. *Fulfilment at P12:* waits until month 10 to sell capacity we are already paying for.

**Why.** Density is the whole economics: three extra retailers at 5–15 parcels a day takes a route from
20 to 28 drops and cost per drop from P15 to P12, on a route that is otherwise half empty. It is our FBA
and our only realistic high-margin line.

**What would reverse it.** Express first-attempt success dropping below 90% because tier discipline
slipped; or third-party parcels falling below 5% of volume by M9, which would mean the route is too full
to sell — a good problem, priced differently.

---

## D-010 · Route One: the launch scope is a shop with a route

| | |
|---|---|
| **Status** | Decided |
| **Date** | 2026-11 |
| **Decided by** | Founders |
| **Reversal date** | G1 (≈ month 4) |

**Decision.** The first build takes **eight weeks and ≈P270,000**, and delivers exactly five things:
a till that works (card + two mobile money, atomic order, double-entry ledger, VAT invoice, refunds), a
shelf of 40 SKUs with photographs and bin locations, a route with offline rider tooling and three-way
capacity, a tracking page and a published scorecard, and the legal furniture around them. **Seller
Central, payouts, search, reviews, subscriptions, pickup points and B2B are built after G1**, funded by
trading.

**Rejected.**
- *The 13-week full build at P325,000 (v1.0):* it built seller tooling before sellers, search before a
  catalogue, and a reviews system before a customer. It also put G1 at month 5 with P390,000 spent and
  no revenue.
- *Build in the same order but faster:* the order was the problem, not the duration.

**Why.** `007` found that the binding constraints are operational — addresses, vehicle capacity, supply
lead time, licensed categories — not platform features. Every week spent on Seller Central is a week not
spent learning whether anyone will pay P380 for a basket delivered tomorrow. The till is also the
highest-risk code we will write and the PSP underwriting is the only true critical path; starting there
means the risk surfaces in week 2 instead of week 9.

**What would reverse it.** A seller signing a consignment agreement large enough to fund the marketplace
build before G1 — in which case Seller Central jumps the queue, because it would then be revenue, not
speculation.

---

## Template for the next entry

```
## D-0NN · Title

| | |
|---|---|
| Status | Proposed / Decided / Superseded by D-0NN |
| Date | YYYY-MM |
| Decided by | who actually decided |
| Reversal date | when we would revisit |

Decision. What we are doing, in one paragraph a newcomer could act on.

Rejected. Each alternative, and the specific reason it lost.

Why. The reasoning, including the number or fact that settled it.

What would reverse it. The observable evidence that would make us change our mind.
```
