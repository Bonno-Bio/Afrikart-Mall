# B1 — The Till: build report

**Date:** 25 November 2026
**Scope:** the first milestone of Route One (`docs/005`), built as `app/` in this repository
**Status:** built, tested, committed (`428b67f`), database provisioned, board and schedule live

---

## 1. What actually shipped

`app/` is an order-to-cash platform, not a prototype. Six guarantees, each one covered by a test
that fails if the guarantee stops being true:

| # | Guarantee | Where it lives |
|---|---|---|
| 1 | An order is written once, atomically: stock, lines, totals and event trail in one transaction | `src/orders.js` |
| 2 | A replayed request cannot charge or create twice — the idempotency key is held during the attempt | `src/server.js`, `idempotency_keys` |
| 3 | Revenue is recognised **on delivery**, not on payment | `src/delivery.js`, `src/payments.js` |
| 4 | The ledger is double-entry and append-only; a deferred constraint trigger rejects any transaction whose debits and credits differ | `src/ledger.js`, `ledger_must_balance` |
| 5 | The delivery promise is honest: express is refused for a landmark-only address, and capacity is checked on orders, weight *and* volume per route per day | `src/pricing.js`, `src/delivery.js` |
| 6 | A refund reverses exactly seller / commission / fulfilment / VAT, to the thebe | `src/refunds.js` |

## 2. The numbers, as of this commit

- **51 tests pass** (`npm test`): money 6, ledger 6, orders 16, payments 7, refunds 9, HTTP API 7.
- **Schema:** 39 tables + 6 views = 45 relations, 20 ledger accounts, 97 statements.
- **Demo order `AK-26001`:** subtotal P378.00 + delivery P30.00 = **P408.00**, VAT P50.10 inclusive.
- **Trial balance: P821.10 = P821.10.**
- **Invoice:** `INV-00000001`.

One order, in full:

| Line | Pula | Why |
|---|---|---|
| Customer paid | 408.00 | 2 × P189.00 + P30.00 express, VAT inclusive |
| VAT inside it | 50.10 | never revenue |
| Goods ex-VAT | 331.58 | commission is charged on this, not the shelf price |
| Commission to Afrikart (12%) | 39.79 | |
| Fulfilment to Afrikart (6%) | 19.89 | |
| Seller payable | 271.90 | |
| Afrikart revenue | 86.00 | commission + fulfilment + delivery |
| Processing fee (1.25%) | 5.10 | |
| **Afrikart net before COGS and last mile** | **80.90** | if the drop costs more than this, the order lost money |

## 3. What B1 does not do

Stated plainly, because every one of these is a way to lose money or trust if it is assumed:

- **No authentication.** The API trusts the caller — any `customer_id` in the body is believed.
  This is why B6 (soft launch) is gated behind B5 (hardening).
- **No seller payouts.** `seller_payable` is computed and posted; nobody is paid yet.
- **No COGS posting.** Gross margin is currently uncomputable from the books. The trial balance
  carries no inventory and no cost of goods sold.
- **No PDF invoices** — the invoice endpoint returns text, not a document.
- **No search, no reviews, no persisted carts, single process only.**

## 4. Where it now runs

| System | State |
|---|---|
| **Repository** | `arena/b9ad95dd-afrikart-mall`, commit `428b67f` |
| **Production database** | Supabase project `afrikart-mall` (`vjhrpqqzmeunbespucrh`, eu-central-1), schema applied as six migrations |
| **Security posture** | row level security enabled on 39/39 tables; **0** grants to `anon`/`authenticated`; the 6 views are `security_invoker` so they cannot read around RLS |
| **Local development** | embedded PostgreSQL (PGlite) in `.afrikart-db/` |
| **Board** | Linear → *Afrikart Mall — Route One (B1→G1)*, issues AFR-34…AFR-46 |
| **Schedule** | Google Calendar → *Afrikart Route One — B1→G1*, 10 events including the weekly review and G1 |
| **Finance view** | Google Sheets → *Afrikart Mall — B1 live figures & Route One calculators*, 6 tabs |

### The honest limits of the above

1. **The 51 tests run against embedded PostgreSQL, not against Supabase.** This sandbox has no
   network route to Supabase's database from Node, so the Supabase copy was verified by structure:
   identical table / view / sequence / index counts (39 / 6 / 8 / 87), 20 chart-of-accounts rows,
   the one deferrable constraint present, and the ledger guard proved by a live unbalanced insert
   that PostgreSQL rejected with `Unbalanced ledger transaction`. That is strong evidence; it is
   not the same as the suite passing against it. **Run `npm test` with `DATABASE_URL` set from a
   machine that can reach Supabase before trusting it.**
2. **Nothing is deployed.** No public URL exists, so there is no preview link to share. Deploying
   this process as-is to a serverless platform would produce a broken till; it needs a long-lived
   host or a rewrite, and that work is not done.
3. **The database password was set during provisioning.** Rotate it in Supabase → Settings →
   Database before anyone else has access.

## 5. The eight weeks

| Week | Milestone | Gate |
|---|---|---|
| 1 (25 Nov – 1 Dec) | Sprint Zero | PSP applications filed (2), supplier LOIs signed (5), address audit started |
| 2–3 (2 – 15 Dec) | B2 The Shelf | 10 SKUs live with landed cost; stock cannot go negative |
| 4–5 (16 – 29 Dec) | B3 The Route | POD on every drop; rider cash reconciled same day |
| 6 (30 Dec – 5 Jan) | B4 Trust | reviews only on delivered orders; scorecard from the ledger |
| 7 (6 – 12 Jan) | B5 Hardening | auth on every money route; RLS verified; restore tested |
| 8 (13 – 19 Jan) | B6 Soft launch | 20 orders/day for 5 days, zero manual fixes |
| 20 Jan – 6 Mar | B7 Pilot | 45 days; density and cost per drop measured weekly |
| **6 Mar 2027** | **G1** | **go / no-go** on suburb two, rider two, capital |

Two clocks start on day two and cannot be compressed: **PSP underwriting (~6 weeks)** and
**supplier inventory (~4 weeks)**. Every week they are not started is a week added to G1.

## 6. The next five things, in order

1. **Rotate the database password** and run the suite against Supabase from a networked machine.
2. **File the two PSP applications** (AFR-34). Ask each whether they will underwrite a marketplace
   that pays sellers out; that answer decides whether Afrikart holds the money or the PSP does.
3. **Sign five supplier LOIs** (AFR-34) and audit 40 Gaborone addresses (AFR-35) — the buy button's
   honesty depends on the second one.
4. **Post COGS on delivery** (AFR-37): until then every margin in this report is flattering.
5. **Build authentication** (AFR-41) before any stranger is allowed to order.

---

*All figures in this report are reproducible from the repository: `npm test`, `npm run migrate`,
`npm run seed:demo`, then `GET /api/ops/ledger` (which returns the trial balance and `balanced: true`).*
