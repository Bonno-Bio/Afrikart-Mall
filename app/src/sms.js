/**
 * SMS delivery.
 *
 * An OTP that is generated and never sent is a login that cannot work, and the
 * worst kind of broken feature: it returns success, the customer waits by a
 * phone that will never buzz, and the support inbox fills. So delivery is a
 * first-class dependency here, not a `console.log`.
 *
 * Three rules:
 *
 *   1. **No silent success.** If the message cannot be handed to a gateway, the
 *      caller is told so and the code is destroyed. "Sent" is a claim we only
 *      make when a gateway accepted it.
 *
 *   2. **Provider-agnostic.** The gateway is an HTTP endpoint we POST to, not an
 *      SDK. Botswana SMS aggregators all speak some variant of JSON-or-form with
 *      a sender ID, and a hard dependency on one vendor's Node package is a
 *      migration we would regret at the worst moment.
 *
 *   3. **Production refuses to pretend.** A production process with no gateway
 *      configured should fail loudly at boot, not quietly accept logins that
 *      cannot complete.
 */
import { AppError } from './errors.js';

const BRAND = 'Afrikart';

/** What the customer actually reads. Short, because SMS is charged by length. */
export function otpMessage(code) {
  return `${BRAND}: your code is ${code}. It expires in 5 minutes. Never share it, not even with our staff.`;
}

/**
 * Build a sender.
 *
 * - `http`    — POST {to, message, sender} as JSON, Bearer auth. The shape most
 *               aggregators accept; adjust here, in one place, when a vendor is
 *               chosen.
 * - `console` — development: prints the message. Never selected automatically.
 * - `none`    — nothing configured. Sending throws, which is the point.
 */
export function createSmsSender({
  provider = process.env.SMS_PROVIDER ?? 'none',
  apiUrl = process.env.SMS_API_URL ?? null,
  apiKey = process.env.SMS_API_KEY ?? null,
  senderId = process.env.SMS_SENDER_ID ?? BRAND,
  timeoutMs = 8000,
  fetchImpl = globalThis.fetch,
  log = console,
} = {}) {
  const send = async (to, message) => {
    if (provider === 'console') {
      log.info?.(`[sms] to ${to}: ${message}`);
      return { accepted: true, provider: 'console', messageId: null };
    }

    if (provider === 'http') {
      if (!apiUrl) throw new AppError(503, 'SMS_UNCONFIGURED', 'SMS_API_URL is not set.');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(apiUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ to, message, sender: senderId }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new AppError(502, 'SMS_REJECTED', `The SMS gateway refused the message (${res.status}).`);
        }
        const body = await res.json().catch(() => ({}));
        return { accepted: true, provider: 'http', messageId: body.id ?? body.message_id ?? null };
      } catch (err) {
        if (err instanceof AppError) throw err;
        // A timeout or a network error must not look like success.
        throw new AppError(502, 'SMS_UNAVAILABLE', 'The SMS gateway could not be reached.');
      } finally {
        clearTimeout(timer);
      }
    }

    throw new AppError(503, 'SMS_UNCONFIGURED', 'No SMS gateway is configured; a code cannot be delivered.');
  };

  return { provider, senderId, send, configured: provider !== 'none' && (provider !== 'http' || Boolean(apiUrl)) };
}

/**
 * A production process with no way to send a login code is not ready to serve
 * customers. This returns the reasons, so a boot script can refuse to start and
 * a deployment can fail loudly instead of silently.
 */
export function productionReadiness(env = process.env) {
  const problems = [];
  if (env.NODE_ENV !== 'production') return problems;

  if (!env.SMS_API_URL || (env.SMS_PROVIDER ?? 'none') === 'none') {
    problems.push('SMS gateway is not configured: phone logins cannot be delivered.');
  }
  if (env.ALLOW_DEV_AUTH === '1') {
    problems.push('ALLOW_DEV_AUTH=1 in production: the x-user-id header would grant identity.');
  }
  if (!env.PSP_WEBHOOK_SECRET) {
    problems.push('PSP_WEBHOOK_SECRET is not set: unsigned payment webhooks would be trusted.');
  }
  if (!env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set: the process would run on an in-memory database.');
  }
  return problems;
}
