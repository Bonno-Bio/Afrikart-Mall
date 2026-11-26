# Risk Register

**Owner:** Ops lead · **Reviewed:** monthly, first Tuesday · **Escalation:** any risk whose trigger
fires goes to the CEO the same day.

Scoring: likelihood and impact each 1–5. Anything scoring 15+ has a named owner and a written
mitigation. Anything scoring 20+ stops growth spending until it is reduced.

**R-17 is the one risk mitigated by design rather than by spending.** Address grading ships inside the
launch scope (`M0-07`), so the score reflects the world, not our inaction: it falls as the landmark
dictionary grows and is re-scored at G1. It is also the risk most likely to be underestimated, because
every founder who has only shopped in an addressed country assumes an address is a solved problem.

**Revision 2026-11 (framework v1.3).** Four operational risks appeared, all from
`007-hinderings-last-run.md`: R-17 addresses (20 — the highest score in the register), R-18 vehicle
capacity, R-19 supply lead time, R-20 licensed categories. These are not strategic risks; they are the
ones that stop a machine that was designed correctly.

**Revision 2026-11 (framework v1.2).** Three scores moved and three risks appeared, all from
`006-amazon-gap-analysis.md`. R-04 rose from 15 to 20: the model now shows a **P114,000 operating
trough in month 5**, so "cash squeeze while profitable" is not a tail risk, it is the plan. R-08 was
rewritten: the incumbent threat is not a price war, it is a grocery chain discovering that it already
owns 100 forward warehouses. R-08b keeps the old price-war risk, which is still real but smaller.

---

| ID | Risk | L | I | Score | Trigger we watch | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| R-01 | Delivery never gets cheap enough — orders grow, density does not | 4 | 5 | **20** | Cost per drop not falling 10% per month by M4 | Cost per drop is a gate metric; route design reviewed weekly; hard stop on marketing if it rises 2 weeks running | Ops |
| R-02 | Disintermediation — customers find sellers and transact offline | 4 | 4 | **16** | Sellers asking for customer phone numbers; repeat rate falling while order volume grows | We hold payment and delivery; sellers never receive customer contact details; withdrawal is only via us | CEO |
| R-03 | Basket never grows — cheap single items, one delivery each | 4 | 4 | **16** | AOV flat or falling 3 weeks running | Bundles, minimum order value, free-delivery threshold; AOV is a gate metric | Merchandising |
| R-04 | Cash squeeze while profitable on paper (COD float, inventory, seller receivables) | 4 | 5 | **20** | Cash buffer under 8 weeks of fixed costs; **cumulative operating loss deeper than P114,000 — the modelled trough itself is planned, past it is not** | 13-week cash forecast, daily reconciliation, deposit within 24h, supplier terms to 30 days by G3, prepaid to 70%. The trough is modelled, not discovered: `Ramp` sheet, `005` §5 | Finance |
| R-05 | Reputational damage from one bad delivery week | 3 | 4 | 12 | First-attempt success under 85% for a week | Publish the scorecard honestly; proactive refunds; personal call from the CEO | Ops |
| R-06 | Key-person dependency — founder is the only one who knows how it runs | 4 | 3 | 12 | Any SOP unexecuted for a week without the founder | SOPs by day 90; one unsupervised route by M11; ops manual by M10 | CEO |
| R-07 | Supplier failure or single-supplier dependency in the top category | 3 | 4 | 12 | Top-5 SKU more than 60% supplied by one vendor | Dual-source every top-20 SKU; 4 weeks of cover on best sellers | Merchandising |
| R-08 | **A grocery incumbent turns its stores into forward warehouses** — store-pickup-within-2-hours in Gaborone, which makes "next day" the second-best promise in the customer's mind | 3 | 5 | **15** | (a) Any of Choppies / Shoprite / Pick n Pay / Sefalana announcing online ordering or store fulfilment; (b) our repeat rate falling while category demand is flat | Standing monthly question (`002` §10.1); compete on the long tail and to-the-door delivery of what a supermarket does not stock — never on price, speed or breadth; escalate to a board-level strategy review in the week it is announced | CEO |
| R-08b | Price war with Choppies or a South African chain on FMCG | 3 | 3 | 9 | A competitor pricing below cost on our top-10 SKUs | Do not compete on price for the top-10; move the basket to bundles and beauty where they are not present | CEO |
| R-09 | Fraud and COD abuse | 3 | 3 | 9 | COD refusal rate above 12% | Velocity rules, first-order value cap, phone-number blacklist, COD confinement to Gaborone | Finance |
| R-10 | Regulatory lapse — VAT, data protection, consumer obligations | 2 | 4 | 8 | Any filing date within 14 days | Compliance calendar with 30/14/7-day reminders; external accountant on retainer | Finance |
| R-11 | Platform dependency — WhatsApp/Meta policy or pricing change | 3 | 3 | 9 | Any change to WhatsApp Business terms | Own the customer list; email and SMS as backup; PWA as the primary storefront | Growth |
| R-12 | Currency and import cost shock (Pula vs Rand/USD) | 3 | 3 | 9 | >7% move in 30 days | Hedge by holding less inventory; reprice weekly; SACU sourcing to reduce USD exposure | Finance |
| R-13 | Rider turnover mid-route | 3 | 2 | 6 | Any rider absent without notice | 2 trained relief riders; documented routes; pay above local courier norms | Ops |
| R-14 | A funded competitor buys share we cannot defend on margin | 3 | 4 | 12 | >P5m raised by a direct competitor, or >15% of repeat customers lost in one quarter | Second north star with a written activation trigger: switch to orders/day within a **P150,000 / 90-day** loss budget, recorded as a decision (D-007). Never a drift | CEO |
| R-15 | We call ourselves a technology company and fund no engineer | 4 | 3 | 12 | Six weeks with no code change; every change quoted as a project | Engineer or retainer from M4, or strike the pillar from all material (D-008) | CEO |
| R-17 | **Addresses are not routable** — no postal system, free-text landmarks, pins dropped at the estate gate | 5 | 4 | **20** | >30% of active addresses below `pin_and_landmark`; address-attributable failures above 25% | Graded addresses at checkout (`address_confidence`), landmark dictionary per suburb, rider write-back on every `NO_LANDMARK`; Express withheld from ungraded addresses (`007` H1) | Ops |
| R-18 | **The route hits its physical limit before its drop limit** — formula and nappies are the densest consumer goods sold | 4 | 4 | **16** | Any route whose weight or volume is above 85% while drops are below 15 | Three-way capacity (`route_load`), vehicle class per route, `volume_ml` on every variant, bulky lines on a bakkie day (`007` H2) | Ops |
| R-19 | **Supply does not arrive in time** — 90% of SKUs are imported, 4-week lead time, no local wholesale depth | 4 | 4 | **16** | Opening inventory not landed by week 6 of the build | Buying run booked in week 2, landed-cost sheet per SKU, 4 weeks of cover on the top 20, dual sourcing (`007` H3) | Merchandising |
| R-20 | **A regulated product is listed without its paperwork** — infant formula, cosmetics, restricted ingredients | 3 | 5 | **15** | Any live product in a `licence_required` category with `compliance_status = 'unchecked'` | Category licence fields, `compliance_status` gate before listing, restricted-ingredient screen, one-page licence matrix in `registers/compliance.md` (`007` H4) | CEO |
| R-16 | Comfortable, permanent smallness — every gate says continue, nothing compounds | 3 | 4 | 12 | Contribution per route flat 3 months; third-party volume below 5% at M9 | Gates redefined as continue / re-scope / stop with re-scope expected; third-party fulfilment at P10; density and AOV as the only two growth levers | CEO |

---

## Standing questions for the monthly review

1. Which score went **up** this month, and what did we do about it?
2. Which trigger fired and was not noticed until the review? (That is a monitoring failure, not a risk
   failure.)
3. Which mitigation exists only on this page and not in an SOP?
