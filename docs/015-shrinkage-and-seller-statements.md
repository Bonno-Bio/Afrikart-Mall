# 015 — Who pays for stock that vanished (AFR-48)

**Date:** 25 November 2026
**Tests:** 112 passing (was 104)
**Supabase:** `b5d_shrinkage_incidents_and_compensation` — 42 tables, RLS **42/42**, 0 public grants.

---

## 1. The gap this closes

`docs/014` ended with an admission: the stocktake recorded a consignment shortfall and printed *report to seller statement*, and no statement line existed. The variance named a seller, and the seller was never told anything. That is the shape of a lie told by omission — the system appears to have handled it, and nobody downstream sees it.

There was also a second, quieter bug in the same area, and it is worth stating plainly because it survived two increments: **the statement's `reconciles` flag was wrong on any week with a refund.** It compared the paid lines against `net − refunds` when the correct check is against `net` itself, because a returned line's payable is already excluded from the paid lines. Every test that touched it used a week with no returns, so the flag was `true` only where it could not be false.

## 2. What replaced it

A shortfall on someone else's stock is now a **`stocktake_incidents` row**: the movement, the seller, the SKU, the units lost, the landed unit cost, the value, and — this is the point — a **decision field that starts `open`**.

```
COUNT    201  PAM-BDP-M46  Δ −3  posted 0  incident 3ba8f617…  raised as a stocktake incident
OPEN     200  1 open, P510.09 at risk
DECIDE   200  afrikart_compensates  compensation P510.09  posts P510.09
PAYOUT   201  gross 0  compensation 51009  net 51009  incidents 1
STATEMENT 200 reconciles true  0 + 51009 = 51009
```

The two honest answers, and why there is no third:

| Decision | Ledger | Why |
|---|---|---|
| `seller_absorbs` | **nothing** | the goods were never our asset; booking the loss would put a cost in our P&L that we never suffered. We are not their insurer, and we are not going to pretend we were robbed. |
| `afrikart_compensates` | **Dr 5080 / Cr 2010** | we decided the loss is ours — a forklift, a breakage, a careless pick. Then it is real, and the seller is made whole in the next payout. |
| ~~charge the seller cash~~ | — | deliberately not offered. It would be a receivable against a person who did nothing wrong, and the system should not make that easy. |

## 3. The rules that make it safe

- **Idempotent by decision.** Deciding `seller_absorbs` twice is a no-op, so a retried request cannot compensate twice.
- **Irreversible once paid.** An incident carries `payout_id`; after a payout settles it, the decision cannot be revisited (`409 INCIDENT_ALREADY_PAID`). Money out is one-way.
- **Uncosted losses cannot be compensated.** No landed cost on file means no value to pay (`409 INCIDENT_UNCOSTED`); the seller can still absorb it, and the incident stays visible. Inventing a number would be worse than waiting for the purchase order.
- **A seller with only compensation to receive still gets paid.** The payout run no longer returns early when there are no order lines; a week with no sales but a P510 compensation produces a payout of P510.09 and a statement that reconciles.
- **Compensation is its own line**, not folded into gross: it is not a sale, it was never VATable, and stuffing it into gross would break the VAT arithmetic that the invoice depends on. The `payout_math` check constraint was extended, not weakened:
  `net = gross − commission − fulfilment − refunds + compensation`.

## 4. The statement a seller can now actually check

```json
{
  "grossMinor": 33158, "commissionMinor": 2653, "fulfilmentMinor": 1326,
  "refundsMinor": 0, "compensationMinor": 51009, "netMinor": 80188,
  "itemsSumMinor": 29179, "reconciles": true,
  "shrinkage": [{ "sku": "PAM-BDP-M46", "decision": "afrikart_compensates",
                  "chargedToSellerMinor": 0, "compensatedMinor": 51009 }],
  "arithmetic": { "grossMinor": 33158, "lessCommissionMinor": 2653, "lessFulfilmentMinor": 1326,
                  "lessRefundsMinor": 0, "plusCompensationMinor": 51009, "equalsNetMinor": 80188 }
}
```

The `arithmetic` block exists because "the seller can add it up themselves" should not require reading our code. It is the sum written out in the order a person would do it.

Shrinkage appears on the statement **at every decision**, including the ones that moved no money — because a seller who cannot see the loss they were *not* charged for will assume they were charged for it.

## 5. Still missing

1. **Compensation waits for the next payout run** by seller. If a seller is paid monthly and their stock vanishes the day after, they wait a month unless someone runs an off-cycle payout. There is no "pay this incident now" path.
2. **No evidence attached.** No photograph, no counter's name beyond `created_by` on the movement, no signature. A dispute is settled by a note field.
3. **No threshold.** Every shortfall waits for a human decision, including one unit. At 400 SKUs that queue is the whole job.
4. **No seller-facing view.** A seller still cannot log in and see their own incidents; the statement shows them after the fact (`docs/012` §6).
5. **Owned stock remains all-or-nothing**: it goes straight to 5080 with no decision step, which is right — it is our loss by definition — but there is no damage-versus-theft split, so the 5080 trend cannot tell you which is happening.

## 6. Where the pilot stands

| Item | State |
|---|---|
| Authentication | built |
| SMS delivery | built; **vendor account still to buy** (AFR-49) |
| Bulk import | built |
| Stocktake | built; **sessions/recounts open** (AFR-47) |
| Shrinkage on statements | **built** (AFR-48) |
| Reprice or drop PAM-BDP-M46 | open — supplier conversation |
| Packaging cost on fulfilment | open |

The shelf, the statement and the ledger now agree with each other, and each of them can be checked by a person who does not trust the other two. That is the whole point of the last four increments.
