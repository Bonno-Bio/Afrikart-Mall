/**
 * Packaging is a real cost per parcel (AFR-51).
 *
 * Account 5030 "Packaging" has been in the chart since the first draft and
 * nothing ever posted to it. That is not a harmless empty account: it means every
 * fulfilment margin in this system was calculated with the box left out. The
 * fulfilment fee is 4% of the ex-VAT sale; a bulky parcel of nappies earns
 * P7.54 of it and costs P5.95 in cardboard, filler and a label before a rider
 * moves. That is a margin, but not the one the spreadsheet claimed.
 *
 * The model, chosen because it is the one that cannot lie:
 *
 *   - **Buying** packaging is Dr 1110 Packaging stock / Cr Bank. It is stock, not
 *     an expense, until it is used.
 *   - **Using** it on an order is Dr 5030 / Cr 1110, recorded against that order,
 *     so a parcel's cost is attributable and not a monthly guess.
 *   - **Running out** is not a reason to stop recording the cost, because the
 *     customer is at the door. The shortfall becomes Cr 2030 Packaging accrual —
 *     a real debt to a real supplier — never negative stock. Negative stock is
 *     the fiction that lets a warehouse believe it has boxes it does not.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';

/** Units that fit in one parcel of each class. Pilot packing, not a rule of physics. */
export const PARCEL_CAPACITY = { small: 8, bulky: 2, fragile: 2, cold: 4 };

/** Strictest wins: one cold item makes the parcel cold; one fragile item, fragile. */
export const CLASS_PRIORITY = ['cold', 'fragile', 'bulky', 'small'];

export function parcelClassFor(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return 'small';
  const present = new Set(lines.map((l) => l.parcelClass ?? l.parcel_class ?? 'small'));
  for (const cls of CLASS_PRIORITY) if (present.has(cls)) return cls;
  return 'small';
}

export function parcelsFor(parcelClass, units) {
  const capacity = PARCEL_CAPACITY[parcelClass] ?? PARCEL_CAPACITY.small;
  const count = Math.max(1, Math.ceil(Number(units || 0) / capacity));
  return count;
}

/** What a parcel of this class costs, from the recipe and the current quotes. */
export async function packagingQuote(db, { parcelClass, parcels = 1 } = {}) {
  const recipe = await db.query(
    `select r.material_code, r.quantity, m.name, m.unit_cost_minor, m.on_hand
       from packaging_recipe r join packaging_materials m on m.code = r.material_code
      where r.parcel_class = $1 and m.is_active
      order by r.material_code`,
    [parcelClass],
  );
  if (recipe.rows.length === 0) {
    throw new AppError(500, 'NO_PACKAGING_RECIPE', `There is no packaging recipe for "${parcelClass}" parcels.`);
  }

  const pieces = recipe.rows.map((r) => ({
    code: r.material_code,
    name: r.name,
    quantityPerParcel: Number(r.quantity),
    quantity: Number(r.quantity) * parcels,
    unitCostMinor: Number(r.unit_cost_minor),
    costMinor: Number(r.quantity) * parcels * Number(r.unit_cost_minor),
    onHand: Number(r.on_hand),
  }));

  return {
    parcelClass,
    parcels,
    costMinor: pieces.reduce((a, p) => a + p.costMinor, 0),
    costPerParcelMinor: pieces.reduce((a, p) => a + p.quantityPerParcel * p.unitCostMinor, 0),
    pieces,
  };
}

/**
 * Buy packaging into stock: Dr 1110 / Cr Bank.
 *
 * The unit cost on the invoice is what lands in stock; a supplier price rise is
 * then visible per material rather than smeared into an average nobody checks.
 */
export async function buyPackaging(db, { materialCode, quantity, unitCostMinor = null, actorId = null, note = null } = {}) {
  const qty = Number(quantity);
  if (!materialCode) throw new AppError(400, 'MATERIAL_REQUIRED', 'Which packaging material?', { field: 'materialCode' });
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    throw new AppError(422, 'INVALID_QUANTITY', 'Quantity must be a whole number above zero.', { field: 'quantity' });
  }

  return db.transaction(async (tx) => {
    const found = await tx.query(
      `select code, name, unit_cost_minor, on_hand from packaging_materials where code = $1 for update`,
      [materialCode],
    );
    const material = found.rows[0];
    if (!material) throw new AppError(404, 'MATERIAL_NOT_FOUND', `No packaging material ${materialCode}.`);

    const unitCost = unitCostMinor === null ? Number(material.unit_cost_minor) : Number(unitCostMinor);
    if (!Number.isSafeInteger(unitCost) || unitCost < 0) {
      throw new AppError(422, 'INVALID_COST', 'Unit cost must be a whole number of cents.', { field: 'unitCostMinor' });
    }
    const total = qty * unitCost;

    await tx.query(`update packaging_materials set on_hand = on_hand + $2, unit_cost_minor = $3 where code = $1`, [
      material.code,
      qty,
      unitCost,
    ]);

    const purchase = await tx.query(
      `insert into packaging_purchases (material_code, quantity, unit_cost_minor, total_minor, purchased_by, note)
       values ($1, $2, $3, $4, $5, $6)
       returning id, purchased_at`,
      [material.code, qty, unitCost, total, actorId, note],
    );

    if (total > 0) {
      await post(tx, {
        kind: 'packaging_purchase',
        refType: 'packaging_purchase',
        refId: purchase.rows[0].id,
        memo: `bought ${qty} x ${material.code}`,
        createdBy: actorId,
        entries: [
          { accountCode: ACCOUNTS.PACKAGING_STOCK, debit: total },
          { accountCode: ACCOUNTS.BANK, credit: total },
        ],
      });
    }

    return {
      purchaseId: purchase.rows[0].id,
      material: material.code,
      name: material.name,
      quantity: qty,
      unitCostMinor: unitCost,
      totalMinor: total,
      onHandAfter: Number(material.on_hand) + qty,
    };
  });
}

/**
 * Consume packaging for one order. Idempotent: an order is packed once, and
 * packing it again returns the record that already exists rather than charging
 * twice.
 *
 * **Must be called inside a transaction.** The ledger's balance check is
 * deferred to COMMIT, so a two-sided posting outside one is refused — which is
 * the constraint doing its job, and the reason `packAnOrder` exists for callers
 * that only have the order number.
 */
export async function packOrder(client, { orderId, orderNumber = null, actorId = null } = {}) {
  if (!orderId) throw new AppError(400, 'ORDER_REQUIRED', 'Which order?', { field: 'orderId' });

  const existing = await client.query(
    `select id, parcel_class, parcels, cost_minor, shortfall_minor, packed_at, pieces
       from packaging_consumptions where order_id = $1`,
    [orderId],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      orderNumber,
      alreadyPacked: true,
      consumptionId: row.id,
      parcelClass: row.parcel_class,
      parcels: Number(row.parcels),
      packagingCostMinor: Number(row.cost_minor),
      shortfallMinor: Number(row.shortfall_minor),
      pieces: row.pieces,
    };
  }

  const linesRes = await client.query(
    `select i.quantity, coalesce(v.parcel_class, 'small') as parcel_class
       from order_items i
       left join product_variants v on v.id = i.variant_id
      where i.order_id = $1 and i.status = 'active'`,
    [orderId],
  );
  const lines = linesRes.rows.map((r) => ({ quantity: Number(r.quantity), parcelClass: r.parcel_class }));
  const units = lines.reduce((a, l) => a + l.quantity, 0);
  const parcelClass = parcelClassFor(lines);
  const parcels = parcelsFor(parcelClass, units);

  const quote = await packagingQuote(client, { parcelClass, parcels });

  const consumed = [];
  let stockedValue = 0;
  let shortfallValue = 0;

  for (const piece of quote.pieces) {
    const snapshot = await client.query(
      `select on_hand, unit_cost_minor from packaging_materials where code = $1 for update`,
      [piece.code],
    );
    const material = snapshot.rows[0];
    const available = Number(material.on_hand);
    const needed = piece.quantity;
    const used = Math.min(needed, available);
    const short = needed - used;
    const unitCost = Number(material.unit_cost_minor);

    if (used > 0) {
      await client.query(`update packaging_materials set on_hand = on_hand - $2 where code = $1`, [piece.code, used]);
    }

    stockedValue += used * unitCost;
    shortfallValue += short * unitCost;
    consumed.push({
      code: piece.code,
      name: piece.name,
      needed,
      used,
      short,
      unitCostMinor: unitCost,
      costMinor: needed * unitCost,
    });
  }

  const cost = stockedValue + shortfallValue;

  const record = await client.query(
    `insert into packaging_consumptions
       (order_id, parcel_class, parcels, cost_minor, shortfall_minor, pieces, packed_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, packed_at`,
    [orderId, parcelClass, parcels, cost, shortfallValue, JSON.stringify(consumed), actorId],
  );

  // Dr 5030 for the whole parcel; the credit splits between stock we had and the
  // supplier we now owe, so the balance sheet says which it was.
  const entries = [{ accountCode: ACCOUNTS.PACKAGING, debit: cost }];
  if (stockedValue > 0) entries.push({ accountCode: ACCOUNTS.PACKAGING_STOCK, credit: stockedValue });
  if (shortfallValue > 0) entries.push({ accountCode: ACCOUNTS.PACKAGING_ACCRUAL, credit: shortfallValue });
  if (entries.length > 1) {
    await post(client, {
      kind: 'packaging_consumed',
      refType: 'order',
      refId: orderId,
      memo: `packed ${orderNumber ?? orderId} (${parcelClass} x${parcels})`,
      createdBy: actorId,
      entries,
    });
  }

  return {
    orderNumber,
    alreadyPacked: false,
    consumptionId: record.rows[0].id,
    parcelClass,
    parcels,
    units,
    packagingCostMinor: cost,
    stockedValueMinor: stockedValue,
    shortfallMinor: shortfallValue,
    pieces: consumed,
    packedAt: record.rows[0].packed_at,
  };
}

/** Pack by order number, opening the transaction that a posting needs. */
export async function packAnOrder(db, { orderNumber, actorId = null } = {}) {
  return db.transaction(async (tx) => {
    const orderRes = await tx.query(`select id, order_number from orders where order_number = $1`, [orderNumber]);
    const order = orderRes.rows[0];
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'That order does not exist.');
    return packOrder(tx, { orderId: order.id, orderNumber: order.order_number, actorId });
  });
}

/**
 * Does the fulfilment fee cover the box?
 *
 * This is the report 5030 exists for. It pairs, per packed order, the fulfilment
 * fee we charged with the packaging we actually used, and names every order where
 * the box cost more than the fee — before the rider, the fuel or the wages.
 */
export async function packagingReport(db, { limit = 50 } = {}) {
  const summary = await db.query(
    `select count(*)::int as orders_packed,
            coalesce(sum(pc.cost_minor), 0) as packaging_minor,
            coalesce(sum(pc.shortfall_minor), 0) as shortfall_minor,
            coalesce(sum(pc.parcels), 0) as parcels
       from packaging_consumptions pc`,
  );

  const vsFee = await db.query(
    `select o.order_number, pc.parcel_class, pc.parcels, pc.cost_minor, pc.shortfall_minor,
            coalesce(sum(i.fulfilment_minor), 0) as fulfilment_minor,
            coalesce(sum(i.line_subtotal_minor - i.vat_minor), 0) as gross_minor
       from packaging_consumptions pc
       join orders o on o.id = pc.order_id
       left join order_items i on i.order_id = o.id and i.status = 'active'
      group by o.order_number, pc.parcel_class, pc.parcels, pc.cost_minor, pc.shortfall_minor
      order by o.order_number desc
      limit $1`,
    [limit],
  );

  const rows = vsFee.rows.map((r) => ({
    orderNumber: r.order_number,
    parcelClass: r.parcel_class,
    parcels: Number(r.parcels),
    packagingCostMinor: Number(r.cost_minor),
    fulfilmentFeeMinor: Number(r.fulfilment_minor),
    packagingShortfallMinor: Number(r.shortfall_minor),
    // Negative means the fee did not buy the box. The rider is still to come.
    feeAfterPackagingMinor: Number(r.fulfilment_minor) - Number(r.cost_minor),
  }));

  const stock = await db.query(
    `select code, name, kind, unit_cost_minor, on_hand from packaging_materials order by kind, code`,
  );

  return {
    summary: {
      ordersPacked: summary.rows[0].orders_packed,
      parcels: Number(summary.rows[0].parcels),
      packagingCostMinor: Number(summary.rows[0].packaging_minor),
      packagingShortfallMinor: Number(summary.rows[0].shortfall_minor),
      fulfilmentFeeMinor: rows.reduce((a, r) => a + r.fulfilmentFeeMinor, 0),
      feeAfterPackagingMinor: rows.reduce((a, r) => a + r.feeAfterPackagingMinor, 0),
      // The list that has to be empty, or the 4% is priced wrong for that class.
      fulfilmentUnderwater: rows.filter((r) => r.feeAfterPackagingMinor < 0).map((r) => r.orderNumber),
      packagingStockValueMinor: stock.rows.reduce((a, r) => a + Number(r.unit_cost_minor) * Number(r.on_hand), 0),
    },
    rows,
    stock: stock.rows.map((r) => ({
      code: r.code,
      name: r.name,
      kind: r.kind,
      unitCostMinor: Number(r.unit_cost_minor),
      onHand: Number(r.on_hand),
      valueMinor: Number(r.unit_cost_minor) * Number(r.on_hand),
    })),
  };
}
