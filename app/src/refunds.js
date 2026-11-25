/**
 * Refunds.
 *
 * Two channels, because the rails force it (007 H6):
 *   - store_credit  — instant, always. The customer gets value in seconds and
 *                     the cash stays inside the business.
 *   - original_method — a mobile-money reversal is a human in a back office,
 *                     so it carries a 48-hour SLA and is shown to the customer
 *                     as a state, not a mystery.
 *
 * A refund reverses exactly the money the order line created: the seller's
 * payable, our commission, our fulfilment fee and the VAT. Nothing is estimated
 * and nothing is "written off" — if the reversal does not sum to the line
 * total, the ledger refuses to post it.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';

const REFUND_SLA_HOURS = 48;
const NON_RESTOCKABLE = new Set(['DAMAGED']);

export async function refundLine(
  db,
  { orderItemId, channel = 'store_credit', reason, requestedBy = null, restock },
) {
  if (!reason) throw new AppError(400, 'REASON_REQUIRED', 'A refund needs a reason.', { field: 'reason' });
  if (!['store_credit', 'original_method', 'bank_transfer'].includes(channel)) {
    throw new AppError(400, 'INVALID_REFUND_CHANNEL', `Unknown refund channel "${channel}".`, { field: 'channel' });
  }

  return db.transaction(async (tx) => {
    const res = await tx.query(
      `select i.id, i.order_id, i.seller_id, i.title_snapshot, i.quantity, i.line_subtotal_minor,
              i.vat_minor, i.commission_minor, i.fulfilment_minor, i.seller_payable_minor,
              i.status, i.variant_id,
              o.order_number, o.status as order_status
         from order_items i join orders o on o.id = i.order_id
        where i.id = $1
        for update of i`,
      [orderItemId],
    );
    const line = res.rows[0];
    if (!line) throw new AppError(404, 'ORDER_LINE_NOT_FOUND', 'That order line does not exist.');
    if (line.status !== 'active') {
      throw new AppError(409, 'ALREADY_REFUNDED', 'That line has already been refunded or cancelled.');
    }
    if (line.order_status !== 'delivered') {
      throw new AppError(409, 'NOT_DELIVERED', 'Only a delivered line can be refunded.');
    }

    const gross = Number(line.line_subtotal_minor);
    const vat = Number(line.vat_minor);
    const commission = Number(line.commission_minor);
    const fulfilment = Number(line.fulfilment_minor);
    const sellerPayable = Number(line.seller_payable_minor);

    const reversalTotal = vat + commission + fulfilment + sellerPayable;
    if (reversalTotal !== gross) {
      throw new AppError(
        500,
        'REFUND_MATH',
        `Line ${orderItemId} does not reverse cleanly: gross ${gross}, reversal ${reversalTotal}.`,
      );
    }

    const paymentRes = await tx.query(
      `select id from payments where order_id = $1 order by created_at limit 1`,
      [line.order_id],
    );
    const paymentId = paymentRes.rows[0]?.id;
    if (!paymentId) throw new AppError(409, 'NO_PAYMENT', 'That order has no payment to refund against.');

    // Money moves back to the customer either now (credit) or on a named date
    // (reversal). Both are a liability to them until settled.
    await post(tx, {
      kind: 'refund',
      refType: 'order',
      refId: line.order_id,
      memo: `refund ${line.title_snapshot} (${channel})`,
      entries: [
        { accountCode: ACCOUNTS.SELLER_PAYABLE, debit: sellerPayable, sellerId: line.seller_id },
        { accountCode: ACCOUNTS.COMMISSION_REVENUE, debit: commission, sellerId: line.seller_id },
        { accountCode: ACCOUNTS.FULFILMENT_REVENUE, debit: fulfilment, sellerId: line.seller_id },
        { accountCode: ACCOUNTS.VAT_PAYABLE, debit: vat },
        { accountCode: ACCOUNTS.CUSTOMER_PREPAYMENTS, credit: gross },
      ],
    });

    const instant = channel === 'store_credit';
    const slaDueAt = instant ? null : new Date(Date.now() + REFUND_SLA_HOURS * 3600 * 1000).toISOString();

    const refundRes = await tx.query(
      `insert into refunds
         (payment_id, order_id, amount_minor, reason, status, channel, credited_minor, sla_due_at, requested_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, status, channel, amount_minor, credited_minor, sla_due_at`,
      [
        paymentId,
        line.order_id,
        gross,
        reason,
        instant ? 'completed' : 'pending',
        channel,
        instant ? gross : 0,
        slaDueAt,
        requestedBy,
      ],
    );

    await tx.query(`update order_items set status = 'returned' where id = $1`, [line.id]);

    const remaining = await tx.query(
      `select count(*)::int as active from order_items where order_id = $1 and status = 'active'`,
      [line.order_id],
    );
    if (Number(remaining.rows[0].active) === 0) {
      await tx.query(`update orders set status = 'refunded' where id = $1`, [line.order_id]);
    }

    // A returned parcel that is still sellable goes back on the shelf. A damaged
    // one does not — pretending otherwise is how a stock record starts lying.
    const shouldRestock = restock ?? !NON_RESTOCKABLE.has(reason);
    if (shouldRestock && line.variant_id) {
      await tx.query(
        `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, note)
         values ($1, $2, 'returned', 'order', $3, $4)`,
        [line.variant_id, line.quantity, line.order_id, `refund:${reason}`],
      );
      await tx.query(
        `update inventory_levels set on_hand = on_hand + $2, updated_at = now() where variant_id = $1`,
        [line.variant_id, line.quantity],
      );
    }

    await tx.query(
      `insert into order_events (order_id, event, detail, actor_type, actor_id)
       values ($1, 'line_refunded', $2, 'staff', $3)`,
      [line.order_id, `${line.title_snapshot} ${gross} via ${channel} (${reason})`, requestedBy],
    );
    await tx.query(`insert into outbox_events (event_type, payload) values ('refund.issued', $1)`, [
      JSON.stringify({ orderNumber: line.order_number, amountMinor: gross, channel }),
    ]);

    return refundRes.rows[0];
  });
}

/** Mark an off-platform reversal as done. The cash actually left the bank. */
export async function completeRefund(db, { refundId, providerRef = null }) {
  return db.transaction(async (tx) => {
    const res = await tx.query(
      `select id, order_id, amount_minor, status, channel from refunds where id = $1 for update`,
      [refundId],
    );
    const refund = res.rows[0];
    if (!refund) throw new AppError(404, 'REFUND_NOT_FOUND', 'That refund does not exist.');
    if (refund.status === 'completed') return { ...refund, alreadyCompleted: true };

    const amount = Number(refund.amount_minor);

    await tx.query(
      `update refunds set status = 'completed', completed_at = now(), provider_ref = $2,
              credited_minor = amount_minor
        where id = $1`,
      [refund.id, providerRef],
    );

    await post(tx, {
      kind: 'refund_settlement',
      refType: 'refund',
      refId: refund.id,
      memo: `settle refund ${refund.id}`,
      entries: [
        { accountCode: ACCOUNTS.CUSTOMER_PREPAYMENTS, debit: amount },
        { accountCode: ACCOUNTS.BANK, credit: amount },
      ],
    });

    return { ...refund, status: 'completed', alreadyCompleted: false };
  });
}
