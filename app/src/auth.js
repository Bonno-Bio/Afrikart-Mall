/**
 * Authentication — AFR-41.
 *
 * Until this file existed the API believed whatever `x-user-id` header it was
 * handed, and every ops route was reachable by anyone who could guess a UUID.
 * That is fine for a demo and indefensible for a shop.
 *
 * The choices, and why:
 *
 *   - **Phone OTP, not passwords.** A Botswana customer's phone number is a
 *     better identity than an email address, and a password they will reuse is a
 *     liability we would have to store carefully forever.
 *   - **The code and the token are stored as hashes.** A six-digit code or a
 *     session token sitting in plaintext in a table is a credential sitting in
 *     every backup and every support screenshot.
 *   - **A code is single-use and dies after five wrong tries.** Six digits is a
 *     million guesses; without an attempt cap and an expiry it is not a secret.
 *   - **A session is revocable.** Logging out has to mean something.
 */
import crypto from 'node:crypto';
import { AppError } from './errors.js';
import { otpMessage } from './sms.js';

const CODE_TTL_SECONDS = 300;
const SESSION_TTL_DAYS = 30;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const hashCode = (phone, code) =>
  crypto.createHash('sha256').update(`otp:${phone}:${code}`).digest('hex');
const hashToken = (token) => crypto.createHash('sha256').update(`session:${token}`).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** E.164 or nothing. A number we cannot dial is not an identity. */
export function normalisePhone(input) {
  const raw = String(input ?? '').replace(/[\s()-]/g, '');
  if (/^\+267\d{8}$/.test(raw)) return raw;
  if (/^267\d{8}$/.test(raw)) return `+${raw}`;
  if (/^0\d{8}$/.test(raw)) return `+267${raw.slice(1)}`;
  throw new AppError(400, 'INVALID_PHONE', 'Enter a Botswana mobile number, for example +267 71 000 001.', {
    field: 'phone',
  });
}

const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Ask for a code.
 *
 * Returns the code itself only when `exposeCode` is set — which is true for
 * development and for the test suite, and false in production, where the code
 * leaves by SMS and never by HTTP. An endpoint that returns its own OTP is an
 * endpoint that authenticates nobody.
 */
export async function requestOtp(
  db,
  { phone, purpose = 'login', ip = null, exposeCode = false, sender = null } = {},
) {
  const normalised = normalisePhone(phone);

  const recent = await db.query(
    `select created_at from otp_challenges
      where phone = $1 and created_at > now() - make_interval(secs => $2)
      order by created_at desc limit 1`,
    [normalised, RESEND_COOLDOWN_SECONDS],
  );
  if (recent.rows.length > 0) {
    throw new AppError(429, 'OTP_RATE_LIMITED', 'A code was just sent to that number. Wait a minute.', {
      retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
    });
  }

  // Any earlier live code stops working the moment a new one is requested.
  await db.query(
    `update otp_challenges set consumed_at = now()
      where phone = $1 and consumed_at is null`,
    [normalised],
  );

  const code = sixDigits();
  const res = await db.query(
    `insert into otp_challenges (phone, code_hash, purpose, max_attempts, expires_at, requested_ip)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5), $6)
     returning id, expires_at`,
    [normalised, hashCode(normalised, code), purpose, MAX_ATTEMPTS, CODE_TTL_SECONDS, ip],
  );

  const challenge = {
    challengeId: res.rows[0].id,
    phone: normalised,
    expiresAt: res.rows[0].expires_at,
    expiresInSeconds: CODE_TTL_SECONDS,
  };

  // Delivery is not optional in production. If the message cannot be handed to
  // a gateway, the code is destroyed and the caller is told: "sent" is a claim,
  // and an unsent code that looks sent is how a login fails silently.
  if (sender) {
    try {
      const delivery = await sender.send(normalised, otpMessage(code));
      return { ...challenge, delivered: true, provider: delivery.provider, ...(exposeCode ? { devCode: code } : {}) };
    } catch (err) {
      await db.query(`update otp_challenges set consumed_at = now() where id = $1`, [challenge.challengeId]);
      throw err;
    }
  }

  return { ...challenge, delivered: false, ...(exposeCode ? { devCode: code } : {}) };
}

/**
 * Check a code and, if it is right, hand back a session.
 *
 * A correct code creates the account if this phone has never been seen: for a
 * shop, "sign up" and "sign in" are the same gesture, and asking a first-time
 * customer to choose a password before they can buy anything is a way of losing
 * them at the door.
 */
export async function verifyOtp(db, { phone, code, userAgent = null, ip = null } = {}) {
  const normalised = normalisePhone(phone);
  const submitted = String(code ?? '').trim();
  if (!/^\d{6}$/.test(submitted)) {
    throw new AppError(400, 'INVALID_CODE', 'Enter the six-digit code.', { field: 'code' });
  }

  // The attempt counter is written OUTSIDE the failing path's transaction on
  // purpose. A wrong guess that rolls back its own penalty is a guess-counting
  // scheme that counts nothing: five wrong tries, no lockout, and the sixth
  // gets through.
  const found = await db.query(
    `select id, code_hash, attempts, max_attempts, expires_at, consumed_at
       from otp_challenges
      where phone = $1 and consumed_at is null
      order by created_at desc limit 1`,
    [normalised],
  );
  const challenge = found.rows[0];
  if (!challenge) {
    throw new AppError(410, 'OTP_EXPIRED', 'That code has expired. Ask for a new one.');
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await db.query(`update otp_challenges set consumed_at = now() where id = $1`, [challenge.id]);
    throw new AppError(410, 'OTP_EXPIRED', 'That code has expired. Ask for a new one.');
  }
  if (Number(challenge.attempts) >= Number(challenge.max_attempts)) {
    throw new AppError(429, 'OTP_LOCKED', 'Too many attempts. Ask for a new code.');
  }

  if (!safeEqual(challenge.code_hash, hashCode(normalised, submitted))) {
    const attempts = Number(challenge.attempts) + 1;
    await db.query(
      `update otp_challenges
          set attempts = $2,
              consumed_at = case when $2 >= max_attempts then now() else consumed_at end
        where id = $1`,
      [challenge.id, attempts],
    );
    throw new AppError(401, 'OTP_INVALID', 'That code is not right.', {
      attemptsLeft: Math.max(0, Number(challenge.max_attempts) - attempts),
    });
  }

  return db.transaction(async (tx) => {
    // Re-read under a lock: two requests with the same correct code must not
    // both win the race and produce two sessions from one code.
    const locked = await tx.query(
      `select id, consumed_at from otp_challenges where id = $1 for update`,
      [challenge.id],
    );
    if (locked.rows[0]?.consumed_at) {
      throw new AppError(410, 'OTP_EXPIRED', 'That code has already been used. Ask for a new one.');
    }
    await tx.query(`update otp_challenges set consumed_at = now() where id = $1`, [challenge.id]);

    const existing = await tx.query(`select id, email, full_name, role, status from users where phone = $1`, [
      normalised,
    ]);

    let user = existing.rows[0];
    if (user && user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'That account is not active.');
    }
    if (!user) {
      const created = await tx.query(
        `insert into users (email, phone, full_name, role, phone_verified_at)
         values ($1, $2, $3, 'customer', now())
         returning id, email, full_name, role, status`,
        [`${normalised.replace('+', '')}@phone.afrikart.co.bw`, normalised, 'New customer'],
      );
      user = created.rows[0];
    } else {
      await tx.query(`update users set phone_verified_at = coalesce(phone_verified_at, now()) where id = $1`, [
        user.id,
      ]);
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const session = await tx.query(
      `insert into sessions (user_id, token_hash, user_agent, ip, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(days => $5))
       returning id, expires_at`,
      [user.id, hashToken(token), userAgent, ip, SESSION_TTL_DAYS],
    );

    return {
      token,
      sessionId: session.rows[0].id,
      expiresAt: session.rows[0].expires_at,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
      isNewAccount: existing.rows.length === 0,
    };
  });
}

/** Resolve a bearer token to a user, or null. Never trusts a header beyond it. */
export async function userFromToken(db, token) {
  if (!token) return null;
  const res = await db.query(
    `select s.id as session_id, s.expires_at, s.revoked_at,
            u.id, u.email, u.full_name, u.role, u.status
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1`,
    [hashToken(token)],
  );
  const row = res.rows[0];
  if (!row || row.revoked_at || row.status !== 'active') return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  await db.query(`update sessions set last_used_at = now() where id = $1`, [row.session_id]);
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

export async function revokeSession(db, { token }) {
  if (!token) return { revoked: false };
  const res = await db.query(
    `update sessions set revoked_at = now()
      where token_hash = $1 and revoked_at is null
      returning id`,
    [hashToken(token)],
  );
  return { revoked: res.rows.length > 0 };
}

/** Every live session for a user — the "where am I signed in" screen. */
export async function listSessions(db, { userId }) {
  const res = await db.query(
    `select id, created_at, last_used_at, expires_at, user_agent
       from sessions
      where user_id = $1 and revoked_at is null and expires_at > now()
      order by last_used_at desc`,
    [userId],
  );
  return res.rows;
}

export const AUTH_CONSTANTS = {
  CODE_TTL_SECONDS,
  SESSION_TTL_DAYS,
  RESEND_COOLDOWN_SECONDS,
  MAX_ATTEMPTS,
};
