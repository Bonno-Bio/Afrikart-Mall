# Afrikart Mall — Platform Architecture & Build Record v0.1

**Companion to:** `docs/000-founding-decisions.md`
**Status:** Working vertical slice. Every screen reads and writes real data.

---

## 1. What was built

A working, Amazon-shaped marketplace at `product/`, covering the full order lifecycle and both
supply-side portals. It is not a clickable mock — orders placed in the UI persist, decrement stock,
appear in Seller Central, and move the admin P&L.

| Surface | What works |
|---|---|
| **Storefront** | Homepage with deals, category rails, "buy it again", best sellers, department navigation |
| **Search** | Full-text across title/brand/tags/description, department + price + rating + Express + deal filters, six sort orders, pagination, live suggestions in the header |
| **Product page** | Pricing and discount, stock states, bullets, spec table, tabbed description, generated media gallery, delivery options, seller card, "customers who bought this also bought" computed from real order co-occurrence, review distribution and a live review form |
| **Cart** | Quantities, free-delivery progress, buyer-protection panel, save-for-later |
| **Checkout** | Address selection/creation, four delivery methods with live pricing, five Botswana payment rails incl. cash-on-delivery with a Gaborone-only rule, server-side re-pricing and stock validation |
| **Orders** | History, four-stage tracking bar, full timeline, cancel-before-dispatch, return-after-delivery, refund messaging |
| **Seller Central** | GMV/payout/conversion KPIs, 14-day sales chart, "waiting to ship" queue, best sellers, stock alerts, listing CRUD with inline price/stock editing, payout statement with commission and fulfilment fee, growth tools |
| **Admin** | Platform GMV, take rate, failure rate, revenue split (commission / fulfilment / delivery), GMV by department, seller performance board, seller verification queue with approve, order book, catalogue view |
| **Accounts** | Auth (scrypt + httpOnly session cookie), addresses, saved list, role-aware navigation |

### Demo accounts

All three use the password `demo1234`.

| Role | Email | What you see |
|---|---|---|
| Customer | `customer@afrikart.co.bw` | Order history, tracking, saved list |
| Seller | `seller@afrikart.co.bw` | Seller Central for Naledi Beauty Supply |
| Admin | `admin@afrikart.co.bw` | Platform admin |

---

## 2. Stack decision, and what it deliberately is not

| Choice | Why |
|---|---|
| **React + Vite** single-page app | The storefront is the one place where perceived quality is the product. Vite gives a fast, boring, well-understood build. |
| **Express + JSON store** | Zero infrastructure. The whole thing runs with `npm start`. The domain model is the deliverable here, not the database. |
| **Server-side pricing and stock checks** | Checkout re-prices every line server-side and rejects on insufficient stock. A client-side cart is never trusted for money. |
| **No component library** | A design system written for this brand, not a reskinned template. Navy + Kalahari saffron, not Amazon blue. |
| **Generated product media** | Real supplier photography is an operational problem, not a coding one. The platform ships a deterministic generated tile per product until a real photo is uploaded — and the admin flow for photo approval is on the roadmap. |

**Explicitly not in this build:** real payment capture, real courier API integration, real email/SMS,
a search index, image upload/CDN, multi-currency, and native apps. Section 5 sequences those.

---

## 3. Domain model

The seven pillars in the brief are an org chart. This is the data model that has to carry them.

```
User ──1:N── Address
  │
  ├─ role: customer | seller | admin
  └─ sellerId ──────────┐
                        ▼
Seller ──1:N── Product ──1:N── Review
  │                │
  │                └─ category → Category
  │                └─ stock, price, listPrice, status, views, sold
  │
  └─ fulfilment: 'Afrikart Fulfilment' | 'Seller fulfilled'

Order ──1:N── OrderItem ──→ Product, Seller
  │
  ├─ subtotal, deliveryFee, codFee, total
  ├─ status: placed → packed → dispatched → delivered
  │           ↘ cancelled      ↘ returned
  ├─ deliveryMethod, paymentMethod
  ├─ address (snapshot, not a reference — addresses change)
  └─ timeline[] (append-only audit trail)
```

Three modelling decisions that matter more than they look:

1. **`OrderItem` snapshots title and price.** If a seller edits a listing tomorrow, yesterday's order
   must not change. This is also what makes a dispute defensible.
2. **`Order.address` is a snapshot, not a foreign key.** Same reason. A customer moving house must not
   rewrite the delivery record of a past order.
3. **`Order.timeline` is append-only.** Every state change writes a human-readable event. This is the
   audit trail customer support will live inside, and later the training data for exception handling.

### How the seven pillars map onto it

| Pillar | Implemented in this slice | Next build step |
|---|---|---|
| 1. Marketplace | Storefront, search, PDP, cart, checkout | Search index, merchandising rules |
| 2. Seller Central | Full dashboard, listings, payouts, fulfilment queue | Onboarding/KYC, bulk upload, ads console |
| 3. Logistics & fulfilment | Delivery methods, tracking timeline, dispatch state | Route batching, rider app, pickup-point inventory |
| 4. Payments | Five rails, COD geographic rule, commission/fulfilment fee split | PSP integration, seller settlement ledger, escrow |
| 5. B2B commerce | Price breaks stubbed in the model | Trade accounts, quotes, purchase orders, terms |
| 6. Technology & AI | Co-occurrence recommendations from real orders | Demand forecasting, delivery exception triage |
| 7. Private label | Modelled as a seller (`Afrikart Bundle`) | Cost accounting, own-brand quality gates |

---

## 4. API surface

```
POST   /api/auth/login | /api/auth/register | /api/auth/logout
GET    /api/auth/me
POST   /api/account/addresses

GET    /api/home
GET    /api/meta
GET    /api/search?q&category&min&max&rating&express&deal&sort&page
GET    /api/suggest?q
GET    /api/products/:id
POST   /api/products/:id/reviews

POST   /api/checkout/quote
POST   /api/orders
GET    /api/orders
GET    /api/orders/:id
POST   /api/orders/:id/action        { action: cancel | return }

GET    /api/seller/summary
GET    /api/seller/products
POST   /api/seller/products
PATCH  /api/seller/products/:id
DELETE /api/seller/products/:id
POST   /api/seller/orders/:id/fulfil

GET    /api/admin/summary
POST   /api/admin/sellers/:id/approve
PATCH  /api/admin/products/:id
```

Money is always recomputed server-side. Roles are enforced per route, not in the UI.

---

## 5. From this slice to production

Ordered by what actually blocks revenue, not by what is fun to build.

### Gate 1 — Take a real payment (2–3 weeks)
- Integrate one licensed PSP (card + Orange Money + MyZaka). Do **not** build a wallet.
- Replace the simulated checkout form with the PSP's hosted fields. Card data never touches our servers.
- Add a settlement ledger: every order line has `gross → commission → fulfilment fee → seller payable`.
- Implement idempotency keys on order creation. Double-charging once destroys trust permanently.

### Gate 2 — Make delivery trackable (3 weeks)
- Rider app or a PWA: route list, mark delivered / failed / rescheduled with a reason code.
- Pickup-point inventory: which parcels are at which shop.
- **Failed-delivery reason codes are the single most valuable data we will collect.** They are what
  turns "delivery is hard" into "Extension 12 has no gate numbers, so call ahead".

### Gate 3 — Trust surfaces (2 weeks)
- SMS/WhatsApp notifications at four moments: order placed, out for delivery, delivered, refund issued.
- Verified-purchase enforcement on reviews.
- Seller verification workflow: documents, checklist, approval audit trail.

### Gate 4 — Scale the catalogue (ongoing)
- Real image upload + CDN, with a photo quality gate (a bad photo suppresses conversion more than a
  missing product).
- CSV bulk upload for sellers with 100+ SKUs.
- A real search index (Meilisearch or Postgres FTS). The current scorer is honest but naive.

### Gate 5 — Operationalise the money
- Seller payout runs (weekly), reconciliation report, VAT report for BURS.
- Refund automation tied to the PSP.
- Fraud rules: velocity per phone number, COD rejection history, first-order value caps.

### What to rebuild, not extend
The JSON store is correct for this stage and wrong for production. Move to Postgres when you have any
of: more than one server process, a payout run, or a need to query order history for reconciliation.
Design the migration around the domain model above — it is already relational.

---

## 6. National-scale shape (when it is needed, not before)

```
                ┌──────────────┐
   web / app ──▶│  API gateway │──▶ Auth service
                └──────┬───────┘
                       │
        ┌──────────────┼───────────────┬────────────────┐
        ▼              ▼               ▼                ▼
   Catalogue      Order service    Payment service   Logistics service
   + Search            │               │                │
                       └───────┬───────┴────────────────┘
                               ▼
                        Event bus (order.placed,
                        order.packed, delivery.failed,
                        refund.issued, payout.settled)
                               │
      ┌────────────┬───────────┼───────────┬──────────────┐
      ▼            ▼           ▼           ▼              ▼
  Notifications  Ledger    Analytics   Forecasting   Seller payouts
```

The reason to go event-driven early: **every one of those consumers is a business in the brief.**
Notifications, the ledger, analytics and forecasting all read the same facts. Building them as
side-effects of the order table is how you end up unable to answer "what did we actually earn per
route last month" — which is the only question that matters at Stage 3.

The rule: **one event per fact, no event that could have been derived from another.**

---

## 7. Notes on the demo data

- 47 products across 8 departments, 14 sellers (12 approved, 2 pending verification), 52 orders,
  ~220 reviews, deterministic seed so the shop is identical on every reset.
- Catalogue is weighted toward non-discretionary, high-frequency categories on purpose — that is the
  launch thesis in memo 000, expressed as data.
- Orders are generated around category affinities, so "customers also bought" surfaces sensible pairs
  instead of random noise.
- **The demo AOV settles around P1,300, not the P380 in the pilot model.** That gap is real and
  intentional: the seeded catalogue skews to high-ticket items (a P8,490 inverter, a P1,290 weave).
  Which basket the business actually ends up with is the first question the pilot answers, and it is
  the difference between a 21-order-a-day break-even and an unreachable one.

---

## 8. Running it

```bash
cd product
npm install
npm run build && npm start     # http://localhost:3000
npm run seed                   # reset demo data
```

Requires Node 20+. No database, no environment variables, no external services.
