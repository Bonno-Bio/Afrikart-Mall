# Production Stack Decision

**Status:** Recommendation for sign-off · **Supersedes:** the prototype runtime (see §6)
**Companion:** `db/schema.sql` — the production data model this decision commits us to

---

## 1. The verdict

> **Next.js (server-rendered React) + PostgreSQL on Supabase + a licensed payment provider.**
> Buy the commodity (payments, auth, hosting, email). Own the moat (money ledger, inventory,
> delivery routing). Do not put the prototype in `product/` into production.

**WordPress is not disqualified because it is old. It is disqualified because our moat is the two
things WooCommerce cannot do well: seller settlement accounting and route-level delivery.** You would
end up writing custom PHP for exactly the parts that make the business worth anything — on the most
attacked CMS on the internet, with a plugin stack that fails on update.

And "React" is not a stack. React is a view layer. The thing I built with React was the problem, not
React: the data layer was a JSON file, which cannot survive two users at once let alone two riders.

---

## 2. Why the question "WordPress or React?" is the wrong question

Four questions actually decide this, and they have nothing to do with framework preference:

| Question | Why it decides everything | Our answer |
|---|---|---|
| **Who maintains it in month 14?** | A stack nobody local can maintain is a stack you will pay a foreign agency to maintain forever. | One named owner (hire or partner), with the schema and docs in this repo as the handover artifact |
| **What must we own?** | Own the differentiator, buy everything else. | Money ledger, inventory truth, delivery routing. Buy payments, auth, hosting, email. |
| **How do we take money safely?** | PCI scope, mobile money APIs, idempotency, refunds, VAT invoices. | Licensed PSP, hosted fields, zero card data on our servers |
| **How do customers find us?** | A marketplace lives on organic search and WhatsApp link previews. | Server-rendered HTML, not a client-rendered shell |

That last one is not theoretical. A client-side SPA serves an empty `<div>` to a crawler and **no
preview at all** to WhatsApp. In a market where the product link is shared in a WhatsApp group before
it is ever googled, that is a distribution failure disguised as an engineering preference. Server
rendering is a growth decision.

---

## 3. The comparison, scored on what this business actually needs

| | WooCommerce + Dokan | Shopify + multivendor app | **Next.js + Postgres** | Medusa / Saleor |
|---|---|---|---|---|
| Live in 2 weeks | ✅ | ✅ | ⚠️ 4–6 weeks | ⚠️ 6 weeks |
| Multi-vendor with settlement ledger | ⚠️ plugin, weak reconciliation | ⚠️ app, weak reconciliation | ✅ exactly as we need | ✅ |
| Route / delivery management | ❌ custom plugin | ❌ | ✅ | ⚠️ custom |
| Mobile money (Orange, MyZaka) | ⚠️ thin plugins, verify | ⚠️ varies, verify | ✅ whatever the PSP offers | ✅ |
| PCI scope | ⚠️ depends on gateway | ✅ | ✅ hosted fields | ✅ |
| Security surface | ❌ the most attacked CMS | ✅ | ✅ small | ✅ small |
| SEO / WhatsApp previews | ✅ | ✅ | ✅ with SSR | ✅ with SSR |
| Cost at launch | P300–800/mo | P600–1,500/mo + 2% gateway fee | P600–900/mo | P600–900/mo |
| Cost to change later | ❌ rewrite | ❌ rewrite | — | ⚠️ partial |
| Can it model contribution per route? | ❌ | ❌ | ✅ view in `schema.sql` | ⚠️ |
| Runs without a developer for a month | ✅ | ✅ | ❌ needs ops discipline | ❌ |

**Why not Shopify:** no Shopify Payments in Botswana, so every transaction carries an extra
third-party gateway fee on top of an already thin margin, and the multi-vendor apps are built for
single-country Western stores. It is a superb single-seller store and a poor marketplace.

**Why not Medusa/Saleor:** genuinely good foundations, but they bring a learning curve and an
opinionated model we would fight on seller settlements. If we wanted a headless commerce core, this
would be the second choice — not the first.

---

## 4. What we buy, and what we own

| Layer | Decision | Why |
|---|---|---|
| **Hosting** | Vercel (app) + Supabase (database, storage, auth) | Zero ops at our volume; both have Botswana-friendly latency via EU regions |
| **Database** | PostgreSQL — the schema in `db/schema.sql` | Money needs transactions and constraints. This is not negotiable. |
| **Auth** | Supabase Auth (phone OTP first) | Phone is the real identity in this market; email is secondary |
| **Payments** | A licensed PSP with card + Orange Money + MyZaka | **Get three quotes. The deciding question is not the rate — it is: do you have a documented Orange Money and MyZaka API, and do you settle T+1?** |
| **Card data** | Hosted fields only — never touches our servers | Keeps us in PCI SAQ-A instead of SAQ-D |
| **Email / SMS** | Transactional provider + local SMS aggregator | Volumes are tiny; cost is irrelevant, reliability is not |
| **WhatsApp** | Business API via a provider | This is the primary support channel, not an add-on |
| **Search (later)** | Meilisearch | Postgres full-text is enough until ~5,000 SKUs |
| **Monitoring** | Sentry + uptime pings | You cannot fix what you cannot see |
| **Ledger, inventory, routing** | **Ours.** | This is the business |

---

## 5. The money architecture (the part that separates a shop from a company)

Six rules. They are already enforced in `db/schema.sql`.

1. **All money is `bigint` in thebe.** No floats, ever. `0.1 + 0.2` has ended companies.
2. **Double-entry, append-only ledger.** Every sale posts: debit PSP receivable, credit seller
   payable, credit commission revenue, credit fulfilment revenue, credit delivery revenue, credit VAT
   payable. A deferred constraint rejects any transaction that does not balance to zero.
3. **Order lines snapshot the price, the tax rate and the commission rate.** Changing a rate tomorrow
   must not rewrite last month's books.
4. **Seller payable is derived from the ledger, never stored as a number.** What we owe a seller is a
   query, not a column — because a column will drift and a query cannot.
5. **Every money endpoint is idempotent.** One key per request, stored with the response. Charging a
   customer twice is the one error support cannot undo.
6. **Cash on delivery is reconciled daily per rider, with a float limit.** A variance is investigated
   the same day; a variance over the limit suspends the rider until it is resolved.

The single most valuable query in the system is already written: **`route_weekly_pnl`**. It answers
whether the business works. Almost no marketplace in this market can answer it, because they never
modelled the route.

---

## 6. What the prototype actually was — and what to do with it

You are right to push back on simulation, so let me be precise about which parts were real.

| Part | Was it real? | Verdict |
|---|---|---|
| Domain model (orders, items, snapshots, timeline) | ✅ Real, and now formalised in `db/schema.sql` | **Keep.** This is the expensive thinking. |
| Flows and screens (search → PDP → cart → checkout → tracking → seller → admin) | ✅ Real decisions, already made | **Keep.** ~3 weeks of product design you do not have to redo. |
| API surface and role rules (`001` §4) | ✅ Real | **Keep.** Same endpoints, same contracts. |
| Data layer (JSON file) | ❌ Simulation | **Replace** with Postgres. The schema is written. |
| Auth (scrypt + in-memory session) | ❌ Simulation | **Replace** with Supabase Auth / OTP. |
| Payments (fake card form) | ❌ Simulation | **Replace** with a PSP. |
| Images (generated tiles) | ❌ Placeholder | **Replace** with real photography — this is an ops task, not a coding one. |
| Seeded catalogue and orders | ❌ Demo data | **Replace** with real suppliers. |

**So: `product/` is a clickable specification, not a product.** It is worth roughly three weeks of
design and architecture. It is not worth deploying, and it should not be shown to a customer as if it
were live. `docs/001` already said this; the answer to your question is to say it more plainly.

---

## 7. Cost to run, honestly

| Item | Monthly |
|---|---|
| Vercel Pro | P280 |
| Supabase Pro | P340 |
| Domain, DNS, email | P40 |
| Monitoring | P0 (free tier) |
| WhatsApp + SMS (at 1,000 orders/mo) | P250–500 |
| **Total infrastructure** | **≈ P650–900** |
| PSP fees (2.5–3.5% of GMV) | variable |
| **Build (one-off)** | |
| Local Gaborone dev shop | P120,000–250,000 |
| Senior remote contractor, 3 months | $7,500–13,500 (≈ P105,000–190,000) |

Infrastructure is not the constraint. **The constraint is one competent builder and the discipline to
keep the scope to the schema.** At 25 orders a day, this stack is over-provisioned for a year — which
is exactly right, because you do not want to migrate during your first Christmas.

---

## 8. Who to hire, and the one question that filters them

Hire **one senior full-stack engineer** (contract or partner) who has shipped a payment flow before.
Not a WordPress person, not a "we do everything" agency, not three freelancers.

**The interview is one question.** Put `db/schema.sql` in front of them and ask:

> *"A customer orders three items from two sellers and pays by Orange Money. Walk me through every
> ledger entry from payment capture to the Friday payout, and tell me what happens if the delivery
> fails and the customer wants a refund instead of a redelivery."*

Someone who has handled money will draw the entries and immediately ask about idempotency and the
partial refund. Someone who has only built CRUD will describe updating a `balance` column. That
distinction is worth more than any CV.

**Payment provider: ask each of the three this, in writing.** Not "do you support Botswana" —
everyone says yes. Ask:

1. Do you have a documented **Orange Money** and **MyZaka** API, with sandbox credentials, today?
2. What is your **settlement cycle** to a Botswana bank account, in writing?
3. Who holds the funds, and are you licensed by the **Bank of Botswana**?
4. What is your **refund and chargeback** process and SLA?
5. Give me two Botswana merchants I can call.

If a provider cannot answer all five, they are not a provider yet.

---

## 9. Migration plan, four weeks

| Week | Do | Done when |
|---|---|---|
| 1 | Provision Supabase; run `db/schema.sql`; seed categories only. Set up Vercel + a staging URL. | Migrations run clean from empty |
| 2 | Rebuild auth (phone OTP), catalogue CRUD, and the storefront pages against real tables. Port the API surface from `001` §4 unchanged. | A real product can be created by a seller and found by a customer |
| 3 | PSP integration with hosted fields + webhooks + idempotency. Post the ledger entries. Build the reconciliation report. | One real P1 order taken end to end, ledger balanced |
| 4 | Rider PWA (route list, reason codes, proof photo), seller dashboard on real data, invoices with sequential numbering. | One real delivery completed with a reason code logged |

Then: **run the pilot, and do not add features until gate G1 passes.**

---

## 10. The honest fallback

If you cannot get a competent builder within 30 days, do not wait and do not compromise the
architecture. Instead:

> Open a **single-vendor Shopify store** with 20 SKUs in one category, run it for 60 days, and prove
> that people in Gaborone will pay for next-day delivery with returns.

That is not a failure of ambition — it is buying demand evidence cheaply while you recruit. What you
must **not** do is put a marketplace with seller settlements on WordPress and hope. The settlements
are where the accounting risk lives, and plugin-grade accounting is how small companies discover they
owe a seller money they have already spent.

---

*Decision record: D-005 in `registers/decisions.md`. Reversal condition: if the chosen PSP cannot
support Orange Money within 30 days of contracting, we switch provider before writing a line of
payment code — not after.*
