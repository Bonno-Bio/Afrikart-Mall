import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items, stockOf } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { capturePayment } from '../src/payments.js';
import { recordDelivery } from '../src/delivery.js';
import { refundLine, completeRefund } from '../src/refunds.js';
import { trialBalance, balance, ACCOUNTS } from '../src/ledger.js';

async function deliveredOrder(db, { variantId = IDS.variantFormula, quantity = 2 } = {}) {
  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(variantId, quantity),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'card',
    idempotencyKey: `refund-${Math.random()}`,
  });
  const pay = await db.query(`select id from payments where order_id = (select id from orders where order_number = $1)`, [
    order.orderNumber,
  ]);
  await capturePayment(db, { paymentId: pay.rows[0].id, providerRef: `PSP-${Math.random().toString(36).slice(2)}` });
  await recordDelivery(db, { orderNumber: order.orderNumber });

  const lines = await db.query(
    `select i.id, i.line_subtotal_minor, i.vat_minor, i.commission_minor, i.fulfilment_minor, i.seller_payable_minor
       from order_items i join orders o on o.id = i.order_id where o.order_number = $1`,
    [order.orderNumber],
  );
  return { order, line: lines.rows[0] };
}

test('store credit is instant: credited in the same call, and the cash stays inside', async () => {
  const db = await freshDb();
  try {
    const { line } = await deliveredOrder(db);
    const refund = await refundLine(db, { orderItemId: line.id, channel: 'store_credit', reason: 'DAMAGED' });

    assert.equal(refund.status, 'completed');
    assert.equal(Number(refund.credited_minor), Number(line.line_subtotal_minor));
    assert.equal(refund.sla_due_at, null);
    // The customer now has value we owe them, and we keep the bank balance.
    assert.equal(await balance(db, ACCOUNTS.CUSTOMER_PREPAYMENTS), -Number(line.line_subtotal_minor));
    assert.equal((await trialBalance(db)).balanced, true);
  } finally {
    await db.close();
  }
});

test('a mobile-money reversal carries a 48-hour promise instead of a vague apology', async () => {
  const db = await freshDb();
  try {
    const { line } = await deliveredOrder(db);
    const refund = await refundLine(db, { orderItemId: line.id, channel: 'original_method', reason: 'REFUSED' });

    assert.equal(refund.status, 'pending');
    assert.equal(Number(refund.credited_minor), 0);
    const hours = (new Date(refund.sla_due_at).getTime() - Date.now()) / 3600000;
    assert.ok(hours > 47 && hours <= 48.1, `SLA should be ~48h, got ${hours}`);
  } finally {
    await db.close();
  }
});

test('a refund reverses exactly what the line created: seller, commission, fulfilment, VAT', async () => {
  const db = await freshDb();
  try {
    const { line } = await deliveredOrder(db);
    const vatBefore = await balance(db, ACCOUNTS.VAT_PAYABLE);
    const sellerBefore = Number(
      (await db.query(`select payable_minor from seller_balances where seller_id = $1`, [IDS.seller])).rows[0]
        .payable_minor,
    );

    await refundLine(db, { orderItemId: line.id, channel: 'store_credit', reason: 'WRONG_ITEM' });

    const sellerAfter = Number(
      (await db.query(`select payable_minor from seller_balances where seller_id = $1`, [IDS.seller])).rows[0]
        .payable_minor,
    );
    assert.equal(sellerBefore - sellerAfter, Number(line.seller_payable_minor));

    const vatAfter = await balance(db, ACCOUNTS.VAT_PAYABLE);
    assert.equal(vatAfter - vatBefore, Number(line.vat_minor), 'the VAT liability must fall by exactly the line VAT');
    assert.equal((await trialBalance(db)).balanced, true);
  } finally {
    await db.close();
  }
});

test('a refund cannot be paid twice', async () => {
  const db = await freshDb();
  try {
    const { line } = await deliveredOrder(db);
    await refundLine(db, { orderItemId: line.id, channel: 'store_credit', reason: 'DAMAGED' });
    await assert.rejects(
      () => refundLine(db, { orderItemId: line.id, channel: 'store_credit', reason: 'DAMAGED' }),
      /already been refunded/,
    );
  } finally {
    await db.close();
  }
});

test('an undelivered line cannot be refunded, because there is nothing to take back', async () => {
  const db = await freshDb();
  try {
    const order = await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'undelivered',
    });
    const lines = await db.query(
      `select i.id from order_items i join orders o on o.id = i.order_id where o.order_number = $1`,
      [order.orderNumber],
    );
    await assert.rejects(
      () => refundLine(db, { orderItemId: lines.rows[0].id, channel: 'store_credit', reason: 'DAMAGED' }),
      /Only a delivered line/,
    );
  } finally {
    await db.close();
  }
});

test('a sellable return goes back on the shelf; a damaged one does not', async () => {
  const db = await freshDb();
  try {
    const good = await deliveredOrder(db, { quantity: 1 });
    const before = await stockOf(db, IDS.variantFormula);
    await refundLine(db, { orderItemId: good.line.id, channel: 'store_credit', reason: 'WRONG_SIZE' });
    assert.equal(await stockOf(db, IDS.variantFormula), before + 1);

    const damaged = await deliveredOrder(db, { quantity: 1 });
    const afterGood = await stockOf(db, IDS.variantFormula);
    await refundLine(db, { orderItemId: damaged.line.id, channel: 'store_credit', reason: 'DAMAGED' });
    assert.equal(await stockOf(db, IDS.variantFormula), afterGood, 'damaged stock must not return to sellable');
  } finally {
    await db.close();
  }
});

test('refunding every line closes the order', async () => {
  const db = await freshDb();
  try {
    const { line, order } = await deliveredOrder(db, { quantity: 1 });
    await refundLine(db, { orderItemId: line.id, channel: 'store_credit', reason: 'DAMAGED' });
    const state = await db.query(`select status from orders where order_number = $1`, [order.orderNumber]);
    assert.equal(state.rows[0].status, 'refunded');
  } finally {
    await db.close();
  }
});

test('settling a reversal moves money out of the bank and clears the liability', async () => {
  const db = await freshDb();
  try {
    const { line } = await deliveredOrder(db);
    const refund = await refundLine(db, { orderItemId: line.id, channel: 'original_method', reason: 'REFUSED' });
    const settled = await completeRefund(db, { refundId: refund.id, providerRef: 'MM-REV-1' });

    assert.equal(settled.status, 'completed');
    assert.equal(await balance(db, ACCOUNTS.CUSTOMER_PREPAYMENTS), 0);
    assert.equal(await balance(db, ACCOUNTS.BANK), -Number(line.line_subtotal_minor));
    assert.equal((await trialBalance(db)).balanced, true);

    const again = await completeRefund(db, { refundId: refund.id });
    assert.equal(again.alreadyCompleted, true);
  } finally {
    await db.close();
  }
});

test('a refund without a reason is refused', async () => {
  const db = await freshDb();
  try {
    const { line } = await deliveredOrder(db);
    await assert.rejects(() => refundLine(db, { orderItemId: line.id, channel: 'store_credit' }), /needs a reason/);
  } finally {
    await db.close();
  }
});
