# The Last Run — what will actually stop us running like Amazon

**Status:** the operational critique. `006` audited the *framework*; this audits the *machine*.
**Method:** forget the strategy documents for an hour. Ask one question: **if the build finished
tomorrow and we had P1m in the bank, what would stop us operating like Amazon?**

Twelve answers, none of them strategic. They are physical, legal, data and product problems — the kind
that kill companies that did the strategy well. Each one is fixed in a named artefact, or named as
something only money and time can fix.

> **One honest sentence first.** We will not run like Amazon. Amazon in 1997 did not run like Amazon
> either: it sold books, out of a garage, with no marketplace, no Prime, no ads, no cloud. What we can
> copy is the *machine of 1997* — a promise kept, one category deep, a funnel measured, cost per unit
> falling. What we cannot copy is anything that requires their scale to exist. `007` §3 lists the four
> mechanisms that transfer and §4 the six that must be refused.

---

## 1. The twelve hinderings

### H1 · There are no addresses — the data layer is missing
**Severity: fatal. This is the most Amazon-unlike thing about Botswana.**

Amazon's machine begins with an address: a normalised string, geocoded, grouped into a route, optimised.
Botswana has no residential postal addressing. Deliveries run on a plot number, a landmark ("behind the
Total filling station"), a ward, and a WhatsApp pin. That is not a UI inconvenience — it is the input to
every downstream system we planned:

| What we assumed | What we actually have |
|---|---|
| Address → geocode → cluster into routes | Plot number + free-text landmark + optional pin |
| Failed delivery = customer absent | Failed delivery = **we could not find the house** |
| Route optimisation as a graph problem | Route planning as local knowledge held by one rider |
| First-attempt success of 93% (developed market) | 85% is optimistic until addresses are verified |

Until addresses are a *first-class, verified, graded data asset*, cost per drop, first-attempt success,
route density and every metric in `002` §3.2 are being measured through fog.

**The fix.** Address quality is a stored property, not an assumption: `address_confidence`
(`verified` / `pin_and_landmark` / `pin_only` / `landmark_only` / `unverified`), `access_notes` (gate
codes, "third gate past the church"), rider-verified timestamps, and a **landmark dictionary** per suburb
that accumulates every correction a rider makes. Landed in `db/schema.sql` (`addresses`, `landmarks`).
Operationally: **any address below `pin_and_landmark` cannot be promised Express** — it is routed as
marketplace with a phone call first. The rider's failed-drop reason `NO_LANDMARK` now feeds the
dictionary instead of a report nobody reads.

---

### H2 · The route is limited by weight and volume, not by drops
**Severity: high. It breaks the density maths we just built.**

We modelled a route as 22 drops. A case of infant formula is ~6 kg and ~14 litres. Twenty-two of them is
**132 kg and 308 litres** — which does not fit on a scooter with panniers, and barely fits in a
hatchback. Our own delivery spec assumes a scooter-based route and a nappy-and-formula basket. Those two
statements cannot both be true.

The consequence is worse than a capacity error: **the density curve in `002` §3.1 assumes the constraint
is drops**, so a route filled with bulky goods hits its physical limit at 9–11 drops and the cost per
drop never falls to P18 no matter how good the marketing is. We would chase a number that the vehicle
forbids.

**The fix.** Three capacities per route, not one: `daily_capacity`, `max_weight_grams`,
`max_volume_ml`, plus `vehicle_class` (`scooter` / `car` / `bakkie` / `van`) — all in `db/schema.sql`,
with a `route_load` view that sums promised weight and volume per route per day. Products carry
`volume_ml` and a `parcel_class` (`small` / `bulky` / `fragile` / `cold`). The pack screen refuses to
load a route past any of its three limits, and checkout switches vehicle class rather than silently
overloading. **Bulky categories get a bakkie day, small parcels get a scooter day** — that is how the
P18 drop survives contact with a case of formula.

---

### H3 · There is no supply chain behind the shelf
**Severity: fatal to selection. Fatal to the flywheel.**

Amazon's flywheel starts with *selection*, and selection starts with supply. Botswana retail is supplied
by South African distributors and a thin layer of local wholesalers; roughly nine in ten SKUs we would
sell are imported. Nobody in our documents has asked the question: **who physically gets 40 SKUs into a
70 m² unit in Gaborone, on what terms, in what lead time?**

Without that answer there is no catalogue, and therefore no traffic, no repeat, no business. Our plan
currently assumes suppliers appear when we sign them.

**The fix.** A **buying function** as a first-class operating area (`002` §5 area 8 now carries
procurement), with: a supplier register and payment terms (`suppliers`, `purchase_orders` — already in
the schema), a **landed-cost sheet** (goods + freight + duty + clearing + FX, per SKU — the only number
that tells you whether a price is a business), a **four-week cover rule** on the top 20 SKUs, dual
sourcing on everything (R-07), and a standing **monthly buying run to Johannesburg** in the calendar.
First run booked in week 2 of the build, not after it — because the inventory is what makes the storefront
real and it has a four-week lead time.

---

### H4 · Our wedge categories are the regulated ones
**Severity: high. A compliance stop on day one, discovered late.**

Baby & mother and hair & beauty are the right commercial wedge (`002` §2.1) and the wrong regulatory
wedge. Infant formula carries labelling, composition and sometimes registration duties; cosmetics and
skin-care carry ingredient restrictions, and the "skin-lightening" segment is restricted in several SACU
markets. Botswana additionally requires certain product licences and standards conformance (BOBS) and
import permits for some categories.

Selling these casually is not a small risk. **A single restricted-ingredient listing is a recall, a fine
and a news story** — and Amazon-like breadth means *hundreds* of such listings, each one a chance to get
it wrong.

**The fix.** Compliance becomes a property of the category and the listing, not a memo: `categories`
carries `licence_required`, `licence_authority`, `restricted_ingredients`; `products` carries
`compliance_status` (`unchecked` / `verified` / `blocked`) and `compliance_doc_url`. **Nothing in a
regulated category goes live with `compliance_status = 'unchecked'`**, and a blocked ingredient list is
checked at listing time, not at audit time. A one-page licence matrix (category → authority → document →
renewal date) goes into `registers/compliance.md` in week 1. *Confirm the exact duties with BOBS and the
accountant — this document names the mechanism, not the statute.*

---

### H5 · Mobile money cannot be debited — so a "subscription" is a reminder
**Severity: medium, but it silently breaks a G2 promise.**

`002` Q2 promises ≥40 active subscriptions by month 6. Card-on-file recurring billing is a card
primitive. Orange Money and MyZaka are **push payments**: the customer authorises each one, and a
merchant our size has no debit mandate. A subscription that "charges automatically" is a subscription
that charges nobody.

**The fix.** Say what it is. `subscriptions` in `db/schema.sql` now carries `payment_mode`
(`card_token` / `push_request`), `next_charge_at`, and a `subscription_charges` table with
`requested / paid / skipped / failed / expired` — because the interesting state is `expired`. Operationally:
a WhatsApp request two days before the date, a one-tap pay link, a 48-hour window, and a discount
(`discount_bps`) as the incentive to actually pay. The G2 metric changes from "40 active subscriptions" to
**"40 subscriptions with a ≥70% on-time payment rate"** — which is the only version that means anything.

---

### H6 · Refunds on these rails are manual, and slow
**Severity: medium. Directly attacks the one promise we are judged on.**

Amazon's refund is a button. A mobile-money reversal is a manual back-office action with a human on the
other end, often next business day. Our promise — "if it is wrong we take it back" — is a promise about
*speed*, and our rails cannot deliver it at Amazon speed.

**The fix.** Split the refund into the part we control and the part we do not. `refunds` now carries
`channel` (`original_method` / `store_credit` / `bank_transfer`), `credited_minor` and `sla_due_at`:
**store credit is instant, always**; the money-back reversal runs to a 48-hour SLA and is visible in the
tracking page as a state, not a mystery. Customers who take credit get a small bonus (P20) — cheaper than
the support call, and it keeps the cash in the business. This is the "never argue over P300" policy
(`002` §13) given a data model.

---

### H7 · Picking has no geography
**Severity: medium now, fatal at 300 orders/day.**

A 70 m² unit with 60 SKUs is a shelf and a memory. That works until it does not: the picker walks the
room four times per order, gets the wrong size off a shelf that holds three sizes, and the error shows up
as a failed delivery — which costs the trip twice. Amazon's answer is a warehouse management system; our
answer at this size is a **bin code**.

**The fix.** `inventory_levels.bin_code` and `pick_sequence`; pick lists sorted by the walk, not by the
order; scan-confirm on the bin, not just the parcel; a weekly cycle count of ten bins. Target metric:
**pick error rate < 0.5%** and **pick time < 90 seconds per order**. Same change makes the unit safely
transferable to a second picker — which is H11.

---

### H8 · Nothing is measured, so the flywheel has no axle
**Severity: high. It is the difference between a shop and a learning machine.**

Amazon's flywheel turns because every visit, search and abandonment is captured. Our metric tree
(`002` §3.2) names sessions, conversion, attach rate, CAC — and there is no event pipeline to produce
any of them. We would launch blind and argue about numbers we cannot see.

**The fix.** Eight events, not a data lake: `product_view`, `search`, `search_zero_results`,
`add_to_cart`, `checkout_start`, `order_placed`, `order_delivered`, `order_failed` — `analytics_events`
in `db/schema.sql`. `search_zero_results` is the most valuable of the eight: it is the customer telling
us what to buy next. Ship it in the first build week, before the storefront is finished, because
retrofitting instrumentation is how analytics projects die.

---

### H9 · Every number in the model is a hypothesis, and we are about to spend P285k on them
**Severity: high. It is the cheapest thing to fix and the most expensive to skip.**

AOV P380, 5 orders/day in month 1, 60% COD, 30% gross margin, a 6-week build — all invented, all
plausible, all unvalidated. Amazon tested with real traffic in a category where the marginal cost of a
wrong guess was a returns label.

**The fix.** A **demand test before the build is contracted**: a WhatsApp catalogue of 40 real SKUs with
real prices, P300–500 of targeted ads in two Gaborone suburbs, 10 days, one page, one number — *how many
people add to cart and how many of those will pay a deposit?* If fewer than 2% of visitors express intent,
the category or the price band is wrong and we have learned it for P500 instead of P285,000. This runs in
week 0, in parallel with the PSP conversation, and it is the cheapest de-risking available to us. Full
protocol in `005` §1 (Sprint Zero).

---

### H10 · Zero reviews at launch — the conversion mechanism does not exist yet
**Severity: medium, time-limited.**

Amazon's product page converts because of reviews; ours would launch with none. We cannot buy that. What
we can do is make the *first* promise credible by other means: a written money-back guarantee, the
delivery scorecard published from week one, supplier references, and a photographed, named team. Then
reviews arrive — verified-purchase only, which is a database constraint (`reviews` already joins
`order_items`), never imported from a supplier.

**The fix.** Publish the scorecard before you have reviews, and publish the bad weeks too (`002` §13).
A store that shows a 91% first-attempt rate is more credible than one showing three five-star reviews
written by the founders' friends.

---

### H11 · One rider, one picker, one founder — no bench
**Severity: medium. It is the difference between a bad week and a closed business.**

We plan for one of each (`005` P5). A rider's appendix, a picker's family funeral, a founder's flu — any
one of them stops the route. Amazon solves this with depth; we solve it with **written work and one
trained relief**.

**The fix.** One relief rider trained before launch, paid a retainer; every route documented to the
standard where a stranger can run it (that is already G4 evidence — it moves to *launch* evidence for
route one); the picker's job card posted on the wall. Cost: ~P3,000/month. Cheapest insurance in the
plan.

---

### H12 · "Like Amazon" sets an expectation we cannot fund, and that is a business risk
**Severity: strategic. It affects who invests, who applies, and what customers expect.**

Say "Amazon of Botswana" in a pitch and you invite comparison with a company that spends more on cloud
infrastructure in an hour than our annual budget. Investors who hear it will price a capital requirement
we do not have; customers who hear it will expect next-hour delivery and infinite aisle; staff who hear
it will expect a tech salary. The gap between the claim and the machine becomes a credibility tax on
everything else.

**The fix.** One sentence, used everywhere (`002` §1 now carries it): **"The reliable way to buy things in
Botswana — ordered today, delivered tomorrow, taken back if it is wrong."** Ambition stays in the
strategy; the *claim* stays inside what the machine can do this quarter. Amazon is the model of
*mechanism*, not of *scale*.

---

## 2. The four mechanisms that do transfer

Amazon 1997, not Amazon 2024. These are cheap, they compound, and none needs scale to start.

| Mechanism | What it is here | Where it lives |
|---|---|---|
| **A promise kept, narrowly** | One city, one route, next day, returns honoured. Refuse everything else. | `002` §1, §4.1 |
| **Cost per unit falling with volume** | The density curve, and three capacity constraints that keep it honest | `002` §3.1, `route_load` |
| **Owned fixed cost rented to others** | Third-party parcels on our route from P10 — the FBA analogue | `005` P10 |
| **The funnel measured** | Eight events, four ratios, reviewed weekly | `analytics_events`, `002` §3.2 |

## 3. The six that must be refused, with the reason

| Refused | Why, specifically |
|---|---|
| **1-Click ordering** | Needs tokenised card-on-file at scale. Card penetration here does not support it; mobile money cannot store a mandate. |
| **Prime** | A subscription must buy something. It buys speed, and speed is a function of density we do not have until ~25 orders/day on one route. |
| **A9 search advertising** | An ads business needs advertiser density. At 60 SKUs we would be selling ads to ourselves. |
| **AWS** | The only genuinely high-margin business in Amazon's stack, and it required a decade of software margins to fund. Not available to a P285k company. |
| **Self-serve marketplace at launch** | Sellers bring catalogue *and* problems: fraud, fake goods, price chaos, support load. We hold the promise until delivery is boring (D-001). |
| **Infinite aisle** | Breadth without supply chain (H3) is a support queue. Two categories, done properly, then a tier (`002` §2.1). |

---

## 4. What starts on Monday (independent of any contract)

Five things, none of which needs a developer, all of which the build needs:

| # | Task | Owner | Done when |
|---|---|---|---|
| 1 | **PSP quotes ×3** via `docs/hiring/psp-questions.md`, including the mobile-money debit-mandate question (H5) | Founder | Three written quotes, one sandbox |
| 2 | **Demand test** — WhatsApp catalogue, 40 SKUs, P500 of ads, 10 days (H9) | Growth | ≥2% intent rate, or a category change |
| 3 | **Buying run booked** — 5 suppliers, landed-cost sheet started (H3) | Founder | Dates in the calendar, prices in writing |
| 4 | **Licence check** — formula and cosmetics, BOBS/BURS/accountant (H4) | Founder | `registers/compliance.md` row per category |
| 5 | **Address audit** — collect 50 real pilot addresses, grade them (H1) | Ops | ≥70% reach `pin_and_landmark` or better |

If those five are running, the build is de-risked. If they are waiting for the build, the build will
finish and the business will not start.

---

## 5. What this does to the plan

It changes the *sequence*, not the strategy. The platform we were going to build in 13 weeks is the
platform of a company with sellers, subscriptions and a marketplace. **We are not that company on day
one. We are a shop with a route.**

`005-build-phases.md` **v2.0** is the remap: a **Route One** launch in eight weeks, on a reduced scope,
for ≈P285k, with everything that is not needed to take one order and deliver it correctly moved behind
G1 — and the rest of the platform funded by trading rather than by capital. The full-detail catalogue of
the original phases survives in `005` §3 for when we need it.
