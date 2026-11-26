# 020 — Fifteen drops, or don't send the scooter

**Date:** 25 November 2026
**Tests:** 164 passing (was 154)
**Supabase:** `b5i_run_rate_card` — **51 tables**, 8 views, RLS **51/51**, 0 public grants.

---

## 1. From arithmetic to a report

`docs/019` ended with a comparison a person had to do by hand: P370 a run over three drops is P123 a drop; over the route's twenty-two it is P16.82. That was the most important sentence in the document, and it depended on someone doing long division at the right moment.

`GET /api/ops/dispatch?date=YYYY-MM-DD` is that comparison as a report. Every active route with work scheduled is priced before it leaves the yard:

| Field | Meaning |
|---|---|
| `plannedCostMinor` | the trip — the rate card for the route's vehicle class, or the **actual cost of a run already opened** for that day, because a real number beats an estimate |
| `netFeeMinor` | the delivery fees the trip would collect, VAT excluded |
| `perDropMinor` | `plannedCost / scheduledDrops` — what this trip costs per parcel |
| `perDropAtCapacityMinor` | the same at full capacity — the number that separates "delivery loses money" from "this route is empty" |
| `breakEvenDrops` | how many **paying** drops the trip needs before the fees cover it |
| `verdict` | `go`, `thin`, or `hold` |

A free-delivery order adds a drop and a parcel but no fee, so it is excluded from the average and counted in `freeDrops`. Averaging it in would quietly raise the break-even and hide the reason.

## 2. The number, on a live instance

Rate card (seeded, per vehicle class):

```
scooter  P250 pay + P120 fuel = P370
car      P320 + P180 = P500
bakkie   P380 + P260 = P640
van      P450 + P320 = P770
```

Same route, same scooter, two different days:

| | 15 drops | 3 drops |
|---|---|---|
| cost per drop | **P24.66** | **P123.33** |
| delivery fees (net) | P394.74 | P78.95 |
| margin | **+P24.74** | **−P291.05** |
| break-even drops | 15 | 15 |
| verdict | **`go`** | **`thin`** |

**Break-even is fifteen paying drops out of a capacity of twenty-two** — 68% utilisation — for a scooter trip paid at P250 plus P120 of fuel. At fifteen drops the trip earns P24.74 and no more. That is the whole margin on a day's delivery: less than the price of one nappy pack.

This is the number to put next to the delivery fee decision. Free delivery over P250 empties routes: it makes parcels larger, which fills the scooter's litres before it fills its drop count, and the drops are what pay for the trip. A route can be *full by volume* at eight drops — P46.25 a drop, still underwater.

## 3. Decisions the report encodes

- **Cost from the rate card, corrected by reality.** Until a run is opened, the trip is priced from `run_rate_card`. The moment one exists, the plan uses its actual pay and fuel. Dispatch is planning, not accounting; the ledger still only sees closed runs.
- **Paying drops only.** `breakEvenDrops = ceil(cost / average net fee per paying drop)`.
- **Capacity is a hard stop, not an opinion.** Over `daily_capacity`, `max_weight_grams` or `max_volume_ml` is a `hold` regardless of the money — `money does not make a scooter carry 17 kg`.
- **Load is counted once per order.** The join uses a lateral subquery so a three-line order does not multiply its own weight by three. An aggregate that fans out is a silent lie, and this codebase has been bitten by that before.
- **VAT is apportioned on the total.** P90 of fees is P78.95 net, not 3 × P26.32 = P78.96. Rounding each order and adding drifts by a thebe; the report does it once.

## 4. What this changes about the plan

1. **A dispatch decision is now arithmetic.** `thin` and `hold` list route names, and the plan opens on the worst-margin route, because the report should open on the problem.
2. **The break-even is a sales target, not an operating one.** 15 of 22 drops is a fill rate the pilot has to hit on ordinary days, not best days. That number belongs in the route plan next to the capacity.
3. **Vehicle class matters.** The same 15 drops on a van (P770) needs 30 drops — more than any seeded route's capacity. A van route must therefore be a *multi-route* trip or it cannot pay for itself. That is worth knowing before buying a van.
4. **`freeDrops` is the lever nobody is looking at.** It is the only field in the report that is entirely under the shop's control, and it moves the break-even in the wrong direction.

## 5. What is still missing

1. **No day-close.** The plan prices a day; nothing reconciles the plan against the run that actually went out (drops promised vs delivered vs costed).
2. **No failed-drop cost.** A failed attempt still costs a trip and is invisible to both the plan and the run's cost per drop.
3. **Rate card is one row per vehicle class** — no per-rider or per-route override, no fuel price tracking, no date effect.
4. **No multi-route trips.** A rider doing two routes in a day is two runs with two full costs, which over-prices the second.
5. **No capacity reservation.** `route_load` counts what is booked; checkout refuses past capacity, but nothing holds a slot while a customer hesitates.

## 6. Where the pilot stands

| Item | State |
|---|---|
| Authentication, SMS (no vendor), import, stocktake, shrinkage, packaging | built |
| Per-order P&L, last-mile cost, PSP fees | built |
| **Dispatch plan: is this route worth sending?** | **built — break-even is 15 of 22 drops** |
| Cold-chain surcharge | decision required (AFR-51) |
| Delivery fee: per trip or per basket | **decision required — 15 drops, 68% fill** |
| Route utilisation at day close (plan vs actual) | next increment |

Four increments have now produced the same shape of answer. B5f: the box was missing from the fee. B5g: the books were missing the rider. B5h: the rider costs P123 a drop on a three-drop day. B5i: it takes fifteen paying drops to pay for one, and free delivery works against that. None of these are engineering problems any more. Each of them is a price that was set before anyone could measure it — and now it can be measured, on any morning, before the scooter leaves.
