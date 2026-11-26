# 009 — The external surface (where the build now lives outside this repo)

**Date:** 25 November 2026
**Branch:** `arena/b9ad95dd-afrikart-mall`, HEAD `428b67f`
**Purpose:** one page that says, without decoration, which connected app holds what, so that nobody has to guess where the truth lives — and which of these artifacts is load-bearing versus a view of something else.

---

## 1. What each connector holds

| App | Artifact | Identity | Load-bearing? |
|---|---|---|---|
| Supabase | Project `afrikart-mall` | ref `vjhrpqqzmeunbespucrh`, org `cimafcqxhftobwunkjgj`, eu-central-1 | **Yes** — this is the intended production database |
| Linear | Project *Afrikart Mall — Route One (B1→G1)* | `c07b6d05-b4d5-4de2-8e13-5e35669b9de8`, issues AFR-34…AFR-46 | **Yes** — this is the work queue |
| Google Calendar | *Afrikart Route One — B1→G1* | `8449099318df…@group.calendar.google.com`, 12 events, W1→G1 | Yes — the dates are commitments |
| Google Sheets | *Afrikart Mall — B1 live figures & Route One calculators* | `14JnPS8bjeDDfVrq6KBqF2eVFOuH7zgJnVL_zcVFOLgw`, 6 tabs | No — a view of the ledger, not the ledger |
| Google Docs | *B1 The Till: build report* | `10ZaVLikf7jEcATpom6FT0UIbbvmtPwgfkHHE7wiWGvA` | No — a copy of `docs/008` |
| Gmail | 3 drafts (PSP underwriting, supplier LOI, rider) | draft ids `r-4945189310232451334`, `r-5772407786921294510`, `r-695170414817032507` | Yes — these start the two clocks |
| Vercel | **nothing for this project** | account has 5 unrelated projects; none is Afrikart Mall | n/a — see §3 |

The rule that follows from the table: **the repo and the database are the sources of truth.** Sheets, Docs and the deck are readable copies. If a number disagrees, the repo wins.

---

## 2. Supabase — what was actually verified

Schema applied as six migrations:

1. `b1_part1_identity_catalogue`
2. `b1_part2_inventory_orders_payments`
3. `b1_part3_ledger_payouts_routes`
4. `b1_part4_delivery_views`
5. `b1_enable_rls_deny_by_default`
6. `b1_views_security_invoker_and_revoke`

Verified structurally against the local PGlite copy — identical counts:

- 39 public base tables, 6 views (45 relations), 20 `chart_of_accounts` rows, 8 sequences, 87 indexes
- 1 deferrable constraint (`ledger_transactions` balance check)
- RLS enabled on **39/39** tables, **0** policies, **0** grants to `anon` or `authenticated`
- all 6 views `security_invoker = true`
- the ledger guard proved live: an unbalanced insert was rejected with `P0001: Unbalanced ledger transaction`

**What was not verified:** the 51-test suite has **not** been run against Supabase. The sandbox has no outbound route to Supabase from Node, so `DATABASE_URL` could not be exercised from here. Structural identity is strong evidence, not the same thing as a green suite. Run `npm test` with `DATABASE_URL` set from a networked machine before anyone depends on it.

Also outstanding: the database password was set during provisioning and should be rotated (Supabase → Settings → Database) before the project is shared.

---

## 3. Vercel — why there is no URL

There is no Vercel project for Afrikart Mall, and there is no public URL. This is deliberate, not an omission:

- `app/` is a long-lived Node process holding a connection pool to Postgres, plus a migration/seed lifecycle. Vercel runs functions; the process does not exist there.
- Making it fit would mean a serverless adapter, a pooled connection strategy, and a decision about migrations-in-production — none of which can be tested from this environment.
- Deploying an untested refactor at the end of a build session produces the worst outcome available: a URL that looks like a working till and is not one.

The honest sequence is: run the suite against Supabase from a networked machine, then do the serverless work as its own task with its own test, then deploy. Until then the correct statement to any investor, partner or customer is **"the platform exists, it is not yet on the internet."**

---

## 4. Board, calendar, correspondence

- **Linear** carries AFR-34 through AFR-46. The two that gate everything else: **AFR-34** (PSP applications + supplier LOIs — two clocks, ~6 weeks and ~4 weeks) and **AFR-35** (the Gaborone address-density audit that decides which suburb is even viable).
- **Calendar** carries the same dates as Linear so they cannot drift: Sprint Zero gate 1 Dec, B2–B7 weekly, pilot 20 Jan → 6 Mar, G1 gate 6 Mar 2027, plus the weekly Friday review and the two clock checkpoints (PSP week-2 chase 8 Dec, supplier "10 SKUs in hand" 22 Dec).
- **Gmail** carries three unsent drafts, written to be sent as-is once a recipient exists. None of them claims revenue, traction or a processing date. The PSP draft asks the question that actually decides the architecture — whether the processor will underwrite a marketplace that pays out to third parties — rather than asking for a merchant account and discovering the answer later.

---

## 5. The standing list of things not yet true

1. No authentication — the API trusts any `customer_id` it is handed. (AFR-41)
2. No seller payouts — `seller_payable` is posted but nobody is paid. (AFR-42)
3. No COGS posting — every margin quoted today is flattering. (AFR-37)
4. No PDF invoices, no search, no reviews, no persisted carts.
5. Single process, no horizontal scaling, no queue.
6. Nothing deployed; no public URL; no custom domain attached to anything here.

Every external artifact built in this pass repeats at least one of these. That is on purpose: the cost of a claim nobody can reproduce is higher than the cost of an honest gap.
