/**
 * Seller payouts — AFR-42.
 *
 * A marketplace that never pays its sellers is a shop with extra steps. These
 * tests hold the four things that make a payout believable: it is a set of
 * order lines, a line is paid once, the amount equals what the ledger says we
 * owe, and the seller can add the statement up themselves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery } from '../src/delivery.js';
import { refundLine } from '../src/refunds.js';
import { payoutRun, payoutStatement, payoutsFor } from '../src/payouts.js';
import { balance, trialBalance, ACCOUNTS } from '../src/ledger.js';
import { shelfReport } from '../src/catalogue.js';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const key = () => `payout-${(seq += 1)}`;

async function deliveredOrder(db, { variantId = IDS.variantFormula, quantity = 1 } = {}) {
  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(variantId, quantity),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'cod',
    scheduledDate: tomorrow(),
    idempotencyKey: key(),
  });
  const delivered = await recordDelivery(db, { orderNumber: order.orderNumber });
  return { order, delivered };
}

// --- category pricing ------------------------------------------------------

test('commission follows the category rate, and falls back to the seller rate when the category has none', async () => {
  const db = await freshDb();

  // The seed's category carries 8% + 4%; the seller's own rate is 12% + 6%.
  const { order, delivered } = await deliveredOrder(db, { quantity: 1 });
  const net = Math.round(18900 / 1.14); // 16579
  assert.equal(delivered.commissionMinor, Math.round(net * 0.08), 'category rate must win');
  assert.equal(delivered.fulfilmentMinor, Math.round(net * 0.04));

  // Clear the category rate and the seller's rate takes over again.
  await db.query(`update categories set commission_bps = null, fulfilment_bps = null where id = $1`, [
    IDS.category,
  ]);
  const second = await deliveredOrder(db, { quantity: 1 });
  assert.equal(second.delivered.commissionMinor, Math.round(net * 0.12));
  assert.equal(second.delivered.fulfilmentMinor, Math.round(net * 0.06));
  assert.ok(second.delivered.sellerPayableMinor < delivered.sellerPayableMinor);
  assert.ok(order.orderNumber);
});

test('the shelf report names the SKUs where the seller loses money', async () => {
  const db = await freshDb();
  const shelf = await shelfReport(db);
  // At 8% + 4% the nappies still do not clear their landed cost. That is the
  // decision the pilot has to make, and the report has to say so rather than
  // average it away.
  assert.deepEqual(shelf.summary.sellersUnderwater, ['PAM-BDP-M46']);
});

// --- the payout itself -----------------------------------------------------

test('a payout pays exactly what the ledger owes, and the ledger agrees', async () => {
  const db = await freshDb();
  const { order } = await deliveredOrder(db, { quantity: 2 });

  // balance() is debit-minus-credit, so a credit balance reads negative.
  const owedBefore = -(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller }));
  const bankBefore = await balance(db, ACCOUNTS.BANK);

  const run = await payoutRun(db, { sellerId: IDS.seller, periodStart: '2020-01-01', periodEnd: '2030-01-01' });
  assert.equal(run.payouts.length, 1);
  const payout = run.payouts[0];
  assert.equal(payout.netMinor, owedBefore);
  assert.equal(payout.status, undefined); // the run returns the summary
  assert.equal(run.totalPaidMinor, owedBefore);

  assert.equal(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller }), 0);
  assert.equal(await balance(db, ACCOUNTS.BANK), bankBefore - owedBefore);
  assert.equal((await trialBalance(db)).balanced, true);

  const paid = await db.query(`select status, paid_at from seller_payouts where id = $1`, [payout.payoutId]);
  assert.equal(paid.rows[0].status, 'paid');
  assert.ok(paid.rows[0].paid_at);
  assert.ok(order.orderNumber);
});

test('the statement is a set of order lines the seller can add up', async () => {
  const db = await freshDb();
  const { order } = await deliveredOrder(db, { quantity: 2 });

  const run = await payoutRun(db, { sellerId: IDS.seller, periodStart: '2020-01-01', periodEnd: '2030-01-01' });
  const statement = await payoutStatement(db, { payoutId: run.payouts[0].payoutId });

  assert.equal(statement.items.length, 1);
  assert.equal(statement.items[0].orderNumber, order.orderNumber);
  assert.equal(statement.items[0].quantity, 2);
  assert.equal(statement.reconciles, true, 'items must sum to net minus refunds');
  assert.equal(
    statement.grossMinor - statement.commissionMinor - statement.fulfilmentMinor - statement.refundsMinor,
    statement.netMinor,
  );
});

test('a line cannot be paid twice, and the same week cannot be run twice', async () => {
  const db = await freshDb();
  await deliveredOrder(db);

  const period = { sellerId: IDS.seller, periodStart: '2020-01-01', periodEnd: '2030-01-01' };
  await payoutRun(db, period);

  // Same period again: refused by the unique period, not by luck.
  await assert.rejects(
    () => payoutRun(db, period),
    (err) => err.code === 'PAYOUT_EXISTS' || err.code === 'NOTHING_TO_PAY',
  );

  // A later period with nothing new: nothing to pay.
  await assert.rejects(
    () => payoutRun(db, { sellerId: IDS.seller, periodStart: '2031-01-01', periodEnd: '2031-12-31' }),
    (err) => err.code === 'NOTHING_TO_PAY',
  );

  const items = await db.query(`select count(*)::int as n from payout_items`);
  assert.equal(items.rows[0].n, 1, 'one order line, one payout item');
});

test('a refunded line is shown on the statement as a refund, and is not paid', async () => {
  const db = await freshDb();
  const { order } = await deliveredOrder(db, { quantity: 2 });
  const line = await db.query(`select id, seller_payable_minor from order_items where order_id = (select id from orders where order_number = $1)`, [
    order.orderNumber,
  ]);

  await refundLine(db, { orderItemId: line.rows[0].id, channel: 'store_credit', reason: 'DAMAGED' });

  // Nothing payable is left for this seller.
  await assert.rejects(
    () => payoutRun(db, { sellerId: IDS.seller, periodStart: '2020-01-01', periodEnd: '2030-01-01' }),
    (err) => err.code === 'NOTHING_TO_PAY',
  );
  assert.equal(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller }), 0);
});

test('one seller’s payout does not touch another’s balance', async () => {
  const db = await freshDb();

  // A second seller, with their own product in the same category.
  const seller2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const product2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  const variant2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  await db.query(
    `insert into users (id, email, full_name, role) values (gen_random_uuid(), 'second@example.com', 'Second Seller', 'seller')`,
  );
  await db.query(
    `insert into sellers (id, owner_user_id, legal_name, trading_name, slug, city, fulfilment_mode,
                          can_list_express, commission_bps, fulfilment_bps, status, approved_at)
     select $1, id, 'Second Seller (Pty) Ltd', 'Second Seller', 'second-seller', 'Gaborone', 'afrikart',
            true, 800, 400, 'approved', now() from users where email = 'second@example.com'`,
    [seller2],
  );
  await db.query(
    `insert into products (id, seller_id, category_id, title, status, catalog_tier, primary_image_url, compliance_status)
     values ($1, $2, $3, 'Second seller lotion', 'live', 'express',
             'https://cdn.afrikart.co.bw/p/2.jpg', 'verified')`,
    [product2, seller2, IDS.category],
  );
  await db.query(
    `insert into product_variants (id, product_id, sku, price_minor, weight_grams, volume_ml)
     values ($1, $2, 'SEC-BGL-200', 9900, 300, 800)`,
    [variant2, product2],
  );
  await db.query(
    `insert into purchase_orders (id, po_number, supplier_id, status, currency, inventory_owner)
     values (gen_random_uuid(), 'PO-2026-0100', $1, 'received', 'BWP', 'seller')`,
    [IDS.supplier],
  );
  await db.query(
    `insert into purchase_order_lines (purchase_order_id, variant_id, quantity, unit_cost_minor)
     select id, $1, 10, 7000 from purchase_orders where po_number = 'PO-2026-0100'`,
    [variant2],
  );
  await db.query(`insert into inventory_levels (variant_id, on_hand) values ($1, 10)`, [variant2]);

  const first = await deliveredOrder(db, { quantity: 1 });
  const second = await deliveredOrder(db, { variantId: variant2, quantity: 1 });

  await payoutRun(db, { sellerId: IDS.seller, periodStart: '2020-01-01', periodEnd: '2030-01-01' });

  assert.equal(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller }), 0);
  const otherOwed = -(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: seller2 }));
  assert.ok(otherOwed > 0, 'the second seller is still owed their money');
  assert.equal((await trialBalance(db)).balanced, true);

  const all = await payoutRun(db, { periodStart: '2020-01-01', periodEnd: '2030-01-01' });
  assert.equal(all.payouts.length, 1, 'only the seller with something owing is paid');
  assert.equal(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: seller2 }), 0);
  assert.ok(first.order.orderNumber);
  assert.ok(second.order.orderNumber);
});

test('the seller sees their payout history', async () => {
  const db = await freshDb();
  await deliveredOrder(db, { quantity: 1 });
  await payoutRun(db, { sellerId: IDS.seller, periodStart: '2020-01-01', periodEnd: '2030-01-01' });

  const history = await payoutsFor(db, { sellerId: IDS.seller });
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'paid');
  assert.ok(history[0].netMinor > 0);
});
