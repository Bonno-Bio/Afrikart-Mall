# Payment Provider — Question Sheet and Scorecard

**Why this document exists:** the PSP is the critical path of the entire build (2–6 weeks of
underwriting). Choosing badly costs either a rewrite of the payment path or, worse, a launch with
money we cannot settle or reconcile.

**How to run this:** send to at least three providers on day 2. Require written answers. Phone answers
are worth nothing. Score each out of 5 per row.

---

## Part A — The five questions that actually decide it

Everyone says "yes, we support Botswana". Ask these instead.

### A1. Do you have a documented **Orange Money** and **MyZaka** API today, with sandbox credentials?
Not "we can integrate it". Not "through a partner". A documented endpoint, a sandbox, and a named
engineer who will answer questions.
- 5 = both, documented, sandbox live today
- 3 = one native, the other via a partner with a stated lead time
- 1 = "we can build it"
- 0 = no

### A2. What is your settlement cycle to a Botswana bank account, in writing?
- 5 = T+1 or better, automatic
- 3 = T+2/T+3
- 1 = weekly or "on request"
- 0 = refused to commit in writing

### A3. Who holds the customer's funds, and are you licensed by the **Bank of Botswana**?
- 5 = licensed, funds segregated, licence number provided
- 3 = licensed via a sponsor bank, explained clearly
- 0 = evasive

### A4. What are your refund and chargeback processes and SLAs?
- 5 = API refunds, documented chargeback flow, written SLA
- 3 = API refunds, manual chargebacks
- 1 = refunds by email request
- 0 = no API

### A5. Give me two Botswana merchants I can call.
- 5 = two, in our categories, willing to talk
- 3 = two, but neither will discuss settlement
- 0 = none

---

## Part B — Commercial and operational

| # | Question | Why it matters |
|---|---|---|
| B1 | Full fee schedule: card, Orange Money, MyZaka, cross-border, refunds, chargebacks | A 1% difference on thin retail margin is the entire contribution |
| B2 | Monthly or minimum fees? | At 600 orders/month, a P500 minimum is material |
| B3 | Do you support **partial** refunds via API? | Returns are never all-or-nothing in practice |
| B4 | Idempotency: how do you prevent a duplicate capture on retry? | This is the failure that destroys trust |
| B5 | Webhook retries and signature scheme | Unsigned or non-retrying webhooks mean manual reconciliation forever |
| B6 | Hosted fields or direct API for cards? | Determines our PCI scope: SAQ-A vs SAQ-D |
| B7 | Sandbox: is it a real simulation or a stub? | A stub sandbox means the integration is untested until launch |
| B8 | Are subscriptions/tokenised cards supported? | Needed for the nappy subscription in Q2 |
| B9 | What is your uptime, and what happens to in-flight payments during downtime? | Cash-on-delivery spikes whenever a rail fails |
| B10 | Data: where are card and PII stored, and who is the controller? | Data Protection Act 2024 obligations |
| B11 | Integration effort, in your estimate, for a Next.js app with webhooks | Sanity-check the M3 estimate |
| B12 | Contract: term, notice period, exit and data return | Never sign a 24-month lock-in for a pilot |

---

## Part C — Scorecard

| Criterion | Weight | Provider 1 | Provider 2 | Provider 3 |
|---|---|---|---|---|
| A1 Mobile money API (native, sandboxed) | 25% | | | |
| A2 Settlement cycle | 15% | | | |
| A3 Licensing and fund segregation | 15% | | | |
| A4 Refunds and chargebacks | 10% | | | |
| B1 Total cost at 600 orders/month | 15% | | | |
| B5/B6 Webhooks and hosted fields | 10% | | | |
| A5 References | 5% | | | |
| B12 Contract flexibility | 5% | | | |
| **Weighted total** | 100% | | | |

**Decision rule:** reject any provider scoring 0 on A2, A3 or A4, regardless of price. A cheap
provider who cannot commit to settlement in writing is a cash-flow crisis with a nicer invoice.

---

## Part D — The parallel-track note

Underwriting usually cannot finish until the company is registered and the bank account exists. That
is not a reason to wait: request quotes against the intended company name on **day 2**, submit the
full application the day the CIPC/CIPA certificate lands, and keep the builder working on M0–M2 (which
need no payment provider at all) while underwriting runs.

**The one thing that must not happen:** the builder writing a payment integration against an invented
interface and then discovering the real provider's semantics differ. M3 starts when the contract is
signed, not before. See `docs/004-build-readiness.md` §8.
