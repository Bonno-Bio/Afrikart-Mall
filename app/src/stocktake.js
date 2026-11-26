/**
 * Stocktakes as sessions (AFR-47).
 *
 * A warehouse counts over two hours with two people and a coffee break. A count
 * that exists only inside one HTTP request cannot survive that, so the unit of
 * work is a session: opened, counted line by line, resumed after a break, and
 * applied once. The session is also the record afterwards — who opened it, who
 * counted each line, what the system believed at the time, and what a second
 * counter said when the first number looked wrong.
 *
 * Four rules hold the whole thing up:
 *
 *   1. **The system quantity is frozen when a line is first counted.** If stock
 *      moves while the count is open, that difference is a fact about the count
 *      and not something to overwrite silently.
 *
 *   2. **A session applies exactly once.** Applying is what moves stock, raises
 *      incidents and posts to the ledger; doing it twice would double a loss.
 *
 *   3. **A recount keeps both numbers.** The second count is applied and the
 *      disagreement is reported, because "we were P500 apart and looked twice"
 *      is information, and overwriting it destroys the audit trail that makes
 *      the count worth doing.
 *
 *   4. **Reserved units are still owed to customers** at the moment of applying,
 *      not only at the moment of counting. Stock sells while a count is open.
 */
import { AppError } from './errors.js';
import { landedCosts } from './catalogue.js';
import { post, ACCOUNTS } from './ledger.js';

const ROLLBACK = Symbol('dry-run');

const iso = (value) => (value instanceof Date ? value.toISOString() : String(value));

function normaliseCounts(counts) {
  if (!Array.isArray(counts) || counts.length === 0) {
    throw new AppError(400, 'STOCKTAKE_EMPTY', 'A stocktake needs at least one counted SKU.', { field: 'counts' });
  }

  const normalised = counts.map((entry, index) => {
    const sku = String(entry?.sku ?? '').trim().toUpperCase();
    const counted = Number(entry?.counted);
    if (!sku) throw new AppError(422, 'STOCKTAKE_INVALID', `counts[${index}]: sku is required.`);
    if (!Number.isSafeInteger(counted) || counted < 0) {
      throw new AppError(422, 'STOCKTAKE_INVALID', `counts[${index}]: counted must be a whole number, 0 or more.`);
    }
    return { sku, counted };
  });

  if (new Set(normalised.map((n) => n.sku)).size !== normalised.length) {
    // Repeating a SKU inside one payload is a client bug; repeating it in a
    // later call is a recount, which is allowed and recorded.
    throw new AppError(422, 'STOCKTAKE_INVALID', 'The same SKU is counted twice in one call; send a recount in a separate call.');
  }
  return normalised;
}

async function loadSession(client, sessionId, { forUpdate = false } = {}) {
  if (!sessionId) throw new AppError(400, 'SESSION_REQUIRED', 'Which stocktake session?', { field: 'sessionId' });

  const res = await client.query(
    `select id, reference, status, opened_by, opened_at, closed_at, note,
            lines_counted, lines_adjusted, shrinkage_minor
       from stocktake_sessions where id = $1 ${forUpdate ? 'for update' : ''}`,
    [sessionId],
  );
  const session = res.rows[0];
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'That stocktake session does not exist.');
  return session;
}

function assertOpen(session) {
  if (session.status !== 'open') {
    throw new AppError(409, 'SESSION_NOT_OPEN', `Stocktake ${session.reference} is ${session.status}.`, {
      details: { reference: session.reference, status: session.status },
    });
  }
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export async function openStocktake(db, { note = null, actorId = null } = {}) {
  return db.transaction((tx) => openOn(tx, { note, actorId }));
}

async function openOn(tx, { note = null, actorId = null }) {
  const refRes = await tx.query(
    `select 'ST-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('stocktake_number_seq')::text, 4, '0') as reference`,
  );
  const res = await tx.query(
    `insert into stocktake_sessions (reference, opened_by, note) values ($1, $2, $3)
     returning id, reference, status, opened_at`,
    [refRes.rows[0].reference, actorId, note],
  );
  return { ...res.rows[0], openedAt: res.rows[0].opened_at };
}

// ---------------------------------------------------------------------------
// The count sheet, in walk order
// ---------------------------------------------------------------------------

/**
 * What to count, in the order somebody walks the shelves.
 *
 * Bin code first, then pick sequence, then SKU — the same order the pick list
 * uses, so the person counting does not zig-zag the room. `counted` is false for
 * the lines still outstanding, which is what makes "stop, resume" work.
 */
export async function countSheet(db, { sessionId } = {}) {
  const session = await loadSession(db, sessionId);

  const res = await db.query(
    `select v.id as variant_id, v.sku, v.ownership,
            coalesce(l.on_hand, 0) as on_hand, coalesce(l.reserved, 0) as reserved,
            l.bin_code, l.pick_sequence,
            p.title, s.trading_name as seller,
            e.id as entry_id, e.system_quantity, e.counted_quantity, e.counted_at,
            e.recount_quantity, e.recount_at
       from product_variants v
       join products p on p.id = v.product_id
       join sellers s on s.id = p.seller_id
       left join inventory_levels l on l.variant_id = v.id
       left join stocktake_entries e on e.variant_id = v.id and e.session_id = $1
      where v.is_active
      order by l.bin_code nulls last, l.pick_sequence nulls last, v.sku`,
    [sessionId],
  );

  const lines = res.rows.map((r) => {
    const counted = r.entry_id !== null;
    return {
      variantId: r.variant_id,
      sku: r.sku,
      title: r.title,
      seller: r.seller,
      ownership: r.ownership,
      binCode: r.bin_code,
      pickSequence: r.pick_sequence === null ? null : Number(r.pick_sequence),
      systemOnHand: Number(r.on_hand),
      reserved: Number(r.reserved),
      counted,
      // Once counted, the sheet shows the frozen comparison, not today's cache.
      systemAtCount: counted ? Number(r.system_quantity) : null,
      countedQuantity: counted ? Number(r.counted_quantity) : null,
      countedAt: counted ? iso(r.counted_at) : null,
      recountQuantity: r.recount_quantity === null ? null : Number(r.recount_quantity),
      recountAt: r.recount_at === null ? null : iso(r.recount_at),
    };
  });

  return {
    session: {
      id: session.id,
      reference: session.reference,
      status: session.status,
      openedAt: iso(session.opened_at),
      note: session.note,
      closedAt: session.closed_at ? iso(session.closed_at) : null,
      linesCounted: session.lines_counted,
      linesAdjusted: session.lines_adjusted,
      shrinkageMinor: session.shrinkage_minor,
    },
    progress: {
      total: lines.length,
      counted: lines.filter((l) => l.counted).length,
      remaining: lines.filter((l) => !l.counted).length,
      recounted: lines.filter((l) => l.recountQuantity !== null).length,
    },
    lines,
  };
}

// ---------------------------------------------------------------------------
// Count, and recount
// ---------------------------------------------------------------------------

/**
 * Record counts against an open session. Calling it again is how a session is
 * resumed; counting a line twice is a recount and keeps both numbers.
 */
export async function recordCounts(db, { sessionId, counts, actorId = null } = {}) {
  return db.transaction(async (tx) => {
    const session = await loadSession(tx, sessionId, { forUpdate: true });
    assertOpen(session);
    return recordOn(tx, session, { counts, actorId });
  });
}

async function recordOn(tx, session, { counts, actorId = null }) {
  const normalised = normaliseCounts(counts);
  const accepted = [];
  const recounted = [];
  const warnings = [];

  for (const entry of normalised) {
    const found = await tx.query(
      `select v.id as variant_id, v.sku,
              coalesce(l.on_hand, 0) as on_hand, coalesce(l.reserved, 0) as reserved
         from product_variants v
         left join inventory_levels l on l.variant_id = v.id
        where v.sku = $1`,
      [entry.sku],
    );
    if (found.rows.length === 0) {
      throw new AppError(404, 'SKU_NOT_FOUND', `No SKU ${entry.sku}.`, { details: { sku: entry.sku } });
    }
    const row = found.rows[0];
    const onHand = Number(row.on_hand);

    if (entry.counted < Number(row.reserved)) {
      // Refused at the point of counting too, because a person who is told now
      // can go and find the units; a person told at apply time has gone home.
      warnings.push(
        `${entry.sku}: only ${entry.counted} counted but ${row.reserved} are reserved; the count will be refused at apply unless the units are found.`,
      );
    }

    const existing = await tx.query(
      `select id, counted_quantity, recount_quantity from stocktake_entries
        where session_id = $1 and variant_id = $2`,
      [session.id, row.variant_id],
    );

    if (existing.rows.length === 0) {
      const inserted = await tx.query(
        `insert into stocktake_entries
           (session_id, variant_id, sku, system_quantity, counted_quantity, counted_by)
         values ($1, $2, $3, $4, $5, $6)
         returning id, system_quantity, counted_quantity`,
        [session.id, row.variant_id, entry.sku, onHand, entry.counted, actorId],
      );
      accepted.push({
        sku: entry.sku,
        system: onHand,
        counted: entry.counted,
        delta: entry.counted - onHand,
      });
      continue;
    }

    const prior = existing.rows[0];
    await tx.query(
      `update stocktake_entries
          set recount_quantity = $2, recount_by = $3, recount_at = now()
        where id = $1`,
      [prior.id, entry.counted, actorId],
    );
    const first = Number(prior.counted_quantity);
    recounted.push({
      sku: entry.sku,
      first,
      recount: entry.counted,
      difference: entry.counted - first,
      system: Number(
        (await tx.query(`select system_quantity from stocktake_entries where id = $1`, [prior.id])).rows[0]
          .system_quantity,
      ),
    });
    if (entry.counted !== first) {
      warnings.push(`${entry.sku}: recount says ${entry.counted}, first count said ${first}. Applying uses the recount.`);
    }
  }

  return { reference: session.reference, accepted, recounted, warnings };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export async function applyStocktake(db, { sessionId, actorId = null, note = null } = {}) {
  return db.transaction(async (tx) => {
    const session = await loadSession(tx, sessionId, { forUpdate: true });
    assertOpen(session);
    return applyOn(tx, session, { actorId, note });
  });
}

async function applyOn(tx, session, { actorId = null, note = null, landed = null } = {}) {
  const entriesRes = await tx.query(
    `select e.id, e.variant_id, e.sku, e.system_quantity, e.counted_quantity,
            e.recount_quantity, e.counted_by, e.recount_by,
            v.ownership, p.seller_id,
            coalesce(l.on_hand, 0) as on_hand, coalesce(l.reserved, 0) as reserved
       from stocktake_entries e
       join product_variants v on v.id = e.variant_id
       join products p on p.id = v.product_id
       left join inventory_levels l on l.variant_id = e.variant_id
      where e.session_id = $1
      order by e.sku
      for update of v`,
    [session.id],
  );

  if (entriesRes.rows.length === 0) {
    throw new AppError(409, 'SESSION_EMPTY', `${session.reference} has nothing counted yet.`);
  }

  const costs = landed ?? (await landedCosts(tx));

  const report = {
    reference: session.reference,
    counted: entriesRes.rows.length,
    unchanged: 0,
    adjusted: 0,
    variances: [],
    warnings: [],
    recounted: 0,
    shrinkageMinor: 0,
    // Lines where the count matched today's stock but not the number frozen
    // when it was counted: something sold or arrived while the session was open.
    // Not an error, and worth saying out loud.
    stockMovedDuringCount: [],
  };

  for (const row of entriesRes.rows) {
    const applicable = Number(row.recount_quantity ?? row.counted_quantity);
    const onHand = Number(row.on_hand);
    const reserved = Number(row.reserved);

    if (applicable < reserved) {
      throw new AppError(
        409,
        'COUNT_BELOW_RESERVED',
        `${row.sku}: ${reserved} unit(s) are reserved for orders but only ${applicable} were counted. ` +
          'Find the units or cancel the order; the count cannot be lowered below what is already owed.',
        { details: { sku: row.sku, reserved, counted: applicable } },
      );
    }

    if (row.recount_quantity !== null) report.recounted += 1;

    // The delta is against stock as it stands now, not against the number frozen
    // when the line was counted: stock sold during the count is not a loss.
    const delta = applicable - onHand;
    if (delta === 0) {
      report.unchanged += 1;
      if (applicable !== Number(row.system_quantity)) {
        report.stockMovedDuringCount.push({
          sku: row.sku,
          systemAtCount: Number(row.system_quantity),
          counted: applicable,
          now: onHand,
        });
      }
      continue;
    }

    const movementRes = await tx.query(
      `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, note, created_by)
       values ($1, $2, 'adjusted', 'stocktake', $3, $4, $5)
       returning id`,
      [
        row.variant_id,
        delta,
        session.id,
        note ?? `${session.reference}: counted ${applicable}, system said ${onHand}`,
        actorId,
      ],
    );
    const movementId = movementRes.rows[0].id;

    await tx.query(
      `insert into inventory_levels (variant_id, on_hand) values ($1, $2)
       on conflict (variant_id) do update set on_hand = excluded.on_hand, updated_at = now()`,
      [row.variant_id, applicable],
    );

    const cost = costs.get(row.variant_id)?.unitCostMinor ?? null;
    const owned = row.ownership === 'afrikart';
    const value = cost === null ? null : Math.abs(delta) * cost;

    if (owned) {
      if (cost === null) {
        report.warnings.push(
          `${row.sku}: owned stock adjusted with no landed cost on file; ${Math.abs(delta)} unit(s) unvalued.`,
        );
      } else if (delta < 0) {
        report.shrinkageMinor += value;
        await post(tx, {
          kind: 'stock_shrinkage',
          refType: 'stocktake',
          refId: session.id,
          memo: `shrinkage ${row.sku} x${Math.abs(delta)}`,
          createdBy: actorId,
          entries: [
            { accountCode: ACCOUNTS.SHRINKAGE, debit: value },
            { accountCode: ACCOUNTS.INVENTORY, credit: value },
          ],
        });
      } else {
        await post(tx, {
          kind: 'stock_gain',
          refType: 'stocktake',
          refId: session.id,
          memo: `found ${row.sku} x${delta}`,
          createdBy: actorId,
          entries: [
            { accountCode: ACCOUNTS.INVENTORY, debit: value },
            { accountCode: ACCOUNTS.SHRINKAGE, credit: value },
          ],
        });
      }
    }

    // A shortfall on someone else's stock is evidence plus a question, never an
    // expense of ours (AFR-48).
    let incidentId = null;
    if (!owned && delta < 0 && value !== null) {
      const incident = await tx.query(
        `insert into stocktake_incidents
           (movement_id, seller_id, variant_id, sku, quantity_lost, unit_cost_minor, value_minor, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [movementId, row.seller_id, row.variant_id, row.sku, Math.abs(delta), cost, value, note ?? null],
      );
      incidentId = incident.rows[0].id;
    }

    report.adjusted += 1;
    report.variances.push({
      sku: row.sku,
      system: onHand,
      systemAtCount: Number(row.system_quantity),
      counted: applicable,
      firstCount: Number(row.counted_quantity),
      delta,
      ownership: row.ownership,
      postedMinor: owned ? value ?? 0 : 0,
      incidentId,
      sellerNotified: owned ? null : 'raised as a stocktake incident',
    });
  }

  await tx.query(
    `update stocktake_sessions
        set status = 'applied', closed_by = $2, closed_at = now(),
            lines_counted = $3, lines_adjusted = $4, shrinkage_minor = $5
      where id = $1`,
    [session.id, actorId, report.counted, report.adjusted, report.shrinkageMinor],
  );

  await tx.query(`insert into outbox_events (event_type, payload) values ('stocktake.applied', $1)`, [
    JSON.stringify({
      reference: session.reference,
      adjusted: report.adjusted,
      variances: report.variances.length,
      shrinkageMinor: report.shrinkageMinor,
    }),
  ]);

  return report;
}

// ---------------------------------------------------------------------------
// One-shot: open, count, apply
// ---------------------------------------------------------------------------

/**
 * A single-shot count, for the case where somebody has twenty SKUs in front of
 * them and no reason to open a session. It is the same machinery — a session is
 * created and applied in one transaction — so the audit trail is identical and
 * there is no second code path to keep honest.
 */
export async function runStocktake(db, { counts, note = null, actorId = null, dryRun = false } = {}) {
  normaliseCounts(counts);

  let captured = null;
  try {
    const report = await db.transaction(async (tx) => {
      const session = await openOn(tx, { note, actorId });
      await recordOn(tx, session, { counts, actorId });
      const applied = await applyOn(tx, session, { actorId, note });
      const result = { ...applied, sessionId: session.id, note: note ?? null };
      if (dryRun) {
        captured = result;
        throw ROLLBACK;
      }
      return result;
    });
    return { ...report, dryRun: false };
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return { ...captured, dryRun: true };
}
