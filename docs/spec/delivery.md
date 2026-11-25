# Delivery Specification

**Read this before P5.** Delivery is not a feature of Afrikart. It is the product, the moat and the
largest variable cost. Everything else — catalogue, checkout, seller portal — exists to feed it.

**Status of this document:** delivery is already modelled in `db/schema.sql`, contracted in
`spec/api-contract.md`, and broken into stories `M4-01`→`M4-06`. This document is the single reference
that ties those three together and specifies the parts that were only implied.

---

## 1. Why this is the moat and not a cost line

Two numbers justify the entire company:

| | Owned rider, batched | Per-parcel courier |
|---|---|---|
| Cost per drop, Gaborone | **P16–18** | **P60–80** |

A P30 delivery fee is a loss at P70 a drop and a contributor at P18 — and **P18 is only true above
about 18 drops a day.** At five drops it is P64 and the fee loses P34 a parcel. The density curve in
`002` §3.1 is the number to hold in your head, not the constant.

The business case in `000` depends
entirely on batched density, which is why **the route, not the order, is the unit of success**
(`002` §3.1) and why the schema ships a `route_weekly_pnl` view.

**We do not pretend delivery is profitable on its own.** Above P400 it is free, and we fund it from the
basket. That is a deliberate trade: free delivery is a marketing cost paid for by basket size. The
metric that proves it is contribution **per route per week**, not margin per delivery.

---

## 2. The service matrix

| ID | Service | Price | Promise | Available | Fulfilled by |
|---|---|---|---|---|---|
| `express` | Afrikart Express | P30, free over P400 | **Tomorrow, 08:00–13:00** | Gaborone, Tlokweng, Mogoditshane | Our own rider, our own route |
| `standard` | Standard courier | P20 | 2 working days (local) | Nationwide | Sprint / Aramex, tracked |
| `pickup` | Collect at a pickup point | P10 | Tomorrow after 14:00 (local) | 16 points (9 Gaborone, 7 upcountry) | Partner shop, ID + OTP collection |
| `intercity` | Intercity combi | P45 | 2–4 working days | Villages off the courier grid | Combi/bus network, driver calls on arrival |
| `cod` | *Modifier, not a service* | +P15 | — | Gaborone, Tlokweng, Mogoditshane **only** | Rider collects cash |

**Three rules baked into the rules engine (server-side, never the client):**

1. `express` is offered only inside the zone. The quote engine refuses it outside, it does not silently
   downgrade.
2. `cod` outside the zone returns `422 COD_NOT_AVAILABLE`, never a quiet fallback to prepaid.
3. Intercity is offered only for items whose margin survives a P45 parcel. The quote engine filters by
   parcel value, not by what the customer wishes.

**Why we promise a day and not a slot:** a time window we cannot hold is worse than a day we can. A
2-hour slot creates a failed drop every time traffic or a gate number defeats us. We will earn the right
to promise windows when first-attempt success is above 93%.

---

## 3. The state machine

Every delivery is a record with a state, and **every transition writes an event**. There is no state
change without an audit row.

```
                    ┌──────────┐
                    │ pending  │  order paid, not yet picked
                    └────┬─────┘
                         │ ops assigns route + rider
                    ┌────▼─────┐
                    │ assigned │  on today's route sheet
                    └────┬─────┘
                         │ rider starts the route
                 ┌───────▼────────────┐
                 │  out_for_delivery  │
                 └───┬────────────┬───┘
        delivered    │            │   failed (reason code REQUIRED)
              ┌──────▼─────┐  ┌───▼──────────────┐
              │ delivered  │  │      failed      │
              └──────┬─────┘  └───┬──────────┬───┘
                     │            │          │
        customer     │      reschedule   return to hub
        keeps it     │            │          │
              ┌──────▼─────┐ ┌────▼───────┐ ┌▼──────────────┐
              │  (closed)  │ │rescheduled │ │returned_to_hub│
              └────────────┘ └────┬───────┘ └───────┬───────┘
                                   │                 │
                              next route        refund or
                                                restock
```

| From | To | Actor | Side effects |
|---|---|---|---|
| `pending` | `assigned` | ops (or auto) | Route sheet regenerated; rider notified |
| `assigned` | `out_for_delivery` | rider | Customer notified on WhatsApp; ETA published |
| `out_for_delivery` | `delivered` | rider | **Proof photo required**; cash captured; order → delivered; seller payable becomes releasable; review invite queued |
| `out_for_delivery` | `failed` | rider | **Reason code mandatory** (DB constraint); attempt_count += 1; order stays open |
| `failed` | `rescheduled` | ops or customer | Next available route; customer notified with the new day |
| `failed` | `returned_to_hub` | ops | Stock decision: restock, damaged, or refund |
| `rescheduled` | `out_for_delivery` | rider | — |

**Two transitions are forbidden outright:**
- `delivered` → anything. A completed delivery is a fact; corrections are a return, not a state change.
- `failed` without a reason code. Enforced by `constraint failed_needs_reason` in the database.

---

## 4. The failure taxonomy, and what happens automatically

This table is the most valuable operational asset the company will own. It is why `delivery.failed` is
one of the three analytics events that matter.

| Code | Meaning | Customer message (automatic) | Next action | Who bears the cost |
|---|---|---|---|---|
| `NO_ANSWER` | Phone not answered at the door | "We missed you. Rebook for tomorrow?" | Auto-reschedule offer, 1 attempt free | Afrikart |
| `NOT_HOME` | Nobody present | Same | Auto-reschedule, 1 attempt free | Afrikart |
| `WRONG_ADDRESS` | Address could not be found | "We couldn't find the address. Send a pin or landmark?" | Ops calls within 2h | Afrikart |
| `NO_LANDMARK` | No gate number / landmark | Same | Ops calls; address flagged for review | Afrikart |
| `REFUSED` | Customer refused the item | "Refund started. Nothing to send back." | Return to hub, refund in 48h | Afrikart (recovered from seller if at fault) |
| `NO_CASH` | Customer could not pay COD | "Pay now by Orange Money and we'll redeliver?" | Payment link sent; 1 reattempt | **Customer** |
| `DAMAGED` | Damaged in transit | "Sorry. Replacement sent, no need to return." | Restock claim, seller chargeback | Afrikart / seller |
| `WRONG_ITEM` | Wrong item packed | "We sent the wrong item. Replacement out today." | Pick error logged against picker | Afrikart |
| `WEATHER` | Route blocked | "Delivery moved to tomorrow due to rain." | Bulk reschedule | Afrikart |

**The rule behind the table:** a reason code without an automatic next action is a data point that
costs the customer a day. Every code above has a scripted response that fires without a human deciding.

**What we do with the codes after 90 days:** rank them by frequency × cost. Fix the top one. Then the
next. That single discipline is worth more than any marketing campaign, because it is the only thing
that moves first-attempt success, which is the only thing that makes the unit economics work.

---

## 5. The routing model

Density is everything, and density is a design decision, not an outcome.

| Rule | Why |
|---|---|
| **One route per suburb-cluster per day** | Ten drops in Extension 12 cost almost nothing extra; ten spread across Gaborone cost a full day |
| **Routes are named, not drawn by an algorithm** | `Gaborone West 1` is a human object a rider and a support agent can both reason about |
| **Batching is by day, not by slot** | Predictable batching is what creates the P18 drop; slots destroy batching |
| **Capacity is 18–22 drops per route per day** | Above that, first-attempt success falls and the route takes 11 hours |
| **Capacity is three numbers, not one** | Drops, weight and volume. A route of formula nappies hits its physical limit at 9–11 drops on a scooter, long before it hits the drop limit |
| **A parcel that does not fit is not a parcel** | Bulky lines get a bakkie day; small parcels share a scooter day. This is how a P18 drop survives a case of formula |
| **A new route opens only when the existing one is above 85% capacity for two weeks** | Opening early splits density and doubles cost per drop |
| **No route optimisation software until 6 routes** | Manual routing is correct at 2 routes; algorithms are a Phase 11 problem |

**The density maths.** Contribution per drop = fee collected + basket margin share − P18 − P15 pick/pack
− PSP − returns. At 20 drops/day the route covers its rider, its fuel and a share of the warehouse. At
8 drops/day it covers nothing. **The break-even is roughly 21 orders/day across the city** — which is
why `model/afrikart-unit-economics.xlsx` and this document must always agree.

### 5.1 The three capacities (`routes`)

| Constraint | Column | Scooter | Car | Bakkie |
|---|---|---|---|---|
| Drops | `daily_capacity` | 22 | 22 | 26 |
| Weight | `max_weight_grams` | 40,000 (40 kg) | 120,000 | 500,000 |
| Volume | `max_volume_ml` | 80,000 (80 L) | 300,000 | 1,500,000 |

`route_load` (view) sums promised drops, grams and millilitres per route per day from live orders.
**The pack screen refuses to load a route past any of the three**, and the failure is a *scheduling*
failure, not an exception: the order moves to the next route-day or to a larger vehicle. Products carry
`weight_grams`, `volume_ml` and `parcel_class` (`small` / `bulky` / `fragile` / `cold`), and a product
without both numbers cannot be listed as Express.

Why this matters more than it looks: our wedge is infant formula and nappies, which are the two densest
consumer products sold. **A drops-only capacity model would have us promise 22 deliveries and fail at 9**,
then blame the rider.

### 5.2 Addresses are graded, not assumed

There is no residential postal system here (`007` H1). What we have is a plot number, a landmark and
sometimes a pin. So address quality is a stored property, and it gates the promise:

| `address_confidence` | What it means | Can promise Express? |
|---|---|---|
| `verified` | A rider has delivered here and corrected the record | Yes |
| `pin_and_landmark` | Pin dropped by the customer **and** a landmark described | Yes |
| `pin_only` | Pin only — pins are often dropped at the gate of the estate | Yes, with a call first |
| `landmark_only` | "Behind the Total filling station" — routable but ambiguous | **No** — marketplace estimate, phone before dispatch |
| `unverified` | Free text | **No** — call and grade before dispatch |

Every failed drop with `NO_LANDMARK` or `WRONG_ADDRESS` writes back to the address record and to the
**landmark dictionary** (`landmarks` table, per suburb, with aliases). That dictionary is a company asset
in a way that a route-optimisation algorithm is not: it is the local knowledge that makes a stranger able
to deliver, and it is what lets us hire rider number four.

**Target:** ≥70% of active addresses at `pin_and_landmark` or better by G1; failed drops attributable to
address quality below 15% of all failures.

---

## 6. The rider flow, step by step

1. **07:00** — opens the PWA. Today's route loads **from cache if there is no signal** (Botswana
   connectivity is not guaranteed; this is a hard requirement, story `M4-02`).
2. **07:15** — collects parcels. Scans each one. A mis-scan blocks route start.
3. **07:30** — cash float issued and recorded against the rider. Float limit is enforced in the schema.
4. **08:00** — starts the route. Customer 1 receives a WhatsApp: "Your order arrives this morning",
   with the rider's first name.
5. **At each stop** — taps **Call** or **Navigate by landmark**, not by street address. Addresses here
   are landmarks and plot numbers, and the schema stores `landmark` for exactly this.
6. **On success** — photo of the parcel at the door, cash entered if COD, one tap. Offline-tolerant:
   the action queues locally and syncs on reconnect.
7. **On failure** — reason code **required** (the button is disabled without it), one optional note.
8. **17:00** — closes the route. Expected cash is computed from the day's COD drops. Counts, enters,
   deposits within 24 hours. **A variance above the float limit blocks tomorrow's assignment.**

**What the rider never sees:** the customer's email, order history, other riders' stops, or any price
other than the cash they must collect today.

---

## 7. Cash control loop

COD is the riskiest thing this company does. Five controls, all enforced in code:

1. **Float limit per rider** (`riders.cash_float_limit_minor`) — a rider cannot be assigned more
   collectable value than the limit.
2. **Every Pula attributable** — `deliveries.cash_collected_minor` ties cash to an order, a rider and a
   date. Nothing is a rounding bucket.
3. **Daily reconciliation** — expected vs counted with a `variance_minor` generated column.
4. **Variance escalation** — a non-zero variance over the limit suspends assignment until resolved;
   the record stays forever.
5. **Deposit within 24 hours** — with a bank reference on the reconciliation row.

**Why COD is confined to Gaborone:** we can control it. A failed cash drop in Maun costs the trip twice
and we cannot recover it. Expanding COD is a decision for when first-attempt success is above 93%, not
before.

---

## 8. Integration map — where delivery touches everything else

Delivery is not a module. It is a dimension of the whole system. Twelve touchpoints:

| # | Touchpoint | Where it lives | What delivery does there |
|---|---|---|---|
| 1 | **Checkout quote** | `POST /checkout/quote` | Returns service options, prices, COD eligibility by city |
| 2 | **Order creation** | `orders`, `order_items` | Stores `delivery_method` and the fee; the order cannot be placed without a valid service for that address |
| 3 | **Inventory** | `inventory_movements` | Reserves on order; releases on cancel; restocks on return |
| 4 | **Payment** | `payments` | COD creates a receivable instead of a capture — a different accounting path entirely |
| 5 | **Ledger** | `ledger_entries` | Posts `5010 Courier and last mile` on completion; `1000 Cash on hand` on COD collection |
| 6 | **Seller payable** | `order_items.seller_payable_minor` | Becomes **releasable only on `delivered`** — not on payment. This is what protects the customer |
| 7 | **Payout run** | `seller_payouts`, `payout_items` | Excludes undelivered lines automatically |
| 8 | **Customer tracking** | `GET /orders/{number}` | Four-stage bar, timeline, proof photo |
| 9 | **Rider PWA** | `/rider/route`, `/rider/deliveries/{id}/attempt` | The only surface where state actually changes |
| 10 | **Support** | `/admin/customers?phone=` | "Where is my order" answered from the delivery record, not from guesswork |
| 11 | **Analytics** | `delivery.attempted`, `delivery.failed` | Reason-code Pareto drives the weekly fix |
| 12 | **Route P&L** | `route_weekly_pnl` | The number the founders run the business on |

**The integration that matters most is #6.** A seller is paid when the parcel is *delivered*, not when
the customer *pays*. That single rule is what makes returns a click instead of a negotiation, and it is
why the payout run must query deliveries, not payments.

---

## 9. What the customer sees, per state

| Delivery state | Tracking page shows |
|---|---|
| `pending` | "Packed at our Gaborone warehouse. Going out tomorrow." |
| `assigned` | "On tomorrow's Gaborone West route." |
| `out_for_delivery` | "Out for delivery. Sipho will call before arriving." |
| `delivered` | "Delivered at 10:42" + proof photo + "How was it?" review invite |
| `failed` | "We missed you — [reason]. Rebook for tomorrow?" with one-tap reschedule |
| `rescheduled` | "Moved to [date]. Nothing else needed from you." |

No jargon, no internal codes, and always exactly one next action.

---

## 10. Metrics and targets

| Metric | M3 | M6 | M12 | Owner |
|---|---|---|---|---|
| First-attempt success | 85% | 91% | 93% | Ops |
| Cost per drop | ≤ P24 | ≤ P22 | ≤ P18 | Ops |
| Drops per route hour | 3.5 | 4.5 | 5.0 | Ops |
| Drops per route per day | 14 | 18 | 22 | Ops |
| **Route load utilisation (drops / weight / volume)** | ≤ 85% | ≤ 85% | ≤ 85% | Ops |
| **Addresses at `pin_and_landmark` or better** | 50% | 60% | 70% | Ops |
| **Failures caused by address quality** | < 25% | < 20% | < 15% | Ops |
| Failure reason code coverage | 100% | 100% | 100% | Ops |
| Cash variance per day | ≤ P20 | 0 | 0 | Finance |
| Time from failed drop to customer message | < 15 min | < 5 min | < 5 min | Ops |
| Refund after `REFUSED`/`DAMAGED` | ≤ 72h | ≤ 48h | ≤ 48h | Support |

---

## 11. Built, specified, and still to come

| Capability | Schema | API contract | Prototype | To build |
|---|---|---|---|---|
| Service matrix and pricing | ✅ | ✅ | ✅ live at checkout | — |
| COD geo-fence (server-enforced) | ✅ | ✅ | ✅ live | — |
| Delivery records and state machine | ✅ | ✅ | ✅ seeded | `M4-03` |
| Failure taxonomy (9 codes) | ✅ | ✅ | ✅ seeded | `M4-03` |
| Proof of delivery | ✅ | ✅ | — | `M4-04` |
| Rider PWA with offline tolerance | ✅ | ✅ | ✅ **now clickable** | `M4-02` |
| Route sheets | ✅ | ✅ | ✅ **now clickable** | `M4-02` |
| Cash reconciliation and float limits | ✅ | ✅ | ✅ **now live in the demo** | `M4-05` |
| Customer tracking page | ✅ | ✅ | ✅ live | `M4-06` |
| Address grading + landmark dictionary | ✅ | ✅ (`address_confidence`) | — | `M0-07` (new) |
| Three-way route capacity (`route_load`) | ✅ | ✅ (`capacity_limited`) | — | `M4-07` (new) |
| Vehicle class per route | ✅ | — | — | `M4-07` (new) |
| Route weekly P&L | ✅ `route_weekly_pnl` | ✅ | — | `M6-03` |
| Multilingual rider UI (Setswana) | — | — | — | Post-launch |

---

## 12. The five things that will go wrong, and the pre-planned response

| What will happen | When | Response, decided in advance |
|---|---|---|
| Rider doesn't show, route unassigned at 07:00 | Month 2, guaranteed | Two trained relief riders; a documented route a relief can run cold |
| Signal drops mid-route, app freezes | Month 1 | Offline queue from day one (`M4-02`); never a "refresh to continue" |
| One suburb has a 30% failure rate | Month 2 | Reason-code Pareto identifies it as landmarks, not effort. Fix by calling ahead, not by blaming the rider |
| COD refusal spikes on a new SKU | Month 3 | COD cap on new SKUs until three successful prepaid orders prove the customer |
| A customer claims "never arrived" when proof exists | Month 4 | Proof photo + timestamp + rider confirmation. Refund anyway, then investigate. **We never argue with a customer over P300** |

---

*This specification is binding on the build. Any change to the service matrix, the state machine or the
failure taxonomy is a decision record, not a pull request.*
