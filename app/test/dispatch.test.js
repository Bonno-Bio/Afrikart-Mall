/**
 * Whether a route should go out today (AFR-54).
 *
 * `docs/019` ended on arithmetic a person had to do by hand: P370 a run over
 * three drops is P123 a drop, over twenty-two it is P16.82. These tests hold that
 * comparison still, because the moment it drifts, someone dispatches a route that
 * cannot pay for itself and finds out at month end.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery } from '../src/delivery.js';
import { openRun, closeRun } from '../src/lastmile.js';
import { dispatchPlan, rateCard } from '../src/dispatch.js';
import { createApp } from '../src/server.js';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
const key = () => `dsp-${(seq += 1)}`;

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

/** Send a scheduled order onto the seeded route. */
async function schedule(db, orderNumber, routeId = IDS.routeWest, riderId = null) {
  await db.query(
    `update deliveries set route_id = $2, rider_id = coalesce($3, rider_id) where order_id = (select id from orders where order_number = $1)`,
    [orderNumber, routeId, riderId],
  );
}

test('the rate card prices each vehicle class, and the seed agrees with the pilot', async () => {
  const db = await freshDb();
  const rates = await rateCard(db);
  assert.equal(rates.length, 4);
  const scooter = rates.find((r) => r.vehicleClass === 'scooter');
  assert.equal(scooter.riderPayMinor, 25000);
  assert.equal(scooter.fuelMinor, 12000);
  assert.equal(scooter.costMinor, 37000, 'P250 rider pay plus P120 fuel, as in docs/019');
  const van = rates.find((r) => r.vehicleClass === 'van');
  assert.ok(van.costMinor > scooter.costMinor, 'a van costs more than a scooter');
});

test('an empty day is held, not dispatched, and says so', async () => {
  const db = await freshDb();
  const plan = await dispatchPlan(db, { runDate: tomorrow() });

  assert.equal(plan.routes.length, 1, 'the seeded route is still listed');
  const route = plan.routes[0];
  assert.equal(route.scheduledDrops, 0);
  assert.equal(route.verdict, 'hold');
  assert.equal(route.perDropMinor, null, 'nothing to divide by');
  assert.equal(route.breakEvenDrops, null);
  assert.deepEqual(plan.summary.hold, ['Gaborone West 1']);
});

test('three drops on a P370 trip is thin, and the break-even count is named', async () => {
  const db = await freshDb();
  for (let i = 0; i < 3; i += 1) {
    const placed = await order(db, items(IDS.variantLotion, 1)); // P98: pays the P30 fee
    await schedule(db, placed.orderNumber);
  }

  const plan = await dispatchPlan(db, { runDate: tomorrow() });
  const route = plan.routes[0];

  assert.equal(route.scheduledDrops, 3);
  assert.equal(route.plannedCostMinor, 37000);
  assert.equal(route.costSource, 'rate_card');
  assert.equal(route.perDropMinor, 12333, 'P123.33 a drop, exactly as docs/019 reported');
  assert.equal(route.perDropAtCapacityMinor, 1681, 'P16.81 a drop if the route filled');
  // Three P30 fees. VAT is apportioned on the total (P90 gross -> P78.95 net), not
  // summed per order, because rounding each order first drifts by a thebe.
  assert.equal(route.netFeeMinor, 7895);
  assert.equal(route.averageNetFeeMinor, 2632);
  assert.equal(route.breakEvenDrops, Math.ceil(37000 / 2632));
  assert.equal(route.verdict, 'thin');
  assert.ok(route.marginMinor < 0);
  assert.deepEqual(plan.summary.thin, ['Gaborone West 1']);
});

test('a full route turns positive, which is the whole point of the report', async () => {
  const db = await freshDb();
  // 22 drops is the seeded route's capacity. Small parcels, because 22 bulky
  // twelve-litre packs genuinely do not fit on a scooter — the volume limit
  // would (correctly) refuse them at checkout.
  for (let i = 0; i < 22; i += 1) {
    const placed = await order(db, items(IDS.variantLotion, 1));
    await schedule(db, placed.orderNumber);
  }

  const plan = await dispatchPlan(db, { runDate: tomorrow() });
  const route = plan.routes[0];

  assert.equal(route.scheduledDrops, 22);
  assert.equal(route.utilisationBps, 10000);
  assert.equal(route.residualCapacity, 0);
  assert.equal(route.perDropMinor, 1681);
  assert.equal(route.netFeeMinor, 22 * 3000 - Math.round((22 * 3000 * 1400) / 11400));
  assert.ok(route.marginMinor > 0, 'a full route pays for the trip');
  assert.equal(route.verdict, 'go');
  assert.equal(route.breakEvenDrops, Math.ceil(37000 / 2632));
  assert.ok(route.breakEvenDrops < 22, 'and the break-even is inside capacity');
});

test('free delivery adds weight and no fee, and the break-even count sees it', async () => {
  const db = await freshDb();
  const paying = await order(db, items(IDS.variantLotion, 1)); // P98: pays the P30 fee
  const free = await order(db, items(IDS.variantNappies, 2)); // P378: free delivery
  await schedule(db, paying.orderNumber);
  await schedule(db, free.orderNumber);

  const plan = await dispatchPlan(db, { runDate: tomorrow() });
  const route = plan.routes[0];

  assert.equal(route.scheduledDrops, 2);
  assert.equal(route.payingDrops, 1);
  assert.equal(route.freeDrops, 1);
  assert.equal(route.netFeeMinor, 2632, 'one fee, not two');
  assert.equal(route.averageNetFeeMinor, 2632, 'averaged over paying drops only');
  // One free drop means the trip needs more paying drops than a naive average.
  assert.ok(route.breakEvenDrops > 14);
  assert.equal(route.verdict, 'thin');
});

test('an already-open run is the real cost, not the rate card', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantNappies, 1));
  await schedule(db, placed.orderNumber);

  await openRun(db, { routeId: IDS.routeWest, riderId: IDS.rider, runDate: tomorrow(), riderPayMinor: 40000, fuelMinor: 15000 });
  const plan = await dispatchPlan(db, { runDate: tomorrow() });
  assert.equal(plan.routes[0].costSource, 'actual_run');
  assert.equal(plan.routes[0].plannedCostMinor, 55000, 'the run says what it cost, not the card');

  // A plan for another day has no run of its own, so it falls back to the card.
  const otherDay = (await dispatchPlan(db, { runDate: today() })).routes[0];
  assert.equal(otherDay.costSource, 'rate_card');
  assert.equal(otherDay.plannedCostMinor, 37000);

  await recordDelivery(db, { orderNumber: placed.orderNumber, riderId: IDS.rider, cashCollectedMinor: null });
  const after = await dispatchPlan(db, { runDate: tomorrow() });
  assert.equal(after.routes[0].plannedCostMinor, 55000, 'the actual run still governs its own day');
});

test('over capacity is a hold, whatever the money says', async () => {
  const db = await freshDb();
  // Room at checkout, then a route that cannot actually carry what it promised.
  await db.query(
    `update routes set daily_capacity = 8, max_weight_grams = 40000, max_volume_ml = 400000 where id = $1`,
    [IDS.routeWest],
  );
  for (let i = 0; i < 4; i += 1) {
    const placed = await order(db, items(IDS.variantNappies, 3)); // 4.35 kg and 36 L each
    await schedule(db, placed.orderNumber);
  }

  const route = (await dispatchPlan(db, { runDate: tomorrow() })).routes[0];
  assert.equal(route.scheduledDrops, 4);
  assert.equal(route.weightGrams, 4 * 3 * 1450);
  assert.equal(route.overCapacity, false, 'four drops is inside eight');

  await db.query(`update routes set max_weight_grams = 10000 where id = $1`, [IDS.routeWest]);
  const tight = (await dispatchPlan(db, { runDate: tomorrow() })).routes[0];
  assert.equal(tight.weightGrams, 17400);
  assert.equal(tight.overCapacity, true);
  assert.equal(tight.verdict, 'hold', 'money does not make a scooter carry 17 kg');
  assert.deepEqual((await dispatchPlan(db, { runDate: tomorrow() })).summary.overCapacity, ['Gaborone West 1']);
});

test('load is counted once per order, not once per line', async () => {
  const db = await freshDb();
  const placed = await order(db, [
    { variantId: IDS.variantNappies, quantity: 1 },
    { variantId: IDS.variantLotion, quantity: 1 },
    { variantId: IDS.variantFormula, quantity: 1 },
  ]);
  await schedule(db, placed.orderNumber);

  const plan = await dispatchPlan(db, { runDate: tomorrow() });
  const route = plan.routes[0];
  const expected = 620 + 1450 + 260; // formula + bulky pack + bottle, one each
  assert.equal(route.weightGrams, expected, 'three lines, three parcels, no fan-out');
  assert.equal(route.volumeMl, 1400 + 12000 + 700);
});

test('only the named route is planned when one is given', async () => {
  const db = await freshDb();
  const plan = await dispatchPlan(db, { runDate: tomorrow(), routeId: IDS.routeWest });
  assert.equal(plan.routes.length, 1);
  assert.deepEqual((await dispatchPlan(db, { runDate: tomorrow(), routeId: IDS.routeWest })).summary.byVehicleClass.length, 1);
});

test('a plan without a date is refused, and dispatch routes are admin-only', async () => {
  const db = await freshDb();
  await assert.rejects(() => dispatchPlan(db, {}), (err) => {
    assert.equal(err.code, 'RUN_DATE_REQUIRED');
    return true;
  });

  const placed = await order(db, items(IDS.variantNappies, 1));
  await schedule(db, placed.orderNumber);

  const app = createApp({ db, devAuth: true, exposeOtpCodes: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { user = IDS.admin } = {}) =>
    fetch(`${base}${path}`, { headers: { 'content-type': 'application/json', 'x-user-id': user } });

  try {
    assert.equal((await call('/api/ops/dispatch', { user: IDS.customer })).status, 403);
    assert.equal((await call('/api/ops/dispatch/rates', { user: IDS.customer })).status, 403);

    const res = await call(`/api/ops/dispatch?date=${tomorrow()}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.runDate, tomorrow());
    assert.equal(body.summary.routes, 1);
    assert.equal(body.routes[0].scheduledDrops, 1);
    assert.equal(body.routes[0].verdict, 'thin');

    const rates = await (await call('/api/ops/dispatch/rates')).json();
    assert.equal(rates.rates.length, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
