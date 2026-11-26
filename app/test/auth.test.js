/**
 * Authentication — AFR-41.
 *
 * Before this, the API believed any `x-user-id` header it was handed. These
 * tests hold the properties that make a login real rather than decorative: the
 * code is never stored, it dies after five guesses, it works once, the session
 * can be revoked, and a customer cannot reach the staff surface.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS } from './helpers.js';
import { createApp } from '../src/server.js';
import { requestOtp, verifyOtp, userFromToken } from '../src/auth.js';

const CUSTOMER_PHONE = '+26771000001';

async function withServer(fn, opts = {}) {
  const db = await freshDb();
  const app = createApp({ db, devAuth: false, exposeOtpCodes: true, ...opts });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json, text };
  };
  try {
    await fn({ call, db });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
}

// --- the code itself -------------------------------------------------------

test('the code is never stored in plaintext, and is single-use', async () => {
  const db = await freshDb();
  const { devCode } = await requestOtp(db, { phone: CUSTOMER_PHONE, exposeCode: true });

  const stored = await db.query(`select code_hash from otp_challenges order by created_at desc limit 1`);
  assert.notEqual(stored.rows[0].code_hash, devCode);
  assert.equal(stored.rows[0].code_hash.length, 64);

  const session = await verifyOtp(db, { phone: CUSTOMER_PHONE, code: devCode });
  assert.ok(session.token.length > 30);
  assert.equal(session.user.id, IDS.customer, 'an existing phone signs into the existing account');
  assert.equal(session.isNewAccount, false);

  await assert.rejects(
    () => verifyOtp(db, { phone: CUSTOMER_PHONE, code: devCode }),
    (err) => err.code === 'OTP_EXPIRED',
    'the same code must not work twice',
  );
});

test('five wrong guesses kill the code, and the sixth attempt is refused even if right', async () => {
  const db = await freshDb();
  const { devCode } = await requestOtp(db, { phone: '+26771000009', exposeCode: true });

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      () => verifyOtp(db, { phone: '+26771000009', code: '000000' === devCode ? '111111' : '000000' }),
      (err) => err.code === 'OTP_INVALID',
    );
  }

  await assert.rejects(
    () => verifyOtp(db, { phone: '+26771000009', code: devCode }),
    (err) => err.code === 'OTP_EXPIRED' || err.code === 'OTP_LOCKED',
  );
});

test('an expired code is refused, and a fresh request kills the old one', async () => {
  const db = await freshDb();
  const first = await requestOtp(db, { phone: '+26771000002', exposeCode: true });

  // A second request inside the cooldown is refused outright...
  await assert.rejects(
    () => requestOtp(db, { phone: '+26771000002', exposeCode: true }),
    (err) => err.code === 'OTP_RATE_LIMITED',
  );

  // ...and once it is allowed, the earlier code is dead.
  await db.query(`update otp_challenges set created_at = now() - interval '5 minutes'`);
  const second = await requestOtp(db, { phone: '+26771000002', exposeCode: true });
  assert.notEqual(second.challengeId, first.challengeId);

  await assert.rejects(
    () => verifyOtp(db, { phone: '+26771000002', code: first.devCode ?? '123456' }),
    (err) => err.code === 'OTP_INVALID' || err.code === 'OTP_EXPIRED',
  );
});

test('an unknown phone creates a customer account on first verified code', async () => {
  const db = await freshDb();
  const { devCode } = await requestOtp(db, { phone: '+26774000111', exposeCode: true });
  const session = await verifyOtp(db, { phone: '+26774000111', code: devCode });

  assert.equal(session.isNewAccount, true);
  assert.equal(session.user.role, 'customer');
  const count = await db.query(`select count(*)::int as n from users where phone = '+26774000111'`);
  assert.equal(count.rows[0].n, 1);
});

test('a phone number that is not a Botswana mobile is refused', async () => {
  const db = await freshDb();
  await assert.rejects(
    () => requestOtp(db, { phone: '12345' }),
    (err) => err.code === 'INVALID_PHONE',
  );
});

// --- the session -----------------------------------------------------------

test('a session resolves to its user, and stops resolving after logout', async () => {
  const db = await freshDb();
  const { devCode } = await requestOtp(db, { phone: CUSTOMER_PHONE, exposeCode: true });
  const { token } = await verifyOtp(db, { phone: CUSTOMER_PHONE, code: devCode });

  const user = await userFromToken(db, token);
  assert.equal(user.id, IDS.customer);

  await db.query(`update sessions set revoked_at = now()`);
  assert.equal(await userFromToken(db, token), null);
});

// --- over HTTP -------------------------------------------------------------

test('the full login works over HTTP, and the token is what opens the door', async () => {
  await withServer(async ({ call }) => {
    const requested = await call('/api/auth/otp', {
      method: 'POST',
      body: { phone: CUSTOMER_PHONE },
    });
    assert.equal(requested.status, 201);
    assert.ok(requested.body.devCode, 'dev exposures exist so the flow is testable without an SMS gateway');

    const verified = await call('/api/auth/verify', {
      method: 'POST',
      body: { phone: CUSTOMER_PHONE, code: requested.body.devCode },
    });
    assert.equal(verified.status, 201);
    const token = verified.body.token;

    const me = await call('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, IDS.customer);
    assert.equal(me.body.sessions.length, 1);

    // No token: the till is closed.
    const anonymous = await call('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'authless' },
      body: { items: [{ variantId: IDS.variantFormula, quantity: 1 }], addressId: IDS.addressVerified },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error.code, 'UNAUTHORISED');

    // With the token it opens.
    const placed = await call('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'with-token', authorization: `Bearer ${token}` },
      body: {
        items: [{ variantId: IDS.variantFormula, quantity: 1 }],
        addressId: IDS.addressVerified,
        deliveryMethod: 'express',
        paymentMethod: 'cod',
        scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      },
    });
    assert.equal(placed.status, 201);

    const out = await call('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    assert.equal(out.body.revoked, true);

    const after = await call('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(after.status, 401);
    assert.equal(after.body.error.code, 'SESSION_INVALID');
  });
});

test('a customer token cannot reach the staff surface; a dev header cannot either', async () => {
  await withServer(async ({ call }) => {
    const { body } = await call('/api/auth/otp', { method: 'POST', body: { phone: CUSTOMER_PHONE } });
    const { body: session } = await call('/api/auth/verify', {
      method: 'POST',
      body: { phone: CUSTOMER_PHONE, code: body.devCode },
    });

    const forbidden = await call('/api/ops/ledger', {
      headers: { authorization: `Bearer ${session.token}` },
    });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'FORBIDDEN');

    // The old shortcut does nothing when dev auth is off.
    const legacy = await call('/api/ops/ledger', { headers: { 'x-user-id': IDS.admin } });
    assert.equal(legacy.status, 401);
  });
});

test('one customer cannot read another customer’s order', async () => {
  await withServer(async ({ call, db }) => {
    const { body } = await call('/api/auth/otp', { method: 'POST', body: { phone: CUSTOMER_PHONE } });
    const { body: session } = await call('/api/auth/verify', {
      method: 'POST',
      body: { phone: CUSTOMER_PHONE, code: body.devCode },
    });
    const placed = await call('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'owner-check', authorization: `Bearer ${session.token}` },
      body: {
        items: [{ variantId: IDS.variantFormula, quantity: 1 }],
        addressId: IDS.addressVerified,
        deliveryMethod: 'express',
        paymentMethod: 'cod',
        scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      },
    });
    assert.equal(placed.status, 201);

    // A second customer, a different phone.
    const second = await call('/api/auth/otp', { method: 'POST', body: { phone: '+26774000222' } });
    const secondSession = await call('/api/auth/verify', {
      method: 'POST',
      body: { phone: '+26774000222', code: second.body.devCode },
    });

    const peek = await call(`/api/orders/${placed.body.orderNumber}`, {
      headers: { authorization: `Bearer ${secondSession.body.token}` },
    });
    assert.equal(peek.status, 403);

    const own = await call(`/api/orders/${placed.body.orderNumber}`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    assert.equal(own.status, 200);
    assert.ok(db);
  });
});
