# 011 — Commission by category, and seller payouts (AFR-42)

**Date:** 25 November 2026
**Tests:** 72 passing (was 64)
**Commit:** on `arena/b9ad95dd-afrikart-mall`
**Supabase:** `b2_category_commission_rates` applied — 39 tables, 7 views, RLS on all 39, 0 grants to `anon`/`authenticated` on our schema.

---

## 1. The take is now a category decision

`categories.commission_bps` and `categories.fulfilment_bps` exist, nullable, with the seller's own rates as the fallback. An unconfigured category behaves exactly as it did before, which is why nothing else had to change on the day it landed.

The seed sets Baby & Mother to **8% + 4%**, down from 12% + 6%, because the numbers in `docs/010` §7 left the seller underwater on all three SKUs. What that change actually bought:

| SKU | Price | Net before commission | Commission 8% + 4% | **Seller net** | Landed cost | Seller spread |
|---|---|---|---|---|---|---|
| NAN-OP3-400 | P189.00 | P165.79 | P21.19 | **P144.60** | P144.27 | **+P0.33** |
| NIV-BGL-200 | P98.00 | P85.96 | P10.99 | **P74.97** | P72.14 | **+P2.83** |
| PAM-BDP-M46 | P215.00 | P188.60 | P24.12 | **P164.48** | P170.03 | **−P5.55** |

Two SKUs are now viable at a margin so thin it is barely a margin, and one is still losing money.

**The finding that matters more than the fix:** cutting the take from 18% to 12% was not enough. The nappies still fail, because a P170 landed cost against a P215 shelf price leaves P45 of gross spread for the whole chain — and 12% of it is ours. No plausible commission rate fixes that SKU. It has to be repriced (to roughly P229) or dropped from the opening ten. That is a supplier conversation, not a code change, and the system now says so out loud: `shelfReport.summary.sellersUnderwater` returns `['PAM-BDP-M46']`.

**A correction the sheet forced:** the shelf report used to compare landed cost with the *shelf price*, which flatters every SKU by ignoring our own take. It now compares landed cost with the seller's **net after commission and fulfilment, VAT-excluded**. That is the only comparison that answers "can this seller stay with us".

---

## 2. Seller payouts

`app/src/payouts.js`, three routes, seven tests.

**A payout is a set of order lines, not a number.** Every payout writes `payout_items` rows referencing the exact `order_items` it pays for. A seller can add up their own orders and either agree with the statement or produce a list of disagreements. A number without lines is an assertion.

**A line is paid exactly once** — `unique (order_item_id)`, not a convention — and a period can only be run once per seller: `unique (seller_id, period_start, period_end)`.

**The amount equals what the ledger says we owe.** Before posting, the run compares the computed net against the seller's 2010 balance and refuses to pay more (`PAYOUT_EXCEEDS_LEDGER`). The payment posts in the same transaction: Dr Seller payable 2010 / Cr Bank 1010.

**VAT is not the seller's money.** The first version of this used the VAT-inclusive line total as gross and immediately failed its own arithmetic (net P338.21 against a payable of P291.79). Gross on a payout statement is now VAT-exclusive, because the VAT was credited to 2020 and never to the seller.

**Refunds show up honestly.** A returned line appears on the statement as a refund and contributes zero net — the seller kept nothing and we paid nothing — rather than vanishing and leaving the seller to wonder why the week looked light. If refunds swallow the week, the run pays nothing instead of moving money in the wrong direction.

### Live run, on the dev database

```
period 2026-11-20 .. 2026-11-26
Naledi Beauty Supply
  gross (ex-VAT)  331.58
  commission      -26.53
  fulfilment      -13.26
  refunds           0.00
  net             291.79   -> paid
statement: items sum 291.79, reconciles = true
ledger after: seller payable 0.00, bank 49,708.21, trial balance balanced at P50,714.79
```

---

## 3. What this does not do

1. **It pays by bank transfer we did not make.** `bankReference` is recorded; nothing here talks to a bank or a PSP payout API. In the pilot it is a manual transfer with a reference — which is honest, and is why the statement exists.
2. **No payout approval step.** `approved_by` is captured when a run passes an actor, but there is no draft → approve → pay flow, and no second pair of eyes. That is a hardening item (B5), not a pilot blocker, *provided one person is running it*.
3. **No partial payouts / no holdbacks.** A line is paid in full or not at all. A reserve for returns (the standard marketplace practice) is not modelled, which means a refund after a payout is our credit risk, not a withheld balance.
4. **No payout file export** (CSV for the bank) and no seller-facing email.
5. **No commission versioning.** Rates are read at the time of sale and snapshotted onto the order line, so history is safe — but there is no schedule table, so "what was the rate in March" is answered by reading old order lines.

---

## 4. Where this leaves the pilot

The marketplace now pays its sellers, which is the last item that made "marketplace" a stretch. What still stands between this and a soft launch, in order:

1. **Reprice or drop PAM-BDP-M46** — the one SKU where the seller still loses money.
2. **Authentication** (AFR-41) — the API still trusts `x-user-id`.
3. **Bulk import** — ten SKUs by seed is a demo.
4. **Stocktake** — `adjusted` movements exist; a count workflow does not.
5. **Packaging cost on fulfilment** — the P13.26 fulfilment fee is currently pure margin, which it is not.
