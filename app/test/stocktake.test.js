/**
 * Stocktakes as sessions — AFR-47.
 *
 * A warehouse counts over two hours with two people and a coffee break. These
 * tests hold the four things that make a session usable: it can be stopped and
 * resumed, the system number is frozen when the line is first counted, a recount
 * keeps both numbers, and applying happens exactly once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, stockOf } from './helpers.js';
import { openStocktake, countSheet, recordCounts, applyStocktake, runStocktake } from '../src/stocktake.js';
import { openStocktakeIncidents } from '../src/shrinkage.js';
import { createApp } from '../src/server.js';

const year = new Date().getUTCFullYear();

async function opened(db, note = 'pilot count') {
  return openStocktake(db, { note, actorId: IDS.admin });
}

test('a session gets a reference, and the sheet reads in walk order', async () => {
  const db = await freshDb();
  const session = await opened(db);

  assert.equal(session.reference, `ST-${year}-0001`);
  assert.equal(session.status, 'open');

  const sheet = await countSheet(db, { sessionId: session.id });
  assert.equal(sheet.progress.total, 3);
  assert.equal(sheet.progress.counted, 0);
  assert.deepEqual(
    sheet.lines.map((l) => l.binCode),
    ['B1-01', 'B1-02', 'B1-03'],
    'the count sheet must follow the walk, not the SKU alphabet',
  );
  assert.equal(sheet.lines[0].sku, 'NAN-OP3-400');
  assert.equal(sheet.lines[0].systemOnHand, 40);
});

test('a session can be stopped and resumed, and the system number is frozen per line', async () => {
  const db = await freshDb();
  const session = await opened(db);

  await recordCounts(db, { sessionId: session.id, counts: [{ sku: 'NAN-OP3-400', counted: 39 }], actorId: IDS.admin });
  const partway = await countSheet(db, { sessionId: session.id });
  assert.equal(partway.progress.counted, 1);
  assert.equal(partway.progress.remaining, 2);

  // Stock moves while the count is open: one tin is sold.
  await db.query(`update inventory_levels set on_hand = 39 where variant_id = $1`, [IDS.variantFormula]);

  await recordCounts(db, {
    sessionId: session.id,
    counts: [{ sku: 'NIV-BGL-200', counted: 60 }],
    actorId: IDS.admin,
  });

  const report = await applyStocktake(db, { sessionId: session.id, actorId: IDS.admin });
  assert.equal(report.unchanged, 2, 'nothing to adjust: the count agrees with stock as it now stands');
  const moved = report.stockMovedDuringCount.find((v) => v.sku === 'NAN-OP3-400');
  assert.equal(moved.systemAtCount, 40, 'the frozen number is what the counter compared against');
  assert.equal(moved.now, 39, 'a tin sold during the count is a sale, not a gain');
  assert.equal(moved.counted, 39);
  assert.equal(report.variances.length, 0);

  assert.equal(await stockOf(db, IDS.variantFormula), 39);
});

test('a recount keeps both numbers, applies the second, and says they disagreed', async () => {
  const db = await freshDb();
  const session = await opened(db);

  await recordCounts(db, { sessionId: session.id, counts: [{ sku: 'PAM-BDP-M46', counted: 26 }], actorId: IDS.admin });
  const recount = await recordCounts(db, {
    sessionId: session.id,
    counts: [{ sku: 'PAM-BDP-M46', counted: 27 }],
    actorId: IDS.admin,
  });

  assert.equal(recount.accepted.length, 0);
  assert.equal(recount.recounted.length, 1);
  assert.deepEqual(
    { first: recount.recounted[0].first, recount: recount.recounted[0].recount, difference: recount.recounted[0].difference },
    { first: 26, recount: 27, difference: 1 },
  );
  assert.ok(recount.warnings.some((w) => /recount says 27/.test(w)));

  const report = await applyStocktake(db, { sessionId: session.id, actorId: IDS.admin });
  assert.equal(report.recounted, 1);
  const variance = report.variances[0];
  assert.equal(variance.firstCount, 26);
  assert.equal(variance.counted, 27, 'the second look is what counts');
  assert.equal(variance.delta, -3);
  assert.equal(await stockOf(db, IDS.variantNappies), 27);
});

test('applying moves stock once, records the session, and raises the incident', async () => {
  const db = await freshDb();
  const session = await opened(db);
  await recordCounts(db, { sessionId: session.id, counts: [{ sku: 'PAM-BDP-M46', counted: 27 }], actorId: IDS.admin });

  const report = await applyStocktake(db, { sessionId: session.id, actorId: IDS.admin, note: 'month end' });
  assert.equal(report.adjusted, 1);
  assert.equal(report.shrinkageMinor, 0, 'consignment shrinkage is not our expense');
  assert.ok(report.variances[0].incidentId);

  const movement = await db.query(
    `select ref_type, ref_id, delta, note from inventory_movements where variant_id = $1 order by id desc limit 1`,
    [IDS.variantNappies],
  );
  assert.equal(movement.rows[0].ref_type, 'stocktake');
  assert.equal(movement.rows[0].ref_id, session.id, 'a movement must point at the session that caused it');
  assert.equal(movement.rows[0].delta, -3);

  const stored = await db.query(
    `select status, lines_counted, lines_adjusted, shrinkage_minor, closed_by, closed_at
       from stocktake_sessions where id = $1`,
    [session.id],
  );
  assert.equal(stored.rows[0].status, 'applied');
  assert.equal(stored.rows[0].lines_counted, 1);
  assert.equal(stored.rows[0].lines_adjusted, 1);
  assert.equal(stored.rows[0].closed_by, IDS.admin);
  assert.ok(stored.rows[0].closed_at);

  assert.equal((await openStocktakeIncidents(db)).count, 1);

  // And the session reads back as a record, not a form.
  const sheet = await countSheet(db, { sessionId: session.id });
  assert.equal(sheet.session.status, 'applied');
  assert.equal(sheet.session.linesAdjusted, 1);
  assert.equal(sheet.progress.counted, 1);
});

test('a session applies once, and cannot be counted into afterwards', async () => {
  const db = await freshDb();
  const empty = await opened(db);
  await assert.rejects(() => applyStocktake(db, { sessionId: empty.id }), (err) => err.code === 'SESSION_EMPTY');

  const session = await opened(db);
  await recordCounts(db, { sessionId: session.id, counts: [{ sku: 'NAN-OP3-400', counted: 40 }], actorId: IDS.admin });
  await applyStocktake(db, { sessionId: session.id, actorId: IDS.admin });

  await assert.rejects(() => applyStocktake(db, { sessionId: session.id }), (err) => err.code === 'SESSION_NOT_OPEN');
  await assert.rejects(
    () => recordCounts(db, { sessionId: session.id, counts: [{ sku: 'NAN-OP3-400', counted: 1 }] }),
    (err) => err.code === 'SESSION_NOT_OPEN',
  );

  await assert.rejects(() => countSheet(db, { sessionId: '00000000-0000-4000-8000-000000000000' }), (err) => err.code === 'SESSION_NOT_FOUND');
});

test('reserved units are checked again at apply, because stock sells while a count is open', async () => {
  const db = await freshDb();
  const session = await opened(db);
  await recordCounts(db, { sessionId: session.id, counts: [{ sku: 'PAM-BDP-M46', counted: 28 }], actorId: IDS.admin });

  // While the count is open, an order reserves five packs.
  await db.query(`update inventory_levels set reserved = 29 where variant_id = $1`, [IDS.variantNappies]);

  await assert.rejects(() => applyStocktake(db, { sessionId: session.id, actorId: IDS.admin }), (err) => {
    assert.equal(err.code, 'COUNT_BELOW_RESERVED');
    assert.equal(err.details.reserved, 29);
    return true;
  });

  // Nothing half-applied: the session is still open and stock is untouched.
  assert.equal(await stockOf(db, IDS.variantNappies), 30);
  const status = await db.query(`select status from stocktake_sessions where id = $1`, [session.id]);
  assert.equal(status.rows[0].status, 'open');
});

test('counting below a reservation warns immediately, without blocking the count', async () => {
  const db = await freshDb();
  await db.query(`update inventory_levels set reserved = 5 where variant_id = $1`, [IDS.variantNappies]);
  const session = await opened(db);

  const result = await recordCounts(db, {
    sessionId: session.id,
    counts: [{ sku: 'PAM-BDP-M46', counted: 4 }],
    actorId: IDS.admin,
  });
  assert.equal(result.accepted.length, 1);
  assert.ok(result.warnings.some((w) => /will be refused at apply/.test(w)), 'told now, not after everybody has gone home');
});

test('bad input is refused before it can be stored', async () => {
  const db = await freshDb();
  const session = await opened(db);

  await assert.rejects(
    () => recordCounts(db, { sessionId: session.id, counts: [] }),
    (err) => err.code === 'STOCKTAKE_EMPTY',
  );
  await assert.rejects(
    () =>
      recordCounts(db, {
        sessionId: session.id,
        counts: [{ sku: 'NAN-OP3-400', counted: 1 }, { sku: 'NAN-OP3-400', counted: 2 }],
      }),
    (err) => err.code === 'STOCKTAKE_INVALID',
  );
  await assert.rejects(
    () => recordCounts(db, { sessionId: session.id, counts: [{ sku: 'NOPE-1', counted: 1 }] }),
    (err) => err.code === 'SKU_NOT_FOUND',
  );
  await assert.rejects(
    () => recordCounts(db, { sessionId: session.id, counts: [{ sku: 'NAN-OP3-400', counted: -1 }] }),
    (err) => err.code === 'STOCKTAKE_INVALID',
  );
  assert.equal((await countSheet(db, { sessionId: session.id })).progress.counted, 0, 'a rejected call stores nothing');
});

test('a one-shot count is the same machinery, and leaves the same record', async () => {
  const db = await freshDb();
  const report = await runStocktake(db, { counts: [{ sku: 'NIV-BGL-200', counted: 59 }], actorId: IDS.admin });

  assert.equal(report.adjusted, 1);
  assert.ok(report.sessionId);

  const session = await db.query(`select reference, status from stocktake_sessions where id = $1`, [report.sessionId]);
  assert.equal(session.rows[0].status, 'applied');
  assert.match(session.rows[0].reference, /^ST-\d{4}-\d{4}$/);

  // Each session numbers itself, so two counts in a day are distinguishable.
  const second = await opened(db);
  assert.notEqual(second.reference, session.rows[0].reference);
});

test('sessions are admin-only over HTTP and work end to end for an admin', async () => {
  const db = await freshDb();
  const app = createApp({ db, devAuth: true, exposeOtpCodes: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = (path, body, user = IDS.admin, method = 'POST') =>
    fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-id': user },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  try {
    const forbidden = await call('/api/ops/stocktake/sessions', { note: 'nope' }, IDS.customer);
    assert.equal(forbidden.status, 403);

    const created = await call('/api/ops/stocktake/sessions', { note: 'aisle one' });
    assert.equal(created.status, 201);
    const session = await created.json();

    const sheet = await (await call(`/api/ops/stocktake/sessions/${session.id}`, null, IDS.admin, 'GET')).json();
    assert.equal(sheet.progress.total, 3);

    const counted = await call(`/api/ops/stocktake/sessions/${session.id}/counts`, {
      counts: [{ sku: 'PAM-BDP-M46', counted: 29 }],
    });
    assert.equal(counted.status, 200);

    const applied = await call(`/api/ops/stocktake/sessions/${session.id}/apply`, {});
    assert.equal(applied.status, 200);
    const report = await applied.json();
    assert.equal(report.adjusted, 1);
    assert.equal(await stockOf(db, IDS.variantNappies), 29);

    const twice = await call(`/api/ops/stocktake/sessions/${session.id}/apply`, {});
    assert.equal(twice.status, 409);
    assert.equal((await twice.json()).error.code, 'SESSION_NOT_OPEN');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});
