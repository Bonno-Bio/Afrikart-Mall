/**
 * What each order actually earned (AFR-52).
 *
 * Every figure here comes out of the ledger, grouped by the order it was posted
 * against. That is not laziness — it is the point. The ledger already knows the
 * commission, the fulfilment fee, the delivery and COD revenue, the cost of the
 * goods, the box, and every refund, because each of those was posted against
 * `ref_type = 'order'` at the moment it happened. A profitability report that
 * recomputes any of it from the catalogue would be a second opinion, and second
 * opinions drift.
 *
 * Every amount is VAT-excluded, because that is how the ledger holds it: the
 * P30 delivery fee is P26.32 of revenue and P3.68 of VAT that was never ours.
 *
 * The one thing the ledger cannot tell us is what an order's postings add up to
 * for the business as a whole: some costs are not attributable to an order at
 * all (a stocktake shrinkage, a bank charge). Those are reported as
 * `unattributed` rather than quietly divided across orders, and the tie-out
 * proves that orders + unattributed = the ledger.
 */
import { AppError } from './errors.js';
import { ACCOUNTS, balance } from './ledger.js';

/** The accounts that make up a per-order margin, in the order they read. */
export const MARGIN_ACCOUNTS = {
  revenue: [
    { code: ACCOUNTS.COMMISSION_REVENUE, key: 'commissionMinor', label: 'Commission' },
    { code: ACCOUNTS.FULFILMENT_REVENUE, key: 'fulfilmentMinor', label: 'Fulfilment' },
    { code: ACCOUNTS.DELIVERY_REVENUE, key: 'deliveryMinor', label: 'Delivery' },
    { code: ACCOUNTS.COD_REVENUE, key: 'codMinor', label: 'Cash handling' },
  ],
  cost: [
    { code: ACCOUNTS.COGS, key: 'cogsMinor', label: 'Cost of goods' },
    { code: ACCOUNTS.PACKAGING, key: 'packagingMinor', label: 'Packaging' },
    { code: ACCOUNTS.LAST_MILE, key: 'lastMileMinor', label: 'Last mile' },
    { code: ACCOUNTS.PSP_FEES, key: 'pspFeeMinor', label: 'Payment fees' },
    { code: ACCOUNTS.REFUNDS, key: 'refundWriteOffMinor', label: 'Refunds written off' },
  ],
};

const REVENUE_CODES = MARGIN_ACCOUNTS.revenue.map((a) => a.code);
const COST_CODES = MARGIN_ACCOUNTS.cost.map((a) => a.code);

const num = (v) => Number(v ?? 0);

/** Basis points of `part` in `whole`, or null when there is nothing to divide. */
export const bpsOf = (part, whole) => (whole === 0 ? null : Math.round((part * 10000) / whole));

/**
 * The per-order margin table.
 *
 * Existing orders are pulled from the ledger by `ref_type = 'order'`, so an
 * order that was never posted (still `pending_payment`) has no margin to report
 * and correctly does not appear.
 */
export async function orderMargins(db, { from = null, to = null, limit = 200 } = {}) {
  if (from && to && from > to) {
    throw new AppError(422, 'BAD_WINDOW', '`from` is after `to`.', { field: 'from' });
  }

  const where = [`et.ref_type = 'order'`, `et.ref_id is not null`, `le.account_code = any($1::text[])`];
  const args = [[...REVENUE_CODES, ...COST_CODES]];
  // Nine fixed account placeholders follow the codes, so the window starts at 11.
  const nextPlaceholder = () => 10 + args.length;
  if (from) {
    args.push(from);
    where.push(`et.occurred_at >= $${nextPlaceholder() - 1}::timestamptz`);
  }
  if (to) {
    args.push(to);
    where.push(`et.occurred_at < ($${nextPlaceholder() - 1}::timestamptz + interval '1 day')`);
  }
  const windowArgs = args.slice(1);

  const res = await db.query(
    `select et.ref_id as order_id,
            sum(case when le.account_code = $2 then le.credit_minor - le.debit_minor else 0 end) as commission,
            sum(case when le.account_code = $3 then le.credit_minor - le.debit_minor else 0 end) as fulfil,
            sum(case when le.account_code = $4 then le.credit_minor - le.debit_minor else 0 end) as delivery,
            sum(case when le.account_code = $5 then le.credit_minor - le.debit_minor else 0 end) as cod,
            sum(case when le.account_code = $6 then le.debit_minor - le.credit_minor else 0 end) as cogs,
            sum(case when le.account_code = $7 then le.debit_minor - le.credit_minor else 0 end) as packaging,
            sum(case when le.account_code = $8 then le.debit_minor - le.credit_minor else 0 end) as last_mile,
            sum(case when le.account_code = $9 then le.debit_minor - le.credit_minor else 0 end) as psp_fee,
            sum(case when le.account_code = $10 then le.debit_minor - le.credit_minor else 0 end) as refund_write_off
       from ledger_entries le
       join ledger_transactions et on et.id = le.transaction_id
      where ${where.join(' and ')}
      group by et.ref_id
      order by order_id`,
    [
      args[0],
      ACCOUNTS.COMMISSION_REVENUE,
      ACCOUNTS.FULFILMENT_REVENUE,
      ACCOUNTS.DELIVERY_REVENUE,
      ACCOUNTS.COD_REVENUE,
      ACCOUNTS.COGS,
      ACCOUNTS.PACKAGING,
      ACCOUNTS.LAST_MILE,
      ACCOUNTS.PSP_FEES,
      ACCOUNTS.REFUNDS,
      ...windowArgs,
    ],
  );

  const ids = res.rows.map((r) => r.order_id);
  const facts = new Map();
  if (ids.length > 0) {
    const factsRes = await db.query(
      `select o.id,
              o.order_number,
              o.status,
              o.total_minor,
              o.subtotal_minor,
              o.placed_at,
              (select max(d.delivered_at) from deliveries d where d.order_id = o.id) as delivered_at,
              (select pc.parcel_class from packaging_consumptions pc where pc.order_id = o.id) as parcel_class,
              (select pc.parcels from packaging_consumptions pc where pc.order_id = o.id) as parcels,
              (select count(distinct i.seller_id)::int from order_items i where i.order_id = o.id) as seller_count
         from orders o
        where o.id = any($1::uuid[])`,
      [ids],
    );
    for (const row of factsRes.rows) facts.set(row.id, row);
  }

  const rows = [];
  for (const r of res.rows) {
    const fact = facts.get(r.order_id) ?? {};
    const commissionMinor = num(r.commission);
    const fulfilmentMinor = num(r.fulfil);
    const codMinor = num(r.cod);
    const deliveryMinor = num(r.delivery);
    const costs = {
      cogsMinor: num(r.cogs),
      packagingMinor: num(r.packaging),
      lastMileMinor: num(r.last_mile),
      pspFeeMinor: num(r.psp_fee),
      refundWriteOffMinor: num(r.refund_write_off),
    };

    // Our fees on their own. The delivery fee is deliberately kept out of this
    // number: nothing in this system posts a rider's cost against an order yet,
    // so treating the fee as margin would be counting revenue whose cost is
    // missing. That absence is reported, not assumed away.
    const marketplaceRevenueMinor = commissionMinor + fulfilmentMinor + codMinor;
    const costMinor = Object.values(costs).reduce((a, v) => a + v, 0);
    const goodsMarginMinor = marketplaceRevenueMinor - costMinor;
    const deliveryUncosted = deliveryMinor > 0 && costs.lastMileMinor === 0;

    rows.push({
      orderNumber: fact.order_number ?? null,
      status: fact.status ?? null,
      placedAt: fact.placed_at ?? null,
      deliveredAt: fact.delivered_at ?? null,
      customerTotalMinor: num(fact.total_minor),
      parcelClass: fact.parcel_class ?? null,
      parcels: fact.parcels === null || fact.parcels === undefined ? null : Number(fact.parcels),
      sellers: Number(fact.seller_count ?? 0),
      commissionMinor,
      fulfilmentMinor,
      codMinor,
      deliveryMinor,
      ...costs,
      marketplaceRevenueMinor,
      costMinor,
      // Did our fees pay for our own costs — the goods, the box, the payment
      // fee? This is the number an order has to clear.
      goodsMarginMinor,
      // The whole order including the delivery fee, less any last-mile cost we
      // have actually posted. Null when the fee has no cost behind it.
      deliveryMarginMinor: deliveryUncosted ? null : deliveryMinor - costs.lastMileMinor,
      deliveryUncosted,
      netMarginMinor: marketplaceRevenueMinor + deliveryMinor - costMinor,
      marginBps: bpsOf(goodsMarginMinor, marketplaceRevenueMinor),
      lossMaking: goodsMarginMinor < 0,
    });
  }

  rows.sort(
    (a, b) => a.goodsMarginMinor - b.goodsMarginMinor || String(a.orderNumber).localeCompare(String(b.orderNumber)),
  );
  const limited = limit === null ? rows : rows.slice(0, limit);
  const summary = summarise(rows);
  const unattributed = await unattributedMargins(db, { from, to });
  const tieOut = await tieOutMargins(db, { rows, unattributed });

  return { rows: limited, summary, unattributed, tieOut };
}

function summarise(rows) {
  const totals = {
    commissionMinor: 0,
    fulfilmentMinor: 0,
    deliveryMinor: 0,
    codMinor: 0,
    cogsMinor: 0,
    packagingMinor: 0,
    lastMileMinor: 0,
    pspFeeMinor: 0,
    refundWriteOffMinor: 0,
  };
  for (const r of rows) for (const key of Object.keys(totals)) totals[key] += r[key];

  const marketplaceRevenueMinor =
    totals.commissionMinor + totals.fulfilmentMinor + totals.codMinor;
  const costMinor =
    totals.cogsMinor +
    totals.packagingMinor +
    totals.lastMileMinor +
    totals.pspFeeMinor +
    totals.refundWriteOffMinor;
  const goodsMarginMinor = marketplaceRevenueMinor - costMinor;
  const deliveryUncostedMinor = rows.filter((r) => r.deliveryUncosted).reduce((a, r) => a + r.deliveryMinor, 0);

  const byClass = new Map();
  for (const r of rows) {
    const key = r.parcelClass ?? 'unpacked';
    const bucket = byClass.get(key) ?? {
      parcelClass: key,
      orders: 0,
      marketplaceRevenueMinor: 0,
      costMinor: 0,
      goodsMarginMinor: 0,
      packagingMinor: 0,
    };
    bucket.orders += 1;
    bucket.marketplaceRevenueMinor += r.marketplaceRevenueMinor;
    bucket.costMinor += r.costMinor;
    bucket.goodsMarginMinor += r.goodsMarginMinor;
    bucket.packagingMinor += r.packagingMinor;
    byClass.set(key, bucket);
  }
  const classes = [...byClass.values()]
    .map((b) => ({
      ...b,
      marginBps: bpsOf(b.goodsMarginMinor, b.marketplaceRevenueMinor),
      averageGoodsMarginMinor: Math.round(b.goodsMarginMinor / b.orders),
      averagePackagingMinor: Math.round(b.packagingMinor / b.orders),
    }))
    .sort((a, b) => a.goodsMarginMinor - b.goodsMarginMinor);

  return {
    orders: rows.length,
    ...totals,
    marketplaceRevenueMinor,
    costMinor,
    goodsMarginMinor,
    netMarginMinor: marketplaceRevenueMinor + totals.deliveryMinor - costMinor,
    marginBps: bpsOf(goodsMarginMinor, marketplaceRevenueMinor),
    averageGoodsMarginMinor: rows.length === 0 ? 0 : Math.round(goodsMarginMinor / rows.length),
    packagingShareOfCostBps: bpsOf(totals.packagingMinor, costMinor),
    // Delivery fees whose rider cost has never been posted. Until last mile is
    // recorded per order, every net margin here is an upper bound, and the
    // report says so rather than quietly flattering the business.
    deliveryUncostedMinor,
    lossMaking: rows.filter((r) => r.lossMaking).map((r) => r.orderNumber),
    lossMakingMinor: rows.filter((r) => r.lossMaking).reduce((a, r) => a + r.goodsMarginMinor, 0),
    byParcelClass: classes,
  };
}

/** Margin-account postings that are not against an order, per account. */
async function unattributedMargins(db, { from = null, to = null } = {}) {
  const args = [[...REVENUE_CODES, ...COST_CODES]];
  const where = [`le.account_code = any($1::text[])`, `(et.ref_type is null or et.ref_type <> 'order')`];
  if (from) {
    args.push(from);
    where.push(`et.occurred_at >= $${args.length}::timestamptz`);
  }
  if (to) {
    args.push(to);
    where.push(`et.occurred_at < ($${args.length}::timestamptz + interval '1 day')`);
  }

  const res = await db.query(
    `select le.account_code as code,
            sum(le.debit_minor) as debits,
            sum(le.credit_minor) as credits,
            count(*)::int as entries
       from ledger_entries le
       join ledger_transactions et on et.id = le.transaction_id
      where ${where.join(' and ')}
      group by le.account_code
      order by le.account_code`,
    args,
  );

  const isRevenue = new Set(REVENUE_CODES);
  let revenueMinor = 0;
  let costMinor = 0;
  const accounts = res.rows.map((r) => {
    const signed = isRevenue.has(r.code) ? num(r.credits) - num(r.debits) : num(r.debits) - num(r.credits);
    if (isRevenue.has(r.code)) revenueMinor += signed;
    else costMinor += signed;
    return { code: r.code, amountMinor: signed, entries: Number(r.entries) };
  });

  return { revenueMinor, costMinor, netMarginMinor: revenueMinor - costMinor, accounts };
}

/**
 * Orders + unattributed must equal the ledger, account by account. If it does
 * not, the report is not a report — it is a guess with a header row.
 */
async function tieOutMargins(db, { rows, unattributed }) {
  const perOrder = new Map();
  for (const r of rows) {
    perOrder.set(ACCOUNTS.COMMISSION_REVENUE, (perOrder.get(ACCOUNTS.COMMISSION_REVENUE) ?? 0) + r.commissionMinor);
    perOrder.set(ACCOUNTS.FULFILMENT_REVENUE, (perOrder.get(ACCOUNTS.FULFILMENT_REVENUE) ?? 0) + r.fulfilmentMinor);
    perOrder.set(ACCOUNTS.DELIVERY_REVENUE, (perOrder.get(ACCOUNTS.DELIVERY_REVENUE) ?? 0) + r.deliveryMinor);
    perOrder.set(ACCOUNTS.COD_REVENUE, (perOrder.get(ACCOUNTS.COD_REVENUE) ?? 0) + r.codMinor);
    perOrder.set(ACCOUNTS.COGS, (perOrder.get(ACCOUNTS.COGS) ?? 0) + r.cogsMinor);
    perOrder.set(ACCOUNTS.PACKAGING, (perOrder.get(ACCOUNTS.PACKAGING) ?? 0) + r.packagingMinor);
    perOrder.set(ACCOUNTS.LAST_MILE, (perOrder.get(ACCOUNTS.LAST_MILE) ?? 0) + r.lastMileMinor);
    perOrder.set(ACCOUNTS.PSP_FEES, (perOrder.get(ACCOUNTS.PSP_FEES) ?? 0) + r.pspFeeMinor);
    perOrder.set(ACCOUNTS.REFUNDS, (perOrder.get(ACCOUNTS.REFUNDS) ?? 0) + r.refundWriteOffMinor);
  }
  const unattributedBy = new Map(unattributed.accounts.map((a) => [a.code, a.amountMinor]));

  const accounts = [];
  let reconciles = true;
  for (const { code } of [...MARGIN_ACCOUNTS.revenue, ...MARGIN_ACCOUNTS.cost]) {
    const isRevenue = REVENUE_CODES.includes(code);
    const bookBalance = await balance(db, code); // debit minus credit
    const ledgerSide = isRevenue ? -bookBalance : bookBalance;
    const explained = (perOrder.get(code) ?? 0) + (unattributedBy.get(code) ?? 0);
    if (explained !== ledgerSide) reconciles = false;
    accounts.push({ code, ledgerMinor: ledgerSide, perOrderMinor: perOrder.get(code) ?? 0, unattributedMinor: unattributedBy.get(code) ?? 0, reconciles: explained === ledgerSide });
  }

  return { reconciles, accounts };
}

/** The seller view: what we earned on their goods, and what we owe them. */
export async function marginBySeller(db, { from = null, to = null } = {}) {
  const params = [];
  const where = [`le.seller_id is not null`, `le.account_code = any($1::text[])`];
  params.push([ACCOUNTS.COMMISSION_REVENUE, ACCOUNTS.FULFILMENT_REVENUE]);
  // $2 and $3 are the commission and fulfilment codes; the window follows them.
  const windowPlaceholder = () => 3 + params.length;
  if (from) {
    params.push(from);
    where.push(`le.occurred_at >= $${windowPlaceholder() - 1}::timestamptz`);
  }
  if (to) {
    params.push(to);
    where.push(`le.occurred_at < ($${windowPlaceholder() - 1}::timestamptz + interval '1 day')`);
  }

  const res = await db.query(
    `select le.seller_id,
            s.trading_name,
            sum(case when le.account_code = $2 then le.credit_minor - le.debit_minor else 0 end) as commission,
            sum(case when le.account_code = $3 then le.credit_minor - le.debit_minor else 0 end) as fulfil
       from ledger_entries le
       join sellers s on s.id = le.seller_id
      where ${where.join(' and ')}
      group by le.seller_id, s.trading_name
      order by le.seller_id`,
    [params[0], ACCOUNTS.COMMISSION_REVENUE, ACCOUNTS.FULFILMENT_REVENUE, ...params.slice(1)],
  );

  return res.rows.map((r) => {
    const commissionMinor = num(r.commission);
    const fulfilmentMinor = num(r.fulfil);
    return {
      sellerId: r.seller_id,
      tradingName: r.trading_name,
      commissionMinor,
      fulfilmentMinor,
      marketplaceRevenueMinor: commissionMinor + fulfilmentMinor,
    };
  });
}
