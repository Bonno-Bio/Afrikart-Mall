# Build Brief — Afrikart Mall v1

**Send this to every contractor or agency you shortlist.** It is deliberately narrow: it is the
scope for a 10–12 week build of a real marketplace, not a prototype.

## 1. What we are building

A multi-vendor marketplace in Botswana. Customers order in Gaborone and receive next-day delivery from
our own riders. Sellers list stock and are paid out weekly from a ledger. Nothing exotic — but the
money handling has to be exactly right.

**Stack is fixed:** Next.js (App Router) + TypeScript + PostgreSQL on Supabase + Tailwind.
Deployment: Vercel. Payments: a Bank of Botswana licensed PSP with hosted fields.
**Do not propose a different stack** unless you can show, in writing, how your alternative handles
seller settlements and route-level delivery better. That is the whole job.

## 2. What you are given

| Artifact | Path | What it is |
|---|---|---|
| Production schema | `db/schema.sql` | 32 tables, double-entry ledger, constraints. **Treat as authoritative.** |
| Backlog | `docs/spec/backlog.md` | 48 stories, M0–M7, with acceptance criteria |
| API contract | `docs/spec/api-contract.md` | Every endpoint, shape, error code |
| Framework | `docs/002-master-framework.md` | The business context and the gates |
| Clickable reference | `product/` | A React prototype. **Reference for flows and visual language only — do not reuse the data layer.** |

## 3. What you deliver

1. The application, deployed to a staging URL we can click daily.
2. Migrations that run clean from an empty database.
3. Tests covering every money path: capture, partial refund, payout, COD reconciliation.
4. A written runbook: deploy, rollback, restore from backup (tested, with a measured time).
5. A 60-minute handover call, recorded.

## 4. Milestones and payment

| # | Milestone | Weeks | % of fee | Paid when |
|---|---|---|---|---|
| M0 | Foundation: repo, CI, auth, design tokens, RLS | 2 | 15% | A seller can create a product on staging |
| M1 | Catalogue: products, media, inventory, search | 1.5 | 15% | A real product is findable by search |
| M2 | Storefront: home, search, PDP, cart | 1.5 | 15% | A customer can fill a cart |
| M3 | **Money**: PSP, orders, ledger, invoices, refunds | 3 | 30% | One real P1 order, ledger balanced |
| M4 | Fulfilment: pick/pack, rider PWA, cash reconciliation | 1.5 | 10% | One real delivery with a reason code |
| M5 | Seller Central: KYC, dashboard, fulfilment, payouts | 1.5 | 10% | A seller sees their own payout |
| M6 | Admin: dashboard, orders, route P&L, support | 1 | 3% | Founders can run the day from the dashboard |
| M7 | Hardening: UAT, performance, backups, analytics | 1 | 2% | Restore drill performed and timed |

Milestone M3 is weighted heaviest because it is where the risk is concentrated. If you are cheaper on
M3 than on M0, you have misunderstood the job.

## 5. Non-negotiables

1. **Money is an integer in thebe.** Any float, decimal or string in a money column is a rejection.
2. **The ledger is append-only.** No `UPDATE`, no `DELETE`. Corrections are reversing entries.
3. **Every money endpoint takes an `Idempotency-Key`.** Charging a customer twice is unrecoverable.
4. **Order lines snapshot price, VAT and commission rate.** History must not change when a listing does.
5. **Server-side authorisation.** Roles enforced in the API, never only in the UI.
6. **No card data touches our servers.** Hosted fields only.
7. **A product cannot go live without an approved image.** This is enforced by a database constraint.
8. **Every delivery failure requires a reason code.** Also database-enforced.
9. **No `DELETE` on a business record.** Cancel, archive, suspend.
10. **Accessibility: WCAG 2.1 AA.** Contrast, keyboard, labels, error text tied to the field.

## 6. Product photography standard

This is listed because it is the most common reason a marketplace launches looking unprofessional.

- **5 images minimum per product:** front, detail, scale reference, packaging, in-use.
- White or seamless light-grey background for the hero image; natural light for in-use.
- 1600px on the long edge, sRGB, exported as WebP under 250KB.
- No watermarks, no text overlays, no stock imagery, no phone screenshots of another website.
- The item must fill 80% of the frame. No collage, no borders.
- One consistent orientation per category (all portraits upright, all garments flat-laid).
- Alt text in plain English: "Pampers Baby-Dry size 4 box of 168", not "product image 1".

## 7. What you must not do

- Do not build a custom auth system. Use Supabase Auth.
- Do not store a seller balance as a column. Derive it from the ledger.
- Do not add coupons, loyalty points, multi-currency, or an app. They are out of scope by decision.
- Do not touch the schema without a written migration and a one-line reason.
- Do not put a feature behind a flag and leave it half-built. Ship it or cut it.

## 8. How we will judge the work

| Week | Review |
|---|---|
| End of week 1 | Staging URL exists and is clickable |
| Weekly, Friday | You demonstrate the milestone; we tick the backlog acceptance criteria, not your description |
| Before each payment | The milestone's exit condition is demonstrably true on staging |
| Final | We follow your runbook with you watching, and nothing breaks |

## 9. Commercial terms

- **IP assignment:** all code and assets transfer to the company on payment. No licence-and-hold.
- **Repository:** company-owned from day one. You get access, not ownership.
- **Handover:** the repo must be buildable by a third party from the README alone. If it is not,
  the final payment is withheld until it is.
- **Warranty:** 30 days of bug fixes at no cost after launch.

## 10. The first question we will ask you

> A customer orders three items from two sellers and pays by Orange Money. Walk us through every
> ledger entry from payment capture to the Friday payout. Then tell us what happens if the delivery
> fails and the customer wants a refund instead of a redelivery.

Answer that well and the rest is detail.
