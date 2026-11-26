# 018 — The order's own P&L, and the two costs it admits are missing

**Date:** 25 November 2026
**Tests:** 144 passing (was 130)
**Supabase:** `b5g_order_margins` — 48 tables, 8 views, RLS **48/48**, 0 public grants.

---

## 1. It is a `group by`, not a second opinion

Every delivery, refund, cost of goods and box has been posted against its order with `ref_type = 'order'` since the modules that created them were written. So the per-order P&L does not compute anything new: it reads the ledger back in the shape an owner asks for.

That matters because the alternative — recomputing a margin from the catalogue, the fee schedule and the packaging recipe — is a second opinion, and second opinions drift. The report and the books can only disagree here if the query is wrong, which is why `tieOut` exists.

**Two margins, deliberately:**

| Field | Means |
|---|---|
| `goodsMarginMinor` | commission + fulfilment + COD fee − goods − box − payment fee − refund write-offs |
| `netMarginMinor` | the same, plus the delivery fee, less any posted last-mile cost |

`goodsMarginMinor` is the number an order has to clear on its own merits: did our fees pay for what the order cost us? `netMarginMinor` is the whole order, and it carries a caveat (below) that prevents it being read as profit.

## 2. What the pilot says, on a live instance

```
AK-26001  bulky  2 packs nappies   fees 5843  box 595  cogs 0  goods 5248  net 5248
AK-26002  small  1 bottle          fees 2348  box 155  cogs 0  goods 2193  net 4825
summary   margin 91%   packaging = 100% of attributed cost   tieOut: true
ledger    debit = credit = 5,308,050
```

A 91% margin. It is not a lie, and it is not profit — and the report says why in the same object:

- **`cogsMinor` is zero on every order**, because all seeded stock is consigned. We never paid for the goods, so there is nothing to subtract. That is true of the pilot's stock model and false of the business's future.
- **`lastMileMinor` is zero on every order**, because nothing posts a rider's cost against an order. The P30 delivery fee is recorded as revenue and no cost follows it. `deliveryUncosted: true` marks those orders, `summary.deliveryUncostedMinor` totals the fee, and `deliveryMarginMinor` is **null** rather than a flattering number.

So `packagingShareOfCostBps = 10000`: the only cost the books currently attribute to an order is cardboard. That is not a flaw in the report; it is the report telling the truth about the ledger's completeness.

## 3. The cold-chain order, in the report

A single cold-chain bottle (P24.35 of insulated bag and gel pack) is **loss-making on its fees alone** — `goodsMarginMinor < 0` — and it appears in `summary.lossMaking` by order number, not as a negative average. The delivery fee does not rescue the argument: counting it would be counting revenue whose rider cost is missing, so it is left out of the test that decides whether the order paid for itself.

`byParcelClass` ranks classes worst-first, so the report opens on the category that is leaking money rather than on the total.

## 4. Costs that belong to no order

A bank charge, a stocktake shrinkage: real costs, no order to hang them on. They are reported as `unattributed` per account and **never divided across orders**. Averaging them into per-order margins would make every order look slightly worse and the actual problem invisible.

`tieOut.reconciles` is the proof that the split is complete:

```
orders + unattributed = ledger, account by account
```

Nine accounts are checked. If one fails, the report is a guess with a header row, and the flag says so.

## 5. Same arithmetic in SQL

`order_margins` is a view with identical columns, so anyone querying Supabase directly gets the same numbers without reimplementing them. A test asserts the view and the module agree to the cent on the same database — the cheapest possible guard against two implementations drifting apart.

## 6. What is still missing

1. **Last-mile cost per order.** The single biggest gap: rider pay, fuel and route cost are not posted against orders, so `5010` is empty and every `netMarginMinor` is an upper bound. Until this exists, the profitability report is a fee-coverage report, not a profit statement — and it says so every time it is called.
2. **Consignment goods have no cost to us, and that is real** — but the moment the shop buys its own stock, `cogsMinor` becomes the dominant number and every margin halves. The report will not flinch; the pricing plan might.
3. **No PSP fees posted per order.** `5020` is used by nothing, so card orders look cheaper than they are. Same shape of gap as last mile.
4. **No period-over-period comparison**, no COGS-to-fees ratio trend, no per-route profitability (route cost is not modelled).
5. **Refund write-offs** (`5040`) are wired but nothing posts to it; refunds currently reverse the revenue accounts directly, which is correct, and leaves 5040 unused.

## 7. Where the pilot stands

| Item | State |
|---|---|
| Authentication | built |
| SMS delivery | built; **vendor account still to buy** (AFR-49) |
| Bulk import, stocktake, shrinkage, packaging | built |
| **Per-order P&L** | **built — and it says the books are missing rider cost and PSP fees** |
| Cold-chain surcharge | **decision required, not code** (AFR-51) |
| Last-mile cost per order | **the next honest increment** |
| Reprice or drop PAM-BDP-M46 | open — supplier conversation |

Two increments in a row (packaging, then the order P&L) have ended with the same sentence: the system knows something the pricing does not. That is worth reading as the pattern it is. The engineering is no longer the bottleneck; the decisions about fees, riders and cold chain are.
