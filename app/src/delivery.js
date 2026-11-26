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
import { postCogs } from './catalogue.js';
import { packOrder } from './packaging.js';
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
              -- This delivery is one more attempt than whatever came before it.
              -- A parcel that failed once and arrived on the second try must be
              -- countable as a second attempt, or first-attempt success is a lie.
              attempt_count = attempt_count + 1,
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

    // The other half of the sale: what the goods cost us. Posted in the same
    // transaction as the revenue, because a sale recognised without its cost is
    // a margin the owner will make decisions on and should not.
    const cogs = await postCogs(tx, { orderId: order.id, orderNumber: order.order_number });

    // The box. Consumed in the same transaction as the sale, because a delivery
    // recorded without its packaging cost is a margin with a hole in it — and
    // 5030 sat empty for months proving exactly that.
    const packaging = await packOrder(tx, { orderId: order.id, orderNumber: order.order_number });

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

    // What Afrikart actually keeps, VAT excluded: commission, fulfilment and the
    // net of delivery and the cash-handling fee. VAT was never ours.
    const keptMinor = commission + fulfilment + (deliveryMinor - deliveryVat) + (codFeeMinor - codVat);

    // What is left after the goods and the box. `keptMinor` is the revenue side
    // and `grossMarginMinor` prices only the goods; this is the number to quote
    // when someone asks whether an order made money, because a margin calculated
    // with the cardboard left out is the mistake 5030 existed to expose.
    const keptAfterPackagingMinor = keptMinor - packaging.packagingCostMinor;
    const netMarginMinor =
      cogs.unresolved.length === 0 ? keptAfterPackagingMinor - cogs.cogsMinor : null;

    return {
      orderNumber: order.order_number,
      status: 'delivered',
      cashCollectedMinor: cash,
      commissionMinor: commission,
      deliveryMinor,
      fulfilmentMinor: fulfilment,
      sellerPayableMinor: payable,
      invoiceNumber: invoice.invoice_number,
      packagingCostMinor: packaging.packagingCostMinor,
      packagingClass: packaging.parcelClass,
      packagingParcels: packaging.parcels,
      packagingShortfallMinor: packaging.shortfallMinor,
      cogsMinor: cogs.cogsMinor,
      sellerCostMinor: cogs.sellerCostMinor,
      cogsUnresolved: cogs.unresolved,
      keptMinor,
      keptAfterPackagingMinor,
      netMarginMinor,
      // What Afrikart kept, less what the goods cost Afrikart. Consignment stock
      // costs us nothing, so this is positive; the seller's own cost is reported
      // beside it rather than subtracted from our margin.
      grossMarginMinor: cogs.unresolved.length === 0 ? keptMinor - cogs.cogsMinor : null,
      alreadyDelivered: false,
    };
  });
}

/**
 * A drop that did not happen. It is not a sale, so nothing is recognised; it is
 * a trip, so the fuel is already spent. Recording it here is what lets the run
 * report charge the cost to the business instead of to a customer who never
 * received a parcel.
 *
 * Repeatable on purpose: three attempts at one address are three attempts, and a
 * delivery record that only remembers the last one cannot explain why a route
 * took five hours.
 */
export async function recordFailedAttempt(db, { orderNumber, reasonCode, note = null, riderId = null }) {
  if (!reasonCode) {
    throw new AppError(422, 'REASON_REQUIRED', 'A failed attempt needs a reason code.', { field: 'reasonCode' });
  }
  return db.transaction(async (tx) => {
    const res = await tx.query(
      `select d.id, d.status, d.attempt_count, o.id as order_id, o.order_number, o.status as order_status
         from deliveries d join orders o on o.id = d.order_id
        where o.order_number = $1
        for update of d`,
      [orderNumber],
    );
    const delivery = res.rows[0];
    if (!delivery) throw new AppError(404, 'ORDER_NOT_FOUND', 'That order does not exist.');
    if (delivery.status === 'delivered') {
      throw new AppError(409, 'ALREADY_DELIVERED', 'That order has already been delivered.');
    }
    if (['cancelled', 'refunded'].includes(delivery.order_status)) {
      throw new AppError(409, 'ORDER_CLOSED', `An order in "${delivery.order_status}" cannot be attempted.`);
    }

    const reason = await tx.query(`select code, category from delivery_failure_reasons where code = $1`, [reasonCode]);
    if (reason.rows.length === 0) {
      throw new AppError(422, 'UNKNOWN_REASON', `"${reasonCode}" is not a known failure reason.`, {
        field: 'reasonCode',
      });
    }

    const attempts = Number(delivery.attempt_count) + 1;
    await tx.query(
      `update deliveries
          set status = 'failed', attempt_count = $2, failure_reason_code = $3, failure_note = $4,
              first_attempt_at = coalesce(first_attempt_at, now()),
              rider_id = coalesce(rider_id, $5)
        where id = $1`,
      [delivery.id, attempts, reasonCode, note, riderId],
    );

    await tx.query(
      `insert into order_events (order_id, event, detail, actor_type)
       values ($1, 'delivery_failed', $2, 'rider')`,
      [delivery.order_id, `${reasonCode}${note ? `: ${note}` : ''}`],
    );

    return {
      orderNumber: delivery.order_number,
      status: 'failed',
      reasonCode,
      category: reason.rows[0].category,
      attempts,
      // A failed attempt is rescheduled, not abandoned: the parcel goes back out.
      needsReschedule: true,
    };
  });
}
