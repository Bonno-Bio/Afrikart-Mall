/**
 * Day close (AFR-55): the morning's plan against the evening's facts.
 *
 * Two things were still untrue before this increment. A failed attempt cost a
 * trip and was invisible — it appeared in neither the run's cost per drop nor
 * any report — and nothing compared what dispatch planned with what the route
 * actually did, so a route could be planned at fifteen drops and deliver nine
 * without anyone seeing the gap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery, recordFailedAttempt } from '../src/delivery.js';
import { openRun, closeRun, lastMileReport } from '../src/lastmile.js';
import { dispatchPlan, dayClose } from '../src/dispatch.js';
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
const key = () => `dc-${(seq += 1)}`;

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

async function schedule(db, orderNumber, routeId = IDS.routeWest) {
  await db.query(
    `update deliveries set route_id = $2 where order_id = (select id from orders where order_number = $1)`,
    [orderNumber, routeId],
  );
}

test('a failed attempt is recorded, repeatable, and needs a real reason', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantLotion, 1));

  const first = await recordFailedAttempt(db, {
    orderNumber: placed.orderNumber,
    reasonCode: 'NO_ANSWER',
    riderId: IDS.rider,
  });
  assert.equal(first.status, 'failed');
  assert.equal(first.attempts, 1);
  assert.equal(first.category, 'customer');
  assert.equal(first.needsReschedule, true);

  const second = await recordFailedAttempt(db, {
    orderNumber: placed.orderNumber,
    reasonCode: 'NOT_HOME',
    note: 'gate locked',
    riderId: IDS.rider,
  });
  assert.equal(second.attempts, 2, 'three attempts are three attempts');

  await assert.rejects(
    () => recordFailedAttempt(db, { orderNumber: placed.orderNumber, reasonCode: 'MADE_UP' }),
    (err) => {
      assert.equal(err.code, 'UNKNOWN_REASON');
      return true;
    },
  );
  await assert.rejects(() => recordFailedAttempt(db, { orderNumber: placed.orderNumber }), (err) => {
    assert.equal(err.code, 'REASON_REQUIRED');
    return true;
  });

  const events = await db.query(`select count(*)::int as n from order_events where event = 'delivery_failed'`);
  assert.equal(events.rows[0].n, 2);
});

test('a delivered order cannot fail afterwards, and nothing is recognised on a failure', async () => {
  const db = await freshDb();
  const delivered = await order(db, items(IDS.variantLotion, 1));
  const doomed = await order(db, items(IDS.variantLotion, 1));
  await recordDelivery(db, { orderNumber: delivered.orderNumber, riderId: IDS.rider });

  await assert.rejects(
    () => recordFailedAttempt(db, { orderNumber: delivered.orderNumber, reasonCode: 'NO_ANSWER' }),
    (err) => {
      assert.equal(err.code, 'ALREADY_DELIVERED');
      return true;
    },
  );

  // A failed attempt is not a sale: revenue and packaging are unchanged by it.
  const commissionBefore = await balance(db, ACCOUNTS.COMMISSION_REVENUE);
  const packagingBefore = await balance(db, ACCOUNTS.PACKAGING);
  await recordFailedAttempt(db, { orderNumber: doomed.orderNumber, reasonCode: 'REFUSED', riderId: IDS.rider });
  assert.equal(await balance(db, ACCOUNTS.COMMISSION_REVENUE), commissionBefore);
  assert.equal(await balance(db, ACCOUNTS.PACKAGING), packagingBefore);
  const sales = await db.query(`select count(*)::int as n from ledger_transactions where kind = 'sale'`);
  assert.equal(sales.rows[0].n, 1, 'one sale, one posting');
});

test('a failed attempt is in the trip but not on a customer', async () => {
  const db = await freshDb();
  const good = await order(db, items(IDS.variantLotion, 1));
  const bad = await order(db, items(IDS.variantLotion, 1));
  await recordDelivery(db, { orderNumber: good.orderNumber, riderId: IDS.rider });
  await recordFailedAttempt(db, { orderNumber: bad.orderNumber, reasonCode: 'NO_ANSWER', riderId: IDS.rider });

  const run = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 25000, fuelMinor: 12000 });
  assert.equal(run.routeSource, 'inferred_from_work', 'the route came from the rider\'s work, and it says so');
  const closed = await closeRun(db, { runId: run.runId });

  assert.equal(closed.drops, 1, 'one parcel was delivered');
  assert.equal(closed.attempts, 2, 'two doors were knocked on');
  assert.equal(closed.failedDrops, 1);
  assert.equal(closed.perAttemptMinor, 18500, 'P370 across two attempts');
  assert.equal(closed.unattributedMinor, 18500);
  assert.equal(closed.allocatedMinor, 18500);

  // The delivered order carries only its own share.
  const row = (await orderMargins(db)).rows.find((r) => r.orderNumber === good.orderNumber);
  assert.equal(row.lastMileMinor, 18500);
  // The failed attempt's share is a cost with no order to hang it on, and the
  // profitability report shows it as unattributed rather than pretending.
  const margins = await orderMargins(db);
  assert.equal(margins.unattributed.accounts.find((a) => a.code === ACCOUNTS.LAST_MILE).amountMinor, 18500);
  assert.equal(margins.tieOut.reconciles, true);
  assert.equal((await trialBalance(db)).balanced, true);
});

test('the last-mile report shows both cost per drop and cost per door', async () => {
  const db = await freshDb();
  const good = await order(db, items(IDS.variantLotion, 1));
  const bad = await order(db, items(IDS.variantLotion, 1));
  await recordDelivery(db, { orderNumber: good.orderNumber, riderId: IDS.rider });
  await recordFailedAttempt(db, { orderNumber: bad.orderNumber, reasonCode: 'NO_ANSWER', riderId: IDS.rider });

  const run = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 25000, fuelMinor: 12000 });
  await closeRun(db, { runId: run.runId });

  const report = await lastMileReport(db);
  assert.equal(report.totals.attempts, 2);
  assert.equal(report.totals.failedDrops, 1);
  assert.equal(report.totals.perAttemptMinor, 18500);
  assert.equal(report.totals.perDropMinor, 18500, 'what the delivered parcel carries');
  assert.equal(report.totals.unattributedMinor, 18500);
  assert.equal(report.runs[0].attempts, 2);
});

test('a drop belongs to the day it happened, so a plan shrinks as work is done', async () => {
  const db = await freshDb();
  const keep = await order(db, items(IDS.variantLotion, 1));
  const fail = await order(db, items(IDS.variantLotion, 1));
  const never = await order(db, items(IDS.variantLotion, 1));
  for (const o of [keep, fail, never]) await schedule(db, o.orderNumber);

  const planned = await dispatchPlan(db, { runDate: tomorrow() });
  assert.equal(planned.routes[0].scheduledDrops, 3, 'three parcels to carry tomorrow');

  await recordDelivery(db, { orderNumber: keep.orderNumber, riderId: IDS.rider });
  await recordFailedAttempt(db, { orderNumber: fail.orderNumber, reasonCode: 'NO_ANSWER', riderId: IDS.rider });

  // Two of the three now belong to today, which is the day they happened.
  const tomorrowPlan = await dispatchPlan(db, { runDate: tomorrow() });
  assert.equal(tomorrowPlan.routes[0].scheduledDrops, 1, 'only the untouched parcel is still tomorrow work');

  const close = await dayClose(db, { runDate: today() });
  const route = close.routes.find((r) => r.routeId === IDS.routeWest);
  assert.equal(route.deliveredDrops, 1);
  assert.equal(route.failedDrops, 1);
  assert.equal(route.attempts, 2);
  assert.equal(route.plannedDrops, 0, 'no run was opened, so nothing was ever planned for today');
  assert.equal(route.plannedSource, 'none');
  assert.equal(route.currentWorkDrops, 2, 'but two drops belong to today');
  assert.equal(route.varianceDrops, null, 'no plan, no variance to claim');
  assert.equal(route.uncostedDeliveries, 1);
  assert.equal(route.closed, false);
  assert.match(route.discrepancies.join(' '), /carry no last-mile cost/);

});

test('a day closes only when runs are shut, nothing is on the road, and nothing is uncosted', async () => {
  const db = await freshDb();
  const a = await order(db, items(IDS.variantLotion, 1));
  const b = await order(db, items(IDS.variantLotion, 1));
  for (const o of [a, b]) await schedule(db, o.orderNumber);

  // Deliveries happen today, so they are dated today for the close.
  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });
  await recordDelivery(db, { orderNumber: b.orderNumber, riderId: IDS.rider });
  await db.query(`update deliveries set scheduled_date = $1 where rider_id = $2`, [today(), IDS.rider]);

  const beforeRun = await dayClose(db, { runDate: today() });
  assert.equal(beforeRun.routes[0].deliveredDrops, 2);
  assert.equal(beforeRun.routes[0].uncostedDeliveries, 2);
  assert.equal(beforeRun.routes[0].closed, false);
  assert.match(beforeRun.routes[0].discrepancies.join(' '), /carry no last-mile cost/);

  const run = await openRun(db, { routeId: IDS.routeWest, riderId: IDS.rider, runDate: today(), riderPayMinor: 25000, fuelMinor: 12000 });
  const open = await dayClose(db, { runDate: today() });
  assert.equal(open.routes[0].runsOpened, 1);
  assert.equal(open.routes[0].runsClosed, 0);
  assert.match(open.routes[0].discrepancies.join(' '), /still open/);

  await closeRun(db, { runId: run.runId });
  const after = await dayClose(db, { runDate: today() });
  const route = after.routes[0];
  assert.equal(route.runsClosed, 1);
  assert.equal(route.uncostedDeliveries, 0);
  assert.equal(route.costedMinor, 37000);
  assert.equal(route.plannedSource, 'run_at_open');
  assert.equal(route.plannedDrops, 2, 'the plan captured when the run was opened');
  assert.equal(route.varianceDrops, 0, 'two planned, two carried');
  assert.equal(route.closed, true);
  assert.deepEqual(route.discrepancies, []);
  assert.equal(after.summary.closed, true);
  assert.equal(after.summary.costedMinor, 37000);
});

test('a run opened with nothing on it is a plan of zero, and the day is held to it', async () => {
  const db = await freshDb();
  const a = await order(db, items(IDS.variantLotion, 1));
  await schedule(db, a.orderNumber);

  // The rider is sent out before the parcel is put on the scooter: dispatch said
  // nothing, the day produced something. That is a variance, not a blank.
  const run = await openRun(db, { riderId: IDS.rider, runDate: today(), riderPayMinor: 15000 });
  assert.equal(run.plannedDrops, 0, 'at open, the rider was carrying nothing');
  assert.equal(run.routeSource, null, 'and no route could be inferred from an empty plate');

  await recordDelivery(db, { orderNumber: a.orderNumber, riderId: IDS.rider });
  await db.query(`update deliveries set scheduled_date = $1 where rider_id = $2`, [today(), IDS.rider]);
  await closeRun(db, { runId: run.runId });

  const { routes, summary } = await dayClose(db, { runDate: today() });
  const route = routes[0];
  assert.equal(route.plannedSource, 'run_at_open', 'a run exists, so the plan exists — it said zero');
  assert.equal(route.plannedDrops, 0);
  assert.equal(route.varianceDrops, 1, 'one drop was carried that nobody planned');
  assert.equal(route.costedMinor, 15000, 'the cost still lands on the route, derived from the rider\'s work');
  assert.equal(route.runsOpened, 1);
  assert.equal(summary.closed, true);
  assert.deepEqual(summary.unroutedRuns, [], 'the run found its route through the work');
});

test('first-attempt success is a number, not a memory', async () => {
  const db = await freshDb();
  const ok = await order(db, items(IDS.variantLotion, 1));
  const late = await order(db, items(IDS.variantLotion, 1));
  const refused = await order(db, items(IDS.variantLotion, 1));
  for (const o of [ok, late, refused]) await schedule(db, o.orderNumber);

  await recordDelivery(db, { orderNumber: ok.orderNumber, riderId: IDS.rider });
  // Failed once, then delivered: a parcel that arrived, but not first time.
  await recordFailedAttempt(db, { orderNumber: late.orderNumber, reasonCode: 'NO_ANSWER', riderId: IDS.rider });
  await recordDelivery(db, { orderNumber: late.orderNumber, riderId: IDS.rider });
  await recordFailedAttempt(db, { orderNumber: refused.orderNumber, reasonCode: 'NO_CASH', riderId: IDS.rider });
  await db.query(`update deliveries set scheduled_date = $1 where rider_id = $2`, [today(), IDS.rider]);

  const close = await dayClose(db, { runDate: today() });
  assert.equal(close.summary.deliveredDrops, 2);
  assert.equal(close.summary.deliveredFirstAttempt, 1);
  assert.equal(close.summary.failedDrops, 1);
  // Two parcels arrived, one of them without a second trip: 50%, not 100%.
  assert.equal(close.summary.firstAttemptSuccessBps, 5000);
});

test('a day with no work is not "closed", it is empty', async () => {
  const db = await freshDb();
  const close = await dayClose(db, { runDate: tomorrow() });
  assert.equal(close.summary.routes, 1);
  assert.equal(close.summary.closed, false, 'nothing happened, so nothing was closed');
  assert.equal(close.summary.firstAttemptSuccessBps, null);
});

test('day close and failed attempts are admin-only', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantLotion, 1));

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
    assert.equal((await call(`/api/ops/dispatch/day-close?date=${today()}`, { user: IDS.customer })).status, 403);
    assert.equal(
      (
        await call(`/api/ops/orders/${placed.orderNumber}/failed-attempt`, {
          method: 'POST',
          body: { reasonCode: 'NO_ANSWER' },
          user: IDS.customer,
        })
      ).status,
      403,
    );

    const failed = await call(`/api/ops/orders/${placed.orderNumber}/failed-attempt`, {
      method: 'POST',
      body: { reasonCode: 'NO_CASH', note: 'P400 short', riderId: IDS.rider },
    });
    assert.equal(failed.status, 201);
    const body = await failed.json();
    assert.equal(body.attempts, 1);
    assert.equal(body.category, 'cash');

    const close = await call(`/api/ops/dispatch/day-close?date=${today()}`);
    assert.equal(close.status, 200);
    const day = await close.json();
    assert.equal(day.runDate, today());
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
