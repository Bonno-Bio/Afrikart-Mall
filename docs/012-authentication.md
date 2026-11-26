# 012 — Authentication (AFR-41)

**Date:** 25 November 2026
**Tests:** 81 passing (was 72)
**Supabase:** `b2_authentication_otp_sessions` + `b2_auth_tables_deny_by_default` — 41 tables, 7 views, RLS on **41/41**, 0 grants to `anon`/`authenticated` on our schema.

---

## 1. What was wrong

Every ops route and every customer route trusted an `x-user-id` header. Anyone who could guess — or simply read — a UUID was that person. Any stranger could read the ledger, deliver an order, refund it, run payouts, or publish a product. It was fine for a demo and indefensible for a shop, and it was the one remaining gap that made every other guarantee conditional.

## 2. What exists now

**Phone OTP → session token.** `POST /api/auth/otp` takes a Botswana mobile number, `POST /api/auth/verify` takes the six digits, and the reply is a bearer token good for 30 days.

The decisions worth stating:

- **Phone, not email and not a password.** In this market the phone number is the identity, and a password we do not store is a breach we cannot have.
- **The code is never stored.** Only `sha256(otp:phone:code)` is written. Same for the session token: `sessions.token_hash`. A stolen table dump is not a set of usable credentials.
- **A code is single-use, expires in 5 minutes, and dies after 5 wrong guesses.** Six digits is a million guesses; without an attempt cap it is not a secret.
- **A new code kills the old one**, and requests are rate limited to one per phone per minute.
- **A session is revocable.** `POST /api/auth/logout` sets `revoked_at` and the token stops resolving immediately.
- **First verified code creates the account.** For a shop, "sign up" and "sign in" are the same gesture; asking a first-time customer to invent a password before they can buy anything loses them at the door. New accounts are `customer` role, never `admin`.
- **Identity is resolved once, in middleware, before any route.** `x-user-id` now works only when `ALLOW_DEV_AUTH=1`, and even then the role comes from the database, not the header.

## 3. Role checks are real

- Every `/api/ops/*` route and the seller payout views call `requireAdmin` — a customer token gets `403 FORBIDDEN`.
- `GET /api/orders/:number` and its invoice now check ownership: an order number is guessable, and one customer reading another's address is the kind of bug that ends a company's reputation in a small city.
- `POST /api/orders` requires a session at all (`401` without one).

## 4. The bug that made "five attempts" decorative

The first implementation wrapped the whole verification in a transaction, including the failed-attempt increment. Throwing the error rolled the transaction back — **so the penalty for a wrong guess was undone by the failure that caused it.** Five wrong guesses, no lockout, and the sixth attempt got through. A test caught it (`five wrong guesses kill the code…`); the fix is that the attempt counter is written outside the failing path, and the success path takes a row lock so one code cannot produce two sessions.

This is the class of bug that makes a security control look present and be absent, and it is why the tests assert the lockout rather than the existence of the counter.

## 5. The Supabase trap, second occurrence

Creating the two new tables **auto-granted them to `anon` and `authenticated`** — 28 privileges across `otp_challenges` and `sessions`, with RLS off on both. In a hosted Supabase project the `anon` key is public by design, so that is not a theoretical exposure: it is a public read/write window onto a session table. Caught by the post-migration check (`public_grants: 28`, `rls_tables: 39 of 41`) and fixed in its own migration.

**The standing rule, now written in three documents:** in Supabase, every new table or view must be followed in the same pass by `enable row level security` and `revoke all … from anon, authenticated, public`, then re-checked. Deny-by-default is a posture you re-apply, not a setting you configure once.

## 6. What authentication does not do yet

1. **Nothing sends the SMS.** `requestOtp` generates and hashes a code; there is no gateway integration, so in production the code goes nowhere. In development it comes back in the response (`exposeOtpCodes`), which is honest for a local run and catastrophic in production — hence two separate switches (`ALLOW_DEV_AUTH`, `exposeOtpCodes`) and a `NODE_ENV !== 'production'` guard on both. **This is the next blocker: an SMS provider account.**
2. **No rate limiting per IP**, only per phone. A caller can burn through many numbers.
3. **No refresh tokens.** A 30-day session is a long-lived credential; rotation on use is not implemented.
4. **No device/session management UI** beyond `GET /api/auth/me` listing sessions, and no "sign out everywhere".
5. **No step-up authentication** for payout changes or bank details — a single session can do everything its role allows.
6. **Sellers and riders cannot manage their own surface.** `/api/sellers/:id/payouts` is admin-only today; the seller portal is a later phase.

## 7. Where the pilot stands now

Guarantees B1 and B2 promised are no longer conditional on a demo header. What is left before a stranger could be allowed near a real order:

1. **SMS gateway** (blocks every real login).
2. **Reprice or drop PAM-BDP-M46** — the one SKU where the seller loses money.
3. **Bulk import** and a **stocktake** workflow.
4. **Packaging cost** on fulfilment.
5. **Per-IP rate limiting** and session rotation, as hardening rather than as features.
