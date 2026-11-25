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
npm test                 # 64 tests against real PostgreSQL 16
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
| GET | `/api/ops/margin` | realised margin per delivered order |

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
test/               64 tests: money, ledger, orders, payments, refunds, shelf, HTTP
```

## The two bugs this harness found on day one

`schema.sql` had never been executed in file order. Applying it to a real PostgreSQL found two
forward references that would have failed on the first production deploy:

1. `addresses.verified_by` referenced `riders`, which is created 600 lines later.
2. `route_load` and `route_capacity_remaining()` (added in `007` H2) referenced `deliveries`,
   which did not exist yet.

Both are fixed, and `npm run migrate` is now the first thing any change runs. A schema that has
never been loaded is a schema that has never been tested.
