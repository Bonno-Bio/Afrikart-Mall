/**
 * Payments: capture, and the money path after it.
 *
 * The provider is never the source of truth. Our `payments` row is. A webhook
 * tells us something changed; we decide whether that change is legal from the
 * state we are already in. That is the only way to survive a provider that
 * retries, reorders, or delivers the same event three times at 02:00.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';

export async function loadOrder(db, orderNumber) {
  const res = await db.query(
    `select id, user_id, order_number, status, subtotal_minor, delivery_minor, cod_fee_minor, vat_minor,
            total_minor, delivery_method, placed_at, shipping_address
       from orders where order_number = $1`,
    [orderNumber],
  );
  const order = res.rows[0];
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'That order does not exist.');
  return order;
}

/**
 * Capture a payment. Idempotent: the same provider reference captured twice
 * produces one ledger posting, because the second call finds the row already
 * captured and returns it.
 */
export async function capturePayment(db, { paymentId, providerRef, providerFeeMinor = 0 }) {
  return db.transaction(async (tx) => {
    const res = await tx.query(
      `select p.id, p.order_id, p.status, p.method, p.amount_minor, p.provider_ref,
              o.order_number, o.status as order_status
         from payments p join orders o on o.id = p.order_id
        where p.id = $1
        for update of p`,
      [paymentId],
    );
    const payment = res.rows[0];
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'That payment does not exist.');

    if (payment.status === 'captured') {
      return { paymentId: payment.id, status: 'captured', alreadyCaptured: true };
    }
    if (payment.status === 'failed') {
      throw new AppError(409, 'PAYMENT_FAILED', 'That payment failed and cannot be captured.');
    }

    const amountMinor = Number(payment.amount_minor);
    const feeMinor = Number(providerFeeMinor);

    await tx.query(
      `update payments
          set status = 'captured', provider_ref = $2, captured_at = now(), provider_fee_minor = $3
        where id = $1`,
      [payment.id, providerRef ?? null, feeMinor],
    );

    await tx.query(
      `update orders set status = 'placed', placed_at = coalesce(placed_at, now()) where id = $1`,
      [payment.order_id],
    );

    // Cash arrived at the PSP, but we owe the customer goods. It is a liability
    // until the parcel is delivered — which is also when the seller earns it.
    await post(tx, {
      kind: 'capture',
      refType: 'payment',
      refId: payment.id,
      memo: `capture ${payment.provider_ref ?? ''} for ${payment.order_number}`,
      entries: [
        { accountCode: ACCOUNTS.PSP_RECEIVABLE, debit: amountMinor },
        { accountCode: ACCOUNTS.CUSTOMER_PREPAYMENTS, credit: amountMinor },
      ],
    });

    // The provider's fee is a cost of *this order*, not of the act of capturing.
    // Posting it against the payment kept it out of every per-order margin — the
    // gap `docs/018` reported — so it gets its own transaction, tagged to the
    // order, in the same database transaction as the capture.
    if (feeMinor > 0) {
      await post(tx, {
        kind: 'psp_fee',
        refType: 'order',
        refId: payment.order_id,
        memo: `payment fee for ${payment.order_number}`,
        entries: [
          { accountCode: ACCOUNTS.PSP_FEES, debit: feeMinor },
          { accountCode: ACCOUNTS.PSP_RECEIVABLE, credit: feeMinor },
        ],
      });
    }

    await tx.query(
      `insert into order_events (order_id, event, detail, actor_type)
       values ($1, 'payment_captured', $2, 'system')`,
      [payment.order_id, `${payment.method} ${amountMinor}`],
    );
    await tx.query(`insert into outbox_events (event_type, payload) values ('payment.captured', $1)`, [
      JSON.stringify({ orderNumber: payment.order_number, amountMinor }),
    ]);

    return { paymentId: payment.id, status: 'captured', alreadyCaptured: false };
  });
}
