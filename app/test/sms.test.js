/**
 * SMS delivery.
 *
 * An OTP that is generated and never sent is a login that cannot work, and the
 * worst kind of broken feature: it returns success, the customer waits by a
 * silent phone, and support fills up. These tests hold the rules that stop that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.js';
import { createApp } from '../src/server.js';
import { requestOtp, verifyOtp } from '../src/auth.js';
import { createSmsSender, otpMessage, productionReadiness } from '../src/sms.js';

/** A sender that records what it was asked to deliver. */
const recorder = () => {
  const sent = [];
  return {
    sent,
    provider: 'test',
    configured: true,
    send: async (to, message) => {
      sent.push({ to, message });
      return { accepted: true, provider: 'test', messageId: `msg-${sent.length}` };
    },
  };
};

test('the message is short, carries the code, and tells the customer not to share it', () => {
  const message = otpMessage('123456');
  assert.match(message, /123456/);
  assert.match(message, /Afrikart/);
  assert.match(message, /Never share/i);
  assert.ok(message.length <= 160, `SMS is charged by length; this is ${message.length} characters`);
});

test('a configured sender delivers the code, and the response does not contain it', async () => {
  const db = await freshDb();
  const sms = recorder();

  const result = await requestOtp(db, { phone: '+26771000002', sender: sms });

  assert.equal(result.delivered, true);
  assert.equal(result.devCode, undefined, 'the code must never come back over HTTP in production shape');
  assert.equal(sms.sent.length, 1);
  assert.equal(sms.sent[0].to, '+26771000002');

  const code = sms.sent[0].message.match(/\b(\d{6})\b/)[1];
  const session = await verifyOtp(db, { phone: '+26771000002', code });
  assert.ok(session.token);
});

test('a failed gateway destroys the code and reports failure, rather than pretending', async () => {
  const db = await freshDb();
  const broken = {
    provider: 'http',
    configured: true,
    send: async () => {
      throw new Error('gateway down');
    },
  };

  await assert.rejects(() => requestOtp(db, { phone: '+26771000003', sender: broken }), /gateway down/);

  // Nothing is left for the customer to use, and nothing is left for an attacker.
  const live = await db.query(`select count(*)::int as n from otp_challenges where consumed_at is null`);
  assert.equal(live.rows[0].n, 0);
});

test('the http sender posts the shape an aggregator expects, with the sender id', async () => {
  const calls = [];
  const sender = createSmsSender({
    provider: 'http',
    apiUrl: 'https://sms.example.test/send',
    apiKey: 'secret-key',
    senderId: 'AFRIKART',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ id: 'gw-1' }) };
    },
  });

  const result = await sender.send('+26771000004', otpMessage('654321'));
  assert.equal(result.messageId, 'gw-1');
  assert.equal(calls[0].url, 'https://sms.example.test/send');
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret-key');
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.to, '+26771000004');
  assert.equal(payload.sender, 'AFRIKART');
  assert.match(payload.message, /654321/);
});

test('a gateway that answers with an error is not treated as success', async () => {
  const sender = createSmsSender({
    provider: 'http',
    apiUrl: 'https://sms.example.test/send',
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
  await assert.rejects(() => sender.send('+26771000005', 'hello'), (err) => err.code === 'SMS_REJECTED');
});

test('an unconfigured sender refuses to send, and says why', async () => {
  const sender = createSmsSender({ provider: 'none' });
  assert.equal(sender.configured, false);
  await assert.rejects(() => sender.send('+26771000006', 'hello'), (err) => err.code === 'SMS_UNCONFIGURED');
});

test('production refuses to start without an SMS gateway, dev auth, or secrets', () => {
  const problems = productionReadiness({ NODE_ENV: 'production', ALLOW_DEV_AUTH: '1' });
  assert.equal(problems.length, 4);
  assert.ok(problems.some((p) => /SMS/.test(p)));
  assert.ok(problems.some((p) => /ALLOW_DEV_AUTH/.test(p)));
  assert.ok(problems.some((p) => /PSP_WEBHOOK_SECRET/.test(p)));
  assert.ok(problems.some((p) => /DATABASE_URL/.test(p)));

  const ready = productionReadiness({
    NODE_ENV: 'production',
    SMS_API_URL: 'https://sms.example.test/send',
    SMS_PROVIDER: 'http',
    PSP_WEBHOOK_SECRET: 'x',
    DATABASE_URL: 'postgres://y',
  });
  assert.deepEqual(ready, []);

  // Development is allowed to be incomplete.
  assert.deepEqual(productionReadiness({ NODE_ENV: 'development' }), []);
});

test('the endpoint refuses a login it cannot deliver, and succeeds through a real gateway path', async () => {
  const db = await freshDb();
  const sms = recorder();

  const app = createApp({ db, devAuth: false, exposeOtpCodes: false, sms });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const ok = await fetch(`${base}/api/auth/otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+26771000007' }),
    });
    assert.equal(ok.status, 201);
    const body = await ok.json();
    assert.equal(body.delivered, true);
    assert.equal(body.devCode, undefined);
    assert.equal(sms.sent.length, 1);

    // Same app, no gateway: an honest 503 instead of a login that cannot finish.
    const bare = createApp({ db, devAuth: false, exposeOtpCodes: false });
    const server2 = bare.listen(0, '127.0.0.1');
    await new Promise((resolve) => server2.once('listening', resolve));
    const base2 = `http://127.0.0.1:${server2.address().port}`;
    try {
      const refused = await fetch(`${base2}/api/auth/otp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+26771000008' }),
      });
      assert.equal(refused.status, 503);
      const err = await refused.json();
      assert.equal(err.error.code, 'SMS_UNCONFIGURED');
    } finally {
      await new Promise((resolve) => server2.close(resolve));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
