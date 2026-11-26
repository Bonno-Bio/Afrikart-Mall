/**
 * Bulk import and stocktake.
 *
 * The two jobs that look administrative and are where a shop loses money
 * quietly: a price missing a zero in a forty-row spreadsheet, and an on-hand
 * number that has drifted so far from the shelf that the shop sells units it
 * does not have.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, stockOf } from './helpers.js';
import { parseCsv, parsePula, readCatalogueCsv, importCatalogue, runStocktake } from '../src/import.js';
import { trialBalance, balance, ACCOUNTS } from '../src/ledger.js';
import { createApp } from '../src/server.js';

const HEADER = 'sku,title,category_slug,price,brand,weight_grams,parcel_class,on_hand,reorder_point';

const csvOf = (...rows) => [HEADER, ...rows].join('\n');

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

test('the CSV reader handles what a spreadsheet export actually contains', () => {
  const text = '\uFEFFsku,title,price\r\n"A,1","Nappies, size 3 ""large""",149.99\r\nB2,"Two\nlines",10\r\n';
  const rows = parseCsv(text);
  assert.deepEqual(rows, [
    ['sku', 'title', 'price'],
    ['A,1', 'Nappies, size 3 "large"', '149.99'],
    ['B2', 'Two\nlines', '10'],
  ]);
});

test('money is parsed strictly, because a price is not an invitation to guess', () => {
  assert.equal(parsePula('149.99', 'price', 'line 2').value, 14999);
  assert.equal(parsePula('P 1 049.5', 'price', 'line 2').value, 104950);
  assert.equal(parsePula('0', 'price', 'line 2').value, 0);
  assert.match(parsePula('149.999', 'price', 'line 2').error, /two decimal places/);
  assert.match(parsePula('149,99', 'price', 'line 2').error, /not a price/);
  assert.match(parsePula('', 'price', 'line 2').error, /empty/);
  assert.match(parsePula('-5', 'price', 'line 2').error, /not a price/);
});

test('a file with a missing or misspelled column is refused, not quietly half-read', () => {
  assert.throws(
    () => readCatalogueCsv('sku,title,price\nA,Thing,10'),
    (err) => err.code === 'CSV_MISSING_COLUMNS' && err.details.missing.includes('category_slug'),
  );
  assert.throws(
    () => readCatalogueCsv('sku,title,category_slug,price,wieght_grams\nA,Thing,baby-mother,10,500'),
    (err) => err.code === 'CSV_UNKNOWN_COLUMNS',
  );
});

test('row problems are reported with line numbers and collected, not thrown one at a time', () => {
  const { errors } = readCatalogueCsv(
    csvOf(
      'A-1,Good row,baby-mother,10,,,small,,',
      'A-1,Duplicate sku,baby-mother,10,,,small,,',
      'B-2,Bad price,baby-mother,10.999,,,small,,',
      'B-3,Crossed out,baby-mother,50,,,small,,',
      'C-4,Bad parcel,baby-mother,10,,,giant,,',
      ',Unnamed row,,10,,,small,,',
    ),
  );
  assert.ok(errors.some((e) => e.startsWith('line 3') && /appears twice/.test(e)));
  assert.ok(errors.some((e) => e.startsWith('line 4') && /two decimal places/.test(e)));
  assert.ok(errors.some((e) => e.startsWith('line 6') && /parcel_class/.test(e)));
  assert.ok(errors.some((e) => e.startsWith('line 7') && /sku is required/.test(e)));
  assert.ok(errors.some((e) => e.startsWith('line 7') && /category_slug is required/.test(e)));
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

test('a dry run reports exactly what would happen and writes nothing', async () => {
  const db = await freshDb();
  const csv = csvOf('SIM-1,Similac 400g,baby-mother,189.00,Abbott,400,small,20,6');

  const before = await db.query(`select count(*)::int as n from products`);
  const report = await importCatalogue(db, { csv, sellerSlug: 'naledi-beauty', dryRun: true });
  const after = await db.query(`select count(*)::int as n from products`);

  assert.equal(report.created, 1);
  assert.equal(report.dryRun, true);
  assert.equal(after.rows[0].n, before.rows[0].n, 'a dry run must not create a product');
});

test('import creates drafts with stock and a movement, never live listings', async () => {
  const db = await freshDb();
  const csv = csvOf(
    'SIM-1,Similac 400g,baby-mother,189.00,Abbott,400,small,20,6',
    'SIM-2,Similac 800g,baby-mother,P 349.99,Abbott,800,small,8,4',
  );

  const report = await importCatalogue(db, { csv, sellerSlug: 'naledi-beauty', actorId: IDS.admin });
  assert.equal(report.created, 2);

  const products = await db.query(`select title, status, catalog_tier from products where title like 'Similac%' order by title`);
  assert.equal(products.rows.length, 2);
  for (const p of products.rows) {
    assert.equal(p.status, 'draft', 'a spreadsheet cannot certify a photograph or a registration');
    assert.equal(p.catalog_tier, 'marketplace');
  }

  const variant = await db.query(
    `select v.id, v.price_minor, v.weight_grams, l.on_hand, l.reorder_point
       from product_variants v join inventory_levels l on l.variant_id = v.id
      where v.sku = 'SIM-2'`,
  );
  assert.equal(Number(variant.rows[0].price_minor), 34999);
  assert.equal(Number(variant.rows[0].on_hand), 8);
  assert.equal(Number(variant.rows[0].reorder_point), 4);

  const movement = await db.query(
    `select delta, reason, ref_type from inventory_movements where variant_id = $1`,
    [variant.rows[0].id],
  );
  assert.deepEqual(movement.rows[0], { delta: 8, reason: 'received', ref_type: 'import' });
});

test('one bad row rejects the whole file — a half-imported catalogue is worse than none', async () => {
  const db = await freshDb();
  const csv = csvOf(
    'SIM-1,Good row,baby-mother,189.00,Abbott,400,small,20,6',
    'SIM-2,Bad row,baby-mother,189.000,Abbott,400,small,20,6',
  );

  await assert.rejects(() => importCatalogue(db, { csv, sellerSlug: 'naledi-beauty' }), (err) => {
    assert.equal(err.code, 'IMPORT_INVALID');
    assert.equal(err.details.errors.length, 1);
    return true;
  });
  const products = await db.query(`select count(*)::int as n from products where title = 'Good row'`);
  assert.equal(products.rows[0].n, 0);
});

test('re-importing a SKU updates its price, and refuses to overwrite stock', async () => {
  const db = await freshDb();
  const csv = csvOf('NIV-BGL-200,"Nivea Baby Lotion 200ml",baby-mother,74.50,,200,small,99,');

  const report = await importCatalogue(db, { csv, sellerSlug: 'naledi-beauty' });
  assert.equal(report.updated, 1);
  assert.ok(report.warnings.some((w) => /on_hand ignored/.test(w)));

  const price = await db.query(`select price_minor from product_variants where sku = 'NIV-BGL-200'`);
  assert.equal(Number(price.rows[0].price_minor), 7450);

  // The count is a fact about the shelf; a price list is not evidence of it.
  assert.equal(await stockOf(db, IDS.variantLotion), 60);
});

test('an unknown category, an unknown seller, and another seller\'s SKU all fail loudly', async () => {
  const db = await freshDb();

  await assert.rejects(
    () => importCatalogue(db, { csv: csvOf('X-1,Thing,no-such-category,10,,,small,,'), sellerSlug: 'naledi-beauty' }),
    (err) => err.code === 'IMPORT_INVALID' && /no category/.test(err.details.errors[0]),
  );

  await assert.rejects(
    () => importCatalogue(db, { csv: csvOf('X-2,Thing,baby-mother,10,,,small,,'), sellerSlug: 'ghost-seller' }),
    (err) => err.code === 'IMPORT_INVALID' && /no seller/.test(err.details.errors[0]),
  );

  await db.query(
    `insert into users (id, email, phone, full_name, role)
     values (gen_random_uuid(), 'other@example.test', '+26771999000', 'Other Seller', 'seller')`,
  );
  await db.query(
    `insert into sellers (owner_user_id, legal_name, trading_name, slug, city, status)
     select id, 'Other (Pty) Ltd', 'Other Seller', 'other-seller', 'Francistown', 'approved'
       from users where phone = '+26771999000'`,
  );

  await assert.rejects(
    () => importCatalogue(db, { csv: csvOf('NIV-BGL-200,Stolen SKU,baby-mother,1,,,small,,'), sellerSlug: 'other-seller' }),
    (err) => err.code === 'SKU_OTHER_SELLER',
  );
});

// ---------------------------------------------------------------------------
// Stocktake
// ---------------------------------------------------------------------------

test('a count records the variance as a movement and repairs the cache', async () => {
  const db = await freshDb();
  assert.equal(await stockOf(db, IDS.variantNappies), 30);

  const report = await runStocktake(db, {
    counts: [
      { sku: 'NAN-OP3-400', counted: 40 },
      { sku: 'PAM-BDP-M46', counted: 27 },
    ],
    note: 'month-end count',
    actorId: IDS.admin,
  });

  assert.equal(report.counted, 2);
  assert.equal(report.unchanged, 1);
  assert.equal(report.adjusted, 1);
  assert.equal(report.variances.length, 1);
  const [variance] = report.variances;
  assert.equal(variance.sku, 'PAM-BDP-M46');
  assert.equal(variance.system, 30);
  assert.equal(variance.counted, 27);
  assert.equal(variance.delta, -3);
  assert.equal(variance.ownership, 'seller');
  assert.equal(variance.postedMinor, 0, 'consignment shrinkage is the seller\'s loss, not ours');

  assert.equal(await stockOf(db, IDS.variantNappies), 27);
  const movements = await db.query(
    `select delta, reason, ref_type from inventory_movements where variant_id = $1 order by id desc limit 1`,
    [IDS.variantNappies],
  );
  assert.deepEqual(movements.rows[0], { delta: -3, reason: 'adjusted', ref_type: 'stocktake' });
});

test('a count cannot go below units already promised to customers', async () => {
  const db = await freshDb();
  await db.query(`update inventory_levels set reserved = 5 where variant_id = $1`, [IDS.variantNappies]);

  await assert.rejects(() => runStocktake(db, { counts: [{ sku: 'PAM-BDP-M46', counted: 2 }] }), (err) => {
    assert.equal(err.code, 'COUNT_BELOW_RESERVED');
    assert.equal(err.details.reserved, 5);
    return true;
  });
  assert.equal(await stockOf(db, IDS.variantNappies), 30);
});

test('unknown, duplicate and negative counts are refused before anything is written', async () => {
  const db = await freshDb();
  await assert.rejects(() => runStocktake(db, { counts: [{ sku: 'NOPE-1', counted: 1 }] }), (err) => err.code === 'SKU_NOT_FOUND');
  await assert.rejects(
    () => runStocktake(db, { counts: [{ sku: 'NAN-OP3-400', counted: 1 }, { sku: 'NAN-OP3-400', counted: 2 }] }),
    (err) => err.code === 'STOCKTAKE_INVALID',
  );
  await assert.rejects(() => runStocktake(db, { counts: [{ sku: 'NAN-OP3-400', counted: -1 }] }), (err) => err.code === 'STOCKTAKE_INVALID');
  await assert.rejects(() => runStocktake(db, { counts: [] }), (err) => err.code === 'STOCKTAKE_EMPTY');
  assert.equal(await stockOf(db, IDS.variantFormula), 40);
});

test('shrinkage on our own stock is priced at landed cost and hits its own account', async () => {
  const db = await freshDb();
  // The pilot holds consignment stock; this is the case where we own the goods.
  await db.query(`update product_variants set ownership = 'afrikart' where id = $1`, [IDS.variantFormula]);

  const before = await balance(db, ACCOUNTS.INVENTORY);
  const report = await runStocktake(db, { counts: [{ sku: 'NAN-OP3-400', counted: 36 }], actorId: IDS.admin });

  const [variance] = report.variances;
  assert.equal(variance.delta, -4);
  // 4 units at the landed cost of the received PO, freight included.
  const unitCost = Math.round(variance.postedMinor / 4);
  assert.ok(unitCost > 14000 && unitCost < 14500, `landed cost must include freight, got ${unitCost}`);
  assert.equal(report.shrinkageMinor, variance.postedMinor);

  assert.equal(await balance(db, ACCOUNTS.INVENTORY), before - variance.postedMinor);
  assert.equal(await balance(db, ACCOUNTS.SHRINKAGE), variance.postedMinor);
  assert.equal((await trialBalance(db)).balanced, true);
});

test('a stocktake dry run changes nothing', async () => {
  const db = await freshDb();
  const report = await runStocktake(db, { counts: [{ sku: 'NAN-OP3-400', counted: 10 }], dryRun: true });
  assert.equal(report.adjusted, 1);
  assert.equal(report.dryRun, true);
  assert.equal(await stockOf(db, IDS.variantFormula), 40);
  const movements = await db.query(`select count(*)::int as n from inventory_movements where ref_type = 'stocktake'`);
  assert.equal(movements.rows[0].n, 0);
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

test('import and stocktake are admin-only, and work over HTTP for an admin', async () => {
  const db = await freshDb();
  const app = createApp({ db, devAuth: true, exposeOtpCodes: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = (path, body, userId) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify(body),
    });

  try {
    const csv = csvOf('SIM-1,Similac 400g,baby-mother,189.00,Abbott,400,small,20,6');

    const customerImport = await post('/api/ops/catalogue/import', { csv, sellerSlug: 'naledi-beauty' }, IDS.customer);
    assert.equal(customerImport.status, 403);

    const customerCount = await post('/api/ops/stocktake', { counts: [{ sku: 'NAN-OP3-400', counted: 1 }] }, IDS.customer);
    assert.equal(customerCount.status, 403);

    const good = await post('/api/ops/catalogue/import', { csv, sellerSlug: 'naledi-beauty', dryRun: true }, IDS.admin);
    assert.equal(good.status, 200);
    assert.equal((await good.json()).created, 1);

    const bad = await post('/api/ops/catalogue/import', { csv: 'sku,title\nA,B' }, IDS.admin);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.details.missing.includes('price'), true);

    const counted = await post('/api/ops/stocktake', { counts: [{ sku: 'NAN-OP3-400', counted: 39 }] }, IDS.admin);
    assert.equal(counted.status, 201);
    assert.equal((await counted.json()).adjusted, 1);
    assert.equal(await stockOf(db, IDS.variantFormula), 39);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
