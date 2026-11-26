import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { capturePayment } from '../src/payments.js';
import { recordDelivery } from '../src/delivery.js';
import { trialBalance, balance, ACCOUNTS } from '../src/ledger.js';

async function orderWithPayment(db, { paymentMethod = 'card', quantity = 2, variantId = IDS.variantFormula } = {}) {
  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(variantId, quantity),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod,
    idempotencyKey: `key-${paymentMethod}-${quantity}-${Math.random()}`,
  });
  const pay = await db.query(`select id from payments where order_id = (select id from orders where order_number = $1)`, [
    order.orderNumber,
  ]);
  return { order, paymentId: pay.rows[0].id };
}

test('a captured payment is cash received against a liability, not revenue', async () => {
  const db = await freshDb();
  try {
    const { order, paymentId } = await orderWithPayment(db);
    await capturePayment(db, { paymentId, providerRef: 'PSP-1', providerFeeMinor: 510 });

    const state = await db.query(`select status, placed_at from orders where order_number = $1`, [order.orderNumber]);
    assert.equal(state.rows[0].status, 'placed');
    assert.ok(state.rows[0].placed_at);

    assert.equal(await balance(db, ACCOUNTS.PSP_RECEIVABLE), order.totalMinor - 510);
    assert.equal(await balance(db, ACCOUNTS.CUSTOMER_PREPAYMENTS), -order.totalMinor);
    // No revenue yet: the parcel has not been delivered.
    assert.equal(await balance(db, ACCOUNTS.COMMISSION_REVENUE), 0);
    assert.equal(await balance(db, ACCOUNTS.VAT_PAYABLE), 0);
  } finally {
    await db.close();
  }
});

test('a webhook delivered three times posts one transaction', async () => {
  const db = await freshDb();
  try {
    const { paymentId } = await orderWithPayment(db);
    const first = await capturePayment(db, { paymentId, providerRef: 'PSP-1' });
    const second = await capturePayment(db, { paymentId, providerRef: 'PSP-1' });
    const third = await capturePayment(db, { paymentId, providerRef: 'PSP-1' });

    assert.equal(first.alreadyCaptured, false);
    assert.equal(second.alreadyCaptured, true);
    assert.equal(third.alreadyCaptured, true);

    const txns = await db.query(`select count(*)::int as n from ledger_transactions where kind = 'capture'`);
    assert.equal(txns.rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('delivery is when revenue, VAT and the seller payable are recognised', async () => {
  const db = await freshDb();
  try {
    const { order, paymentId } = await orderWithPayment(db, { quantity: 2 });
    await capturePayment(db, { paymentId, providerRef: 'PSP-1' });
    const delivered = await recordDelivery(db, { orderNumber: order.orderNumber });

    assert.equal(delivered.status, 'delivered');
    assert.ok(delivered.sellerPayableMinor > 0);
    assert.equal(delivered.commissionMinor + delivered.fulfilmentMinor + delivered.sellerPayableMinor, 37800 - 4642);

    const seller = await db.query(`select payable_minor from seller_balances where seller_id = $1`, [IDS.seller]);
    assert.equal(Number(seller.rows[0].payable_minor), delivered.sellerPayableMinor);

    const o = await db.query(`select vat_minor from orders where order_number = $1`, [order.orderNumber]);
    assert.equal(-(await balance(db, ACCOUNTS.VAT_PAYABLE)), Number(o.rows[0].vat_minor));

    const tb = await trialBalance(db);
    assert.equal(tb.balanced, true, `ledger does not balance: ${JSON.stringify(tb)}`);
    assert.equal(await balance(db, ACCOUNTS.CUSTOMER_PREPAYMENTS), 0);
  } finally {
    await db.close();
  }
});

test('delivering twice does not recognise the sale twice', async () => {
  const db = await freshDb();
  try {
    const { order, paymentId } = await orderWithPayment(db);
    await capturePayment(db, { paymentId, providerRef: 'PSP-1' });
    await recordDelivery(db, { orderNumber: order.orderNumber });
    const again = await recordDelivery(db, { orderNumber: order.orderNumber });

    assert.equal(again.alreadyDelivered, true);
    const sales = await db.query(`select count(*)::int as n from ledger_transactions where kind = 'sale'`);
    assert.equal(sales.rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('one invoice per order, and it is immutable', async () => {
  const db = await freshDb();
  try {
    const { order, paymentId } = await orderWithPayment(db);
    await capturePayment(db, { paymentId, providerRef: 'PSP-1' });
    const first = await recordDelivery(db, { orderNumber: order.orderNumber });
    await recordDelivery(db, { orderNumber: order.orderNumber });

    const invoices = await db.query(`select count(*)::int as n from invoices`);
    assert.equal(invoices.rows[0].n, 1);
    assert.match(first.invoiceNumber, /^INV-\d{8}$/);

    await assert.rejects(() => db.query(`update invoices set total_minor = 1`), /append-only|immutable/i);
  } finally {
    await db.close();
  }
});

test('cash on delivery lands in cash-on-hand, and a short collection is refused', async () => {
  const db = await freshDb();
  try {
    const { order } = await orderWithPayment(db, { paymentMethod: 'cod', quantity: 1 });

    await assert.rejects(
      () => recordDelivery(db, { orderNumber: order.orderNumber, cashCollectedMinor: 100 }),
      (err) => err.code === 'COD_AMOUNT_MISMATCH',
    );

    const delivered = await recordDelivery(db, { orderNumber: order.orderNumber, cashCollectedMinor: order.totalMinor });
    assert.equal(delivered.cashCollectedMinor, order.totalMinor);
    assert.equal(await balance(db, ACCOUNTS.CASH_ON_HAND), order.totalMinor);
    assert.equal((await trialBalance(db)).balanced, true);
  } finally {
    await db.close();
  }
});

test('an order that was never paid cannot be delivered', async () => {
  const db = await freshDb();
  try {
    const { order } = await orderWithPayment(db, { paymentMethod: 'card' });
    await assert.rejects(() => recordDelivery(db, { orderNumber: order.orderNumber }), /cannot be delivered/);
  } finally {
    await db.close();
  }
});
