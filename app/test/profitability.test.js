/**
 * What each order actually earned (AFR-52).
 *
 * The point of this module is that it does not compute anything new: it reads
 * the ledger back in the shape an owner asks for. So the tests are mostly
 * tie-outs — against what `recordDelivery` returned, against a refund, against
 * the trial balance — because a profitability report that disagrees with the
 * books is worse than no report at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery } from '../src/delivery.js';
import { refundLine } from '../src/refunds.js';
import { orderMargins, marginBySeller, bpsOf } from '../src/profitability.js';
import { balance, trialBalance, post, ACCOUNTS } from '../src/ledger.js';
import { createApp } from '../src/server.js';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const key = () => `pnl-${(seq += 1)}`;

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

async function delivered(db, lines, paymentMethod = 'cod') {
  const placed = await order(db, lines, paymentMethod);
  const delivery = await recordDelivery(db, { orderNumber: placed.orderNumber });
  return { placed, delivery };
}

test('nothing delivered means nothing to report, and the report says so', async () => {
  const db = await freshDb();
  const report = await orderMargins(db);

  assert.deepEqual(report.rows, []);
  assert.equal(report.summary.orders, 0);
  assert.equal(report.summary.marketplaceRevenueMinor, 0);
  assert.equal(report.summary.netMarginMinor, 0);
  assert.equal(report.summary.marginBps, null, 'no revenue, no percentage');
  assert.deepEqual(report.summary.lossMaking, []);
  assert.equal(report.tieOut.reconciles, true);
});

test('an order that was never delivered has no margin to report', async () => {
  const db = await freshDb();
  await order(db, items(IDS.variantNappies, 1), 'card'); // pending_payment, nothing posted

  const report = await orderMargins(db);
  assert.deepEqual(report.rows, []);
});

test('the per-order margin agrees with what the delivery returned', async () => {
  const db = await freshDb();
  const { placed, delivery } = await delivered(db, items(IDS.variantNappies, 2));

  const report = await orderMargins(db);
  assert.equal(report.rows.length, 1);
  const row = report.rows[0];

  assert.equal(row.orderNumber, placed.orderNumber);
  assert.equal(
    row.marketplaceRevenueMinor + row.deliveryMinor,
    delivery.keptMinor,
    'the report adds up to exactly what the delivery said we kept',
  );
  assert.equal(row.commissionMinor, delivery.commissionMinor);
  assert.equal(row.fulfilmentMinor, delivery.fulfilmentMinor);
  assert.equal(row.cogsMinor, delivery.cogsMinor);
  assert.equal(row.packagingMinor, delivery.packagingCostMinor);
  assert.equal(row.parcelClass, 'bulky');
  assert.equal(row.parcels, 1);

  // The delivery response prices the goods and the box separately; the report
  // puts them in one number, and the three must agree to the cent.
  assert.equal(row.netMarginMinor, delivery.netMarginMinor);
  assert.equal(delivery.netMarginMinor, delivery.keptMinor - delivery.packagingCostMinor - delivery.cogsMinor);
  assert.equal(row.lossMaking, false);
  // Express delivery on a basket this size is free, so there is no delivery
  // revenue to be uncosted. The next test covers the order that does pay for it.
  assert.equal(row.deliveryMinor, 0);
  assert.equal(row.deliveryUncosted, false);
});

test('a cold-chain parcel is loss-making on its own, and is named', async () => {
  const db = await freshDb();
  await db.query(`update product_variants set parcel_class = 'cold' where id = $1`, [IDS.variantLotion]);
  const { placed, delivery } = await delivered(db, items(IDS.variantLotion, 1));

  const report = await orderMargins(db);
  const row = report.rows[0];
  assert.equal(row.packagingMinor, 1800 + 600 + 35);
  assert.equal(row.netMarginMinor, delivery.netMarginMinor);
  assert.ok(row.goodsMarginMinor < 0, 'one cold bottle does not pay for an insulated bag');
  assert.equal(row.lossMaking, true);
  assert.deepEqual(report.summary.lossMaking, [placed.orderNumber]);
  assert.equal(report.summary.lossMakingMinor, row.goodsMarginMinor);
  // The delivery fee is not the answer to this: it is revenue with no rider
  // cost behind it, and counting it would hide exactly the order we need to see.
  assert.equal(row.deliveryMarginMinor, null);
  assert.ok(report.summary.packagingShareOfCostBps > 0);

  // The worst order sorts first: the report should open on the problem.
  assert.equal(report.rows[0].orderNumber, placed.orderNumber);
});

test('a refund lands on the order it refunds, not in a separate bucket', async () => {
  const db = await freshDb();
  // A formula the shop owns, so the restock also reverses a cost of goods.
  const { placed, delivery } = await delivered(db, items(IDS.variantFormula, 2));
  const before = (await orderMargins(db)).rows[0];

  const line = (
    await db.query(`select id from order_items where order_id = (select id from orders where order_number = $1)`, [
      placed.orderNumber,
    ])
  ).rows[0];
  await refundLine(db, { orderItemId: line.id, reason: 'damaged', channel: 'store_credit', requestedBy: IDS.admin });

  const after = (await orderMargins(db)).rows.find((r) => r.orderNumber === placed.orderNumber);

  // Commission and fulfilment are reversed, and a restocked carton puts its cost
  // back into inventory. Both must show up here without a second computation.
  assert.ok(after.commissionMinor < before.commissionMinor, 'commission reversed');
  assert.ok(after.fulfilmentMinor < before.fulfilmentMinor, 'fulfilment reversed');
  // The seed's stock is consigned, so we never carried a cost of goods to give
  // back. The revenue reversal is the whole effect, and pretending otherwise
  // would double-count goods that were never our asset.
  assert.equal(after.cogsMinor, before.cogsMinor);
  assert.ok(after.marketplaceRevenueMinor < before.marketplaceRevenueMinor);
  assert.ok(after.goodsMarginMinor < before.goodsMarginMinor);
  assert.ok(after.packagingMinor > 0, 'the box was still used, and is still a cost');
  assert.ok(delivery.packagingCostMinor > 0);
});

test('costs that belong to no order are reported, not smeared across orders', async () => {
  const db = await freshDb();
  await delivered(db, items(IDS.variantNappies, 1));

  // A bank charge: a real cost with no order to hang it on. Posting it needs a
  // transaction — the balance check is deferred to COMMIT, which is exactly why.
  await db.transaction((tx) =>
    post(tx, {
      kind: 'bank_fee',
      refType: 'bank',
      refId: null,
      memo: 'monthly account fee',
      entries: [
        { accountCode: ACCOUNTS.PSP_FEES, debit: 2500 },
        { accountCode: ACCOUNTS.BANK, credit: 2500 },
      ],
    }),
  );

  const report = await orderMargins(db);
  assert.equal(report.rows.length, 1, 'the unattributed posting did not invent an order');
  assert.ok(report.unattributed.costMinor >= 2500);
  assert.ok(report.unattributed.accounts.some((a) => a.code === ACCOUNTS.PSP_FEES && a.amountMinor === 2500));

  // And the tie-out still holds: orders + unattributed = the ledger.
  assert.equal(report.tieOut.reconciles, true);
  assert.ok(report.tieOut.accounts.every((a) => a.reconciles));
});

test('a delivery fee with no rider cost behind it is flagged, not counted as margin', async () => {
  const db = await freshDb();
  // One bottle is under the free-delivery threshold, so this order pays P30.
  const { delivery } = await delivered(db, items(IDS.variantLotion, 1));
  assert.equal(delivery.deliveryMinor, 3000, 'the customer pays P30');

  const report = await orderMargins(db);
  const row = report.rows[0];
  // The report is VAT-excluded throughout: P30 gross is P26.32 of revenue and
  // P3.68 of VAT that was never ours.
  assert.equal(row.deliveryMinor, 2632);
  assert.equal(row.lastMileMinor, 0);
  assert.equal(row.deliveryUncosted, true);
  assert.equal(row.deliveryMarginMinor, null, 'a fee with no cost behind it is not a margin');
  assert.equal(report.summary.deliveryUncostedMinor, 2632);
  // The fee is still revenue in the ledger, so it is still in the net figure —
  // labelled as an upper bound rather than dropped.
  assert.equal(row.netMarginMinor, row.goodsMarginMinor + 2632);
});

test('the parcel class breakdown shows which class the money leaks out of', async () => {
  const db = await freshDb();
  await delivered(db, items(IDS.variantNappies, 2)); // bulky, free delivery
  await db.query(`update product_variants set parcel_class = 'cold' where id = $1`, [IDS.variantLotion]);
  await delivered(db, items(IDS.variantLotion, 1)); // cold, pays delivery

  const report = await orderMargins(db);
  const byClass = new Map(report.summary.byParcelClass.map((b) => [b.parcelClass, b]));
  assert.deepEqual([...byClass.keys()].sort(), ['bulky', 'cold']);
  assert.equal(byClass.get('cold').orders, 1);
  assert.equal(byClass.get('cold').averagePackagingMinor, 2435);
  assert.equal(byClass.get('bulky').averagePackagingMinor, 595);
  // Worst class first: cold is loss-making before the delivery fee is considered.
  assert.equal(report.summary.byParcelClass[0].parcelClass, 'cold');
  assert.ok(byClass.get('cold').goodsMarginMinor < byClass.get('bulky').goodsMarginMinor);
});

test('orders plus unattributed equal the ledger, account by account', async () => {
  const db = await freshDb();
  await delivered(db, items(IDS.variantNappies, 2));
  await delivered(db, items(IDS.variantLotion, 1));

  const report = await orderMargins(db);
  assert.equal(report.tieOut.reconciles, true);

  for (const account of report.tieOut.accounts) {
    const ledger = await balance(db, account.code);
    const signed = account.code === ACCOUNTS.COD_REVENUE ||
      account.code === ACCOUNTS.COMMISSION_REVENUE ||
      account.code === ACCOUNTS.FULFILMENT_REVENUE ||
      account.code === ACCOUNTS.DELIVERY_REVENUE
      ? -ledger
      : ledger;
    assert.equal(
      account.perOrderMinor + account.unattributedMinor,
      signed,
      `account ${account.code} does not tie out`,
    );
  }
  assert.equal((await trialBalance(db)).balanced, true);
});

test('the window filters by posting date, and a bad window is refused', async () => {
  const db = await freshDb();
  await delivered(db, items(IDS.variantNappies, 1));

  const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  assert.deepEqual((await orderMargins(db, { from: future })).rows, []);
  assert.equal((await orderMargins(db, { to: future })).summary.orders, 1);

  await assert.rejects(() => orderMargins(db, { from: future, to: '2020-01-01' }), (err) => {
    assert.equal(err.code, 'BAD_WINDOW');
    return true;
  });
});

test('the seller view separates our commission from their goods', async () => {
  const db = await freshDb();
  await delivered(db, items(IDS.variantNappies, 2));
  await delivered(db, items(IDS.variantLotion, 1));

  const sellers = await marginBySeller(db);
  assert.equal(sellers.length, 1);
  const seller = sellers[0];
  assert.equal(seller.sellerId, IDS.seller);
  assert.ok(seller.commissionMinor > 0);
  assert.ok(seller.fulfilmentMinor > 0);
  assert.equal(seller.marketplaceRevenueMinor, seller.commissionMinor + seller.fulfilmentMinor);

  const summary = (await orderMargins(db)).summary;
  assert.equal(summary.commissionMinor, seller.commissionMinor);
});

test('margin basis points do not divide by zero', () => {
  assert.equal(bpsOf(0, 0), null);
  assert.equal(bpsOf(159, 754), 2109);
  assert.equal(bpsOf(-500, 1000), -5000);
});

test('the SQL view and the module agree, to the cent', async () => {
  const db = await freshDb();
  await delivered(db, items(IDS.variantNappies, 2));
  await delivered(db, items(IDS.variantLotion, 1));
  await db.query(`update product_variants set parcel_class = 'cold' where id = $1`, [IDS.variantLotion]);
  await delivered(db, items(IDS.variantLotion, 1));

  const view = (await db.query(`select * from order_margins order by order_number`)).rows;
  const report = await orderMargins(db);
  const rows = [...report.rows].sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  assert.equal(view.length, rows.length);

  for (let i = 0; i < view.length; i += 1) {
    const v = view[i];
    const r = rows[i];
    assert.equal(v.order_number, r.orderNumber);
    assert.equal(Number(v.commission_minor), r.commissionMinor);
    assert.equal(Number(v.fulfilment_minor), r.fulfilmentMinor);
    assert.equal(Number(v.delivery_minor), r.deliveryMinor);
    assert.equal(Number(v.cod_minor), r.codMinor);
    assert.equal(Number(v.cogs_minor), r.cogsMinor);
    assert.equal(Number(v.packaging_minor), r.packagingMinor);
    assert.equal(Number(v.goods_margin_minor), r.goodsMarginMinor);
    assert.equal(Number(v.net_margin_minor), r.netMarginMinor);
  }
});

test('profitability routes are admin-only and return the ledger tie-out', async () => {
  const db = await freshDb();
  await delivered(db, items(IDS.variantNappies, 1));

  const app = createApp({ db, devAuth: true, exposeOtpCodes: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { user = IDS.admin } = {}) =>
    fetch(`${base}${path}`, { headers: { 'content-type': 'application/json', 'x-user-id': user } });

  try {
    assert.equal((await call('/api/ops/profitability', { user: IDS.customer })).status, 403);
    assert.equal((await call('/api/ops/profitability/sellers')).status, 200);

    const res = await call('/api/ops/profitability');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.summary.orders, 1);
    assert.equal(body.tieOut.reconciles, true);
    assert.equal(body.rows[0].orderNumber, body.rows[0].orderNumber.trim());
    assert.ok(body.rows[0].netMarginMinor !== undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
