/**
 * Who pays for stock that vanished — AFR-48.
 *
 * The shelf holds other people's goods. When a count cannot find them, the
 * question is commercial, not accounting: whose loss is it? The tests hold the
 * two honest answers, and refuse the third one (inventing an expense we never
 * suffered, or a debt the seller never agreed to).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items } from './helpers.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery } from '../src/delivery.js';
import { refundLine } from '../src/refunds.js';
import { payoutRun, payoutStatement } from '../src/payouts.js';
import { runStocktake } from '../src/import.js';
import { decideStocktakeIncidents, openStocktakeIncidents } from '../src/shrinkage.js';
import { balance, trialBalance, ACCOUNTS } from '../src/ledger.js';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const key = () => `shrink-${(seq += 1)}`;

async function deliveredOrder(db, { quantity = 1 } = {}) {
  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(IDS.variantFormula, quantity),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'cod',
    scheduledDate: tomorrow(),
    idempotencyKey: key(),
  });
  return recordDelivery(db, { orderNumber: order.orderNumber });
}

/** Count the nappies three short; the seed holds 30 consigned for the seller. */
async function shortCount(db) {
  const report = await runStocktake(db, {
    counts: [{ sku: 'PAM-BDP-M46', counted: 27 }],
    note: 'month-end count',
    actorId: IDS.admin,
  });
  return report.variances[0];
}

// --- the incident ----------------------------------------------------------

test('a consignment shortfall raises an incident with a price and a question', async () => {
  const db = await freshDb();
  const variance = await shortCount(db);

  assert.equal(variance.delta, -3);
  assert.ok(variance.incidentId, 'a shortfall on someone else\'s stock must leave evidence, not just a number');

  const open = await openStocktakeIncidents(db);
  assert.equal(open.count, 1);
  const [incident] = open.incidents;
  assert.equal(incident.sku, 'PAM-BDP-M46');
  assert.equal(incident.quantityLost, 3);
  // 3 units at the landed cost of the received PO, freight included.
  assert.equal(incident.valueMinor, incident.unitCostMinor * 3);
  assert.ok(incident.unitCostMinor > 16500, 'landed cost must carry freight');

  // Nothing has been decided, so nothing has moved in the books.
  assert.equal(await balance(db, ACCOUNTS.SHRINKAGE), 0);
  assert.equal(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller }), 0);
});

test('our own stock does not raise an incident — it is already an expense', async () => {
  const db = await freshDb();
  await db.query(`update product_variants set ownership = 'afrikart' where id = $1`, [IDS.variantNappies]);

  const report = await runStocktake(db, { counts: [{ sku: 'PAM-BDP-M46', counted: 27 }], actorId: IDS.admin });
  assert.equal(report.variances[0].incidentId, null);
  assert.equal((await openStocktakeIncidents(db)).count, 0);
  assert.ok(await balance(db, ACCOUNTS.SHRINKAGE));
});

// --- the two decisions -----------------------------------------------------

test('seller_absorbs posts nothing, because the goods were never our asset', async () => {
  const db = await freshDb();
  const variance = await shortCount(db);
  const before = await trialBalance(db);

  const result = await decideStocktakeIncidents(db, {
    incidentIds: [variance.incidentId],
    decision: 'seller_absorbs',
    actorId: IDS.admin,
    note: 'seller accepted the loss in writing',
  });

  assert.strictEqual(result.incidents[0].postsToLedgerMinor, 0);
  assert.equal(result.compensationMinor, 0);

  const after = await trialBalance(db);
  assert.equal(await balance(db, ACCOUNTS.SHRINKAGE), 0, 'we did not suffer this loss and must not book it');
  assert.equal(after.balanced, true);
  assert.equal(after.entries, before.entries);

  const decided = await db.query(`select decision, decided_by, note from stocktake_incidents where id = $1`, [
    variance.incidentId,
  ]);
  assert.equal(decided.rows[0].decision, 'seller_absorbs');
  assert.equal(decided.rows[0].decided_by, IDS.admin);
  assert.match(decided.rows[0].note, /in writing/);

  assert.equal((await openStocktakeIncidents(db)).count, 0);
});

test('afrikart_compensates books the loss and credits the seller', async () => {
  const db = await freshDb();
  const variance = await shortCount(db);
  const value = variance.postedMinor === 0 ? null : variance.postedMinor;

  const result = await decideStocktakeIncidents(db, {
    incidentIds: [variance.incidentId],
    decision: 'afrikart_compensates',
    actorId: IDS.admin,
    note: 'our forklift',
  });

  const incident = result.incidents[0];
  assert.equal(incident.decision, 'afrikart_compensates');
  // `balance` is debit-minus-credit, so a credit to the seller reads negative.
  assert.equal(-incident.valueMinor, await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller }));
  assert.ok(incident.valueMinor > 0);
  assert.equal(variance.delta, -3);
  assert.ok(value === null || value === 0, 'the stocktake itself posted nothing for consigned stock');

  assert.equal(await balance(db, ACCOUNTS.SHRINKAGE), incident.valueMinor);
  assert.equal((await trialBalance(db)).balanced, true);
});

test('decisions are idempotent, but cannot be reversed once a payout has paid them', async () => {
  const db = await freshDb();
  const variance = await shortCount(db);

  const first = await decideStocktakeIncidents(db, {
    incidentIds: [variance.incidentId],
    decision: 'seller_absorbs',
    actorId: IDS.admin,
  });
  assert.equal(first.incidents[0].decision, 'seller_absorbs');

  // A retried request must not compensate a seller twice, or argue with itself.
  const again = await decideStocktakeIncidents(db, {
    incidentIds: [variance.incidentId],
    decision: 'seller_absorbs',
    actorId: IDS.admin,
  });
  assert.equal(again.compensationMinor, 0);
  assert.equal(await balance(db, ACCOUNTS.SHRINKAGE), 0);

  await assert.rejects(
    () =>
      decideStocktakeIncidents(db, {
        incidentIds: [variance.incidentId],
        decision: 'afrikart_compensates',
        actorId: IDS.admin,
      }),
    (err) => err.code === 'INCIDENT_ALREADY_DECIDED',
  );

  await assert.rejects(
    () => decideStocktakeIncidents(db, { incidentIds: [], decision: 'seller_absorbs' }),
    (err) => err.code === 'INCIDENTS_REQUIRED',
  );
  await assert.rejects(
    () => decideStocktakeIncidents(db, { incidentIds: [variance.incidentId], decision: 'charge_seller' }),
    (err) => err.code === 'INVALID_DECISION',
  );
  await assert.rejects(
    () =>
      decideStocktakeIncidents(db, {
        incidentIds: ['00000000-0000-4000-8000-000000000000'],
        decision: 'seller_absorbs',
      }),
    (err) => err.code === 'INCIDENT_NOT_FOUND',
  );
});

// --- the statement ---------------------------------------------------------

test('compensation is paid in the next run, once, and the statement adds up', async () => {
  const db = await freshDb();
  const delivered = await deliveredOrder(db, { quantity: 2 });
  const variance = await shortCount(db);

  const decision = await decideStocktakeIncidents(db, {
    incidentIds: [variance.incidentId],
    decision: 'afrikart_compensates',
    actorId: IDS.admin,
  });
  const compensation = decision.compensationMinor;
  assert.ok(compensation > 0);

  const payableBefore = await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller });
  const run = await payoutRun(db, { sellerId: IDS.seller, actorId: IDS.admin });

  assert.equal(run.payouts.length, 1);
  const payout = run.payouts[0];
  assert.equal(payout.grossMinor, 33158, 'two formula tins at P189 incl. VAT, ex-VAT');
  assert.equal(payout.compensationMinor, compensation);
  assert.equal(payout.compensatedIncidents, 1);
  assert.equal(
    payout.netMinor,
    payout.grossMinor - payout.commissionMinor - payout.fulfilmentMinor - payout.refundsMinor + compensation,
  );
  assert.equal(await balance(db, ACCOUNTS.SELLER_PAYABLE, { sellerId: IDS.seller }), 0);
  assert.ok(payableBefore < 0, 'the seller was a creditor before the payout');
  assert.equal((await trialBalance(db)).balanced, true);

  const statement = await payoutStatement(db, { payoutId: payout.payoutId });
  assert.equal(statement.compensationMinor, compensation);
  assert.equal(statement.reconciles, true);
  assert.equal(statement.itemsSumMinor + statement.compensationMinor, statement.netMinor);
  assert.deepEqual(statement.arithmetic, {
    grossMinor: statement.grossMinor,
    lessCommissionMinor: statement.commissionMinor,
    lessFulfilmentMinor: statement.fulfilmentMinor,
    lessRefundsMinor: statement.refundsMinor,
    plusCompensationMinor: compensation,
    equalsNetMinor: statement.netMinor,
  });

  // The loss is visible on the statement whether or not it was made good.
  assert.equal(statement.shrinkage.length, 1);
  assert.equal(statement.shrinkage[0].decision, 'afrikart_compensates');
  assert.equal(statement.shrinkage[0].compensatedMinor, compensation);
  assert.equal(statement.shrinkage[0].chargedToSellerMinor, 0);

  // A second run has nothing to pay: the incident is stamped with its payout.
  await assert.rejects(() => payoutRun(db, { sellerId: IDS.seller, actorId: IDS.admin }), (err) => err.code === 'NOTHING_TO_PAY');
  await assert.rejects(
    () =>
      decideStocktakeIncidents(db, {
        incidentIds: [variance.incidentId],
        decision: 'seller_absorbs',
        actorId: IDS.admin,
      }),
    (err) => err.code === 'INCIDENT_ALREADY_PAID',
  );
});

test('a seller with only compensation to receive still gets paid', async () => {
  const db = await freshDb();
  const variance = await shortCount(db);
  await decideStocktakeIncidents(db, {
    incidentIds: [variance.incidentId],
    decision: 'afrikart_compensates',
    actorId: IDS.admin,
  });

  // No orders at all this period: the payout must not silently skip the seller.
  const run = await payoutRun(db, { sellerId: IDS.seller, actorId: IDS.admin });
  const payout = run.payouts[0];
  assert.equal(payout.grossMinor, 0);
  assert.equal(payout.lines, 0);
  assert.equal(payout.netMinor, payout.compensationMinor);
  assert.ok(payout.netMinor > 0);

  const statement = await payoutStatement(db, { payoutId: payout.payoutId });
  assert.equal(statement.reconciles, true);
  assert.equal(statement.items.length, 0);
});

test('a week with a refund still reconciles — the statement must not lie about returns', async () => {
  const db = await freshDb();
  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: [...items(IDS.variantFormula, 2), ...items(IDS.variantLotion, 1)],
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'cod',
    scheduledDate: tomorrow(),
    idempotencyKey: key(),
  });
  await recordDelivery(db, { orderNumber: order.orderNumber });

  // Return the lotion line in full; the formula tins are still payable.
  const line = await db.query(
    `select i.id from order_items i join orders o on o.id = i.order_id
      where o.order_number = $1 and i.sku_snapshot = 'NIV-BGL-200'`,
    [order.orderNumber],
  );
  await refundLine(db, { orderItemId: line.rows[0].id, channel: 'store_credit', reason: 'DAMAGED' });

  const run = await payoutRun(db, { sellerId: IDS.seller, actorId: IDS.admin });
  const statement = await payoutStatement(db, { payoutId: run.payouts[0].payoutId });

  assert.ok(statement.refundsMinor > 0, 'the returned line must appear as a refund');
  assert.equal(statement.items.length, 1, 'only the unreturned line is paid');
  assert.equal(statement.reconciles, true);
  // The corrected arithmetic: the statement is the lines plus compensation, and
  // that must equal the transfer — comparing against net minus refunds, as this
  // code did before, would have been wrong by the refund on any week with one.
  assert.equal(statement.itemsSumMinor + statement.compensationMinor, statement.netMinor);
  assert.equal(statement.arithmetic.equalsNetMinor, statement.netMinor);
});
