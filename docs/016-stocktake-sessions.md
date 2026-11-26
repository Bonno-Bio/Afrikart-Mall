# 016 — Counting a shelf takes hours (AFR-47)

**Date:** 25 November 2026
**Tests:** 122 passing (was 112)
**Supabase:** `b5e_stocktake_sessions` — 44 tables, RLS **44/44**, 0 public grants in `public` (the only sequence grants in the project belong to Supabase's own `realtime` schema).

---

## 1. The shape of the old count

`docs/014` shipped a stocktake as **one HTTP payload**: all counts in, applied, done. That is fine for three SKUs and a demo. It is wrong for the thing the pilot actually has to do — a person walking an aisle for two hours, interrupted, with two counters and a coffee break — because:

- A request is not a unit of work a human can pause.
- A second look at the same shelf was impossible: one count per SKU per request, and the request was atomic.
- Nothing recorded **who counted which line**, so a variance could not be attributed to a person or a day.
- The number the counter was comparing against could change underneath them with no record of it.

## 2. What exists now

A stocktake is a **session** with a reference (`ST-2026-0001`), and a session has lines.

```
OPEN     201  ST-2026-0001  open
SHEET    200  progress {total 3, counted 0}   order B1-01, B1-02, B1-03
COUNT 1  200  accepted [NAN-OP3-400 40 = 40, delta 0]
COFFEE        (somebody goes for coffee)
COUNT 2  200  accepted [PAM-BDP-M46 26, NIV-BGL-200 60]
RECOUNT  200  first 26, recount 27, difference 1
              warn "PAM-BDP-M46: recount says 27, first count said 26. Applying uses the recount."
APPLY    200  counted 3, unchanged 2, adjusted 1, recounted 1, shrinkage 0
              variance PAM-BDP-M46 system 30 → counted 27, delta −3, incident raised
AGAIN    409  SESSION_NOT_OPEN
RECORD   200  status applied, lines 3 counted / 1 adjusted
SHELF    200  NAN-OP3-400 40, NIV-BGL-200 60, PAM-BDP-M46 27
```

The four rules, and the reason each one exists:

1. **The system quantity is frozen when a line is first counted.** Stock sells during a count. If the number kept updating, a sale would silently become "no variance" and the count would mean nothing. Instead the frozen number is reported (`systemAtCount`), and the *delta used when applying* is computed against stock as it stands at that moment — so a tin sold mid-count is a sale, not a gain. Those lines come back as `stockMovedDuringCount`, which is information, not an error.
2. **A session applies exactly once.** Applying moves stock, raises incidents and posts to the ledger. Twice would double a loss, so an applied session answers `409 SESSION_NOT_OPEN` to both another apply and another count.
3. **A recount keeps both numbers.** The second count is what applies, and the disagreement is reported — "we were one pack apart and looked twice" is information a later investigation needs.
4. **Reserved units are re-checked at apply.** At count time a shortfall against a reservation produces a *warning*, because a person who is told now can go and find the units; at apply time it is a `409`, because a person told later has gone home. Nothing is half-applied when it fires: the session stays open and stock is untouched (tested).

## 3. One implementation, two front doors

`runStocktake(db, { counts })` — the one-shot call from `docs/014` — still exists, and is now literally *open a session, count it, apply it, in one transaction*. So:

- the audit trail is identical,
- there is no second code path to drift,
- and `dryRun` still rolls the whole thing back.

The stocktake code moved from `import.js` to `stocktake.js`; `import.js` re-exports it, so nothing that used it changed. All 112 previous tests passed untouched, which is the only reason this refactor was safe to do in the middle of a build.

## 4. What is still missing

1. **Counting by scan.** The sheet is in bin-walk order, but the count is still typed. A barcode (or the camera on the cheap Android in the van) is the remaining step before a 400-SKU count is realistic.
2. **No two-person verification.** There is a recount by the same or another user, but no rule that a variance above a threshold must be confirmed by a second person before applying.
3. **No abandoned sessions.** The status exists in the schema; nothing sets `abandoned`, and an open session never expires, so a forgotten count sits open forever.
4. **No blind count.** The sheet shows `systemOnHand`, which is faster but invites the counter to agree with the computer. A real control hides it for a "blind" pass.
5. **No seller-facing view.** A seller still cannot see the count that shrank their stock until the statement (AFR-48).

## 5. Where the pilot stands

| Item | State |
|---|---|
| Authentication | built |
| SMS delivery | built; **vendor account still to buy** (AFR-49) |
| Bulk import | built |
| Stocktake | **built, including sessions, recounts, walk order** |
| Shrinkage decisions on statements | built |
| Barcode counting | open (AFR-47 remainder) |
| Reprice or drop PAM-BDP-M46 | open — supplier conversation |
| Packaging cost on fulfilment | open |

Five increments in, the pattern that keeps paying is the same: make the refusal explicit, keep the audit trail, and never book a number we cannot source.
