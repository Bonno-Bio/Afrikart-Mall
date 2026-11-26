# 014 — Bulk import and stocktake

**Date:** 25 November 2026
**Tests:** 104 passing (was 89)
**Commit:** `d15a62b` is the previous head; this work is committed on top.

---

## 1. Why these two, together

They are the same problem from both ends. Bulk import is how the catalogue grows past what a human will type carefully; stocktake is how the shelf stops drifting from the computer. A shop with one and not the other is either too small to matter or quietly wrong about its inventory.

Both are also the first place a real operator touches this system without a developer watching, which is why almost every rule below is about refusing bad input loudly rather than cleaning it up silently.

## 2. Import

`POST /api/ops/catalogue/import` takes CSV text (or a `dryRun` of it) and a seller.

Columns: **required** `sku`, `title`, `category_slug`, `price`; **optional** `brand`, `description`, `weight_grams`, `parcel_class`, `list_price`, `on_hand`, `bin_code`, `reorder_point`, `seller_slug`.

The decisions:

- **All or nothing, with line numbers.** One bad row rejects the file and names the line. A half-imported catalogue is worse than none, because nobody knows which half.
- **A misspelled optional column is an error, not an omission.** `wieght_grams` silently becoming "not supplied" is how a weight — and therefore an Express promise — vanishes between the spreadsheet and the shelf.
- **Money is parsed strictly.** `149.99` and `P 1 049.5` are accepted; `149.999`, `149,99` and `-5` are not. A price with three decimals is a spreadsheet that did arithmetic, and guessing the intent is how a P189 product becomes P18.90.
- **`list_price` below `price` is refused.** A crossed-out number lower than the price is a lie on the shelf.
- **Duplicate SKUs inside one file are caught by line.** The second occurrence names the first.
- **Everything arrives as a draft.** A spreadsheet cannot certify a photograph or a BOBS registration, so import never publishes; `publish` still demands both.
- **An existing SKU is updated only inside its own seller.** Moving a SKU across sellers would drag sales history, the payable and the returns liability with it, so it is a `409`, not a convenience.
- **`on_hand` on an existing SKU is ignored, with a warning.** A price list is not evidence of what is on the shelf; the count is.
- **`dryRun` runs the whole import and rolls it back**, so the report is exactly what would have happened.

CSV parsing is hand-written and handles the parts of RFC4180 that a spreadsheet actually produces: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, and the byte-order mark Excel writes whether you want it or not.

## 3. Stocktake

`POST /api/ops/stocktake` takes `[{ sku, counted }]`.

- Every difference becomes an **`inventory_movements` row** (`reason: 'adjusted'`, `ref_type: 'stocktake'`) and only then updates the cache. The cache is repaired by evidence, not by an `update` statement.
- **A count cannot go below `reserved`.** Counting away units that are already promised to customers does not create them; it only removes the warning that would have made somebody look. That is a `409 COUNT_BELOW_RESERVED` naming the SKU, the reservation and the count.
- **Unknown SKU, duplicate SKU, negative count, empty list** are all refused before anything is written.
- **Dry run** reports the variances and changes nothing.

### The accounting, which is where the honesty lives

The pilot holds **consignment** stock, so most variances are not our loss:

| Ownership | What happens | Why |
|---|---|---|
| `seller` (consignment) | movement recorded, `postedMinor: 0`, flagged `report to seller statement` | the goods were never our asset, so posting shrinkage to our P&L would be a fiction |
| `afrikart` (we bought it) | priced at **landed cost** (freight and duty included) and posted **Dr 5080 Inventory shrinkage / Cr 1100 Inventory** | this is a real loss and it belongs in its own account, not buried in cost of goods where the trend disappears |

A new account, **5080 Inventory shrinkage**, exists for exactly this and nothing else. The trial balance still balances after a shrinkage posting (tested).

For owned stock with **no landed cost on file**, the movement is recorded and the adjustment is flagged unvalued rather than valued at a guess. An honest zero beats an invented number.

## 4. Live run

Against a seeded PGlite instance on `:4010`:

```
DRY RUN  200  2 created  1 updated  warnings []
IMPORT   201  2 created  1 updated  ['created', 'created', 'updated']
COUNT    201  unchanged 2  adjusted 1
   { sku: 'PAM-BDP-M46', system: 30, counted: 27, delta: -3,
     ownership: 'seller', postedMinor: 0, sellerNotified: 'report to seller statement' }
```

The shelf afterwards: `PAM-BDP-M46` at 27 on hand, `NAN-OP3-400` 40, `NIV-BGL-200` 60, and the two new Similac SKUs as **drafts** at P229.00 and P399.00 with 24 and 12 units — reported, not published.

## 5. What this does not do

1. **The seller statement does not yet deduct shrinkage.** The variance says *report to seller statement*; no statement line exists for it. A seller whose consigned stock disappears currently receives no deduction and no document — which is the right direction (we are not their insurer) but it is not finished.
2. **No barcode scanning.** Counts are typed. A stocktake of 400 SKUs typed is a stocktake done once.
3. **No stocktake session** — no frozen snapshot, no counting by bin or by route walk, and no two-person recount.
4. **No import of images or attributes** beyond the columns listed; gallery photography is still a human step per product.
5. **No supplier price-list reconciliation**: an import can change our sell price but cannot compare it to the supplier's new cost and say "margin is now negative" before publishing.

## 6. Where the pilot stands

| Item | State |
|---|---|
| Authentication | built (81 tests) |
| SMS delivery | built; **vendor account still to buy** |
| Bulk import | **built** — drafts, all-or-nothing, dry run |
| Stocktake | **built** — variances, reserved guard, shrinkage priced |
| Reprice or drop PAM-BDP-M46 | open — supplier conversation |
| Packaging cost on fulfilment | open |

The count above is the useful one for the pilot: the shelf shrank by three packs of nappies on the first real count, and the system said so out loud instead of adjusting a number.
