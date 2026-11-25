import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshDb, IDS } from './helpers.js';
import { createApp } from '../src/server.js';

const SECRET = 'test-webhook-secret';

async function withServer(fn) {
  const db = await freshDb();
  const app = createApp({ db, webhookSecret: SECRET });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-id': IDS.customer, ...headers },
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

const cart = [{ variantId: IDS.variantFormula, quantity: 2 }];

test('health reports the engine it is actually running', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(['pglite', 'postgres'].includes(res.body.engine));
  });
});

test('quote then order then webhook then delivery, over HTTP', async () => {
  await withServer(async ({ call }) => {
    const quote = await call('/api/checkout/quote', {
      method: 'POST',
      body: { items: cart, addressId: IDS.addressVerified, deliveryMethod: 'express', paymentMethod: 'card' },
    });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.totalMinor, 40800);
    assert.equal(quote.body.deliveryOptions[0].id, 'express');
    assert.equal(quote.body._internal, undefined, 'internal pricing data must not leak to the browser');

    const placed = await call('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'http-1' },
      body: { items: cart, addressId: IDS.addressVerified, deliveryMethod: 'express', paymentMethod: 'card' },
    });
    assert.equal(placed.status, 201);
    assert.match(placed.body.orderNumber, /^AK-/);

    const payload = JSON.stringify({
      event: 'payment.captured',
      data: { paymentId: placed.body.paymentId, providerRef: 'PSP-HTTP-1', providerFeeMinor: 510 },
    });
    const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    const hook = await call('/api/webhooks/psp', {
      method: 'POST',
      headers: { 'x-psp-signature': signature },
      body: JSON.parse(payload),
    });
    assert.equal(hook.status, 200);
    assert.equal(hook.body.status, 'captured');

    const delivered = await call(`/api/ops/orders/${placed.body.orderNumber}/deliver`, { method: 'POST', body: {} });
    assert.equal(delivered.status, 200);
    assert.equal(delivered.body.status, 'delivered');

    const invoice = await call(`/api/orders/${placed.body.orderNumber}/invoice`);
    assert.equal(invoice.status, 200);
    assert.match(invoice.text, /TAX INVOICE/);
    assert.match(invoice.text, /VAT @ 14%/);
    assert.match(invoice.text, /P408\.00/);
  });
});

test('a webhook with the wrong signature is rejected and changes nothing', async () => {
  await withServer(async ({ call, db }) => {
    const placed = await call('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'http-2' },
      body: { items: cart, addressId: IDS.addressVerified, deliveryMethod: 'express', paymentMethod: 'card' },
    });

    const { rows: txns } = await db.query('select count(*)::int as n from ledger_transactions');
    const txnsBefore = txns[0].n;

    const res = await call('/api/webhooks/psp', {
      method: 'POST',
      headers: { 'x-psp-signature': 'deadbeef' },
      body: { event: 'payment.captured', data: { paymentId: placed.body.paymentId } },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'BAD_SIGNATURE');

    // Seeded postings already exist; what matters is that the rejected webhook
    // added none of its own.
    const ledger = await db.query('select count(*)::int as n from ledger_transactions');
    assert.equal(ledger.rows[0].n, txnsBefore);
  });
});

test('errors use the one envelope the client was promised', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'http-3' },
      body: { items: [{ variantId: IDS.variantFormula, quantity: 41 }], addressId: IDS.addressVerified },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK');
    assert.ok(res.body.error.message.length > 0);
    assert.ok(res.body.error.request_id);
  });
});

test('a replayed order request over HTTP returns the same order number', async () => {
  await withServer(async ({ call }) => {
    const body = { items: cart, addressId: IDS.addressVerified, deliveryMethod: 'express', paymentMethod: 'card' };
    const first = await call('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': 'dup' }, body });
    const second = await call('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': 'dup' }, body });
    assert.equal(second.status, 201);
    assert.equal(second.body.orderNumber, first.body.orderNumber);
    assert.equal(second.body.replayed, true);
  });
});

test('an unknown path is a 404 in the same envelope, never an HTML page', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

test('the trial balance endpoint proves the books balance', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/ops/ledger');
    assert.equal(res.status, 200);
    assert.equal(res.body.balanced, true);
    assert.equal(res.body.debit, res.body.credit);
  });
});
