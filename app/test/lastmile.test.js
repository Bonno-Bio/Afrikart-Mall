/**
 * What the last mile actually costs, and where the payment fee lands (AFR-53).
 *
 * `docs/018` reported the gap in the books: a delivery fee was posted as revenue
 * with no cost behind it, and the provider's fee was posted against the payment
 * rather than the order, so neither number reached a per-order margin. These
 * tests hold both costs where they belong, and check that the margin report now
 * sees them without being told twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery } from '../src/delivery.js';
import { capturePayment } from '../src/payments.js';
import {
  openRun,
  closeRun,
  lastMileReport,
  riderPayable,
  recordPspFee,
  splitPerDrop,
} from '../src/lastmile.js';
import { orderMargins } from '../src/profitability.js';
import { balance, trialBalance, ACCOUNTS } from '../src/ledger.js';
import { createApp } from '../src/server.js';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
const key = () => `lm-${(seq += 1)}`;

async function order(db, lines, paymentMethod = 'cod') {
  return placeOrder(db, {
    userId: IDS.customer,
    items: lines,
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod,
    scheduledDate: tomorrow(),
    idempotencyKey: key(),
  });
}

test('a run divides exactly, with no thebe lost to rounding', async () => {
  assert.deepEqual(splitPerDrop(1000, 4), [250, 250, 250, 250]);
  assert.deepEqual(splitPerDrop(1000, 3), [334, 333, 333], 'the remainder does not vanish');
  assert.equal(splitPerDrop(1000, 3).reduce((a, v) => a + v, 0), 1000);
  assert.deepEqual(splitPerDrop(0, 2), [0, 0]);
  assert.throws(() => splitPerDrop(1000, 0), (err) => err.code === 'NO_DROPS');
  assert.throws(() => splitPerDrop(-5, 1), (err) => err.code === 'BAD_RUN_COST');
});

test('closing a run posts each drop its share, and the rider is owed the total', async () => {
  const db = await freshDb();
  const a = await order(db, items(IDS.variantNappies, 1));
  const b = await order(db, items(IDS.variantLotion, 1));
  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });
  await recordDelivery(db, { orderNumber: b.orderNumber, riderId: IDS.rider });

  const run = await openRun(db, {
    routeId: IDS.routeWest,
    riderId: IDS.rider,
    runDate: today(),
    riderPayMinor: 25000,
    fuelMinor: 12000,
  });
  assert.equal(run.status, 'open');
  assert.equal(run.costMinor, 37000, 'P250 rider pay plus P120 fuel');
  assert.equal(await balance(db, ACCOUNTS.LAST_MILE), 0, 'nothing posts until the run closes');

  const closed = await closeRun(db, { runId: run.runId, actorId: IDS.admin });
  assert.equal(closed.drops, 2);
  assert.equal(closed.totalMinor, 37000);
  assert.equal(closed.perDropMinor, 18500);
  assert.equal(closed.allocatedMinor, 37000);

  assert.equal(await balance(db, ACCOUNTS.LAST_MILE), 37000);
  // Debit-minus-credit, so a liability reads negative.
  assert.equal(await balance(db, ACCOUNTS.RIDER_PAYABLE), -37000);

  const payable = await riderPayable(db);
  assert.equal(payable.owedMinor, 37000);
  assert.equal(payable.riders[0].riderName, 'Dineo Mothusi');
  assert.equal(payable.riders[0].runs, 1);

  assert.equal((await trialBalance(db)).balanced, true);
});

test('a run cannot be closed twice, or closed with no drops', async () => {
  const db = await freshDb();

  const empty = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 20000 });
  await assert.rejects(() => closeRun(db, { runId: empty.runId }), (err) => {
    assert.equal(err.code, 'NO_DROPS');
    return true;
  });

  const a = await order(db, items(IDS.variantNappies, 1));
  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });
  const run = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 20000 });
  await closeRun(db, { runId: run.runId });

  await assert.rejects(() => closeRun(db, { runId: run.runId }), (err) => {
    assert.equal(err.code, 'RUN_CLOSED');
    return true;
  });
  assert.equal(await balance(db, ACCOUNTS.LAST_MILE), 20000, 'charged once, not twice');
});

test('a run with no cost is refused rather than silently free', async () => {
  const db = await freshDb();
  const a = await order(db, items(IDS.variantNappies, 1));
  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });

  const run = await openRun(db, { riderId: IDS.rider, runDate: today() });
  await assert.rejects(() => closeRun(db, { runId: run.runId }), (err) => {
    assert.equal(err.code, 'RUN_HAS_NO_COST');
    return true;
  });
});

test('the cost lands on the order, so the margin report sees it without being told', async () => {
  const db = await freshDb();
  const a = await order(db, items(IDS.variantNappies, 1));
  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });

  const before = (await orderMargins(db)).rows[0];
  assert.equal(before.lastMileMinor, 0);
  assert.equal(before.deliveryUncosted, true, 'the fee is posted and the cost behind it is not');

  const run = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 25000, fuelMinor: 12000 });
  await closeRun(db, { runId: run.runId });

  const after = (await orderMargins(db)).rows[0];
  assert.equal(after.lastMileMinor, 37000);
  assert.equal(after.deliveryUncosted, false, 'the drop now has a cost, so the fee is no longer an upper bound');
  assert.equal(after.goodsMarginMinor, before.goodsMarginMinor - 37000, 'the drop is a cost of this order');
  assert.equal(after.netMarginMinor, before.netMarginMinor - 37000);
  assert.equal(after.lossMaking, true, 'one pack of nappies does not pay for a P370 trip');
  assert.equal((await orderMargins(db)).tieOut.reconciles, true, 'and the tie-out still holds');
});

test('an order already costed by one run is not charged by the next', async () => {
  const db = await freshDb();
  const a = await order(db, items(IDS.variantNappies, 1));
  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });

  const first = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 20000 });
  await closeRun(db, { runId: first.runId });

  // A second run the same day: the deliveries are already costed, so it has no
  // drops of its own and is refused rather than charging the customer twice.
  const second = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 20000 });
  await assert.rejects(() => closeRun(db, { runId: second.runId }), (err) => {
    assert.equal(err.code, 'NO_DROPS');
    return true;
  });
  assert.equal(await balance(db, ACCOUNTS.LAST_MILE), 20000);
});

test('the report answers whether the delivery fee pays for the drop', async () => {
  const db = await freshDb();
  const a = await order(db, items(IDS.variantLotion, 1)); // under the free-delivery threshold
  const b = await order(db, items(IDS.variantNappies, 2)); // free delivery
  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });
  await recordDelivery(db, { orderNumber: b.orderNumber, riderId: IDS.rider });

  const reportBefore = await lastMileReport(db);
  assert.equal(reportBefore.totals.uncostedDeliveries, 2, 'both deliveries are still carrying no cost');
  assert.equal(reportBefore.totals.feeCoversDrop, null, 'no cost, no verdict');

  const run = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 25000, fuelMinor: 12000 });
  await closeRun(db, { runId: run.runId });

  const report = await lastMileReport(db);
  assert.equal(report.totals.closedRuns, 1);
  assert.equal(report.totals.drops, 2);
  assert.equal(report.totals.costMinor, 37000);
  assert.equal(report.totals.perDropMinor, 18500);
  assert.equal(report.totals.uncostedDeliveries, 0);
  assert.equal(report.totals.lastMileCostMinor, 37000);
  assert.equal(report.totals.deliveryRevenueMinor, 2632, 'one P30 fee, VAT excluded');
  assert.equal(report.totals.deliveryMarginMinor, 2632 - 37000);
  assert.equal(report.totals.feeCoversDrop, false, 'P26.32 of fee does not pay for an P185 drop');
  assert.equal(report.runs[0].riderName, 'Dineo Mothusi');
  assert.equal(report.runs[0].routeName, null);
});

test('a payment fee is a cost of the order, not of the act of capturing', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantNappies, 1), 'card');
  const payment = (await db.query(`select id from payments where order_id = (select id from orders where order_number = $1)`, [
    placed.orderNumber,
  ])).rows[0];

  await capturePayment(db, { paymentId: payment.id, providerRef: 'psp-ref-1', providerFeeMinor: 900 });

  // The order appears in the report before delivery, because the fee alone is
  // enough to attribute a cost to it: revenue nil, cost P9.
  const report = await orderMargins(db);
  const row = report.rows[0];
  assert.equal(row.marketplaceRevenueMinor, 0);
  assert.equal(row.pspFeeMinor, 900);
  assert.equal(row.goodsMarginMinor, -900);
  const feeRows = await db.query(
    `select le.debit_minor from ledger_entries le
       join ledger_transactions t on t.id = le.transaction_id
      where le.account_code = $1 and t.ref_type = 'order' and t.ref_id = (select id from orders where order_number = $2)`,
    [ACCOUNTS.PSP_FEES, placed.orderNumber],
  );
  assert.equal(feeRows.rows.length, 1);
  assert.equal(Number(feeRows.rows[0].debit_minor), 900);

  await recordDelivery(db, { orderNumber: placed.orderNumber, riderId: IDS.rider });
  const after = (await orderMargins(db)).rows[0];
  assert.equal(after.pspFeeMinor, 900, 'now it is inside the order margin, where it belongs');
  assert.equal(after.marketplaceRevenueMinor - after.costMinor, after.goodsMarginMinor);
  assert.equal((await trialBalance(db)).balanced, true);
});

test('a late settlement fee can be added to the order, and a bad fee is refused', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantNappies, 1), 'card');
  const orderRow = (await db.query(`select id from orders where order_number = $1`, [placed.orderNumber])).rows[0];

  await recordPspFee(db, { orderId: orderRow.id, feeMinor: 450, memo: 'settlement file 2026-11-25' });
  assert.equal((await orderMargins(db)).rows[0].pspFeeMinor, 450);

  await assert.rejects(() => recordPspFee(db, { orderId: orderRow.id, feeMinor: 0 }), (err) => {
    assert.equal(err.code, 'BAD_PSP_FEE');
    return true;
  });
  await assert.rejects(() => recordPspFee(db, { orderId: orderRow.id, feeMinor: 12.5 }), (err) => {
    assert.equal(err.code, 'BAD_PSP_FEE');
    return true;
  });
});

test('last-mile routes are admin-only', async () => {
  const db = await freshDb();
  const app = createApp({ db, devAuth: true, exposeOtpCodes: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { body, method = 'GET', user = IDS.admin } = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-id': user },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  try {
    assert.equal((await call('/api/ops/last-mile', { user: IDS.customer })).status, 403);
    assert.equal(
      (await call('/api/ops/last-mile/runs', { method: 'POST', body: { runDate: today() }, user: IDS.customer })).status,
      403,
    );

    const opened = await call('/api/ops/last-mile/runs', {
      method: 'POST',
      body: { riderId: IDS.rider, runDate: today(), riderPayMinor: 25000, fuelMinor: 12000 },
    });
    assert.equal(opened.status, 201);
    const run = await opened.json();
    assert.equal(run.costMinor, 37000);

    const closed = await call(`/api/ops/last-mile/runs/${run.runId}/close`, { method: 'POST' });
    assert.equal(closed.status, 422, 'no deliveries rode on it, so there is nothing to cost');

    const report = await call('/api/ops/last-mile');
    assert.equal(report.status, 200);
    const body = await report.json();
    assert.equal(body.totals.openRuns, 1);
    assert.equal(body.totals.feeCoversDrop, null);
    assert.equal((await call('/api/ops/last-mile/payable')).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
