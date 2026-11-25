# Build Backlog v1.0

**48 stories across 8 milestones.** Sized S (<1 day), M (1–3 days), L (3–5 days).
Priorities: **M**ust (blocks launch), **S**hould (launch quality), **C**ould (drop if late).

This is the contract between the founder and the builder. A story is done when its acceptance
criteria are ticked in staging — see `004-build-readiness.md` §6.

---

## Milestones

| Milestone | Theme | Week | Exit condition |
|---|---|---|---|
| **M0** | Foundation | 1–2 | A seller can log in and create a product that persists, on staging |
| **M1** | Catalogue | 2–3 | A real product with a real photo is findable by search |
| **M2** | Storefront | 3–4 | A customer can browse, search and fill a cart |
| **M3** | Money | 6–7 | One real P1 order taken; ledger balances; invoice issued |
| **M4** | Fulfilment | 7–8 | One real delivery completed with a reason code and cash reconciled |
| **M5** | Seller Central | 8–9 | A seller sees their own GMV, fulfils an order and checks a payout |
| **M6** | Admin & ops | 9–10 | Founders can run the business from the dashboard alone |
| **M7** | Hardening | 10–12 | UAT passes; backups restore; monitoring is live |

**M3 does not start until the PSP is contracted.** That is deliberate — see `004` §8.

---

## M0 · Foundation

**M0-01 · Repository, CI and environments** · M · L
- `main` and `staging` deploy automatically; PRs get a preview URL.
- Migrations run in CI against a throwaway database before merge.
- Secrets live in the platform vault, never in the repo. `.env.example` documents every key.
- AC: a broken migration fails the build, not production.

**M0-02 · Design tokens and layout shell** · M · M
- Colour, type scale, spacing and radius as tokens; no hard-coded hex in components.
- Header, footer, mobile nav and container grid, matching `product/src/styles.css` as the reference.
- AC: every page inherits the shell; layout holds at 360px, 768px and 1440px.

**M0-03 · Authentication with phone OTP** · M · M
- Sign-in by phone (`+2677…`) via OTP; email optional. Phone is the identity here.
- Roles: customer, seller, rider, support, admin. Server-side enforcement, never UI-only.
- AC: a user without the role gets 403 from the API, even by calling it directly.

**M0-04 · Row-level security and seed data** · M · M
- RLS on every table: a seller reads only their own rows; a rider only their own deliveries.
- Categories and delivery failure reasons seeded from `schema.sql`.
- AC: a seller JWT cannot read another seller's order lines. Verified by a test.

**M0-05 · Observability** · S · M
- Sentry on both app and API; structured logs with a request id.
- Uptime check on the storefront and the API health endpoint.
- AC: a thrown exception on staging produces a Sentry event with a trace id.

**M0-06 · Image upload pipeline** · M · S
- Upload to object storage, resize to 1600px and 400px derivatives, strip EXIF, serve via CDN.
- AC: a 4MB phone photo becomes a 1600px webp under 250KB, and the original is not lost.

---

## M1 · Catalogue

**M1-01 · Category tree** · M · S
- Two levels, ordered, with an active flag. Slug is stable and used in URLs.
- AC: reordering categories changes the storefront order without a deploy.

**M1-02 · Product and variant CRUD** · M · L
- Draft → in review → live. Variants carry SKU, price, list price, weight.
- **A product cannot go live without an approved image** (database-enforced).
- AC: attempting to publish without a photo returns a clear validation error, not a 500.

**M1-03 · Media gallery and approval** · M · M
- Up to 6 images per product, ordered, each with alt text. Reviewer approves or rejects.
- AC: a rejected image blocks publication; an approved one appears first in the gallery.

**M1-04 · Inventory levels and movements** · M · M
- Every change writes an `inventory_movements` row; `on_hand` is a cache that must reconcile.
- Reserve on order, release on cancellation, restock on return.
- AC: a reconciliation job that compares movements to `on_hand` and alarms on drift.

**M1-05 · CSV bulk import** · S · M
- Seller uploads a template; system validates rows and reports per-row errors.
- AC: a 100-row file with 3 bad rows imports 97 and reports exactly which 3 and why.

**M1-06 · Public catalogue read** · M · S
- Anonymous read of live products only; drafts and paused are invisible.
- AC: a paused product returns 404 publicly and 200 to its owner.

**M1-07 · Search** · M · L
- Postgres full-text over title, brand, description; filters for category, price, rating, Express;
  six sort orders; pagination.
- AC: "nappies" returns nappies before accessories; an empty result suggests a broader term.

---

## M2 · Storefront

**M2-01 · Home** · M · M
- Category rails, featured products, recently viewed, and a delivery promise block.
- AC: no rail renders an empty shell; every product tile links to a live PDP.

**M2-02 · Search and category results** · M · M
- Facet sidebar with live counts, active-filter chips, "no results" help text.
- AC: filters compose correctly and survive a page refresh (all state in the URL).

**M2-03 · Product detail page** · M · L
- Price, discount, stock state, bullets, specs, delivery estimate, seller card, reviews.
- "Customers also bought" from real order co-occurrence, fallback to same category.
- AC: a customer can add to cart from mobile in one tap.

**M2-04 · Cart** · M · M
- Guest cart in `localStorage`; **server re-prices every line at checkout** and rejects stale prices.
- Free-delivery progress; out-of-stock lines flagged before checkout.
- AC: editing a price in devtools cannot change what is charged.

**M2-05 · Saved list** · S · S
- Heart from any tile; persists per user; add-all-to-cart.
- AC: list survives sign-out and sign-in on the same account.

**M2-06 · Reviews** · M · M
- Only customers with a **delivered** order line can review; `is_verified` derived server-side.
- One review per customer per product; edit within 48 hours.
- AC: a client cannot post `is_verified: true` and have it stored.

---

## M3 · Money *(starts only after the PSP is contracted)*

**M3-01 · Address book** · M · S
- CRUD, one default, landmark field (no reliable postcode system here).
- AC: checkout pre-selects the default and allows adding a new address inline.

**M3-02 · Delivery quote engine** · M · M
- Rules by city: Express (Gaborone/Tlokweng/Mogoditshane), standard courier, pickup point, intercity.
- Free over the threshold; COD adds a handling fee and is **server-refused** outside the zone.
- AC: quoting is deterministic for the same input, and prices are never taken from the client.

**M3-03 · PSP integration with hosted fields** · M · L
- Card, Orange Money, MyZaka. No card data touches our servers.
- AC: a declined payment returns a specific reason and leaves the order unpaid, not failed.

**M3-04 · Webhook handler with idempotency** · M · M
- Signature verified; duplicate delivery is a no-op; every transition recorded.
- AC: replaying the same webhook ten times produces exactly one ledger posting.

**M3-05 · Order creation transaction** · M · L
- One database transaction: reserve stock, create items with snapshots, post ledger, create invoice.
- Idempotency key required on the endpoint.
- AC: a failure at any step rolls back everything — no half-order, no orphan ledger entry.

**M3-06 · Invoices** · M · S
- Sequential, unbroken numbering; 14% VAT; immutable once issued.
- AC: numbers have no gaps, even after a failed transaction.

**M3-07 · Notifications** · M · M
- WhatsApp + SMS at four moments: placed, out for delivery, delivered, refunded.
- AC: each message states the order number and one next action.

**M3-08 · Refunds** · M · M
- Full and partial; reason required; ledger reversal posted; customer told within the SLA.
- AC: refund completes against the same payment method, and the ledger nets to zero for that order.

**M3-09 · Reconciliation report** · M · M
- Daily: expected vs captured vs refunded vs settled-by-PSP, with a variance column.
- AC: finance can close a day in under 15 minutes.

---

## M4 · Fulfilment

**M4-01 · Pick and pack** · M · M
- Pick list grouped by route, barcode or SKU confirmation, packing slip with order number.
- AC: a mis-scanned item blocks completion.

**M4-02 · Rider PWA** · M · L
- Today's route, ordered stops, tap-to-call, offline-tolerant (Botswana connectivity is not
  guaranteed), large touch targets for use on a scooter.
- AC: the route still loads after a page reload with no signal.

**M4-03 · Delivery transitions and reason codes** · M · M
- pending → assigned → out → delivered | failed | rescheduled; **failure reason is mandatory**.
- AC: saving a failure without a reason is rejected by the database, and surfaced as a field error.

**M4-04 · Proof of delivery** · M · S
- Photo and optional signature; timestamped; visible to the customer on the tracking page.
- AC: proof is immutable after submission.

**M4-05 · Cash reconciliation** · M · M
- Per rider per day: expected (deliveries with COD) vs counted; variance computed; deposit recorded.
- AC: a variance above the rider's float limit blocks the next day's assignment until resolved.

**M4-06 · Customer tracking page** · M · S
- Four-stage bar, timeline, proof photo, expected day, reschedule or refund action.
- AC: page reflects a status change within 60 seconds without a manual refresh.

---

## M5 · Seller Central

**M5-01 · Seller application and KYC** · M · M
- Company details, tax number, bank details (encrypted), document upload.
- AC: an application is not submittable without the three required documents.

**M5-02 · Verification queue** · M · S
- Admin reviews documents, approves or rejects with a reason; every action audited.
- AC: an approved seller is notified and can list within one minute of approval.

**M5-03 · Seller dashboard** · M · M
- GMV, orders, units, AOV, commission, payout, conversion, stock alerts, 14-day chart.
- AC: every number is derived from the ledger and order tables — no cached counters that can drift.

**M5-04 · Seller order list and fulfilment** · M · M
- Only their lines; mark shipped; cannot see customer email or other sellers' items.
- AC: a seller cannot read the customer's contact details through the API.

**M5-05 · Payout run and statement** · M · L
- Weekly run; line-level statement from `payout_items`; approve, mark paid, bank reference.
- AC: the statement lines sum exactly to the payout, and each line traces to an order line.

**M5-06 · Seller scorecard** · S · S
- Fill rate, cancellation rate, response time, rating. Thresholds visible.
- AC: a seller below threshold is flagged to admin automatically.

---

## M6 · Admin and operations

**M6-01 · Platform dashboard** · M · M
- GMV, take rate, contribution, failure rate, revenue split, top categories.
- AC: the numbers reconcile with the ledger for any date range.

**M6-02 · Order management** · M · M
- Search, filter by status, force-cancel with a reason, refund, resend notification.
- AC: every admin action writes to `audit_log`.

**M6-03 · Route weekly P&L** · M · M
- Renders `route_weekly_pnl`: drops, failures, first-attempt %, GMV, contribution per route.
- AC: matches a hand calculation for a chosen week.

**M6-04 · Support view** · M · M
- Customer lookup by phone or order number; full order history; canned replies; refund shortcut.
- AC: a support agent can resolve a "where is my order" in under 60 seconds.

**M6-05 · Moderation** · S · S
- Approve or reject products and images; hide reviews; suspend sellers.
- AC: a hidden review disappears from the PDP and the rating recalculates.

---

## M7 · Hardening and launch

**M7-01 · UAT script** · M · M
- 12 journeys scripted and signed off by the founder, including three failure paths.
- AC: a non-technical person can run the script without help.

**M7-02 · Performance budgets** · M · S
- PDP LCP < 2.5s on a simulated 3G connection; API p95 < 400ms.
- AC: measured on staging with Lighthouse, recorded in the repo.

**M7-03 · Backups and a restore drill** · M · S
- Point-in-time recovery on; **one actual restore performed** and timed.
- AC: written restore runbook, tested, with the measured time recorded.

**M7-04 · Analytics events** · M · S
- The taxonomy in the appendix, wired and verified in a debug view.
- AC: a test order produces the full event chain in order.

**M7-05 · Legal and trust pages** · M · S
- Terms, refund policy, privacy notice under the Data Protection Act, contact, delivery promise.
- AC: linked from the footer and from checkout.

**M7-06 · Launch checklist** · M · S
- DNS, SSL, robots, sitemap, 404s, error pages, support number, monitoring alerts to a phone that
  someone actually answers.

---

## The cut line

If the date slips, cut in this order — and only this order:

1. M5-06 seller scorecard
2. M2-05 saved list
3. M1-05 CSV bulk import (hand-load the first 60 products)
4. M6-05 moderation (do it in the database)
5. M4-04 proof photo (use the rider's phone + WhatsApp instead)

**Never cut:** M3-04 (idempotent webhooks), M3-05 (single transaction), M4-03 (mandatory reason codes),
M7-03 (restore drill). Those four are what stop the company losing money it cannot account for.

---

## Appendix A · Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | PDP LCP < 2.5s on 3G; API p95 < 400ms; no blocking third-party scripts before first paint |
| Availability | 99.5% in year one. Maintenance windows announced to sellers, not to customers. |
| Mobile | 360px first. One-handed checkout. Touch targets ≥ 44px. |
| Data usage | Product images lazy-load; a browsing session under 1MB. Data is expensive here. |
| Offline | Rider route survives a reload without signal; order status is read-mostly |
| Accessibility | WCAG 2.1 AA: contrast, keyboard, focus, labels, error text tied to fields |
| Security | RLS everywhere; secrets in vault; rate limits on auth and checkout; no card data stored |
| Privacy | PII minimised; sellers never see customer contact details; deletion request honoured in 30 days |
| Audit | Every money, inventory and seller-status change is logged with an actor |
| Browsers | Last 2 versions of Chrome, Safari, Firefox, Samsung Internet |

## Appendix B · Analytics events

One event per fact, named `object.verb`. No event that could be derived from another.

```
session.started        { source, medium, city }
search.performed       { query, results, filters }
product.viewed         { product_id, category, price, in_stock }
cart.item_added        { product_id, price, qty, cart_value }
checkout.started       { cart_value, items }
checkout.address_used  { city }
delivery.quoted        { method, fee, city }
payment.initiated      { method, amount }
payment.captured       { method, amount, provider }
payment.failed         { method, reason }
order.placed           { order_id, total, aov, items }
order.cancelled        { order_id, reason, stage }
delivery.attempted     { order_id, outcome, reason_code }
delivery.failed        { order_id, reason_code, attempt }
refund.issued          { order_id, amount, days_since_delivery }
review.submitted       { product_id, rating, verified }
seller.application     { seller_id }
payout.completed       { seller_id, amount }
```

Three that matter more than the rest: `order.placed`, `delivery.failed` (with its reason code), and
`refund.issued` (with its lag). Those three answer whether the business works.
