# 017 — The box was missing from the margin

**Date:** 25 November 2026
**Tests:** 130 passing (was 122)
**Supabase:** `b5f_packaging_cost` — 48 tables, RLS **48/48**, 0 public grants; chart of accounts 1110, 2030, 5030.

---

## 1. An empty account is an accusation

Account **5030 Packaging** has been in the chart since the first draft of the schema. Nothing ever posted to it. That is not a tidy placeholder — it means every fulfilment margin this system has ever reported was calculated with the cardboard left out. The number was not wrong by a rounding error; it was wrong by most of the fee.

`docs/011` and `docs/014` both listed "packaging cost on fulfilment" as an open item. This closes it.

## 2. The model, and why each choice is the one that cannot lie

| Event | Entry | Why |
|---|---|---|
| Buy packaging | **Dr 1110 Packaging stock / Cr Bank** | it is stock until it is used. Expensing on purchase would make the month you restocked look like the month profitability collapsed. |
| Pack an order | **Dr 5030 Packaging / Cr 1110** | cost lands on the order that caused it, so a parcel's cost is attributable and not a monthly guess. |
| Run out and pack anyway | **Dr 5030 / Cr 2030 Packaging accrual** | the customer is at the door; the box is used. Being short of stock is a debt to a supplier, not a permission to invent negative inventory. |

Negative stock is the fiction this deliberately refuses: a warehouse that shows −40 cartons has stopped being an inventory record and become a wish.

## 3. Parcels, not orders

A parcel class already existed on every variant (`small`, `bulky`, `fragile`, `cold`), and the warehouse already uses it for capacity. Packaging is priced from a **recipe per class**:

| Class | Contents | Cost |
|---|---|---|
| small | poly mailer + waybill label | **P1.55** |
| bulky | carton M + void fill + label | **P5.95** |
| fragile | carton M + bubble wrap + label | **P7.25** |
| cold | insulated bag + gel pack + label | **P24.35** |

Units per parcel: 8 / 2 / 2 / 4. The strictest item in an order decides the class — one cold item makes the parcel cold. Pilot packing practice and pilot supplier quotes, stated as such rather than dressed up as a rate card.

## 4. The number that matters

Live, on a seeded PGlite instance:

```
ORDER    AK-26001            one pack of nappies (bulky, 12 L)
DELIVER  200                 packaging P5.95, parcels 1
                             fulfilment fee P7.54
                             left before the rider: P1.59
REPORT   feeAfterPackaging P1.59   underwater []
LEDGER   debit = credit = 5,275,095  balanced
```

**P7.54 of fulfilment fee, P5.95 of cardboard, P1.59 left before fuel, the rider, or a wage.** The 4% is not a margin; it is a rounding error away from being a subsidy. And that is the *good* class:

- A single **cold-chain** item costs **P24.35** per parcel against a fee of P3.44–P6.64. It is underwater on one unit, and stays underwater at any realistic bundle size.
- Five packs of nappies is **three cartons** (P17.85) against P37.72 of fee — the fee scales per item, the cardboard scales per parcel, so big baskets are survivable and small cold ones are not.

`GET /api/ops/packaging` returns `fulfilmentUnderwater` — the order numbers where the fee did not buy the box — instead of averaging the loss into a number that looks fine.

## 5. Where the fee has to change

The honest conclusion from the numbers above:

1. **Fulfilment cannot be a flat percentage across classes.** A 4% fee is roughly right for a cardboard parcel and catastrophically wrong for a cold bag. Cold chain needs a surcharge or a per-parcel minimum (suggested: P30 flat for `cold`, or pass the bag through as a line item, which customers in this market already understand from pharmacies).
2. **The marketplace's own margin per order is now computable** for the first time: commission + fulfilment + delivery + COD fee, less COGS and less packaging. `keptMinor` on the delivery response still excludes packaging; that arithmetic should be joined up next (see §6).
3. **PAM-BDP-M46's seller margin is unchanged by this.** Packaging is our cost, not the seller's, and the repricing decision stands on the earlier numbers (+1.63 per unit). It is worth saying plainly, because it would be easy to blame the box for a seller-level problem.

## 6. What is still missing

1. **Packaging is not yet subtracted from `keptMinor`.** The delivery response reports packaging cost beside the margin rather than inside it. Two numbers that should be one — join them up before anyone quotes a margin per order.
2. **No packaging stocktake.** Cartons are counted by hand; the same drift that the SKU stocktake solves for goods applies to boxes. `packaging_materials.on_hand` is currently only ever moved by purchase and consumption.
3. **No per-material variance or supplier comparison** — one quote per material, no history of price rises.
4. **No customer-facing packaging choice** (reusable bag, no bag) and no packaging weight in the delivery cost model, which it should be: a carton is also volume on a scooter.
5. **Cold chain is priced but not provisioned** — there is no gel-pack freezing step, no bag-return process, and a P24.35 consumable is not reusable in this model.

## 7. Where the pilot stands

| Item | State |
|---|---|
| Authentication | built |
| SMS delivery | built; **vendor account still to buy** (AFR-49) |
| Bulk import | built |
| Stocktake sessions | built |
| Shrinkage decisions | built |
| **Packaging cost** | **built — and it says the fulfilment fee is wrong** |
| Cold-chain surcharge | **decision required, not code** |
| Reprice or drop PAM-BDP-M46 | open — supplier conversation |

The system now knows what a parcel costs. The pricing has not caught up with it, and no amount of further engineering will change that; it is a pricing decision, and it belongs to the owner.
