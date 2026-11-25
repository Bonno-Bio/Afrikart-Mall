# API Contract v1.0

The interface between the storefront, the seller portal, the rider PWA and the database. Written
before the build so that two people can work in parallel and neither invents a shape.

Base: `/api/v1` · JSON only · UTF-8 · all money as **integer thebe** (1 Pula = 100).

---

## Conventions

### Errors
Every non-2xx response uses the same envelope. **A client never has to guess.**

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Only 3 of that item left.",
             "field": "items[1].quantity", "request_id": "req_8f2a" } }
```

| Status | When |
|---|---|
| 400 | Validation failed — `field` tells the client which input |
| 401 | No session or expired OTP |
| 403 | Authenticated but not permitted (role or ownership) |
| 404 | Not found, **or not visible to this caller** — never leak existence |
| 409 | State conflict: stock ran out, order already dispatched, payout already approved |
| 422 | Business rule violated (COD outside the zone, price changed since cart, **route full on the requested date**) |
| 429 | Rate limited — includes `Retry-After` |
| 500 | Our fault. Include `request_id`; never a stack trace |

### Auth
`Authorization: Bearer <jwt>` (Supabase). Roles: `customer`, `seller`, `rider`, `support`, `admin`.
**Roles are enforced server-side on every route.** UI hiding is not security.

### Idempotency
All `POST` endpoints that move money, stock or seller status **require** `Idempotency-Key`.
Same key + same body → the original response, replayed. Same key + different body → `409`.

### Pagination
`?limit=24&cursor=<opaque>`. Response includes `next_cursor` and `total` (total may be `null` on
large sets). No offset pagination on order or ledger tables — it is not stable under concurrent writes.

### Money and time
- Money: `integer` thebe. `P380.00` → `38000`. Never a float, never a decimal string.
- Time: ISO-8601 UTC. The client renders in `Africa/Gaborone`.

---

## Public (no auth)

### `GET /home`
```json
{
  "rails": [{ "category": { "slug": "baby-mother", "name": "Baby & Mother" },
              "products": [ProductCard] }],
  "featured": [ProductCard],
  "stats": { "products": 47, "sellers": 12, "pickup_points": 16 }
}
```

### `GET /search?q=&category=&min=&max=&rating=&express=1&sort=&limit=&cursor=`
`sort ∈ relevance | popular | price_asc | price_desc | rating | newest`
```json
{ "results": [ProductCard], "facets": [{ "slug": "hair-beauty", "name": "Hair & Beauty", "count": 6 }],
  "total": 12, "next_cursor": "eyJvIjoyNH0" }
```

**ProductCard** — the only product shape the list endpoints return:
```json
{ "id": "uuid", "title": "…", "brand": "…", "price_minor": 64900, "list_price_minor": 72900,
  "rating": 4.2, "rating_count": 5, "in_stock": true,
  "tier": "express", "express": true, "delivery_estimate_days": 1,
  "category": "baby-mother", "primary_image_url": "…",
  "seller": { "id": "uuid", "name": "MmaTebogo Baby World", "city": "Gaborone" } }
```

**`tier` is the honest promise, and it is the only thing the badge means** (`002` §2.1, `db/schema.sql`
`products.catalog_tier`):

| `tier` | `express` | `delivery_estimate_days` | Shown to the customer |
|---|---|---|---|
| `express` | `true` | 1 | "Arrives tomorrow" — badged |
| `marketplace` | `false` | 3–5 | "Arrives in 3–5 days" — never badged, never promises next day |

`express` is retained as a derived boolean so the existing `?express=1` search filter keeps working.
A cart is only quoted Express if **every line** is Express; one marketplace line downgrades the whole
order, and the quote says which line did it.

### `GET /products/{slug}`
```json
{ "product": { …ProductCard, "description": "…", "bullets": ["…"], "specs": {…},
               "media": [{ "url": "…", "alt": "…" }] },
  "variants": [{ "id": "uuid", "sku": "…", "options": {"size":"4"}, "price_minor": 64900, "in_stock": true }],
  "stock_message": "Only 4 left",
  "also_bought": [ProductCard], "related": [ProductCard],
  "reviews": { "summary": { "average": 4.2, "total": 5, "distribution": { "5": 3, "4": 1, "3": 1, "2": 0, "1": 0 } },
               "items": [Review] } }
```

### `GET /suggest?q=` → `{ "suggestions": ["…"] }`

---

## Customer (auth: customer)

### `GET /me` · `PATCH /me`
```json
{ "id": "uuid", "full_name": "…", "phone": "+2677…", "email": null, "role": "customer",
  "addresses": [Address] }
```

### `GET|POST /addresses` · `PATCH|DELETE /addresses/{id}`
```json
{ "id": "uuid", "label": "Home", "recipient": "…", "line1": "Plot 5421",
  "line2": "Extension 12", "city": "Gaborone", "landmark": "Opposite the clinic",
  "phone": "+2677…", "lat": null, "lng": null, "is_default": true }
```

### `POST /checkout/quote`
Prices are **always** computed here, never sent by the client.
```json
// request
{ "items": [{ "variant_id": "uuid", "quantity": 2 }], "city": "Gaborone", "payment_method": "orange_money" }
// response
{ "lines": [{ "variant_id": "uuid", "title": "…", "unit_price_minor": 64900, "quantity": 2,
              "line_subtotal_minor": 129800 }],
  "subtotal_minor": 129800, "vat_minor": 15940,
  "delivery_options": [
    { "id": "express", "label": "Afrikart Express", "fee_minor": 0,
      "available_date": "2026-11-26", "eta": "Tomorrow, 08:00–13:00",
      "capacity_limited": false, "next_available_date": "2026-11-26" },
    { "id": "pickup",  "label": "Collect at a pickup point", "fee_minor": 1000,
      "available_date": "2026-11-26", "eta": "Tomorrow after 14:00",
      "capacity_limited": false, "next_available_date": "2026-11-26" }
  ],
  "cod_allowed": true, "free_delivery_threshold_minor": 40000,
  "warnings": [{ "code": "PRICE_CHANGED", "message": "…" }] }
```

**Capacity is quoted, not discovered.** `available_date` is computed by
`route_capacity_remaining(route, date)` (`db/schema.sql`). When today's route is at capacity the quote
returns `capacity_limited: true`, an `available_date` of the next open day, and a warning
`{ "code": "NEXT_DAY_OFFERED" }`. `POST /orders` with an explicitly requested date that is full returns
`422 ROUTE_FULL` with the next available date in `field`. **The system never silently accepts an order it
cannot deliver on the promised day** — that is the whole point of the promise (`005` P5).

### `POST /orders` · requires `Idempotency-Key`
```json
// request
{ "items": [{ "variant_id": "uuid", "quantity": 2 }],
  "address_id": "uuid", "delivery_method": "express", "payment_method": "orange_money",
  "payment_token": "psp_tok_…" }
// response 201
{ "order": { "id": "uuid", "order_number": "AK-24001", "status": "packed",
             "total_minor": 129800, "payment": { "status": "captured", "method": "orange_money" },
             "invoice": { "number": "INV-00000042" } } }
```
Atomic: stock reserved, items snapshotted, ledger posted, invoice issued, or nothing.

### `GET /orders` · `GET /orders/{order_number}`
```json
{ "order_number": "AK-24001", "status": "dispatched", "placed_at": "…",
  "items": [{ "title": "…", "quantity": 2, "unit_price_minor": 64900, "seller": "…" }],
  "totals": { "subtotal_minor": 129800, "delivery_minor": 0, "cod_fee_minor": 0, "total_minor": 129800 },
  "delivery": { "method": "express", "scheduled_date": "2026-11-26", "proof_photo_url": null },
  "timeline": [{ "event": "order.placed", "at": "…", "detail": "…" }] }
```

### `POST /orders/{number}/cancel` — only before dispatch → `409` after
### `POST /orders/{number}/return` — only after delivery; body `{ "reason": "…", "items": [...] }`
Resolution is capped at **P300 of goodwill without approval** (`002` §13): the API accepts
`resolution: "refund" | "replacement" | "credit"` and auto-approves credit up to that amount.
### `POST /products/{id}/reviews` — `{ "rating": 1-5, "title": "…", "body": "…" }`
`is_verified` is derived server-side from a delivered order line. A client-supplied value is ignored.
### `GET|POST|DELETE /saved-items`

---

## Seller (auth: seller)

### `GET /seller/summary`
```json
{ "kpis": { "gmv_minor": 717400, "orders": 5, "units": 7, "aov_minor": 143480,
            "commission_minor": 86088, "fulfilment_minor": 43044, "payout_minor": 588268,
            "pending_fulfilment": 1, "conversion_pct": 0.1, "rating": 4.7 },
  "series": [{ "day": "2026-11-12", "gmv_minor": 41000 }],
  "top_products": [...], "low_stock": [...] }
```

### `GET|POST /seller/products` · `PATCH|DELETE /seller/products/{id}`
Ownership is enforced by RLS **and** by an ownership check — belt and braces, because this is where
one seller reading another's catalogue would be a commercial incident.

### `POST /seller/products/{id}/media` · multipart · max 6, ≤10MB each
### `POST /seller/products/import` · CSV · returns per-row results
### `GET /seller/orders` · `POST /seller/orders/{number}/ship`
### `GET /seller/payouts` · `GET /seller/payouts/{id}` — line-level statement

---

## Rider (auth: rider)

### `GET /rider/route?date=today`
```json
{ "route": { "id": "uuid", "name": "Gaborone West 1" },
  "stops": [{ "delivery_id": "uuid", "sequence": 1, "order_number": "AK-24001",
              "customer_name": "K. Mmolai", "phone": "+2677…", "address": "…", "landmark": "…",
              "cash_due_minor": 129800, "notes": "Call at the gate" }] }
```
Phone numbers are visible to the assigned rider **for that day only**, and the access is logged.

### `POST /rider/deliveries/{id}/attempt`
```json
{ "outcome": "delivered", "proof_photo_url": "…", "cash_collected_minor": 129800 }
{ "outcome": "failed", "reason_code": "NO_LANDMARK", "note": "No gate number on the street" }
```
`reason_code` is **required** for a failure and validated against `delivery_failure_reasons`.
### `POST /rider/cash-reconciliation` — `{ "business_date": "…", "counted_minor": 350000 }`

---

## Admin (auth: admin | support)

- `GET /admin/summary` — GMV, take rate, contribution, failure rate, revenue split, category mix
- `GET /admin/orders` · `POST /admin/orders/{number}/refund` · `POST /admin/orders/{number}/cancel`
- `GET /admin/sellers` · `POST /admin/sellers/{id}/approve|reject` · `POST /admin/sellers/{id}/suspend`
- `GET /admin/payouts` · `POST /admin/payouts/run` · `POST /admin/payouts/{id}/approve`
- `GET /admin/routes/pnl?week=2026-W47` — renders `route_weekly_pnl`
- `GET /admin/customers?phone=` — support lookup
- Every mutating admin route writes `audit_log` with before and after.

---

## Webhooks

### `POST /webhooks/psp`
- Signature verified against the provider's secret; unsigned requests are `401`.
- Duplicate delivery is a no-op (idempotent on `provider_ref` + event id).
- Unknown events are stored and ignored, never 500 — a 500 makes the provider retry forever.
- Handles: `payment.captured`, `payment.failed`, `refund.completed`, `chargeback.opened`.

```json
{ "event_id": "evt_…", "type": "payment.captured",
  "data": { "provider_ref": "…", "amount_minor": 129800, "currency": "BWP", "method": "orange_money" } }
```

---

## Rate limits

| Route | Limit |
|---|---|
| `POST /auth/otp` | 3 per phone per 15 min, 10 per IP per hour |
| `POST /checkout/quote` | 60 per session per minute |
| `POST /orders` | 10 per user per minute |
| `GET /search`, `GET /suggest` | 120 per IP per minute |

---

## Implemented: what the build actually does

`app/` implements the money half of this contract. Where reality and this document differ, this is
the list, and the document should be updated rather than the code quietly diverging:

| Contract says | `app/` does | Why |
|---|---|---|
| `POST /checkout/quote` returns `delivery_options` | `deliveryOptions`, plus `warnings[]` and `expressAvailable` | The Express promise now depends on address confidence and route capacity (`007` H1, H2), so the client needs to know *why* an option is missing |
| `POST /orders` returns order | adds `replayed: true` on an idempotent replay, and `paymentId` | The client must be able to tell a replay from a new order |
| PSP webhook body | `{ event, data: { paymentId, providerRef, providerFeeMinor } }`, HMAC-SHA256 in `x-psp-signature` | Signature verification is mandatory; unsigned calls are rejected when a secret is configured |
| Staff actions | under `/api/ops/...` (deliver, refund, complete refund, ledger) | Separating the staff surface from the customer surface now avoids a role leak later |
| `GET /admin/...` | not built | Admin is post-G1 (`005` §1.2) |

Endpoints not in this document but implemented: `GET /api/health`, `GET /api/ops/ledger`
(trial balance with the balance invariant checked), `GET /api/orders/{number}/invoice`.

## The three rules a reviewer enforces

1. **Money is never computed on the client.** The client sends variant ids and quantities; the server
   returns prices. Any endpoint that accepts a price is a bug.
2. **Every state transition is an event.** `order_events`, `inventory_movements` and `ledger_entries`
   are append-only. If a reviewer sees an `UPDATE` on any of those three, the PR is rejected.
3. **Nothing is deleted.** Orders are cancelled, products are archived, sellers are suspended. There is
   no `DELETE` on a business record.
