/**
 * Delivery completion — where the sale is actually recognised.
 *
 * This is integration #6 from docs/spec/delivery.md, and it is the reason this
 * module exists as its own file: revenue, VAT and the seller's payable are all
 * recognised on `delivered`, not on payment. The seller is paid for what
 * arrived. That single rule is what makes the returns promise affordable.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';
import { issueInvoice } from './invoice.js';
import { vatFromInclusive } from './money.js';

export async function recordDelivery(db, { orderNumber, cashCollectedMinor = null, riderId = null }) {
  return db.transaction(async (tx) => {
    const orderRes = await tx.query(
      `select id, order_number, status, total_minor, vat_minor, delivery_minor, cod_fee_minor,
              delivery_method
         from orders where order_number = $1 for update`,
      [orderNumber],
    );
    const order = orderRes.rows[0];
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'That order does not exist.');

    if (order.status === 'delivered') {
      return { orderNumber: order.order_number, status: 'delivered', alreadyDelivered: true };
    }
    if (!['placed', 'packed', 'dispatched'].includes(order.status)) {
      throw new AppError(409, 'ORDER_NOT_DELIVERABLE', `An order in "${order.status}" cannot be delivered.`);
    }

    const paymentRes = await tx.query(
      `select id, method, status, amount_minor from payments where order_id = $1 order by created_at limit 1`,
      [order.id],
    );
    const payment = paymentRes.rows[0];
    const isCod = payment?.method === 'cod';

    const cash = isCod ? Number(cashCollectedMinor ?? order.total_minor) : 0;
    if (isCod && cash !== Number(order.total_minor)) {
      throw new AppError(
        422,
        'COD_AMOUNT_MISMATCH',
        `Cash collected (${cash}) does not match the order total (${order.total_minor}).`,
        { field: 'cashCollectedMinor' },
      );
    }

    await tx.query(
      `update deliveries
          set status = 'delivered', delivered_at = now(), cash_collected_minor = $2,
              attempt_count = greatest(attempt_count, 1),
              rider_id = coalesce(rider_id, $3)
        where order_id = $1 and status <> 'delivered'`,
      [order.id, cash, riderId],
    );

    if (payment && payment.status !== 'captured') {
      await tx.query(`update payments set status = 'captured', captured_at = now() where id = $1`, [payment.id]);
    }

    // The sale, recognised now. One debit: the money we hold or the cash in the
    // rider's hand. Credits: commission, fulfilment, delivery, COD fee, VAT,
    // and one payable line per seller.
    const linesRes = await tx.query(
      `select seller_id,
              sum(line_subtotal_minor)::bigint as gross,
              sum(commission_minor)::bigint   as commission,
              sum(fulfilment_minor)::bigint   as fulfilment,
              sum(seller_payable_minor)::bigint as payable
         from order_items
        where order_id = $1 and status = 'active'
        group by seller_id`,
      [order.id],
    );

    const deliveryMinor = Number(order.delivery_minor);
    const codFeeMinor = Number(order.cod_fee_minor);
    const deliveryVat = vatFromInclusive(deliveryMinor).vatMinor;
    const codVat = vatFromInclusive(codFeeMinor).vatMinor;

    const entries = [
      isCod
        ? { accountCode: ACCOUNTS.CASH_ON_HAND, debit: cash }
        : { accountCode: ACCOUNTS.CUSTOMER_PREPAYMENTS, debit: Number(order.total_minor) },
      { accountCode: ACCOUNTS.VAT_PAYABLE, credit: Number(order.vat_minor) },
      { accountCode: ACCOUNTS.DELIVERY_REVENUE, credit: deliveryMinor - deliveryVat },
      { accountCode: ACCOUNTS.COD_REVENUE, credit: codFeeMinor - codVat },
    ];

    let commission = 0;
    let fulfilment = 0;
    let payable = 0;
    for (const line of linesRes.rows) {
      entries.push(
        { accountCode: ACCOUNTS.COMMISSION_REVENUE, credit: Number(line.commission), sellerId: line.seller_id },
        { accountCode: ACCOUNTS.FULFILMENT_REVENUE, credit: Number(line.fulfilment), sellerId: line.seller_id },
        { accountCode: ACCOUNTS.SELLER_PAYABLE, credit: Number(line.payable), sellerId: line.seller_id },
      );
      commission += Number(line.commission);
      fulfilment += Number(line.fulfilment);
      payable += Number(line.payable);
    }

    // A free delivery earns no delivery revenue, and a zero-value debit/credit
    // is not an entry. Drop the empties rather than teaching the ledger to
    // accept them.
    const postingEntries = entries.filter((e) => (e.debit ?? 0) > 0 || (e.credit ?? 0) > 0);

    await post(tx, {
      kind: 'sale',
      refType: 'order',
      refId: order.id,
      memo: `delivered ${order.order_number}`,
      entries: postingEntries,
    });

    await tx.query(`update orders set status = 'delivered' where id = $1`, [order.id]);
    await tx.query(
      `insert into order_events (order_id, event, detail, actor_type)
       values ($1, 'delivered', $2, 'rider')`,
      [order.id, isCod ? `cash ${cash}` : 'prepaid'],
    );
    await tx.query(`insert into outbox_events (event_type, payload) values ('order.delivered', $1)`, [
      JSON.stringify({ orderNumber: order.order_number, totalMinor: Number(order.total_minor) }),
    ]);

    const invoice = await issueInvoice(tx, order.id);

    return {
      orderNumber: order.order_number,
      status: 'delivered',
      cashCollectedMinor: cash,
      commissionMinor: commission,
      fulfilmentMinor: fulfilment,
      sellerPayableMinor: payable,
      invoiceNumber: invoice.invoice_number,
      alreadyDelivered: false,
    };
  });
}
