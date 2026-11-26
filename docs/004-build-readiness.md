# Build Readiness Review

**Question this answers:** can we start building on Monday, and what is still missing?
**Verdict:** **Yes — but only 5 of the 18 gaps block the first line of code.** The rest must close
inside the first three weeks or the build will drift.

---

## 1. The honest asset inventory

| # | Asset | State | Enough to build on? |
|---|---|---|---|
| 1 | Business case, model, kill criteria | `docs/000` | ✅ |
| 2 | Operating framework, gates, metric tree | `docs/002` | ✅ |
| 3 | Stack decision | `docs/003` | ✅ |
| 4 | Production schema (32 tables) | `db/schema.sql` | ✅ Parsed against PostgreSQL grammar |
| 5 | Working prototype as clickable spec | `product/` | ⚠️ Reference only — do not deploy |
| 6 | Unit economics model | `model/*.xlsx` | ✅ |
| 7 | Decision / assumption / risk registers | `docs/registers/` | ✅ |
| 8 | **Story-level backlog with acceptance criteria** | `docs/spec/backlog.md` | ✅ **Written now** |
| 9 | **API contract (shapes, errors, auth)** | `docs/spec/api-contract.md` | ✅ **Written now** |
| 10 | **Build brief / RFP for a contractor** | `docs/hiring/build-brief.md` | ✅ **Written now** |
| 11 | **PSP question sheet + scorecard** | `docs/hiring/psp-questions.md` | ✅ **Written now** |
| 12 | Design tokens & UI rules | Prototype CSS + §6 of backlog | ⚠️ Adequate for v1 |
| 13 | Analytics event taxonomy | `docs/spec/backlog.md` appendix | ✅ |
| 14 | Delivery / rider ops spec | §4 of backlog | ⚠️ Adequate; refine at M4 |
| 15 | Photography & content standard | `docs/hiring/build-brief.md` §6 | ✅ |
| 16 | Non-functional requirements | §5 of backlog | ✅ |
| 17 | **Company registration, TIN, bank account** | **Not done** | ❌ Founder only |
| 18 | **Signed PSP contract** | **Not done** | ❌ Founder only — the long pole |
| 19 | **Suppliers signed, products photographed** | **Not done** | ❌ Founder only |
| 20 | **A builder under contract** | **Not done** | ❌ Founder only |

**Net:** 11 of 20 assets are build-ready and in this repository. The remaining nine are commercial and
physical, not technical. That is the correct shape for this stage — you should not have engineering
blockers left, and you don't.

---

## 2. The five things that actually block Monday

Everything else can be decided in flight. These five cannot.

| # | Blocker | Why it blocks | Owner | Realistic time |
|---|---|---|---|---|
| **B1** | **Company registered (CIPA) with TIN** | No entity → no bank account → no PSP → no money | Founder | 5–10 working days |
| **B2** | **PSP conversation started** | **The critical path of the whole build.** Contracting takes 2–6 weeks and can only finish after B1. Start quotes before registration completes — most providers will quote on a name and a plan. | Founder | Weeks 1–6 |
| **B3** | **A builder contracted** | Nothing gets built by a repository | Founder | 2–4 weeks to find, 1 day to start |
| **B4** | **Launch category chosen** | Determines catalogue attributes, the photography brief and which suppliers you sign — it does not block the schema | Founder | 1 decision, today |
| **B5** | **Hosting accounts (Supabase + Vercel) under company email** | Accounts must belong to the company, not a personal Gmail. Migrating later is a mess. | Builder or founder | 1 hour |

### The critical path, drawn

```
Week 1   CIPA application ─┐
         Bank account ─────┼──▶ PSP quote requests (start day 2, do not wait)
         Builder search ───┘
Week 2   Builder contracted ─────▶ M0 foundation build starts
Week 3   CIPA certificate ──▶ Bank account open ──▶ PSP application submitted
Week 4-6 ██ BUILD (catalogue, storefront) ██          PSP underwriting ██
Week 6   PSP approved ──▶ checkout integration
Week 7   First real P1 order taken end to end
```

**B6, which does not block Monday but does block month 5:** *who owns the code after handover.* Left
undecided, every change after launch is a quoted project, every bug a negotiation, and the "technology
company" pillar becomes an unfunded claim. The three funded options are priced in `005` §5 and recorded
as **D-008**; the decision is due before the pilot ends.

**The lesson:** the PSP underwriting runs in parallel with the build, not after it. Companies that
start the PSP conversation in week 5 lose a month. Start it on **day 2**, quoting against the intended
company name.

---

## 3. What only the founders can close

Nothing here can be delegated to a builder, and every item has a real-world lead time.

| Task | Why it matters | Time |
|---|---|---|
| Register company (CIPA) + reserve name "Afrikart Mall" | Legal entity, IP | 5–10 days |
| TIN registration (BURS) | Invoicing, imports | 5 days |
| Decide VAT registration (threshold ~P1m turnover — confirm with accountant) | Pricing and invoicing | 1 decision |
| Open business bank account | PSP settlement, payouts | 1–2 weeks |
| Three PSP quotes via `docs/hiring/psp-questions.md` | Blocks revenue | 2–6 weeks |
| Data protection registration (Act of 2024) | Legal to process customer data | 2 weeks |
| Public liability + goods-in-transit insurance | A single claim can end an unfunded company | 1 week |
| Sign 5–8 suppliers, get wholesale prices in writing | Catalogue cannot exist without it | 2–3 weeks |
| 40–60 products photographed to the standard | No photo, no listing — enforced in the database | 1–2 weeks |
| Storage unit (60–80 m²) + rider + picker | Delivery | 1 week |
| Appoint accountant (BURS experience) | Compliance calendar | 1 week |
| **Decide engineer / retainer / drop the pillar (D-008)** | Every post-launch change depends on it; unfunded, the pitch is false | 1 decision, before P9 |
| Advisory: retail operator, logistics operator | The external check | 2–4 weeks |

---

## 4. What I would not start without, and what I would

**Would not start without:** B1–B5. Building against no payment provider means writing a fake
integration and unpicking it later, which is the most expensive kind of rework.

**Would happily start without:**

| Gap | Why it can wait |
|---|---|
| Final copywriting and brand identity | A builder needs tokens and layout, not a manifesto |
| Search relevance tuning | Postgres full-text is fine to 5,000 SKUs |
| Mobile apps | A PWA is the v1 (framework §4.1) |
| Coupons and promotions | Explicitly out of scope — we do not discount below contribution |
| Subscription billing | Q2 per the framework, not v1 |
| Reviews moderation tooling | A simple admin list is enough |
| Multi-language (Setswana) | Decide later; English-only v1 is defensible |
| Time-slot delivery windows | v1 promises a *day*, not a window — and says so plainly |

---

## 5. Deliberate scope exclusions (so nobody adds them mid-build)

Recorded here because the most common way a build fails is a reasonable-sounding addition in week 3.

| Excluded from v1 | Why | Revisit |
|---|---|---|
| Coupons / discount codes | Contradicts the contribution-margin discipline at this stage | After G2 |
| Loyalty points | Needs volume to mean anything | Year 2 |
| Product Q&A | Support channel covers it | After 1,000 orders |
| Multi-currency | One country, one currency | Regional expansion |
| Native iOS/Android | PWA first | 5,000 monthly orders |
| Automated route optimisation | Manual routing is fine at 2 routes | 6 routes |
| AI anything customer-facing | Cannot forecast without 90 days of clean data | After G3 |
| Seller advertising console | No demand to advertise against yet | After G3 |
| Partial shipments | One order = one delivery until proven | After G3 |
| Gift cards / wallet | Regulated, and not our business to hold float | Never (use a licensed partner) |

---

## 6. Definition of done, applied to every story

A story is not done when it works on the builder's machine. It is done when:

1. It works against the real schema with real constraints (no bypassing a check).
2. It has an automated test for the happy path **and** the money path.
3. Money-moving endpoints are idempotent and verified so.
4. It writes the audit log entry if it changes money, inventory or seller status.
5. It handles the empty, loading, error and slow-network states.
6. It is reachable by keyboard and readable on a 360px screen.
7. It is deployed to staging and demonstrated, not described.
8. The acceptance criteria in the backlog are ticked **by the founder**, not the builder.

---

## 7. Week one, kick-off agenda

| Day | Founder | Builder |
|---|---|---|
| Mon | CIPA application; decide launch category (B4) | Read `002`, `003`, `schema.sql`, `spec/backlog.md`; raise questions |
| Tue | Request three PSP quotes; book accountant | Provision Supabase + Vercel under company email; run migrations to staging |
| Wed | Supplier meetings begin (target 15) | M0-01 → M0-03: repo, CI, env, design tokens, auth skeleton |
| Thu | Shortlist builders; send `hiring/build-brief.md` | M0-04: RLS policies, seed categories |
| Fri | Interview one builder with the ledger question (`003` §8) | Demonstrate M0 on staging |

By Friday of week one you should be able to log in to staging as a seller and create a product that
persists — with the PSP underwriting already running in the background.

---

## 8. The risk if we start without closing these

Stated plainly, because this is the failure mode that costs the most:

> **Building checkout before the PSP is contracted** means the builder invents an interface, the real
> provider's webhook semantics do not match it, and the entire payment path is rewritten — typically
> two to three weeks of the four-week budget, plus a re-audit of every ledger entry already posted.

The mitigation is already in the plan: the PSP runs in parallel from day 2, and the checkout story
(M3) is **not** scheduled before week 6.
