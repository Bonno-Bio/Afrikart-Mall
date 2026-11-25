# The Amazon Gap — where our own framework caps us

**Method:** I read `000`, `002`, `003`, `005`, `spec/delivery.md` and the unit-economics model against
each other and against how Amazon's machine actually works, looking for three things:

1. **Internal contradictions** — places where two of our own decisions fight each other.
2. **Structural caps** — decisions that are right for survival and wrong for scale.
3. **Missing engines** — the parts of Amazon's economics we have not built at all.

Twelve pitfalls. Three are fatal. None of them is a reason not to proceed — but every one of them should
change something in the framework, and §5 lists exactly what.

> **Status: applied.** All twelve amendments are now in the documents: `002` **v1.2**, `005` **v1.1**,
> `model/afrikart-unit-economics.xlsx` **v2**, `db/schema.sql` (route capacity, catalogue tiers,
> suppliers and purchase orders, `cash_cycle` and `cod_cash_in_transit` views), `spec/api-contract.md`
> (tier and capacity-aware quoting), and `registers/decisions.md` **D-006 → D-009**. Every amendment is
> tagged `[A1]`–`[A12]` at the point where it landed in `002` and `005`, so each one is traceable in both
> directions. Three are not closable by a document at all — see §7.

---

## 0. First, the uncomfortable framing

**Amazon is not one business. It is three:**

| Business | What it is | Margin | Do we have it? |
|---|---|---|---|
| 1. Retail | Buying and selling goods | ~2–4% operating | **Yes — being built well** |
| 2. Logistics network | Moving other people's parcels for a fee (FBA) | ~20–30% | **Deferred to P12** |
| 3. Cloud + advertising | Renting compute and attention | 30–70% | **Explicitly refused in year one** |

Amazon's retail arm has never been the profit engine. **The profit is in businesses 2 and 3, and both
of them are funded by the retail arm's cash flow and data.**

Our framework builds business 1 excellently, sketches business 2 as a Phase 12 afterthought, and
refuses business 3 outright. That is a defensible plan for a profitable Botswana commerce company. **It
is not a plan for Amazon**, and we should stop describing it as one until we change something.

---

## 1. The twelve pitfalls, ranked

### ⛔ PITFALL 1 — Our model absorbs cash; Amazon's generates it. *(Critical)*

**Where it's latent:** `000` §3 (COD, weekly seller payouts) · `002` §7 (8-week cash buffer) ·
`assumptions.md` A-09 ("suppliers will extend 30-day terms" — **untested**).

**The mechanism.** Amazon's flywheel is funded by float: customers pay in days, suppliers are paid in
60–90 days. That gap is the cheapest capital in the world and it compounds with volume. It is the single
most under-appreciated part of the model.

Ours runs backwards:

| | Amazon | Afrikart as designed |
|---|---|---|
| Customer pays | At order | At the door (COD 30–60% of orders) |
| We pay supplier | Day 60–90 | Day 0 (cash-upfront, at launch) |
| We pay seller | n/a (we own stock) | After delivery, weekly |
| Result | **Cash generator** | **Cash absorber, permanently, proportional to GMV** |

**Why it blocks Amazon:** every Pula of growth consumes working capital. Growth stops when the bank
account does. A competitor funded by float can outrun us while losing money on every order; we cannot
answer that without raising.

**Severity:** Critical — this is the difference between a business and a treadmill.

---

### ⛔ PITFALL 2 — The model assumes a mature route from day one. *(Critical)*

**Where it's latent:** `000` and `model/*.xlsx` use **P18 cost per drop**. `002` §3.1 targets 18–20
drops per route. `005` P9 expects ~15 orders/day in month 3.

**The arithmetic nobody checked.** Cost per drop is not a constant; it is a function:

```
cost per drop = (rider day cost) ÷ (drops that day)
```

A rider costs roughly P320/day all-in. So:

| Drops on the route | Cost per drop | Our model says |
|---|---|---|
| 8 | **P40** | P18 |
| 12 | P27 | P18 |
| 18 | P18 | P18 |
| 22 | P15 | P18 |

**Months 1–4 will run at two to three times the modelled last-mile cost**, because we are building
density from zero. The unit-economics model is arithmetically correct and operationally flattering: it
describes month 7 as if it were month 1.

**Why it blocks Amazon:** we will conclude, in month 2, that "delivery doesn't work in Botswana" — and
either quit at G1 or over-price delivery and suppress demand. The conclusion would be wrong; the
modelling would be wrong.

**Severity:** Critical, and cheap to fix.

---

### ⛔ PITFALL 3 — A store-based incumbent already has a better last mile than we do. *(Critical)*

**Where it's latent:** `002` §7 lists the moat as route density and treats incumbents only as a
**price-war** risk (R-08, scored 9/25).

**The thing we missed.** Choppies, Shoprite, Pick n Pay and the independents have **dozens of stores
inside the neighbourhoods we are routing to.** A store is a forward warehouse. Their cost to reach a
customer 1km away is one rider-minute; ours is a warehouse-to-door trip. On the day one of them decides
to do next-day delivery, they start closer to the customer than we will be after two years of work.

**Why it blocks Amazon:** our moat is strongest where we chose to build, and weakest exactly where the
incumbents already are. Amazon beat bookstores because bookstores had no national logistics; in Botswana
the incumbents have the density and we do not.

**The honest resolution — and it is the same answer as Pitfall 5:** do not compete with the store
network on its own ground. **Rent them our rails, or serve the ground they will not cover** (imported
beauty, long-tail sellers, niche categories). Either way, "route density is a moat" must be qualified:
it is a moat against another *warehouse-based* startup. It is not a moat against 40 shops.

**Severity:** Critical — but it is also the bridge to the infrastructure thesis.

---

### 🔴 PITFALL 4 — We have deferred every high-margin revenue line. *(High)*

**Where it's latent:** `002` §4.1 — "No advertising product", "No private label", "No fulfilment centre"
in year one. `005` puts third-party fulfilment in P12, month 10–13.

Amazon's retail margin is thin on purpose; the profit comes from ads, FBA fees and cloud. Our framework
refuses ads and private label for twelve months and pushes the FBA analogue to the last phase of year
one.

**Why it blocks Amazon:** we have designed a business whose only revenue is thin-margin retail plus a
12% commission. That structure can be **profitable and still cap out** — it never produces the margin
pool that funds the next city, let alone the next country.

**The one we can fix:** third-party fulfilment *is* our FBA, it is the highest-margin thing we can
actually own, and it needs no new capability — just other people's parcels on routes we already run.
It belongs in **P10, not P12.**

**Severity:** High.

---

### 🔴 PITFALL 5 — No engineering capability means no Amazon. *(High)*

**Where it's latent:** `003` §8 ("hire one senior full-stack engineer, contract or partner") ·
`004` §1 asset 20 · the build-and-handover model in `hiring/build-brief.md`.

**The mechanism.** Amazon's advantage is not intelligence, it is **iteration velocity** — shipping
thousands of small changes a year, measured. A contractor-built platform with a documented handover
becomes **static within about six months**, because the only way to change it is to re-hire.

We have designed an excellent v1 and no capacity to iterate on it.

**Why it blocks Amazon:** the moat in this business is operational learning encoded in software — the
reason codes, the routing, the scorecards. If every change needs a new contract, we learn slower than a
competitor with one engineer on payroll.

**Severity:** High. Two honest resolutions: budget **one engineer on payroll from month 4** (≈P35–55k/month
— this is a real cost the capital plan does not currently carry), or accept that we are a commerce
operator and stop claiming to be a technology company.

---

### 🔴 PITFALL 6 — Our marketing calendar fights our own delivery capacity. *(High)*

**Where it's latent:** `002` §11 concentrates spend on the month-end payday pulse; `002` §2.1 sells
**next-day delivery**; `spec/delivery.md` sets route capacity at 18–22 drops/day.

**The contradiction.** Concentrating demand into the three days after payday means 35–45% of monthly
volume arrives in one week. A fixed route can do 22 drops. On payday week it needs 60. Either:

- we fail deliveries in the week we spent the most money acquiring customers — **destroying the promise
  in the only week it is being tested**, or
- we hold three riders idle for the other twenty days, tripling cost per drop.

**Why it blocks Amazon:** the promise is the product. A promise that breaks monthly is not a promise.

**Fixes, in order of preference:** (a) shift volume from *acquisition* to *scheduled repeat* —
subscriptions and standing orders smooth the curve and are already in P10; (b) market *before* payday
with delivery scheduled *after* the peak; (c) use pickup points as the overflow valve; (d) cap daily
orders per route and show a next-available date, which is honest and trains the customer.

**Severity:** High, and it will bite in month 2.

---

### 🔴 PITFALL 7 — Our north star rewards not growing. *(High)*

**Where it's latent:** `002` §3.1 — contribution per route per week is the single number.

**The tension.** For a bootstrap, this is exactly right; it is what stops us buying unprofitable growth.
But in a land grab it is an **anti-competitive** metric: a funded entrant can lose P50 an order for two
years while we protect contribution and lose the market. Amazon was never measured this way in its
growth years — deliberately.

**Why it blocks Amazon:** we have institutionalised the behaviour of a profitable operator at exactly
the moment a land grab requires the behaviour of a funded one.

**Fix:** a **second north star, activated by a trigger.** Default: contribution per route. If a funded
competitor enters the category, switch to orders/day with a defined monthly loss budget, and record the
decision. The metric should depend on the competitive situation, not on habit.

**Severity:** High.

---

### 🟠 PITFALL 8 — Curation caps selection; the "everything store" needs a long tail. *(Medium-High)*

**Where it's latent:** `000` §3 — 5–8 curated suppliers. `005` P11 — self-serve sellers only in month
7–10. `spec/backlog.md` — 40–60 SKUs at launch.

Amazon's flywheel needs *infinite shelf*. We have deliberately limited it, for good reasons (trust,
quality, delivery predictability) — but the limit is also the cap.

**Fix:** separate **quality** from **breadth**. Two tiers:

- **Express tier** — curated, photographed, stocked, badged. Our promise, our delivery.
- **Marketplace tier** — long-tail, self-serve, seller-fulfilled or pickup-only, **no Express badge**.

The badge becomes the trust currency and the gate becomes lighter. That is how you grow selection
without diluting the promise — and it is a design we can build, not a compromise we have to accept.

**Severity:** Medium-High.

---

### 🟠 PITFALL 9 — Category brand lock-in. *(Medium)*

**Where it's latent:** `002` §2.1 — baby + hair as the wedge; 18-month category discipline.

The risk is not that the wedge is wrong. It is that **the brand becomes the category** — "the nappy shop"
— and the trust we built does not transfer when we try to sell a P8,490 inverter.

**Why it matters for Amazon:** Amazon escaped books via **trust + review corpus + search**, not via
brand stretch. We have not specified our escape mechanism.

**Fix:** define the escape trigger now — at G2, add **one adjacent category that shares the parcel
profile** (phone accessories: small, high-margin, universal, low return risk). Publish the reasoning
("same delivery, same guarantee") so customers see continuity rather than a pivot. Do not attempt a
category that changes the delivery profile until density is proven.

**Severity:** Medium.

---

### 🟠 PITFALL 10 — In a market this small, the "AI engine" may never pay. *(Medium)*

**Where it's latent:** `001` pillar 6 and the original vision's "AI engine"; `002` §9 defers AI to after
G3.

The brief described an AI engine as a pillar. At 45 orders/day we will produce roughly 16,000 orders a
year — enough for demand forecasting and delivery exception triage, **not** enough for the
recommendation quality that constitutes a moat. 142,721 e-commerce users is the whole addressable base.

**Fix:** demote AI from a pillar to a **tool**, and keep only the two applications that work on small
data and save money immediately (forecasting, exception triage). Remove "AI" from external positioning
until it does something a competitor cannot.

**Severity:** Medium — but it protects us from building a feature nobody pays for.

---

### 🟠 PITFALL 11 — Our gates are built to stop; Amazon's were built to compound. *(Medium)*

**Where it's latent:** `002` §4 — "Stopping here is a successful outcome"; `005` P9 — "the cheapest
exit you will ever be offered".

Both statements are **correct capital discipline**. They are also, repeated often enough, a culture that
normalises quitting. Amazon had no off-ramp.

**Fix:** keep the off-ramp but rename the outcome. A gate failure produces one of three written
responses: **continue**, **re-scope** (change category/city/model, with a named new hypothesis and a new
gate date), or **stop**. Re-scoping must be the *default* expectation at G1 — stopping should be the rare
case, not the celebrated one.

**Severity:** Medium.

---

### 🟠 PITFALL 12 — Trust fragility in a 2.4-million-person market. *(Medium)*

**Where it's latent:** `002` commitment 1 — publish a monthly delivery scorecard.

Publishing is the cheapest trust asset available and our best differentiator. It is also **a rod for our
own back**: a published promise followed by a bad month is worse than never having published, because it
converts a private failure into a public one.

**Fix:** publish with a stated remediation commitment in the same post ("in October we failed 14% of
first attempts; here is what changed"). Amazon tolerates 1% failure across millions of orders. We cannot
tolerate a single viral failure, so over-invest in recovery: refund first, investigate second, and never
argue with a customer over P300 (already in `spec/delivery.md` §12 — formalise it as policy).

**Severity:** Medium.

---

## 2. What we got genuinely right

Not everything is a gap, and the strengths are not small ones:

| Strength | Why it is Amazon-like |
|---|---|
| **Route-level P&L** (`route_weekly_pnl`) | Amazon's discipline is unit-level economics at granular scale. Almost no African marketplace can answer "what did this route earn last week". We can, by construction. |
| **Mandatory delivery failure reason codes** | This is the operational feedback loop that Amazon's metric culture is built on. Free data, compounding weekly. |
| **Seller paid on delivery, not on payment** | Structural protection that plugin commerce cannot do. It makes returns a click and it protects the customer's cash. |
| **Double-entry, append-only ledger** | Amazon-grade money discipline from day one, at 25 orders a day. Most startups discover this at audit. |
| **Gates on evidence, not on effort** | Amazon's "disagree and commit, then measure" culture, reduced to something a team of five can run. |

**The gap is not rigour. The gap is structural economics.** We have built a disciplined operator's
framework, and discipline is necessary but not sufficient for what we said we wanted.

---

## 3. The three that are fatal if unaddressed

Everything else is manageable. These three are not, because they compound:

```
  PITFALL 1  cash absorption  ──┐
                                ├──▶  growth limited by the bank balance, not by demand
  PITFALL 2  density ramp    ──┘

  PITFALL 3  store-based incumbent  ──▶  our moat is weakest where the competitors already are

  PITFALL 4  no high-margin engine   ──▶  never generates the pool that funds the next city
```

Together they describe a specific and very plausible outcome: **a genuinely good, profitable,
P15–30m-revenue Botswana commerce company with a loyal base, that is structurally incapable of becoming
Amazon.** That may be a fine outcome — but it must be a *chosen* one, not a discovered one in year three.

---

## 4. The decision this forces

There are two different companies in this repository, and the framework currently tries to be both.

| | **A. The disciplined operator** | **B. The infrastructure play** |
|---|---|---|
| North star | Contribution per route per week | Third-party volume on our rails |
| Capital | P390k, self-funding, CEDA debt | P5–15m, strategic or institutional |
| Gates | Stop early, protect cash | Grow into share, accept losses |
| Hires | Ops-heavy, engineering contracted | Engineering first, ops second |
| First moat | Delivery promise in one city | Sell delivery to retailers who lack it |
| Risk | Capped by market size | Capped by capital and execution |
| Timeline to "Amazon" | Never | Possible, not likely |

**A and B are not sequential versions of the same company. A does not automatically become B** — the
capability, the cost base and the metrics are different. Choosing A and hoping for B is how founders
wake up in year three with a nice business and a dead ambition.

---

## 5. Required framework amendments (v1.2)

Concrete changes, not sentiments. Each maps to a pitfall above.

| # | Amendment | Fixes |
|---|---|---|
| 1 | **Model cost per drop as a function of drops/day**, not a constant. Add a density curve to `model/afrikart-unit-economics.xlsx` and set the month-1 expectation at P36–40/drop. | 2 |
| 2 | **Add "cash conversion cycle" to the G1 evidence pack**, with a target of ≤25 days and a named owner. Negotiating supplier terms becomes a strategic objective, not a finance chore. | 1 |
| 3 | **Drive prepaid share above 70% by G3.** COD is a trust feature for acquisition, not a permanent cost of doing business. | 1 |
| 4 | **Move third-party fulfilment from P12 to P10.** It is our FBA and our only realistic high-margin line. | 4 |
| 5 | **Budget one engineer on payroll from month 4** (≈P35–55k/month) or strike "technology company" from all external material. | 5 |
| 6 | **Cap daily orders per route** and publish a next-available date. Add pickup points as the overflow valve. Move acquisition spend to *before* payday, delivering after. | 6 |
| 7 | **Add a second north star with an activation trigger** — if a funded competitor enters, switch to orders/day within a defined loss budget, and record the decision. | 7 |
| 8 | **Introduce the two-tier catalogue**: Express (curated, badged) and Marketplace (long-tail, unbadged). | 8 |
| 9 | **Name the category escape trigger and the second category now.** | 9 |
| 10 | **Rename the G1 outcome set** to continue / re-scope / stop, with re-scope as the default expectation. | 11 |
| 11 | **Write the incumbent response** as a standing item in the monthly review: "what did Choppies, Shoprite and Pick n Pay do about delivery this month?" If the answer is ever "launched", the strategy changes that week. | 3 |
| 12 | **Demote AI from pillar to tool** in all material. | 10 |

---

## 6. The one-sentence conclusion

> Our framework is excellent at **not dying**, and silent on **how to win** — so the most likely failure
> is not collapse, it is comfortable, permanent smallness. Fix the three structural pitfalls, decide
> between company A and company B on purpose, and the rest of this document becomes a maintenance list.

---

## 7. What a document cannot fix

Honesty about the fix is worth more than a longer checklist. Three of the twelve are now *written down*
and are still not *solved*, because they are behaviour and money, not prose:

| # | Amendment | Applied where | What still has to happen |
|---|---|---|---|
| 1 | Density curve | Model v2, `002` §3.1 | The curve has to be *climbed*: 45 days of real drops, weekly, with the number on the wall. A model cannot route a scooter. |
| 5 | Engineer from M4 | `002` §8, `005` §5, D-008 | **Founders must choose and fund one of three options.** The model prices them; it cannot pick. Unfunded, the correct move is to strike the pillar from the pitch. |
| 11 | Incumbent response | `002` §10.1, R-08 | Somebody has to actually look, every month, and write "nothing" eleven times a year so that the twelfth is credible. |

And one thing is outside every document in this repo: **the capital has to exist.** The applied plan now
says ≈P500,000 to reach a self-funding business — P390,000 to open the doors and P114,000 of operating
loss absorbed before month 6. If that money is not raised, the fix is a better *plan*, not a better
*document*, and the honest fallback in `005` §5 option 3 (Shopify, 20 SKUs, 60 days, P40,000) is the
right one to take.

---

*Recommended reading order for the next review: `002` §3 (north star) → this document §3 → `005` §5
(capital) → the A/B decision in §4 above. That sequence is the actual strategic conversation, and it is
about ninety minutes of honest arithmetic.*
