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
