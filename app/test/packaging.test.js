/**
 * Packaging cost per parcel (AFR-51).
 *
 * Account 5030 existed from the first chart of accounts and nothing ever posted
 * to it, which means every fulfilment margin in this system was calculated with
 * the box left out. These tests hold the cost where it belongs — on the order —
 * and check whether a 4% fulfilment fee actually buys cardboard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery } from '../src/delivery.js';
import {
  buyPackaging,
  packAnOrder,
  packagingQuote,
  packagingReport,
  parcelClassFor,
  parcelsFor,
} from '../src/packaging.js';
import { balance, trialBalance, ACCOUNTS } from '../src/ledger.js';
import { createApp } from '../src/server.js';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const key = () => `pack-${(seq += 1)}`;

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

const material = async (db, code) =>
  (await db.query(`select on_hand, unit_cost_minor from packaging_materials where code = $1`, [code])).rows[0];

test('the recipe prices a parcel by class, and the strictest item wins', async () => {
  const db = await freshDb();

  const small = await packagingQuote(db, { parcelClass: 'small', parcels: 1 });
  assert.equal(small.costPerParcelMinor, 120 + 35, 'mailer plus a waybill label');
  const bulky = await packagingQuote(db, { parcelClass: 'bulky', parcels: 2 });
  assert.equal(bulky.costMinor, 2 * (450 + 110 + 35), 'two cartons with filler and labels');

  assert.equal(parcelClassFor([{ parcelClass: 'small' }]), 'small');
  assert.equal(parcelClassFor([{ parcelClass: 'small' }, { parcelClass: 'bulky' }]), 'bulky');
  assert.equal(parcelClassFor([{ parcelClass: 'bulky' }, { parcelClass: 'cold' }]), 'cold', 'cold beats bulky');
  assert.equal(parcelClassFor([{ parcelClass: 'fragile' }, { parcelClass: 'bulky' }]), 'fragile');

  // Capacity is pilot packing practice, and it is the difference between one box
  // and three.
  assert.equal(parcelsFor('small', 8), 1);
  assert.equal(parcelsFor('small', 9), 2);
  assert.equal(parcelsFor('bulky', 5), 3);
  assert.equal(parcelsFor('bulky', 0), 1, 'an order still needs a parcel');
});

test('buying packaging is stock, not an expense, until it is used', async () => {
  const db = await freshDb();
  const before = await material(db, 'BOX-M');
  const stockValue = await balance(db, ACCOUNTS.PACKAGING_STOCK);
  const bank = await balance(db, ACCOUNTS.BANK);

  const bought = await buyPackaging(db, { materialCode: 'BOX-M', quantity: 50, unitCostMinor: 500, actorId: IDS.admin });
  assert.equal(bought.totalMinor, 25000);
  assert.equal((await material(db, 'BOX-M')).on_hand, Number(before.on_hand) + 50);

  assert.equal(await balance(db, ACCOUNTS.PACKAGING_STOCK), stockValue + 25000);
  assert.equal(await balance(db, ACCOUNTS.BANK), bank - 25000);
  assert.equal(await balance(db, ACCOUNTS.PACKAGING), 0, 'buying is not usage');

  // The new quote reflects the supplier's price, not a stale average.
  const quote = await packagingQuote(db, { parcelClass: 'bulky', parcels: 1 });
  assert.equal(quote.pieces.find((p) => p.code === 'BOX-M').unitCostMinor, 500);
});

test('packing an order moves the box from stock to cost, against that order', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantNappies, 1));
  const orderRow = await db.query(`select id from orders where order_number = $1`, [placed.orderNumber]);

  const boxesBefore = await material(db, 'BOX-M');
  const stockValue = await balance(db, ACCOUNTS.PACKAGING_STOCK);

  const packed = await packAnOrder(db, { orderNumber: placed.orderNumber, actorId: IDS.admin });
  assert.ok(orderRow.rows[0].id);

  assert.equal(packed.parcelClass, 'bulky', 'a 12 litre pack of nappies is not a mailer');
  assert.equal(packed.parcels, 1);
  assert.equal(packed.packagingCostMinor, 450 + 110 + 35);
  assert.equal(packed.shortfallMinor, 0);
  assert.equal((await material(db, 'BOX-M')).on_hand, Number(boxesBefore.on_hand) - 1);

  assert.equal(await balance(db, ACCOUNTS.PACKAGING), 595);
  assert.equal(await balance(db, ACCOUNTS.PACKAGING_STOCK), stockValue - 595);
  assert.equal((await trialBalance(db)).balanced, true);
});

test('packing twice charges once', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantNappies, 1));
  const orderRow = await db.query(`select id from orders where order_number = $1`, [placed.orderNumber]);

  assert.ok(orderRow.rows[0].id);
  const first = await packAnOrder(db, { orderNumber: placed.orderNumber });
  const second = await packAnOrder(db, { orderNumber: placed.orderNumber });

  assert.equal(first.alreadyPacked, false);
  assert.equal(second.alreadyPacked, true);
  assert.equal(second.packagingCostMinor, first.packagingCostMinor);
  assert.equal(await balance(db, ACCOUNTS.PACKAGING), first.packagingCostMinor);
  const rows = await db.query(`select count(*)::int as n from packaging_consumptions`);
  assert.equal(rows.rows[0].n, 1);
});

test('running out of boxes is a debt to the supplier, never negative stock', async () => {
  const db = await freshDb();
  await db.query(`update packaging_materials set on_hand = 0 where code in ('BOX-M','FILLER-PK','LABEL-A4')`);

  const placed = await order(db, items(IDS.variantNappies, 1), 'card');
  const orderRow = await db.query(`select id from orders where order_number = $1`, [placed.orderNumber]);

  assert.ok(orderRow.rows[0].id);
  const packed = await packAnOrder(db, { orderNumber: placed.orderNumber });
  assert.equal(packed.packagingCostMinor, 595, 'the parcel still cost what it cost');
  assert.equal(packed.shortfallMinor, 595, 'all of it was on credit');

  // A liability sits on the credit side, so debit-minus-credit reads negative.
  assert.equal(await balance(db, ACCOUNTS.PACKAGING_ACCRUAL), -595);
  assert.equal(await balance(db, ACCOUNTS.PACKAGING), 595, 'the expense is recorded whatever the stock says');
  assert.equal(await balance(db, ACCOUNTS.PACKAGING_STOCK) >= 0, true);

  const levels = await db.query(`select code, on_hand from packaging_materials where code = 'BOX-M'`);
  assert.equal(Number(levels.rows[0].on_hand), 0, 'never negative: that is the fiction this avoids');
  assert.equal((await trialBalance(db)).balanced, true);
});

test('a delivery records the box in the same commit as the sale', async () => {
  const db = await freshDb();
  const placed = await order(db, items(IDS.variantLotion, 1), 'cod');

  const delivered = await recordDelivery(db, { orderNumber: placed.orderNumber });
  assert.equal(delivered.packagingClass, 'small', 'a 700ml bottle is a mailer');
  assert.equal(delivered.packagingCostMinor, 155);
  assert.equal(delivered.packagingShortfallMinor, 0);
  assert.equal(await balance(db, ACCOUNTS.PACKAGING), 155);

  // Already delivered returns early, and must not pack a second parcel.
  const again = await recordDelivery(db, { orderNumber: placed.orderNumber });
  assert.equal(again.alreadyDelivered, true);
  assert.equal(await balance(db, ACCOUNTS.PACKAGING), 155);
});

test('the report answers the only question that matters: does the fee buy the box?', async () => {
  const db = await freshDb();

  // A single pack of nappies: bulky, and the 4% fulfilment fee covers it.
  const bulkyOrder = await order(db, items(IDS.variantNappies, 1), 'cod');
  const bulkyDelivered = await recordDelivery(db, { orderNumber: bulkyOrder.orderNumber });
  assert.equal(bulkyDelivered.packagingCostMinor, 595);

  // Cold chain is where a flat percentage stops working: an insulated bag and a
  // gel pack cost P24.35 for the parcel, and one bottle's fulfilment fee does not
  // reach that. This is the finding the empty 5030 account hid.
  await db.query(`update product_variants set parcel_class = 'cold' where id = $1`, [IDS.variantLotion]);
  const coldOrder = await order(db, items(IDS.variantLotion, 1), 'cod');
  const coldDelivered = await recordDelivery(db, { orderNumber: coldOrder.orderNumber });
  assert.equal(coldDelivered.packagingClass, 'cold');
  assert.equal(coldDelivered.packagingCostMinor, 1800 + 600 + 35);
  assert.ok(coldDelivered.packagingCostMinor > coldDelivered.fulfilmentMinor, 'the bag costs more than the fee');

  const report = await packagingReport(db);
  assert.equal(report.summary.ordersPacked, 2);
  assert.equal(
    report.summary.packagingCostMinor,
    bulkyDelivered.packagingCostMinor + coldDelivered.packagingCostMinor,
  );

  const bulkyRow = report.rows.find((r) => r.orderNumber === bulkyOrder.orderNumber);
  assert.equal(bulkyRow.packagingCostMinor, 595);
  assert.equal(bulkyRow.fulfilmentFeeMinor, bulkyDelivered.fulfilmentMinor);
  assert.equal(bulkyRow.feeAfterPackagingMinor, bulkyDelivered.fulfilmentMinor - 595);

  const coldRow = report.rows.find((r) => r.orderNumber === coldOrder.orderNumber);
  assert.ok(coldRow.feeAfterPackagingMinor < 0, 'named, not averaged away');
  assert.deepEqual(report.summary.fulfilmentUnderwater, [coldOrder.orderNumber]);

  // A fee that is negative on the box is negative before the rider moves.
  assert.ok(report.summary.feeAfterPackagingMinor < bulkyRow.feeAfterPackagingMinor);
  assert.ok(report.summary.packagingStockValueMinor > 0, 'stock still on the shelf is an asset');
  assert.equal((await trialBalance(db)).balanced, true);
});

test('packaging routes are admin-only and answer over HTTP', async () => {
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
    assert.equal((await call('/api/ops/packaging', { user: IDS.customer })).status, 403);

    const quote = await call('/api/ops/packaging/quote?parcelClass=bulky&parcels=2');
    assert.equal(quote.status, 200);
    assert.equal((await quote.json()).costMinor, 2 * 595);

    const purchase = await call('/api/ops/packaging/purchase', {
      method: 'POST',
      body: { materialCode: 'BOX-M', quantity: 10, unitCostMinor: 480 },
    });
    assert.equal(purchase.status, 201);
    assert.equal((await purchase.json()).totalMinor, 4800);

    const placed = await order(db, items(IDS.variantNappies, 1), 'card');
    const packed = await call(`/api/ops/orders/${placed.orderNumber}/pack`, { method: 'POST' });
    assert.equal(packed.status, 201);
    const body = await packed.json();
    assert.equal(body.parcelClass, 'bulky');

    const second = await call(`/api/ops/orders/${placed.orderNumber}/pack`, { method: 'POST' });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).alreadyPacked, true);

    const report = await call('/api/ops/packaging');
    assert.equal(report.status, 200);
    assert.equal((await report.json()).summary.ordersPacked, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
