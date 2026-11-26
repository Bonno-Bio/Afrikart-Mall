# 021 — The day that ends in a number, not a shrug

**Date:** 25 November 2026
**Tests:** 174 passing (was 164)
**Supabase:** `b5j_day_close` — **51 tables**, 8 views, RLS **51/51**, 0 public grants.

---

## 1. Two things were still untrue

`docs/020` priced the morning. It could not answer the evening, and it could not
see a failure at all.

1. **A failed attempt cost a trip and was invisible.** A rider goes to a gate,
   nobody answers, they come back. Fuel burnt, pay owed, nothing delivered. Before
   this increment there was no way to record that door, so the run's cost per drop
   divided a real trip by the three parcels that *did* land, and the four doors it
   actually cost stayed off the books.
2. **Nothing compared the plan with the day.** A route could be planned at fifteen
   drops, deliver nine, and no report would say the word "six".

Day close is the evening's answer to the morning's plan. It is one call:

```
GET /api/ops/dispatch/day-close?date=YYYY-MM-DD
```

## 2. A failed door is in the trip, not on a customer

The unit of last-mile cost is still the **run** (`docs/019`), but the divisor is
now **attempts**, not delivered drops:

```
cost of the trip = rider pay + fuel
per attempt      = cost / (delivered + failed)
a delivered order carries  per attempt
a failed attempt carries   per attempt → 5010 Last-mile unattributed, against the run
```

A door that nobody answered burned the same fuel as a door that did. It belongs in
the trip. It cannot be charged to a customer who received nothing, so its share
goes to `5010 — last mile, unattributed`, tagged to the run that spent it. The
cost is neither lost nor smeared across the households that did pay.

`POST /api/ops/orders/:number/failed-attempt` records it: a reason code
(`NO_ANSWER`, `NOT_HOME`, `WRONG_ADDRESS`, `NO_LANDMARK`, `REFUSED`, `NO_CASH`,
`DAMAGED`, `WRONG_ITEM`, `WEATHER`), an optional note and rider, and the order's
status becomes `failed`. It is repeatable — a third attempt is a third door — and
each one increments `attempt_count`, which is what makes the next metric honest.

## 3. Delivered is not the same as delivered first time

`recordDelivery` used to write `greatest(attempt_count, 1)`. A parcel that failed
twice and then arrived looked identical to one that worked first time. It now
writes `attempt_count + 1`, so:

- `attempts` on the run = delivered + failed doors, the honest divisor;
- `firstAttemptSuccessBps` = deliveries that needed no second trip / all
  deliveries. On the live day below it is **10000** (3 of 3 delivered first time)
  while **one of four doors failed** — two different facts, both true, no longer
  fused into one.

## 4. A drop belongs to the day it happened

Every dispatch and day-close date filter now uses the same rule:

```sql
coalesce(d.delivered_at::date, d.first_attempt_at::date, d.scheduled_date)
```

A parcel scheduled for tomorrow but delivered today is today's work. A parcel
scheduled for today that was refused today is today's failure. Yesterday's
unfinished work does not silently inflate today's plan, and today's plan shrinks
as the work is done rather than being re-invented at midnight.

## 5. A plan is what dispatch said, not what happened

`last_mile_runs.planned_drops` is captured when the run is opened. Day close reads
it back and reports two numbers side by side:

| Field | Meaning |
|---|---|
| `plannedDrops` / `plannedSource` | the snapshot at run open (`run_at_open`), or 0 with `none` when no run was opened |
| `currentWorkDrops` | the work that belongs to the day now |
| `varianceDrops` | `delivered + failed + stillOpen − plannedDrops`, or `null` when there was never a plan |

Recomputing the plan at close would be a description of history wearing the word
"planned". A run opened on an empty plate is still a statement — the plan said
zero — so a day that then carried four drops reads `plannedDrops 0`,
`varianceDrops 4`, and the discrepancy is visible instead of the plan quietly
growing to match the outcome.

A run opened for a rider but no route finds its route through that rider's work,
and says so: `routeSource` is `declared`, `inferred_from_work`, or `null`. A run
that cannot be tied to any route is reported in `summary.unroutedRuns` and blocks
the close — money with no home is not a clean day.

## 6. Closed is a fact, not a feeling

```js
closed =
  delivered + failed + runsOpened > 0 &&   // something happened
  discrepancies.length === 0 &&            // nothing is unexplained
  unclosedRuns === 0 &&                    // every run is shut
  stillOpen === 0 &&                       // nothing on the road
  uncostedDeliveries === 0;                // nothing delivered without a cost
```

An empty route is **empty**, not closed. A day with a discrepancy is **open**,
even if every run was shut — the open discrepancy is the reason. That distinction
is the whole point of the route: a tidy green tick on a day with an uncosted
parcel is worse than no report at all.

## 7. The live day

Four parcels of Pampers Baby-Dry M46, rider Dineo Mothusi, one scooter, Gaborone
West 1. Rate card says P370 for the trip (P250 rider + P120 fuel).

The run is opened before the parcels are put on the scooter:

```
RUN opened, planned 0        ← the plan said the rider was carrying nothing
DELIVER AK-26001 … AK-26003  → 3 doors, 3 first-attempt successes
FAILED  AK-26004  NO_ANSWER, gate locked, attempts 1
CLOSED  drops 3, attempts 4, total 37000
        perDropMinor 9250    ← P37 per door
        allocatedMinor 27750 ← what the three paying households carry
        unattributedMinor 9250 → 5010, against this run
DAY     plannedDrops 0 (run_at_open), currentWorkDrops 4,
        delivered 3, failed 1, attempts 4, varianceDrops 4,
        costedMinor 37000, unattributedMinor 9250,
        runsOpened 1, runsClosed 1, discrepancies [], closed true
SUMMARY firstAttemptSuccessBps 10000, open [], unroutedRuns []
MARGIN  goods −21171, tieOut reconciles, ledger balanced
```

P9.25 a door against P9.25 a drop: on a day with one failure the two numbers move
apart by exactly the failed share. Four doors on a P370 trip is **P92.50 a door**,
and the three customers who opened their gates carry P27.75 each of it.

## 8. What is still missing

1. **No route-level profitability.** Day close counts drops and cost; it does not
   add the gross margin of what those drops contained. "This route cost P370" and
   "this route earned P1,400" are two reports.
2. **No period trend.** One date at a time. There is no week, no "this route is
   getting worse".
3. **`5040` refund write-offs are still unused.** A failed drop's cost is
   unattributed; a *refused* parcel's goods still sit in the books until someone
   decides whether it is restocked or written off.
4. **No multi-route trips.** A rider doing two routes in a day is two runs with
   two full costs, which over-prices the second.
5. **`planned_drops` is a snapshot, not a commitment.** Nothing yet compares the
   snapshot against the *next* morning's, so a route that is always planned high
   and always delivers low still looks like four separate bad days.

## 9. Where the pilot stands

| Item | State |
|---|---|
| Authentication, SMS (no vendor), import, stocktake, shrinkage, packaging | built |
| Per-order P&L, last-mile cost, PSP fees | built |
| Dispatch plan: is this route worth sending? | built — break-even 15 of 22 drops |
| **Day close: did the day match the plan, and who pays for a failed door?** | **built — a failed door is costed to 5010, never to a customer** |
| Cold-chain surcharge | decision required (AFR-51) |
| Delivery fee: per trip or per basket | decision required — 15 drops, 68% fill |
| Route-level profitability and period trend | next increment |

Five increments have produced the same shape of answer. B5f: the box was missing
from the fee. B5g: the books were missing the rider. B5h: the rider costs P123 a
drop on a three-drop day. B5i: it takes fifteen paying drops to pay for one. B5j:
one unanswered gate turns a P92.50 trip into P27.75 of cost on each household that
did open — and the difference is now a line in the ledger rather than a shrug on
the way back to the yard.
