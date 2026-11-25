# 010 — B2 The Shelf: build report

**Date:** 25 November 2026
**Commit:** `cd2d926` on `arena/b9ad95dd-afrikart-mall`
**Tests:** 64 passing (was 51)
**Supabase:** schema advanced by four migrations (`b2_shelf_ownership_and_consignment`, `b2_consignment_stock_view`, `b2_revoke_consignment_view_grants`, plus the earlier B1 set). 39 tables, 7 views, 20 accounts, 0 grants to `anon`/`authenticated` on our schema.

---

## 1. The finding that changed the phase

B2 was meant to add landed cost and cost of goods. The first honest run of it produced this:

```
order AK-26001 delivered
  commission 39.79  fulfilment 19.89  delivery 30.00   kept 89.68
  cogs 288.54
  gross margin −198.86
```

Every sale lost money. The code was doing exactly what it was told; the *model* was wrong. The seed had Afrikart buying stock from a supplier **and** crediting a seller payable on the same sale. Those two facts cannot both be true: either we own the goods (and there is no seller to pay), or the seller owns the goods (and the goods are never our cost of sales).

The pilot is a **marketplace**: the seller owns the goods, we hold them, sell them, deliver them, keep commission and fulfilment, and pay the seller. So the stock on our shelf is **consignment**. It is counted, priced, and reported — and it is **not an asset on our balance sheet**, because it is not ours. Counting it as one inflates the company and makes every ratio a lie.

That decision is now in the schema, not in a comment:

- `product_variants.ownership` — `seller` | `afrikart`
- `purchase_orders.inventory_owner` — `seller` | `afrikart`
- `consignment_stock_value` — a view that values stock we hold but do not own, deliberately kept off the balance sheet

A receipt of `seller` stock moves quantities and no money. A receipt of `afrikart` stock debits Inventory 1100 and credits Bank 1010. A delivered `seller` line posts no COGS and reports the seller's cost beside our margin. A delivered `afrikart` line posts COGS and takes the value out of inventory. Same code path, one word of difference, both correct.

**What B1's reports were hiding:** B1 could not compute cost of sale at all. Every margin it showed was a ceiling. That is now closed for owned stock, and for consignment the number is explicitly labelled as the seller's cost rather than quietly omitted.

---

## 2. What B2 actually does

**Landed cost is derived, never typed.** It is the weighted average of what was actually received, with the purchase order's freight and duty allocated across lines by value, using largest-remainder so the thebes sum to exactly what was paid. A number a human can edit is a number that will eventually be edited to make a margin look better.

**Receiving is one transaction.** Quantities, the movement trail, the on-hand cache, the order status and the ledger — or none of it. The same delivery cannot be received twice (`PO_ALREADY_RECEIVED`), and a draft order cannot be received at all.

**A product with no cost basis cannot go live.** `UNCOSTED_SKU`. The check exists because the alternative is a sale that books revenue with no cost against it — which is precisely the accounting lie this phase was built to prevent. Three more checks sit beside it: no photograph, no listing (`NO_IMAGE`); a licensed category without its certificate (`COMPLIANCE_UNVERIFIED`); an Express listing without weight and volume (`EXPRESS_NEEDS_DIMENSIONS`).

**The public catalogue is a different shape from the ops shelf.** `GET /api/catalogue` returns no cost, no stock number, no seller contact — a public endpoint that leaks landed cost hands a competitor the entire margin structure in one request.

### The live shelf (real numbers, not illustrations)

| SKU | Price | Landed cost | Margin | Margin % | On hand | Owner |
|---|---|---|---|---|---|---|
| NAN-OP3-400 | 189.00 | 144.27 | 44.73 | 23.7% | 40 | seller |
| PAM-BDP-M46 | 215.00 | 170.03 | 44.97 | 20.9% | 30 | seller |
| NIV-BGL-200 | 98.00 | 72.14 | 25.86 | 26.4% | 60 | seller |

Consignment stock held: **P15,200.10**. Inventory on our balance sheet: **P0.00**.

### The delivered order, restated honestly

AK-26001: customer paid P423.00 (2 × formula + delivery). We kept P99.16 (commission 39.79 + fulfilment 19.89 + net delivery 26.32 + cash handling 13.16). The goods cost the **seller** P288.54. Our gross margin: **P99.16**, before last mile and paying the rider. Trial balance: balanced at P50,423.00.

That is a real margin, and it is the first one this company has been able to compute.

---

## 3. Inventory value and why it is P0.00

A reader may reasonably expect a shop with 130 units on the shelf to show inventory. It does not, and that is correct: none of those units were paid for by Afrikart. The moment a 1P SKU is bought (`ownership = afrikart`), inventory appears, COGS posts on delivery and the value leaves the balance sheet — there is a test that does exactly this (`delivering stock we bought posts cost of goods and moves it out of inventory`).

---

## 4. What B2 does not do

1. **No seller payouts.** `seller_payable` still accumulates; nobody is paid yet (AFR-42).
2. **No authentication.** `x-user-id` is still trusted in development; the ops surface is fenced, not secured (AFR-41).
3. **No supplier credit.** Receiving owned stock credits Bank, because the chart has no supplier-payable account. Buying on terms needs one account and one function to change.
4. **No stock counts.** `inventory_movements` supports `adjusted`, but there is no stocktake workflow that reconciles a physical count against the book.
5. **No packaging cost.** 5030 exists and is unused; fulfilment revenue is currently costed at zero.
6. **No bulk import.** Ten SKUs are loaded by seed and by API, not by a spreadsheet an operator can fill in.
7. **No printing, no barcodes, no bin walk ordering** beyond a sequence number.

The suite still runs on embedded Postgres. The Supabase copy is verified structurally — 39 tables, 7 views, RLS on all 39, zero public grants, the new view `security_invoker` — not by running the 64 tests against it.

---

## 5. One trap worth recording

Creating a view in Supabase **auto-grants** it to `anon` and `authenticated`. The new `consignment_stock_value` view arrived with `DELETE, INSERT, SELECT, TRUNCATE, UPDATE` granted to both roles. The revoke is a migration of its own (`b2_revoke_consignment_view_grants`), and the rule is now: **a view is not finished until its grants have been revoked and re-checked.** This is the second time this project has hit it; that is why it is written down twice.

---

## 6. Where this leaves Route One

B2 closes the shelf, not the shop: a customer still cannot browse, and nobody can be paid. The calendar says B3 (The Route) starts 16 December; the honest position is that B2's remaining gaps — payouts, stocktake, bulk import — matter more to a pilot than route optimisation does for ten SKUs in one suburb.

Next, in order:

1. **Seller payouts** (AFR-42) — a marketplace that never pays its sellers is a shop with extra steps.
2. **Authentication** (AFR-41) before a stranger is allowed to order.
3. **Bulk import** — ten SKUs via seed is a demo; 40 SKUs via API is a chore that will produce typos at 11pm.
4. **Stocktake** — the count that keeps `on_hand` from drifting into fiction.
5. **Packaging cost** on fulfilment, so the P19.89 is not quietly all margin.
