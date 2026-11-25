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
2. `docs/001-platform-architecture.md` — what was built, the domain model, and the path to production
3. `model/afrikart-unit-economics.xlsx` — the break-even model (21 orders/day in Gaborone)

## Layout

| Path | What it is |
|---|---|
| `docs/` | Decision memos, numbered. Read the highest number last. |
| `product/` | The application — React + Vite front end, Express API. |
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
