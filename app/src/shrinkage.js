/**
 * Who pays for stock that vanished (AFR-48).
 *
 * A marketplace holds other people's goods. When a count cannot find them, the
 * question is not "what is the journal entry" but "whose loss is this", and that
 * is a commercial decision, not an accounting one. Getting the order wrong is
 * how a marketplace books a loss it never suffered, or quietly charges a seller
 * for a mistake that was ours.
 *
 * The two honest outcomes, and what each means:
 *
 *   - **seller_absorbs** — the goods were theirs, they were on our shelf, and
 *     nobody is compensating. No ledger entry: our balance sheet never contained
 *     those units. The statement shows the line as a memo so the seller sees it,
 *     and the trial balance does not move. We are not their insurer.
 *
 *   - **afrikart_compensates** — we decided the loss is ours (a break-in, a
 *     forklift, a careless pick). Then it is real: Dr 5080 Inventory shrinkage,
 *     Cr 2010 Seller payable, and the seller is made whole in the next payout.
 *
 * Anything else — charging the seller cash for goods we never bought — would be
 * a receivable against a person who has done nothing wrong, so it is not offered.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';

export const DECISIONS = ['seller_absorbs', 'afrikart_compensates'];

/**
 * Decide one incident, or a batch of them.
 *
 * Idempotence is deliberate: deciding the same way twice is a no-op, because a
 * retried request must not compensate a seller twice. Deciding *differently*
 * once a payout has already included the incident is refused.
 */
export async function decideStocktakeIncidents(
  db,
  { incidentIds, decision, actorId = null, note = null } = {},
) {
  if (!Array.isArray(incidentIds) || incidentIds.length === 0) {
    throw new AppError(400, 'INCIDENTS_REQUIRED', 'Which incidents?', { field: 'incidentIds' });
  }
  if (!DECISIONS.includes(decision)) {
    throw new AppError(400, 'INVALID_DECISION', `Decision must be ${DECISIONS.join(' or ')}.`, {
      field: 'decision',
      details: { allowed: DECISIONS },
    });
  }

  return db.transaction(async (tx) => {
    const res = await tx.query(
      `select id, seller_id, sku, quantity_lost, unit_cost_minor, value_minor, decision, payout_id
         from stocktake_incidents
        where id = any($1::uuid[])
        order by created_at
        for update`,
      [incidentIds],
    );
    if (res.rows.length !== incidentIds.length) {
      const found = new Set(res.rows.map((r) => r.id));
      const missing = incidentIds.filter((id) => !found.has(id));
      throw new AppError(404, 'INCIDENT_NOT_FOUND', `No stocktake incident ${missing.join(', ')}.`, {
        details: { missing },
      });
    }

    const decided = [];
    for (const incident of res.rows) {
      if (incident.payout_id) {
        throw new AppError(
          409,
          'INCIDENT_ALREADY_PAID',
          `${incident.sku} was already compensated in a payout; that decision cannot be revisited.`,
          { details: { incidentId: incident.id } },
        );
      }

      if (incident.decision === decision) {
        decided.push({ ...summarise(incident, decision), changed: false });
        continue;
      }
      if (incident.decision !== 'open') {
        throw new AppError(
          409,
          'INCIDENT_ALREADY_DECIDED',
          `${incident.sku} was already decided as ${incident.decision}.`,
          { details: { incidentId: incident.id, decision: incident.decision } },
        );
      }

      if (decision === 'afrikart_compensates') {
        const value = Number(incident.value_minor ?? 0);
        if (value <= 0) {
          throw new AppError(
            409,
            'INCIDENT_UNCOSTED',
            `${incident.sku} has no landed cost on file, so there is nothing to compensate. Settle the purchase order first, or let the seller absorb it.`,
            { details: { incidentId: incident.id, sku: incident.sku } },
          );
        }
        await post(tx, {
          kind: 'shrinkage_compensation',
          refType: 'stocktake_incident',
          refId: incident.id,
          memo: `compensation ${incident.sku} x${incident.quantity_lost}`,
          createdBy: actorId,
          entries: [
            { accountCode: ACCOUNTS.SHRINKAGE, debit: value },
            { accountCode: ACCOUNTS.SELLER_PAYABLE, credit: value, sellerId: incident.seller_id },
          ],
        });
      }

      await tx.query(
        `update stocktake_incidents
            set decision = $2, decided_by = $3, decided_at = now(), note = coalesce($4, note)
          where id = $1`,
        [incident.id, decision, actorId, note],
      );

      decided.push(summarise(incident, decision));
    }

    const compensationMinor = decided
      .filter((d) => d.decision === 'afrikart_compensates')
      .reduce((a, d) => a + (d.valueMinor ?? 0), 0);

    return { decision, incidents: decided, compensationMinor, note: note ?? null };
  });
}

function summarise(incident, decision) {
  return {
    incidentId: incident.id,
    sellerId: incident.seller_id,
    sku: incident.sku,
    quantityLost: Number(incident.quantity_lost),
    unitCostMinor: incident.unit_cost_minor === null ? null : Number(incident.unit_cost_minor),
    valueMinor: incident.value_minor === null ? null : Number(incident.value_minor),
    decision,
    // What this decision does to our books, stated so nobody has to infer it.
    postsToLedgerMinor: decision === 'afrikart_compensates' ? Number(incident.value_minor ?? 0) : 0,
  };
}

/** Open incidents, newest first — the queue somebody has to clear. */
export async function openStocktakeIncidents(db, { sellerId = null, limit = 100 } = {}) {
  const res = await db.query(
    `select i.id, i.sku, i.quantity_lost, i.unit_cost_minor, i.value_minor, i.decision,
            i.created_at, i.payout_id, s.trading_name as seller
       from stocktake_incidents i join sellers s on s.id = i.seller_id
      where i.decision = 'open' and ($1::uuid is null or i.seller_id = $1)
      order by i.created_at desc limit $2`,
    [sellerId, limit],
  );
  return {
    count: res.rows.length,
    totalValueMinor: res.rows.reduce((a, r) => a + Number(r.value_minor ?? 0), 0),
    incidents: res.rows.map((r) => ({
      incidentId: r.id,
      seller: r.seller,
      sku: r.sku,
      quantityLost: Number(r.quantity_lost),
      unitCostMinor: r.unit_cost_minor === null ? null : Number(r.unit_cost_minor),
      valueMinor: r.value_minor === null ? null : Number(r.value_minor),
      createdAt: r.created_at,
    })),
  };
}
