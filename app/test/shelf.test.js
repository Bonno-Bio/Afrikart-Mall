/**
 * B2 — The Shelf.
 *
 * These tests exist to keep three promises that B1 could not make: stock arrives
 * with a cost attached, a product cannot be sold before it is costed, and a
 * delivered order carries its cost into the ledger in the same commit as its
 * revenue.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items, stockOf } from './helpers.js';
import { allocateCharges, landedCosts, receivePurchaseOrder, publishProduct, shelfReport, postCogs } from '../src/catalogue.js';
import { balance, trialBalance, ACCOUNTS } from '../src/ledger.js';
import { placeOrder } from '../src/orders.js';
import { recordDelivery } from '../src/delivery.js';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// --- the arithmetic -------------------------------------------------------

test('freight is allocated by value, and the thebes add up exactly', () => {
  const lines = [
    { quantity: 40, unitCostMinor: 14000 }, // 560 000
    { quantity: 30, unitCostMinor: 16500 }, // 495 000
    { quantity: 60, unitCostMinor: 7000 }, // 420 000
  ];
  const allocation = allocateCharges(lines, 45000, 0);

  assert.equal(allocation.length, 3);
  assert.equal(
    allocation.reduce((a, v) => a + v, 0),
    45000,
    'a thebe of freight must not be lost to rounding',
  );
  // Largest value takes the largest share.
  assert.ok(allocation[0] > allocation[1]);
  assert.ok(allocation[1] > allocation[2]);
  // 45 000 spread over 1 475 000 is about 3.05%.
  for (const [i, value] of [560000, 495000, 420000].entries()) {
    const share = allocation[i] / value;
    assert.ok(share > 0.029 && share < 0.032, `line ${i} share ${share}`);
  }
});

test('duty is allocated alongside freight, and an even split is used when nothing has value', () => {
  const withDuty = allocateCharges([{ quantity: 1, unitCostMinor: 100 }, { quantity: 1, unitCostMinor: 300 }], 100, 100);
  assert.equal(withDuty.reduce((a, v) => a + v, 0), 200);
  assert.deepEqual(withDuty, [50, 150]);

  const freeSamples = allocateCharges([{ quantity: 5, unitCostMinor: 0 }, { quantity: 5, unitCostMinor: 0 }], 10, 0);
  assert.deepEqual(freeSamples, [5, 5]);
});

// --- receiving ------------------------------------------------------------

test('receiving a purchase order moves stock, value and the ledger in one go', async () => {
  const db = await freshDb();
  const bankBefore = await balance(db, ACCOUNTS.BANK);
  const inventoryBefore = await balance(db, ACCOUNTS.INVENTORY);
  const onHandBefore = await stockOf(db, IDS.variantFormula);

  // A second order, on terms, so there is something still to receive.
  await db.query(
    `insert into purchase_orders (id, po_number, supplier_id, status, currency)
     values (gen_random_uuid(), 'PO-2026-0002', $1, 'ordered', 'BWP')`,
    [IDS.supplier],
  );
  await db.query(
    `insert into purchase_order_lines (purchase_order_id, variant_id, quantity, unit_cost_minor)
     select id, $1, 10, 14500 from purchase_orders where po_number = 'PO-2026-0002'`,
    [IDS.variantFormula],
  );
  await db.query(
    `update purchase_orders set freight_minor = 5000 where po_number = 'PO-2026-0002'`,
  );

  const receipt = await receivePurchaseOrder(db, { poNumber: 'PO-2026-0002' });

  assert.equal(receipt.status, 'received');
  assert.equal(receipt.goodsMinor, 145000);
  assert.equal(receipt.totalMinor, 150000);
  assert.equal(await stockOf(db, IDS.variantFormula), onHandBefore + 10);

  const movement = await db.query(
    `select delta, reason, ref_type from inventory_movements
      where variant_id = $1 order by id desc limit 1`,
    [IDS.variantFormula],
  );
  assert.equal(Number(movement.rows[0].delta), 10);
  assert.equal(movement.rows[0].reason, 'received');
  assert.equal(movement.rows[0].ref_type, 'purchase_order');

  assert.equal(await balance(db, ACCOUNTS.INVENTORY), inventoryBefore + 150000);
  assert.equal(await balance(db, ACCOUNTS.BANK), bankBefore - 150000);
  assert.equal((await trialBalance(db)).balanced, true);
});

test('the same delivery cannot be received twice', async () => {
  const db = await freshDb();
  await assert.rejects(
    () => receivePurchaseOrder(db, { poNumber: 'PO-2026-0001' }),
    (err) => err.code === 'PO_ALREADY_RECEIVED' && err.status === 409,
  );
  // And a draft order is not receivable at all.
  await db.query(
    `insert into purchase_orders (id, po_number, supplier_id, status) values (gen_random_uuid(), 'PO-2026-0009', $1, 'draft')`,
    [IDS.supplier],
  );
  await assert.rejects(
    () => receivePurchaseOrder(db, { poNumber: 'PO-2026-0009' }),
    (err) => err.code === 'PO_NOT_RECEIVABLE',
  );
});

// --- landed cost ----------------------------------------------------------

test('landed cost is a weighted average that includes freight, not a typed-in number', async () => {
  const db = await freshDb();
  const before = await landedCosts(db);
  const formula = before.get(IDS.variantFormula);

  // Opening order: 40 @ 140.00 with 45 000 of freight over three lines.
  assert.equal(formula.quantity, 40);
  assert.ok(formula.unitCostMinor > 14000, 'freight must land in the unit cost');
  assert.ok(formula.unitCostMinor < 14500);

  // Receive a cheaper second batch: the average must move, and move down.
  await db.query(
    `insert into purchase_orders (id, po_number, supplier_id, status, currency)
     values (gen_random_uuid(), 'PO-2026-0003', $1, 'ordered', 'BWP')`,
    [IDS.supplier],
  );
  await db.query(
    `insert into purchase_order_lines (purchase_order_id, variant_id, quantity, unit_cost_minor)
     select id, $1, 40, 12000 from purchase_orders where po_number = 'PO-2026-0003'`,
    [IDS.variantFormula],
  );
  await receivePurchaseOrder(db, { poNumber: 'PO-2026-0003' });

  const after = (await landedCosts(db)).get(IDS.variantFormula);
  assert.equal(after.quantity, 80);
  assert.ok(after.unitCostMinor < formula.unitCostMinor);
  assert.equal(after.purchaseOrders, 2);
  assert.equal(after.unitCostMinor, Math.round(after.valueMinor / after.quantity));
});

// --- publishing rules -----------------------------------------------------

test('a product with no received cost cannot go live, however good the photograph', async () => {
  const db = await freshDb();
  await db.query(
    `insert into products (id, seller_id, category_id, title, status, catalog_tier, primary_image_url, compliance_status)
     values (gen_random_uuid(), $1, $2, 'Uncosted trial product', 'draft', 'marketplace',
             'https://cdn.afrikart.co.bw/p/trial.jpg', 'verified')`,
    [IDS.seller, IDS.category],
  );
  const { rows } = await db.query(`select id from products where title = 'Uncosted trial product'`);
  await db.query(
    `insert into product_variants (product_id, sku, price_minor) values ($1, 'TRIAL-001', 5000)`,
    [rows[0].id],
  );

  await assert.rejects(
    () => publishProduct(db, { productId: rows[0].id }),
    (err) => err.code === 'UNCOSTED_SKU' && /TRIAL-001/.test(err.message),
  );

  const still = await db.query(`select status from products where id = $1`, [rows[0].id]);
  assert.equal(still.rows[0].status, 'draft');
});

test('a costed product publishes, and the response carries the real margin basis', async () => {
  const db = await freshDb();
  await db.query(
    `insert into products (id, seller_id, category_id, title, status, catalog_tier, primary_image_url, compliance_status)
     values (gen_random_uuid(), $1, $2, 'Costed trial product', 'draft', 'marketplace',
             'https://cdn.afrikart.co.bw/p/trial.jpg', 'verified')`,
    [IDS.seller, IDS.category],
  );
  const { rows } = await db.query(`select id from products where title = 'Costed trial product'`);
  await db.query(
    `insert into product_variants (product_id, sku, price_minor) values ($1, 'TRIAL-002', 5000)`,
    [rows[0].id],
  );
  // Its own received order, because a cost basis belongs to the thing received.
  await db.query(
    `insert into purchase_orders (id, po_number, supplier_id, status, currency)
     values (gen_random_uuid(), 'PO-2026-0004', $1, 'received', 'BWP')`,
    [IDS.supplier],
  );
  await db.query(
    `insert into purchase_order_lines (purchase_order_id, variant_id, quantity, unit_cost_minor)
     select po.id, v.id, 5, 3000 from purchase_orders po, product_variants v
      where po.po_number = 'PO-2026-0004' and v.product_id = $1`,
    [rows[0].id],
  );

  const published = await publishProduct(db, { productId: rows[0].id });
  assert.equal(published.status, 'live');
  assert.equal(published.variants.length, 1);
  assert.ok(published.variants[0].landedUnitCostMinor > 0);
  assert.ok(published.variants[0].landedUnitCostMinor < published.variants[0].priceMinor);
});

test('a licensed category does not go live without its certificate', async () => {
  const db = await freshDb();
  await db.query(
    `insert into products (id, seller_id, category_id, title, status, catalog_tier, primary_image_url, compliance_status)
     values (gen_random_uuid(), $1, $2, 'Formula without papers', 'draft', 'marketplace',
             'https://cdn.afrikart.co.bw/p/trial.jpg', 'unchecked')`,
    [IDS.seller, IDS.category],
  );
  const { rows } = await db.query(`select id from products where title = 'Formula without papers'`);
  await db.query(
    `insert into product_variants (product_id, sku, price_minor) values ($1, 'NAN-OP3-400-X', 18900)`,
    [rows[0].id],
  );
  await assert.rejects(
    () => publishProduct(db, { productId: rows[0].id }),
    (err) => err.code === 'COMPLIANCE_UNVERIFIED',
  );
});

// --- the shelf as an operator sees it -------------------------------------

test('the shelf report counts consignment stock without pretending we own it', async () => {
  const db = await freshDb();
  const shelf = await shelfReport(db);

  assert.equal(shelf.rows.length, 3);
  for (const row of shelf.rows) {
    assert.ok(row.landedUnitCostMinor > 0, `${row.sku} should have a cost basis`);
    assert.equal(row.ownership, 'seller', 'the pilot holds seller stock');
    assert.equal(row.marginFlattered, false);
    assert.ok(row.marginMinor > 0);
    assert.ok(row.available === row.onHand - row.reserved);
  }
  assert.equal(shelf.summary.uncostedSkus.length, 0);

  // The whole point: the goods are on our shelf and are not our asset.
  assert.equal(shelf.summary.inventoryValueMinor, 0);
  assert.ok(shelf.summary.consignmentValueMinor > 0);
});

// --- cost of goods on delivery --------------------------------------------

test('delivering consignment stock posts no cost of goods, and reports the seller cost instead', async () => {
  const db = await freshDb();
  const costs = await landedCosts(db);

  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(IDS.variantFormula, 2),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'cod',
    scheduledDate: tomorrow(),
    idempotencyKey: `shelf-${Math.random().toString(36).slice(2)}`,
  });

  const delivered = await recordDelivery(db, { orderNumber: order.orderNumber });
  const sellerCost = costs.get(IDS.variantFormula).unitCostMinor * 2;

  assert.equal(delivered.cogsMinor, 0, 'goods we do not own cannot be our cost of sales');
  assert.equal(delivered.sellerCostMinor, sellerCost, 'but their cost is still reported');
  assert.equal(await balance(db, ACCOUNTS.COGS), 0);
  assert.equal(
    delivered.grossMarginMinor,
    delivered.keptMinor,
    'our margin is what we kept, VAT excluded: commission, fulfilment, net delivery and cash handling',
  );
  assert.equal((await trialBalance(db)).balanced, true);
});

test('delivering stock we bought posts cost of goods and moves it out of inventory', async () => {
  const db = await freshDb();

  // A 1P SKU: Afrikart buys it, so the sale carries a cost of sale.
  await db.query(
    `insert into products (id, seller_id, category_id, title, status, catalog_tier, primary_image_url, compliance_status)
     values (gen_random_uuid(), $1, $2, 'Afrikart-owned brand', 'live', 'marketplace',
             'https://cdn.afrikart.co.bw/p/own.jpg', 'verified')`,
    [IDS.seller, IDS.category],
  );
  const product = await db.query(`select id from products where title = 'Afrikart-owned brand'`);
  const variant = await db.query(
    `insert into product_variants (product_id, sku, price_minor, weight_grams, volume_ml, ownership)
     values ($1, 'AFK-OWN-001', 12000, 500, 900, 'afrikart') returning id`,
    [product.rows[0].id],
  );
  const variantId = variant.rows[0].id;

  await db.query(
    `insert into purchase_orders (id, po_number, supplier_id, status, currency, inventory_owner)
     values (gen_random_uuid(), 'PO-2026-0007', $1, 'ordered', 'BWP', 'afrikart')`,
    [IDS.supplier],
  );
  await db.query(
    `insert into purchase_order_lines (purchase_order_id, variant_id, quantity, unit_cost_minor)
     select id, $1, 10, 8000 from purchase_orders where po_number = 'PO-2026-0007'`,
    [variantId],
  );
  await receivePurchaseOrder(db, { poNumber: 'PO-2026-0007' });

  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(variantId, 2),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'cod',
    scheduledDate: tomorrow(),
    idempotencyKey: `owned-${Math.random().toString(36).slice(2)}`,
  });

  const inventoryBefore = await balance(db, ACCOUNTS.INVENTORY);
  const delivered = await recordDelivery(db, { orderNumber: order.orderNumber });
  const expected = 8000 * 2;

  assert.equal(delivered.cogsMinor, expected);
  assert.equal(delivered.sellerCostMinor, 0);
  assert.equal(await balance(db, ACCOUNTS.COGS), expected);
  assert.equal(await balance(db, ACCOUNTS.INVENTORY), inventoryBefore - expected);
  assert.equal((await trialBalance(db)).balanced, true);
});

test('a line with no costed stock posts no cost and says so, instead of guessing', async () => {
  const db = await freshDb();
  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(IDS.variantFormula, 1),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'cod',
    scheduledDate: tomorrow(),
    idempotencyKey: `shelf-${Math.random().toString(36).slice(2)}`,
  });

  // Simulate the gap that AFR-37 is about: the shelf has no cost basis at all.
  await db.query(`update purchase_orders set status = 'cancelled'`);

  const delivered = await recordDelivery(db, { orderNumber: order.orderNumber });
  assert.equal(delivered.cogsMinor, 0);
  assert.deepEqual(delivered.cogsUnresolved, ['NAN-OP3-400']);
  assert.equal(delivered.grossMarginMinor, null, 'a margin nobody can compute is null, not a number');

  const audit = await db.query(
    `select action, after from audit_log where action = 'cogs.unresolved'`,
  );
  assert.equal(audit.rows.length, 1);
  assert.deepEqual(audit.rows[0].after.skus, ['NAN-OP3-400']);
});

test('postCogs posts nothing for a consignment line and says so in its result', async () => {
  const db = await freshDb();
  const order = await placeOrder(db, {
    userId: IDS.customer,
    items: items(IDS.variantNappies, 1),
    addressId: IDS.addressVerified,
    deliveryMethod: 'express',
    paymentMethod: 'cod',
    scheduledDate: tomorrow(),
    idempotencyKey: `postcogs-${Math.random().toString(36).slice(2)}`,
  });
  const loaded = await db.query(`select id, order_number from orders where order_number = $1`, [order.orderNumber]);

  const result = await db.transaction((tx) =>
    postCogs(tx, { orderId: loaded.rows[0].id, orderNumber: loaded.rows[0].order_number }),
  );

  assert.equal(result.cogsMinor, 0);
  assert.ok(result.sellerCostMinor > 0);
  assert.deepEqual(result.unresolved, []);
  const txn = await db.query(`select count(*)::int as n from ledger_transactions where kind = 'cogs'`);
  assert.equal(txn.rows[0].n, 0, 'a zero-value posting must not create a transaction');
});
