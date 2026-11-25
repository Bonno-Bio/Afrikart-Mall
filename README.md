# Afrikart Mall

Botswana-born commerce platform. This repository holds the **decision record** — strategy, models and
specifications — before any product code is written.

## Principle

Nothing is built until the business model, launch category, unit economics and compliance basics are
settled. See `docs/000-founding-decisions.md`.

## Layout

| Path | What it is |
|---|---|
| `docs/` | Decision memos, in numbered order. Read the highest number last. |
| `model/` | Financial models. `afrikart-unit-economics.xlsx` is the live one. |
| `scripts/` | Generators for anything in `model/`, so models stay reproducible. |

## Current decisions

| # | Decision | Status |
|---|---|---|
| 001 | Business model — C′ "Owned Marketplace" | **Proposed**, awaiting sign-off |
| 002 | Capital approach — Lean, 90-day funded pilot | **Proposed**, awaiting sign-off |
| 003 | Launch ambition — Gaborone first, national via rented carriers | **Proposed**, awaiting sign-off |
| 004 | Launch category | **Open** |

## Rebuilding the model

```bash
python3 -m venv .venv && .venv/bin/pip install openpyxl
.venv/bin/python scripts/build_model.py
```
