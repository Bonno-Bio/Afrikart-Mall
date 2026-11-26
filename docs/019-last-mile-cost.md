# 019 — The drop costs P123. The fee pays P26.

**Date:** 25 November 2026
**Tests:** 154 passing (was 144)
**Supabase:** `b5h_last_mile` — **50 tables**, 8 views, RLS **50/50**, 0 public grants; account **2040 Rider payable** added.

---

## 1. What `docs/018` could not say, and this can

The profitability report was honest about its own hole: the delivery fee was posted as revenue and no cost ever followed it, so every `netMarginMinor` was an upper bound and `deliveryMarginMinor` was `null`. Two costs were missing — last mile, and the payment provider's fee, which was posted against the *payment* rather than the order and therefore never reached an order's margin.

Both now post where they belong. The report was not modified to accommodate them: it reads `5010` and `5020` from the ledger, so it saw them the moment they existed. That is the test of whether the design was right.

## 2. The unit of cost is the trip, not the parcel

A rider is paid for the day whether the eleventh drop happens or not, and fuel is bought by the litre. So cost is captured per **run** — one rider, one route, one day — and divided across the drops that actually rode on it:

```
Dr 5010 Courier and last mile   (this order's share)
Cr 2040 Rider payable           (earned, not yet paid)
```

Decisions worth naming:

- **Per drop, equally.** It is the only basis a route plan can be judged on, and it makes a long route look expensive in exactly the way it is. Weight-based allocation would flatter a route carrying three nappy packs.
- **The remainder is distributed, not dropped.** P370 across 3 drops is P123.34 / P123.33 / P123.33. Rounding that leaves three thebe unallocated is how a ledger slowly stops tying out.
- **A run with no drops cannot be closed** (`NO_DROPS`), and a run with no cost cannot be closed either (`RUN_HAS_NO_COST`). Dividing by zero drops is how a cost disappears, and a cost that disappears is worse than one that is late.
- **Closing twice is refused** (`RUN_CLOSED`), and `last_mile_allocations.order_id` is unique: an order cannot be charged for two runs, so a second run on the same day finds no uncosted drops rather than double-charging the customer.

## 3. The number, on a live instance

Three orders delivered, then one run closed:

```
RUN      P250 rider pay + P120 fuel = P370, 3 drops
         AK-26001 P123.34 · AK-26002 P123.33 · AK-26003 P123.33
PAYABLE  P370 owed to Dineo Mothusi
LEDGER   debit = credit = 5,371,645
```

| | before the run | after |
|---|---|---|
| goods margin (all orders) | **+P104.25** | **−P265.75** |
| AK-26001 (bulky) | +P52.48 | **−P70.86** |
| AK-26002 (small) | +P21.93 | **−P101.40** |
| AK-26003 (bulky) | +P35.79 | **−P93.49** |

**Every order in the pilot is loss-making once the trip is paid for.** The delivery fee is P30 gross (P26.32 net) for an order under the threshold, and nothing at all over it; the drop costs P123.33 on a three-drop day. `feeCoversDrop: false`, and `deliveryMarginMinor = −P317.36` on P52.64 of delivery revenue.

## 4. The nuance that matters: it is a utilisation problem

P123.33 per drop is not a fact about riders. It is P370 divided by three. The same run at the seeded route's capacity of **22 drops** costs **P16.82 per drop** against P26.32 of net fee — a full route is roughly P9.50 per drop to the good.

So the finding is not "delivery is unprofitable". It is:

> **The delivery fee was priced for a full route.** At three drops it loses P97 a drop; at twenty-two it makes about P9.50. Every order in between is a route that has not filled, and nothing in the pricing distinguishes the two.

Three consequences worth putting to the owner:

1. **Free delivery over P250 raises basket size and not drop density.** It makes each parcel bigger and each route emptier, which is why the pilot reads −P97 a drop. A minimum-order or a per-trip charge does the opposite.
2. **A partially loaded route should be visible before it runs.** `route_load` already counts drops, grams and millilitres per route-day; joining it to a run's cost would turn "should this route go out today?" into arithmetic instead of instinct. That is the next small increment.
3. **A per-drop fee of P30 gross only works above roughly 12 drops.** Below that the trip is a subsidy. If the pilot cannot reliably fill a route, the honest model is a delivery charge that reflects the trip, not the basket.

## 5. Where the payment fee went

`capturePayment` previously posted the provider's fee inside the capture transaction, tagged `ref_type = 'payment'` — correct accounting, invisible to any per-order report. It is now its own posting, tagged to the order, inside the same database transaction:

```
Dr 5020 Payment processing fees / Cr 1020 PSP receivable
```

`POST /api/ops/orders/:number/psp-fee` records a fee that arrives later in a settlement file. A fee of zero or a fraction of a thebe is refused: settlement files produce both, and neither should reach a ledger.

An order therefore appears in the margin report the moment it has *any* attributed posting — a P9 fee on an undelivered order shows as revenue nil, cost P9, margin −P9. That is correct and worth knowing: the report does not wait for a delivery to tell the truth about a cost.

## 6. What is still missing

1. **Rider payouts are recorded, not transferred.** 2040 shows what is owed; paying a rider clears it through a route that does not exist yet.
2. **No fuel or maintenance model** — fuel is a per-run figure typed in, not derived from distance.
3. **No failed-drop accounting.** A failed attempt still costs a trip and currently allocates only to delivered orders; failed drops are invisible to the run's cost per drop, which flatters the number.
4. **No utilisation view.** The P16.82-vs-P123.33 comparison above was arithmetic, not a screen.
5. **PSP fees are per order, not reconciled.** Nothing checks the sum of recorded fees against the provider's monthly statement.

## 7. Where the pilot stands

| Item | State |
|---|---|
| Authentication, SMS (no vendor), import, stocktake, shrinkage, packaging | built |
| Per-order P&L | built |
| **Last-mile cost per order** | **built — and it says the delivery fee only works on a full route** |
| **PSP fee per order** | **built; needs reconciliation against a real statement** |
| Route utilisation before dispatch | **next small increment** |
| Cold-chain surcharge | decision required (AFR-51) |
| Delivery fee: per trip or per basket | **decision required — the numbers are now in front of you** |

Three increments have now ended the same way. B5f said the box was missing from the fee. B5g said the books were missing the rider. B5h says the rider costs P123 a drop and the fee was priced for a route that is full. The engineering has stopped being the constraint; what remains is a set of pricing decisions that only the owner can make, now with the numbers attached.
