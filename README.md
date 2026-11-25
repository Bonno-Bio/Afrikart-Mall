# Afrikart Mall

Botswana-born commerce platform. This repository holds the **decision record** and a **working
platform slice** — strategy, models, specifications, and the Amazon-shaped marketplace itself.

## The two things in here

| | |
|---|---|
| **The business** | `docs/` — decision memos. Read `000` before anything else. It argues the business model, the launch category, the unit economics and the kill criteria. |
| **The platform** | `product/` — a working marketplace: storefront, search, product pages, cart, checkout, order tracking, Seller Central and platform admin. |

The software is deliberately broad (Amazon-shaped, all seven pillars modelled). The **business is
deliberately narrow** — one category, one city, one delivery model, until the unit economics prove
out. Those two decisions are not in conflict; memo 000 explains why.

## Start here

```bash
cd product
npm install
npm run build && npm start        # http://localhost:3000
```

Demo accounts (password `demo1234`):

- `customer@afrikart.co.bw` — shopper with order history
- `seller@afrikart.co.bw` — Seller Central for Naledi Beauty Supply
- `admin@afrikart.co.bw` — platform operations

## Read in this order

1. `docs/000-founding-decisions.md` — the business case, the four structural decisions, the 90-day pilot, the kill criteria
2. `docs/002-master-framework.md` — **the operating system**: constitution, strategy bets, metric tree, four quarterly fights, cadence, capital, people, risk
3. `docs/001-platform-architecture.md` — what was built, the domain model, and the path to production
4. `docs/003-production-stack.md` — the production stack decision: WordPress vs React, and why the answer is neither
5. `docs/004-build-readiness.md` — **what is still missing before the build starts**, and who owns it
6. `docs/005-build-phases.md` — **the execution spine: all 14 phases**, gates, cash and dependencies
7. `docs/spec/` — the build pack: 48-story backlog with acceptance criteria, and the API contract
8. `docs/hiring/` — the build brief to send contractors, and the PSP question sheet
9. `docs/registers/` — the living truth: decisions, assumptions, risks
10. `model/afrikart-unit-economics.xlsx` — the break-even model (21 orders/day in Gaborone)

`db/schema.sql` is the production data model — money in integer thebe, a double-entry append-only
ledger that balances by constraint, inventory derived from movements, and a `route_weekly_pnl` view
that answers whether the business actually works.

Two kinds of document here, deliberately kept apart: the **framework** is stable and changes by
version; the **registers** change weekly. If they disagree, the register is right and the framework
needs a new version.

## The five documents that run the company

| Document | Answers | Changes |
|---|---|---|
| `docs/002-master-framework.md` | How we decide and operate | By version, rarely |
| `docs/registers/decisions.md` | Why we chose this, and when we would reverse it | Weekly |
| `docs/registers/assumptions.md` | What we believe, and the test that settles it | Weekly |
| `docs/registers/risks.md` | What could kill us, and the trigger to watch | Monthly |
| `docs/templates/` | The weekly and monthly rituals | Annually |

## Layout

| Path | What it is |
|---|---|
| `docs/` | Decision memos and the master framework. Read the highest number last. |
| `docs/registers/` | Living registers — decisions, assumptions, risks. |
| `docs/templates/` | Meeting templates that the cadence runs on. |
| `product/` | The application — React + Vite front end, Express API. |
| `db/` | Production database schema. Stack-independent — correct for any framework. |
| `docs/spec/` | Backlog and API contract — what a builder needs on day one. |
| `docs/hiring/` | Build brief and payment-provider question sheet. |
| `model/` | Financial models. `afrikart-unit-economics.xlsx` is the live one. |
| `scripts/` | Generators, so models stay reproducible and reviewable in git. |

## Decisions

| # | Decision | Status |
|---|---|---|
| 001 | Business model — C′ "Owned Marketplace" | **Proposed** |
| 002 | Capital approach — Lean, 90-day funded pilot | **Proposed** |
| 003 | Launch ambition — Gaborone first, national via rented carriers | **Proposed** |
| 004 | Launch category | **Open** |

## Rebuilding the financial model

```bash
python3 -m venv .venv && .venv/bin/pip install openpyxl
.venv/bin/python scripts/build_model.py
```
