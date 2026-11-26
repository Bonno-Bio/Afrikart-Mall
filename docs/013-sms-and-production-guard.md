# 013 — SMS delivery, and a production guard that refuses to pretend

**Date:** 25 November 2026
**Tests:** 89 passing (was 81)
**Commit:** `d15a62b` on `arena/b9ad95dd-afrikart-mall`

---

## 1. The gap this closes

`docs/012` ended with the sentence that mattered: *nothing sends the SMS*. The login returned a code that existed only in a response body. In production that is the worst kind of broken feature — it reports success, the customer waits by a phone that never buzzes, and the failure surfaces as a support complaint rather than an error.

## 2. What was built

`app/src/sms.js`, and a small change in `auth.requestOtp`.

- **Provider-agnostic HTTP sender.** `SMS_PROVIDER=http` posts `{to, message, sender}` as JSON with a bearer key to `SMS_API_URL`. No vendor SDK: every Botswana aggregator speaks a variant of this, and a hard dependency on one vendor's Node package is a migration we would regret at the worst moment. One function to change when a vendor is chosen.
- **A failed send destroys the code.** If the gateway rejects the message or cannot be reached, the challenge is marked consumed and the caller gets `502 SMS_REJECTED` / `SMS_UNAVAILABLE` / `503 SMS_UNCONFIGURED`. *Sent* is a claim we only make when a gateway accepted it.
- **Timeouts, not hangs.** 8 seconds, via `AbortController`; a network error never looks like success (there is a test for the 500 case specifically).
- **The message is 160 characters**, carries the code, names the brand, and tells the customer not to share it — including with our own staff, which is the line that stops the most common social-engineering script.
- **The code never travels over HTTP in production shape.** `exposeOtpCodes` is a separate switch from `ALLOW_DEV_AUTH`, and both are refused when `NODE_ENV=production`.

## 3. The guard, proved rather than described

`productionReadiness()` returns the reasons a production process is not fit to serve customers, and the boot path exits non-zero when the list is not empty. Run against this checkout:

```
$ NODE_ENV=production node src/server.js
refusing to start in production:
  - SMS gateway is not configured: phone logins cannot be delivered.
  - PSP_WEBHOOK_SECRET is not set: unsigned payment webhooks would be trusted.
  - DATABASE_URL is not set: the process would run on an in-memory database.
exit=1
```

With the gateway and the webhook secret supplied but no database, it still refuses — correctly, because an in-memory database in production loses every order on restart:

```
refusing to start in production:
  - DATABASE_URL is not set: the process would run on an in-memory database.
exit=1
```

This is the most useful thing in the file. A deployment to a serverless platform, or a container, or a bored operator, now fails at the first second with a reason instead of at the first customer with silence.

## 4. What is still missing

1. **No vendor is signed up.** The abstraction is real and tested against a stub; the account, the sender ID registration and the price per message are not. That is a purchase, not a commit.
2. **No delivery receipts.** We know a gateway accepted a message; we do not know a phone received it. DLR callbacks are the next increment, and they are what turns "sent" into "delivered".
3. **No fallback channel** (voice call-back, WhatsApp) and no resend-with-backoff beyond the one-per-minute limit.
4. **No per-number daily cap** — a caller can request a code every minute indefinitely. Cheap, but it is revenue for the aggregator and a nuisance for the customer.
5. **The guard checks configuration, not capability.** It cannot know a gateway key has been revoked; only a live send proves that, and the first send of the day is where it will be discovered.

## 5. Where the pilot stands

Three of the five items that stood between this and a soft launch are now done or honestly blocked on a purchase:

| Item | State |
|---|---|
| Authentication (AFR-41) | **built** — phone OTP, sessions, roles, ownership |
| SMS delivery | **built, vendor not signed up** — the one remaining purchase |
| Reprice or drop PAM-BDP-M46 | open — supplier conversation, flagged by the API |
| Bulk import | open |
| Stocktake workflow | open |
| Packaging cost on fulfilment | open |

The next engineering work that does not depend on anybody else's signature: **bulk import** (ten SKUs by seed is a demo, forty by API at 11pm is a typo factory) and the **stocktake** that stops `on_hand` drifting into fiction.
