/**
 * Seller payouts (AFR-42).
 *
 * The marketplace promise is simple and easy to break: we sell the seller's
 * goods, keep our commission and fulfilment fee, and hand over the rest. Until
 * this module existed, `seller_payable` accumulated in the ledger and nobody was
 * ever paid — a marketplace that never pays is a shop with extra steps.
 *
 * Three rules:
 *
 *   1. A payout is a set of order lines, not a number. Without `payout_items`
 *      the statement is something the seller has to take on trust; with it, they
 *      can add up their own orders and agree or disagree.
 *
 *   2. A line can be paid exactly once. That is a unique index, not a habit.
 *
 *   3. What we pay is what the ledger says we owe, and the payment is posted in
 *      the same transaction that creates it. A payout record that disagrees with
 *      the ledger is worse than no payout record, because it looks like proof.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';

const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
const addDays = (date, n) => {
  const d = new Date(`${isoDate(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};

/**
 * Run a payout for one seller, or for every seller with something owing.
 *
 * The period is inclusive and is measured on the delivery date, because that is
 * when the seller earned the money. An order delivered after the period belongs
 * to the next payout, not this one.
 */
export async function payoutRun(
  db,
  { sellerId = null, periodStart = null, periodEnd = null, actorId = null, bankReference = null } = {},
) {
  const end = isoDate(periodEnd ?? new Date());
  const start = isoDate(periodStart ?? addDays(end, -6));
  if (start > end) {
    throw new AppError(400, 'INVALID_PERIOD', 'The period ends before it starts.', { field: 'periodStart' });
  }

  return db.transaction(async (tx) => {
    const sellersRes = await tx.query(
      `select s.id, s.trading_name
         from sellers s
        where s.status = 'approved' and ($1::uuid is null or s.id = $1)
        order by s.trading_name`,
      [sellerId],
    );
    if (sellerId && sellersRes.rows.length === 0) {
      throw new AppError(404, 'SELLER_NOT_FOUND', 'That seller does not exist or is not approved.');
    }

    const payouts = [];
    for (const seller of sellersRes.rows) {
      const payout = await runForSeller(tx, {
        seller,
        start,
        end,
        actorId,
        bankReference,
      });
      if (payout) payouts.push(payout);
    }

    if (payouts.length === 0) {
      throw new AppError(
        409,
        'NOTHING_TO_PAY',
        sellerId
          ? 'Nothing is owed to that seller for those delivered lines.'
          : 'Nothing is owed to any seller for those delivered lines.',
      );
    }

    return {
      periodStart: start,
      periodEnd: end,
      totalPaidMinor: payouts.reduce((a, p) => a + p.netMinor, 0),
      payouts,
    };
  });
}

async function runForSeller(tx, { seller, start, end, actorId, bankReference }) {
  const linesRes = await tx.query(
    `select i.id, i.order_id, i.status, i.quantity, i.line_subtotal_minor, i.vat_minor,
            i.commission_minor, i.fulfilment_minor, i.seller_payable_minor,
            i.title_snapshot, i.sku_snapshot,
            o.order_number, d.delivered_at
       from order_items i
       join orders o on o.id = i.order_id
       join deliveries d on d.order_id = o.id and d.status = 'delivered'
      where i.seller_id = $1
        and i.status in ('active','returned')
        and d.delivered_at::date between $2::date and $3::date
        and not exists (select 1 from payout_items pi where pi.order_item_id = i.id)
      order by d.delivered_at, o.order_number, i.id
      for update of i`,
    [seller.id, start, end],
  );

  const lines = linesRes.rows;
  if (lines.length === 0) return null;

  // Gross on a payout is VAT-exclusive. The VAT portion of a sale was never the
  // seller's money and was never credited to their payable, so including it
  // would make the statement fail its own arithmetic.
  const gross = lines.reduce((a, l) => a + Number(l.line_subtotal_minor) - Number(l.vat_minor), 0);
  const commission = lines.reduce((a, l) => a + Number(l.commission_minor), 0);
  const fulfilment = lines.reduce((a, l) => a + Number(l.fulfilment_minor), 0);
  // A returned line contributed its payable when it was delivered, and the
  // refund debited it back out. Showing it here is what makes the statement
  // add up for a seller who had a return that week.
  const refunds = lines
    .filter((l) => l.status === 'returned')
    .reduce((a, l) => a + Number(l.seller_payable_minor), 0);
  const net = gross - commission - fulfilment - refunds;

  const payableLines = lines.filter((l) => l.status === 'active');
  const payable = payableLines.reduce((a, l) => a + Number(l.seller_payable_minor), 0);

  if (net !== payable) {
    throw new AppError(
      500,
      'PAYOUT_MATH',
      `Payout for ${seller.trading_name} does not add up: net ${net}, payable ${payable}.`,
    );
  }
  if (net <= 0) {
    // A zero or negative net means refunds swallowed the week. There is nothing
    // to transfer, and pretending otherwise moves money in the wrong direction.
    return null;
  }

  // What the ledger says we owe. A payout must never exceed it.
  const owedRes = await tx.query(
    `select coalesce(sum(credit_minor - debit_minor), 0) as owed
       from ledger_entries where seller_id = $1 and account_code = $2`,
    [seller.id, ACCOUNTS.SELLER_PAYABLE],
  );
  const owed = Number(owedRes.rows[0].owed);
  if (net > owed) {
    throw new AppError(
      500,
      'PAYOUT_EXCEEDS_LEDGER',
      `Refusing to pay ${seller.trading_name} ${net}: the ledger says we owe ${owed}.`,
    );
  }

  let payoutRes;
  try {
    payoutRes = await tx.query(
      `insert into seller_payouts
         (seller_id, period_start, period_end, gross_minor, commission_minor,
          fulfilment_minor, refunds_minor, net_minor, status, bank_reference, paid_at, approved_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9, now(), $10)
       returning id, period_start, period_end, net_minor, status`,
      [seller.id, start, end, gross, commission, fulfilment, refunds, net, bankReference, actorId],
    );
  } catch (err) {
    if (String(err.message).includes('seller_payouts_seller_id_period_start_period_end_key')) {
      throw new AppError(
        409,
        'PAYOUT_EXISTS',
        `${seller.trading_name} already has a payout for ${start} to ${end}.`,
      );
    }
    throw err;
  }
  const payout = payoutRes.rows[0];

  for (const line of payableLines) {
    await tx.query(
      `insert into payout_items (payout_id, order_item_id, amount_minor) values ($1, $2, $3)`,
      [payout.id, line.id, Number(line.seller_payable_minor)],
    );
  }

  await post(tx, {
    kind: 'seller_payout',
    refType: 'seller_payout',
    refId: payout.id,
    memo: `payout ${seller.trading_name} ${start}..${end}`,
    createdBy: actorId,
    entries: [
      { accountCode: ACCOUNTS.SELLER_PAYABLE, debit: net, sellerId: seller.id },
      { accountCode: ACCOUNTS.BANK, credit: net },
    ],
  });

  await tx.query(`insert into outbox_events (event_type, payload) values ('seller.paid', $1)`, [
    JSON.stringify({
      sellerId: seller.id,
      payoutId: payout.id,
      netMinor: net,
      lines: payableLines.length,
      periodStart: start,
      periodEnd: end,
    }),
  ]);

  return {
    payoutId: payout.id,
    sellerId: seller.id,
    seller: seller.trading_name,
    periodStart: start,
    periodEnd: end,
    grossMinor: gross,
    commissionMinor: commission,
    fulfilmentMinor: fulfilment,
    refundsMinor: refunds,
    netMinor: net,
    lines: payableLines.length,
  };
}

/**
 * The statement a seller can check: every line, what it sold for, what we kept,
 * and what they were paid. If a seller cannot reconcile this against their own
 * records, the marketplace has a trust problem that no dashboard fixes.
 */
export async function payoutStatement(db, { payoutId, sellerId = null } = {}) {
  const payoutRes = await db.query(
    `select p.id, p.seller_id, s.trading_name, p.period_start, p.period_end,
            p.gross_minor, p.commission_minor, p.fulfilment_minor, p.refunds_minor,
            p.net_minor, p.status, p.bank_reference, p.paid_at
       from seller_payouts p join sellers s on s.id = p.seller_id
      where p.id = $1 and ($2::uuid is null or p.seller_id = $2)`,
    [payoutId, sellerId],
  );
  const payout = payoutRes.rows[0];
  if (!payout) throw new AppError(404, 'PAYOUT_NOT_FOUND', 'That payout does not exist.');

  const itemsRes = await db.query(
    `select pi.order_item_id, pi.amount_minor, i.title_snapshot, i.sku_snapshot, i.quantity,
            i.unit_price_minor, i.line_subtotal_minor, i.commission_minor, i.fulfilment_minor,
            o.order_number
       from payout_items pi
       join order_items i on i.id = pi.order_item_id
       join orders o on o.id = i.order_id
      where pi.payout_id = $1
      order by o.order_number`,
    [payoutId],
  );

  const items = itemsRes.rows.map((r) => ({
    orderNumber: r.order_number,
    orderItemId: r.order_item_id,
    title: r.title_snapshot,
    sku: r.sku_snapshot,
    quantity: Number(r.quantity),
    unitPriceMinor: Number(r.unit_price_minor),
    grossMinor: Number(r.line_subtotal_minor),
    commissionMinor: Number(r.commission_minor),
    fulfilmentMinor: Number(r.fulfilment_minor),
    paidMinor: Number(r.amount_minor),
  }));

  const check =
    items.reduce((a, i) => a + i.paidMinor, 0) === Number(payout.net_minor) - Number(payout.refunds_minor);

  return {
    payoutId: payout.id,
    seller: payout.trading_name,
    periodStart: payout.period_start,
    periodEnd: payout.period_end,
    grossMinor: Number(payout.gross_minor),
    commissionMinor: Number(payout.commission_minor),
    fulfilmentMinor: Number(payout.fulfilment_minor),
    refundsMinor: Number(payout.refunds_minor),
    netMinor: Number(payout.net_minor),
    status: payout.status,
    bankReference: payout.bank_reference,
    paidAt: payout.paid_at,
    items,
    // The arithmetic the seller would do themselves.
    itemsSumMinor: items.reduce((a, i) => a + i.paidMinor, 0),
    reconciles: check,
  };
}

/** Everything a seller has been paid, newest first. */
export async function payoutsFor(db, { sellerId, limit = 24 }) {
  const res = await db.query(
    `select id, period_start, period_end, net_minor, status, paid_at, bank_reference
       from seller_payouts where seller_id = $1
      order by period_end desc limit $2`,
    [sellerId, limit],
  );
  return res.rows.map((r) => ({
    payoutId: r.id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    netMinor: Number(r.net_minor),
    status: r.status,
    paidAt: r.paid_at,
    bankReference: r.bank_reference,
  }));
}
