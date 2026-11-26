# Afrikart platform — B2, The Till and The Shelf

The production application. Not the prototype (`product/`), not a demo: this is the code that
takes a payment, writes an order that cannot half-exist, and keeps books that balance by
constraint.

**Scope of B1** (`docs/005-build-phases.md` §1): money in, money recognised, money out. Eight
weeks ends with a customer paying, a rider delivering, the ledger balancing, and a refund that
does not need a meeting.

```
npm install
npm run migrate          # db/schema.sql → the database
npm run seed:demo        # one seller, three SKUs, one route, three addresses
npm start                # API on 0.0.0.0:4000
npm test                 # 130 tests against real PostgreSQL 16
```

## What it runs on

| Concern | Choice | Why |
|---|---|---|
| Engine | **PostgreSQL 16** — a real server in production, the same engine compiled to WebAssembly (PGlite) locally and in tests | Tests run against the actual schema: real constraints, real triggers, real deferred ledger checks. There is no second, "test" data model. |
| Money | integers in thebe | `P19.99` is `1999`. No floats anywhere, ever. |
| Ledger | double-entry, append-only, balances enforced by a deferred constraint trigger | `db/schema.sql` `assert_ledger_balances` |
| Auth | `x-user-id` header in development | **Stand-in.** M0-03 (phone OTP) replaces it. Fenced in `src/server.js` and named here so it does not survive quietly. |

## The six things B1 guarantees

1. **An order is atomic.** Stock, order, lines, delivery, payment intent, event and idempotent
   response land in one transaction or not at all.
2. **A duplicate request cannot double-charge or double-sell.** `Idempotency-Key` is claimed
   with `insert … on conflict do nothing`, so a concurrent replay blocks on the key rather than
   creating a second order.
3. **Revenue is recognised on delivery, not on payment.** Cash collected is a liability
   (`2000 Customer prepayments`) until the parcel arrives. That is also when the seller earns
   the money — integration #6 in `docs/spec/delivery.md`, and the rule that makes returns
   affordable.
4. **The books balance.** Every posting debits and credits the same total; unbalanced postings
   are refused in the application *and* by the database. `GET /api/ops/ledger` returns the
   trial balance with the invariant checked.
5. **The promise is honest.** Express is withheld from addresses we cannot route and from routes
   that are full — three capacity dimensions (drops, grams, millilitres), not one. See
   `src/orders.js` `routeFor` / `fits`.
6. **Refunds reverse exactly what the line created** — seller payable, commission, fulfilment,
   VAT — and the ledger refuses the refund if it does not sum to the line total.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | reports the engine it is actually on |
| POST | `/api/auth/otp` | phone OTP request; dev code only when `ALLOW_DEV_AUTH=1` |
| POST | `/api/auth/verify` | six digits in, 30-day bearer token out |
| GET | `/api/auth/me` | who am I, and where am I signed in |
| POST | `/api/auth/logout` | revokes the session immediately |
| POST | `/api/checkout/quote` | server-side pricing; `deliveryOptions`, `warnings`, `capacity_limited` |
| POST | `/api/orders` | requires `Idempotency-Key`; `201` even on replay, with `replayed: true` |
| GET | `/api/orders/{number}` | order, lines, event trail |
| GET | `/api/orders/{number}/invoice` | VAT invoice as text |
| POST | `/api/webhooks/psp` | HMAC-SHA256 signature; replay-safe |
| POST | `/api/ops/orders/{number}/deliver` | recognises the sale, issues the invoice |
| POST | `/api/ops/orders/{number}/refund` | line-level, `store_credit` or `original_method` |
| POST | `/api/ops/refunds/{id}/complete` | settles an off-platform reversal |
| GET | `/api/ops/ledger` | trial balance + `balanced: true/false` |
| GET | `/api/catalogue` | the customer shelf: no costs, no stock numbers, no seller contact |
| GET | `/api/ops/shelf` | price, landed cost, seller spread, on hand, `sellersUnderwater` |
| POST | `/api/ops/products/{id}/publish` | refuses an uncosted SKU, a missing photo, an unlicensed category |
| POST | `/api/ops/purchase-orders/{number}/receive` | stock + movements + ledger in one transaction |
| POST | `/api/ops/catalogue/import` | CSV import as drafts; all-or-nothing, line-numbered errors, `dryRun` |
| POST | `/api/ops/stocktake` | counts in, variances recorded, consignment shortfalls raised as incidents |
| GET | `/api/ops/packaging` | per-order packaging cost vs fulfilment fee; names orders where the box costs more |
| GET | `/api/ops/packaging/quote` | what a parcel of a given class costs, from the recipe |
| POST | `/api/ops/packaging/purchase` | buy materials into stock (Dr 1110 / Cr Bank) |
| POST | `/api/ops/orders/:number/pack` | consume packaging for an order, once |
| POST | `/api/ops/stocktake/sessions` | open a count; returns `ST-YYYY-NNNN` |
| GET | `/api/ops/stocktake/sessions/:id` | the count sheet in bin-walk order, with progress |
| POST | `/api/ops/stocktake/sessions/:id/counts` | count lines; call again to resume, repeat a SKU to recount |
| POST | `/api/ops/stocktake/sessions/:id/apply` | applies once: movements, incidents, ledger; then it is a record |
| GET | `/api/ops/stocktake/incidents` | open shortfalls waiting on a decision |
| POST | `/api/ops/stocktake/incidents/decide` | `seller_absorbs` (no posting) or `afrikart_compensates` (Dr 5080 / Cr 2010) |
| GET | `/api/ops/margin` | realised margin per delivered order |
| POST | `/api/ops/payouts/run` | pays sellers what the ledger says we owe, from their order lines |
| GET | `/api/ops/payouts/{id}` | the statement a seller can add up themselves |
| GET | `/api/sellers/{id}/payouts` | payout history |

Errors always use the envelope from `docs/spec/api-contract.md`:
`{ "error": { "code", "message", "field?", "request_id" } }`.

## A full lifecycle, by hand

```bash
C=11111111-1111-4111-8111-111111111111        # customer
A=77777777-7777-4777-8777-777777777771        # verified address
V=99999999-9999-4999-8999-999999999991        # formula, P189.00

curl -s -X POST localhost:4000/api/orders \
  -H 'content-type: application/json' -H "x-user-id: $C" -H 'Idempotency-Key: demo-1' \
  -d "{\"items\":[{\"variantId\":\"$V\",\"quantity\":2}],\"addressId\":\"$A\",
       \"deliveryMethod\":\"express\",\"paymentMethod\":\"card\"}"
```

Send the same request again: same `AK-…` number, same stock, `replayed: true`.

## Authentication

Every route that touches money or stock takes `Authorization: Bearer <token>` from
`POST /api/auth/verify`. `/api/ops/*` additionally requires the `admin` role. The
`x-user-id` header still exists for local development and only when
`ALLOW_DEV_AUTH=1`; it is off by default and refused in production.

**SMS delivery is wired but no vendor is chosen.** `app/src/sms.js` posts to a
configurable HTTP gateway (`SMS_PROVIDER=http`, `SMS_API_URL`, `SMS_API_KEY`,
`SMS_SENDER_ID`) and refuses to claim success when a gateway rejects or cannot be
reached — a failed send destroys the code and returns an error, rather than
leaving a customer waiting by a silent phone. In production the process will not
start at all without a gateway, a PSP webhook secret, and a real `DATABASE_URL`:

```
$ NODE_ENV=production node src/server.js
refusing to start in production:
  - SMS gateway is not configured: phone logins cannot be delivered.
  - PSP_WEBHOOK_SECRET is not set: unsigned payment webhooks would be trusted.
  - DATABASE_URL is not set: the process would run on an in-memory database.
```

## The box was missing from the margin

Account **5030 Packaging** existed from the first chart of accounts and nothing
ever posted to it — so every fulfilment margin was calculated with the box left
out. Packaging is now bought into stock (1110), consumed per parcel
(Dr 5030 / Cr 1110), and recorded against the order. A shortfall is
Cr 2030 Packaging accrual, never negative stock.

The number that matters: a single bulky parcel of nappies earns **P7.54** of
fulfilment fee and costs **P5.95** in carton, filler and a label — P1.59 left
before the rider moves. A cold-chain parcel costs **P24.35** and is underwater on
one unit. `GET /api/ops/packaging` names every order where the fee did not buy the
box rather than averaging it away.

## Counting a shelf takes hours

A stocktake is a **session** (`ST-2026-0001`), not one HTTP payload: opened, counted
line by line, resumed after a break, applied once. The system quantity is frozen
when a line is first counted, so a tin sold mid-count is a sale rather than a
gain; a recount keeps both numbers and applies the second; and reserved units are
checked again at apply, because stock sells while somebody is counting. Applying
twice is a `409` — the session is a record afterwards, not a form.

## Who pays for stock that vanished

A shortfall on consigned stock is recorded as `stocktake_incidents` with the landed
value and a question attached, not an expense. `seller_absorbs` posts nothing —
those goods were never our asset, so booking the loss would put a cost in our P&L
that we never suffered. `afrikart_compensates` posts Dr 5080 Inventory shrinkage /
Cr 2010 Seller payable and is paid in the next payout, once, because the incident
carries the payout that settled it. Charging a seller cash for goods we never
bought is deliberately not offered.

## What B1 does not do

Named, so nobody assumes it exists:

- **No auth.** Phone OTP is M0-03. `x-user-id` is a scaffold.
- **No seller payouts.** Sellers accrue a payable; paying it is post-G1.
- **No COGS posting.** Inventory is counted and moved, but cost of goods is not recognised —
  variants have no cost price yet. This is the first thing to add after the pilot, because
  gross margin is currently asserted rather than derived.
- **No cart persistence, search, reviews, recommendations.** Deliberately post-G1 (`005` §1.2).
- **No PDF invoices.** Text now; the numbers are the part that matters.
- **One worker.** The API is a single process. Concurrency correctness comes from database
  locking, not from the process model.

## Layout

```
db/
  schema.sql        the production schema (shared with docs and the SQL editor)
  migrate.js        apply it to whatever DATABASE_URL points at
  seed.js           the fixture the tests run on
  seed-demo.js      the fixture you curl against
src/
  db.js             one client over PGlite (dev/test) and node-pg (production)
  money.js          thebe arithmetic, VAT extraction
  ledger.js         posting, derived balances, trial balance
  pricing.js        service matrix, COD zone, line-level commission and VAT
  orders.js         quote, capacity, address gate, idempotent placement
  payments.js       capture, and the money path after it
  delivery.js       delivery → revenue, VAT, seller payable, invoice
  refunds.js        two channels, exact reversal, restock rules
  invoice.js        immutable VAT invoice
  server.js         the API
test/               130 tests: money, ledger, orders, payments, refunds, shelf, payouts, auth, sms, import, stocktake, shrinkage, packaging, HTTP
```

## The two bugs this harness found on day one

`schema.sql` had never been executed in file order. Applying it to a real PostgreSQL found two
forward references that would have failed on the first production deploy:

1. `addresses.verified_by` referenced `riders`, which is created 600 lines later.
2. `route_load` and `route_capacity_remaining()` (added in `007` H2) referenced `deliveries`,
   which did not exist yet.

Both are fixed, and `npm run migrate` is now the first thing any change runs. A schema that has
never been loaded is a schema that has never been tested.
