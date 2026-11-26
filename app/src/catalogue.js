/**
 * B2 — The Shelf.
 *
 * B1 could sell, but it could not tell you what a sale cost. Every margin it
 * reported was flattering, because cost of goods was never posted (AFR-37).
 * This module closes that: stock arrives priced, arrives counted, and its value
 * sits on the balance sheet as inventory (1100) until the parcel is delivered,
 * at which point it becomes cost of goods sold (5000).
 *
 * Three rules, and they are deliberately uncomfortable:
 *
 *   1. A landed cost is derived, never typed in. It is the weighted average of
 *      what was actually received, with the purchase order's freight and duty
 *      allocated across the lines by value. A number a human can edit is a
 *      number that will eventually be edited to make a margin look better.
 *
 *   2. Receiving stock is one transaction: quantities, the movement trail, the
 *      order status and the ledger. Half a receipt is how a stock count stops
 *      matching the books.
 *
 *   3. A product with no landed cost cannot go live. You may look at a draft,
 *      but you may not promise a price on something you have not costed — the
 *      first sale would otherwise book revenue with no cost of sale against it,
 *      which is the precise accounting lie this module exists to prevent.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';
import { vatFromInclusive, applyBps } from './money.js';

/**
 * Split a purchase order's freight and duty across its lines, pro rata by line
 * value, using largest-remainder so the allocations sum to exactly the amount
 * paid. A thebe of freight must not vanish because three lines each rounded down.
 *
 * @param {Array<{quantity: number, unitCostMinor: number}>} lines
 * @param {number} freightMinor
 * @param {number} dutyMinor
 * @returns {number[]} allocation per line, in minor units
 */
export function allocateCharges(lines, freightMinor, dutyMinor) {
  const charges = Number(freightMinor ?? 0) + Number(dutyMinor ?? 0);
  if (!Array.isArray(lines) || lines.length === 0) return [];
  if (charges === 0) return lines.map(() => 0);

  const values = lines.map((l) => Number(l.quantity) * Number(l.unitCostMinor));
  const base = values.reduce((a, v) => a + v, 0);

  // No value on the order means nothing to weight by: spread it evenly.
  const weights = base === 0 ? lines.map(() => 1) : values;
  const weightTotal = weights.reduce((a, v) => a + v, 0);

  const exact = weights.map((w) => (charges * w) / weightTotal);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = charges - floors.reduce((a, v) => a + v, 0);

  // Hand the leftover thebes to the lines with the largest fractional part.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder -= 1) {
    out[order[k].i] += 1;
  }
  return out;
}

/**
 * Landed unit cost per variant, from everything actually received.
 *
 * Weighted average across all received purchase orders, not "the latest cost":
 * a shop that re-costs on every delivery shows a margin that jumps for reasons
 * the owner cannot see. Returns a Map so callers cannot accidentally price a
 * SKU that was never received.
 *
 * @returns {Promise<Map<string, {unitCostMinor: number, quantity: number, valueMinor: number, purchaseOrders: number}>>}
 */
export async function landedCosts(db) {
  const res = await db.query(
    `select po.id            as po_id,
            po.po_number,
            po.freight_minor,
            po.duty_minor,
            l.variant_id,
            l.quantity,
            l.unit_cost_minor
       from purchase_orders po
       join purchase_order_lines l on l.purchase_order_id = po.id
      where po.status = 'received'
        and l.variant_id is not null
      order by po.id, l.id`,
  );

  const byPo = new Map();
  for (const row of res.rows) {
    if (!byPo.has(row.po_id)) {
      byPo.set(row.po_id, {
        freight: Number(row.freight_minor),
        duty: Number(row.duty_minor),
        owner: row.inventory_owner,
        lines: [],
      });
    }
    byPo.get(row.po_id).lines.push(row);
  }

  const totals = new Map();
  for (const po of byPo.values()) {
    const allocations = allocateCharges(
      po.lines.map((l) => ({ quantity: Number(l.quantity), unitCostMinor: Number(l.unit_cost_minor) })),
      po.freight,
      po.duty,
    );

    po.lines.forEach((line, i) => {
      const variantId = line.variant_id;
      const entry = totals.get(variantId) ?? {
        quantity: 0,
        valueMinor: 0,
        purchaseOrders: 0,
        ownedQuantity: 0,
        ownedValueMinor: 0,
      };
      entry.quantity += Number(line.quantity);
      entry.valueMinor += Number(line.quantity) * Number(line.unit_cost_minor) + allocations[i];
      entry.purchaseOrders += 1;
      if (po.owner === 'afrikart') {
        entry.ownedQuantity += Number(line.quantity);
        entry.ownedValueMinor += Number(line.quantity) * Number(line.unit_cost_minor) + allocations[i];
      }
      totals.set(variantId, entry);
    });
  }

  const out = new Map();
  for (const [variantId, entry] of totals) {
    out.set(variantId, {
      ...entry,
      unitCostMinor: Math.round(entry.valueMinor / entry.quantity),
    });
  }
  return out;
}

/**
 * Receive a purchase order into stock.
 *
 * Everything or nothing: the movements, the on-hand cache, the order status and
 * the ledger posting. The ledger posting is Dr Inventory 1100 / Cr Bank 1010
 * because the pilot buys for cash on delivery of stock. Buying on terms needs a
 * supplier-payable account that is not in the chart of accounts yet — when it
 * arrives, this is the function that changes, and only this one.
 */
export async function receivePurchaseOrder(db, { poNumber, note = null, receivedBy = null } = {}) {
  if (!poNumber) throw new AppError(400, 'PO_REQUIRED', 'Which purchase order?', { field: 'poNumber' });

  return db.transaction(async (tx) => {
    const poRes = await tx.query(
      `select id, po_number, status, supplier_id, freight_minor, duty_minor, inventory_owner
         from purchase_orders where po_number = $1 for update`,
      [poNumber],
    );
    const po = poRes.rows[0];
    if (!po) throw new AppError(404, 'PO_NOT_FOUND', `No purchase order ${poNumber}.`);

    if (po.status === 'received') {
      throw new AppError(409, 'PO_ALREADY_RECEIVED', `${poNumber} was already received into stock.`);
    }
    if (!['ordered', 'in_transit'].includes(po.status)) {
      throw new AppError(409, 'PO_NOT_RECEIVABLE', `A purchase order in "${po.status}" cannot be received.`);
    }

    const linesRes = await tx.query(
      `select id, variant_id, description, quantity, unit_cost_minor
         from purchase_order_lines where purchase_order_id = $1 order by id`,
      [po.id],
    );
    const lines = linesRes.rows;
    if (lines.length === 0) {
      throw new AppError(409, 'PO_EMPTY', `${poNumber} has no lines to receive.`);
    }

    const freight = Number(po.freight_minor);
    const duty = Number(po.duty_minor);
    const allocations = allocateCharges(
      lines.map((l) => ({ quantity: Number(l.quantity), unitCostMinor: Number(l.unit_cost_minor) })),
      freight,
      duty,
    );

    let goods = 0;
    const received = [];
    for (const [i, line] of lines.entries()) {
      goods += Number(line.quantity) * Number(line.unit_cost_minor);
      if (!line.variant_id) continue;

      await tx.query(
        `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, note, created_by)
         values ($1, $2, 'received', 'purchase_order', $3, $4, $5)`,
        [line.variant_id, Number(line.quantity), po.id, note ?? po.po_number, receivedBy],
      );

      // Upsert, because a first delivery has no level row yet and a second one
      // must add to the row that is already there.
      await tx.query(
        `insert into inventory_levels (variant_id, on_hand) values ($1, $2)
         on conflict (variant_id) do update
           set on_hand = inventory_levels.on_hand + excluded.on_hand,
               updated_at = now()`,
        [line.variant_id, Number(line.quantity)],
      );

      received.push({
        variantId: line.variant_id,
        quantity: Number(line.quantity),
        unitCostMinor: Number(line.unit_cost_minor),
        landedAllocationMinor: allocations[i],
      });
    }

    const total = goods + freight + duty;
    const owned = po.inventory_owner === 'afrikart';

    // Consignment does not move our money and does not become our asset. Only
    // stock we bought is debited to inventory; the seller's goods on our shelf
    // are counted, not capitalised.
    if (owned && total > 0) {
      await post(tx, {
        kind: 'inventory_receipt',
        refType: 'purchase_order',
        refId: po.id,
        memo: `received ${po.po_number}`,
        createdBy: receivedBy,
        entries: [
          { accountCode: ACCOUNTS.INVENTORY, debit: total },
          { accountCode: ACCOUNTS.BANK, credit: total },
        ],
      });
    }

    await tx.query(
      `update purchase_orders
          set status = 'received', received_at = now(), subtotal_minor = $2, total_minor = $3
        where id = $1`,
      [po.id, goods, total],
    );

    await tx.query(`insert into outbox_events (event_type, payload) values ('purchase_order.received', $1)`, [
      JSON.stringify({ poNumber: po.po_number, totalMinor: total, lines: received.length }),
    ]);

    return {
      poNumber: po.po_number,
      status: 'received',
      goodsMinor: goods,
      freightMinor: freight,
      dutyMinor: duty,
      totalMinor: total,
      inventoryOwner: po.inventory_owner,
      inventoryDebitedMinor: owned ? total : 0,
      lines: received,
    };
  });
}

/**
 * Publish a product to the shelf.
 *
 * The checks are the business rules from the spec, in the order a customer would
 * be harmed by breaking them: can we cost it, is it legal to sell, is there a
 * photograph, and can our vehicle actually carry it.
 */
export async function publishProduct(db, { productId, actorId = null } = {}) {
  if (!productId) throw new AppError(400, 'PRODUCT_REQUIRED', 'Which product?', { field: 'productId' });

  return db.transaction(async (tx) => {
    const productRes = await tx.query(
      `select p.id, p.title, p.status, p.catalog_tier, p.primary_image_url, p.compliance_status,
              p.compliance_doc_url, c.licence_required, c.name as category_name
         from products p
         join categories c on c.id = p.category_id
        where p.id = $1
        for update of p`,
      [productId],
    );
    const product = productRes.rows[0];
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
    if (product.status === 'live') {
      return { productId: product.id, status: 'live', alreadyLive: true };
    }
    if (!['draft', 'in_review', 'paused'].includes(product.status)) {
      throw new AppError(409, 'PRODUCT_NOT_PUBLISHABLE', `A product in "${product.status}" cannot be published.`);
    }

    const variantsRes = await tx.query(
      `select id, sku, price_minor, weight_grams, volume_ml, parcel_class
         from product_variants where product_id = $1 and is_active order by sku`,
      [product.id],
    );
    const variants = variantsRes.rows;
    if (variants.length === 0) {
      throw new AppError(422, 'NO_VARIANTS', `${product.title} has no active variant, so there is nothing to buy.`);
    }

    if (!product.primary_image_url) {
      throw new AppError(422, 'NO_IMAGE', `${product.title} has no primary photograph.`, {
        field: 'primaryImageUrl',
      });
    }

    if (product.licence_required && product.compliance_status !== 'verified') {
      throw new AppError(
        422,
        'COMPLIANCE_UNVERIFIED',
        `${product.title} is in a licensed category (${product.category_name}); its certificate must be on file first.`,
        { field: 'complianceStatus' },
      );
    }

    if (product.catalog_tier === 'express') {
      const uncarriable = variants.filter((v) => !v.weight_grams || !v.volume_ml);
      if (uncarriable.length > 0) {
        throw new AppError(
          422,
          'EXPRESS_NEEDS_DIMENSIONS',
          `Express needs a weight and a volume on every variant: ${uncarriable.map((v) => v.sku).join(', ')}.`,
        );
      }
    }

    // Rule 3: no costed stock, no listing.
    const costs = await landedCosts(tx);
    const uncosted = variants.filter((v) => !costs.has(v.id) || costs.get(v.id).unitCostMinor <= 0);
    if (uncosted.length > 0) {
      throw new AppError(
        422,
        'UNCOSTED_SKU',
        `Cannot publish ${product.title}: no received purchase order prices ${uncosted
          .map((v) => v.sku)
          .join(', ')}. A sale with no cost of sale is a fictional margin.`,
        { skus: uncosted.map((v) => v.sku) },
      );
    }

    await tx.query(`update products set status = 'live' where id = $1`, [product.id]);
    await tx.query(`insert into outbox_events (event_type, payload) values ('product.published', $1)`, [
      JSON.stringify({ productId: product.id, title: product.title, variants: variants.length }),
    ]);
    if (actorId) {
      await tx.query(
        `insert into audit_log (actor_id, action, entity_type, entity_id, after)
         values ($1, 'product.publish', 'product', $2, $3)`,
        [actorId, product.id, JSON.stringify({ variants: variants.length })],
      );
    }

    return {
      productId: product.id,
      status: 'live',
      variants: variants.map((v) => ({
        sku: v.sku,
        priceMinor: Number(v.price_minor),
        landedUnitCostMinor: costs.get(v.id).unitCostMinor,
      })),
      alreadyLive: false,
    };
  });
}

/**
 * The shelf as the operator sees it: price, real cost, real stock.
 *
 * The gap between shelf price and landed cost is the product's spread. For
 * consignment stock that spread belongs to the SELLER, not to us — our revenue
 * is commission and fulfilment. Calling it "margin" would be the exact
 * confusion this phase exists to end, so it is named `sellerSpread`.
 *
 * `costUnknown` is the honest flag: true when a live variant has no landed cost,
 * which makes its spread a guess rather than a fact.
 */
export async function shelfReport(db) {
  const [productsRes, costs] = await Promise.all([
    db.query(
      `select p.id as product_id, p.title, p.status, p.catalog_tier, p.seller_id, s.trading_name as seller,
              v.id as variant_id, v.sku, v.price_minor, v.parcel_class, v.ownership,
              coalesce(c.commission_bps, s.commission_bps) as commission_bps,
              coalesce(c.fulfilment_bps, s.fulfilment_bps) as fulfilment_bps,
              coalesce(l.on_hand, 0)  as on_hand,
              coalesce(l.reserved, 0) as reserved,
              l.bin_code
         from products p
         join sellers s on s.id = p.seller_id
         join categories c on c.id = p.category_id
         join product_variants v on v.product_id = p.id and v.is_active
         left join inventory_levels l on l.variant_id = v.id
        order by p.title, v.sku`,
    ),
    landedCosts(db),
  ]);

  const rows = productsRes.rows.map((row) => {
    const price = Number(row.price_minor);
    const cost = costs.get(row.variant_id)?.unitCostMinor ?? null;
    // What the seller actually receives: price minus VAT, minus our commission
    // and fulfilment fee. Comparing landed cost to the shelf price instead is
    // how a shop talks itself into a seller who cannot survive.
    const { netMinor } = vatFromInclusive(price);
    const sellerNetMinor =
      netMinor - applyBps(netMinor, Number(row.commission_bps)) - applyBps(netMinor, Number(row.fulfilment_bps));
    const sellerSpreadMinor = cost === null ? null : sellerNetMinor - cost;
    return {
      productId: row.product_id,
      title: row.title,
      seller: row.seller,
      status: row.status,
      catalogTier: row.catalog_tier,
      ownership: row.ownership,
      sku: row.sku,
      priceMinor: price,
      sellerNetMinor,
      landedUnitCostMinor: cost,
      sellerSpreadMinor,
      sellerSpreadBps:
        sellerSpreadMinor === null || sellerNetMinor === 0
          ? null
          : Math.round((sellerSpreadMinor / sellerNetMinor) * 10000),
      onHand: Number(row.on_hand),
      reserved: Number(row.reserved),
      available: Number(row.on_hand) - Number(row.reserved),
      binCode: row.bin_code,
      costUnknown: cost === null,
    };
  });

  const live = rows.filter((r) => r.status === 'live');
  return {
    rows,
    summary: {
      skus: rows.length,
      liveSkus: live.length,
      uncostedSkus: rows.filter((r) => r.costUnknown).map((r) => r.sku),
      // A seller losing money on every unit is a supplier who leaves in week
      // three. This is the list that has to be empty before a soft launch.
      sellersUnderwater: rows
        .filter((r) => r.status === 'live' && r.sellerSpreadMinor !== null && r.sellerSpreadMinor < 0)
        .map((r) => r.sku),
      // Our balance sheet only carries what we own. Consignment is counted, not
      // capitalised, and is reported separately so the difference stays visible.
      inventoryValueMinor: rows
        .filter((r) => r.ownership === 'afrikart')
        .reduce((a, r) => a + (r.landedUnitCostMinor ?? 0) * r.onHand, 0),
      consignmentValueMinor: rows
        .filter((r) => r.ownership !== 'afrikart')
        .reduce((a, r) => a + (r.landedUnitCostMinor ?? 0) * r.onHand, 0),
      lowStock: rows.filter((r) => r.available <= 12 && r.status === 'live').map((r) => r.sku),
    },
  };
}

/**
 * Post cost of goods sold for a delivered order.
 *
 * Called from the delivery transaction, so revenue and its cost land in the same
 * commit. If a line has no costed stock, we do not invent one: we post nothing,
 * return the SKU, and leave an audit trail saying the order's margin is not yet
 * a fact. An honest zero beats a guessed number.
 */
export async function postCogs(tx, { orderId, orderNumber }) {
  const linesRes = await tx.query(
    `select i.sku_snapshot as sku, i.variant_id, i.quantity, v.ownership
       from order_items i
       left join product_variants v on v.id = i.variant_id
      where i.order_id = $1 and i.status = 'active'`,
    [orderId],
  );
  const costs = await landedCosts(tx);

  let cogsMinor = 0;
  let sellerCostMinor = 0;
  const unresolved = [];
  for (const line of linesRes.rows) {
    const cost = line.variant_id ? costs.get(line.variant_id) : null;
    if (!cost || cost.unitCostMinor <= 0) {
      unresolved.push(line.sku ?? 'unknown-sku');
      continue;
    }
    const value = cost.unitCostMinor * Number(line.quantity);
    if (line.ownership === 'afrikart') cogsMinor += value;
    // The seller's goods are the seller's cost. We report it because it is the
    // number that tells us whether the seller can survive our commission, but
    // posting it as our expense would double-count what the payable already is.
    else sellerCostMinor += value;
  }

  if (cogsMinor > 0) {
    await post(tx, {
      kind: 'cogs',
      refType: 'order',
      refId: orderId,
      memo: `cost of goods ${orderNumber}`,
      entries: [
        { accountCode: ACCOUNTS.COGS, debit: cogsMinor },
        { accountCode: ACCOUNTS.INVENTORY, credit: cogsMinor },
      ],
    });
  }

  if (unresolved.length > 0) {
    await tx.query(
      `insert into audit_log (action, entity_type, entity_id, after)
       values ('cogs.unresolved', 'order', $1, $2)`,
      [orderId, JSON.stringify({ orderNumber, skus: unresolved })],
    );
  }

  return { cogsMinor, sellerCostMinor, unresolved };
}

/**
 * What the shop actually sees: the customer-facing shelf.
 *
 * Deliberately a different shape from `shelfReport`. Costs, stock levels and
 * seller identity are absent, because a public catalogue that leaks a landed
 * cost hands a competitor your entire margin structure in one request.
 */
export async function publicCatalogue(db, { sellerSlug = null } = {}) {
  const res = await db.query(
    `select p.id as product_id, p.title, p.brand, p.description, p.bullets, p.catalog_tier,
            p.primary_image_url, s.slug as seller_slug, s.trading_name as seller,
            c.slug as category_slug, c.name as category,
            v.id as variant_id, v.sku, v.option_values, v.price_minor, v.list_price_minor,
            v.parcel_class,
            least(
              coalesce(l.on_hand, 0) - coalesce(l.reserved, 0),
              coalesce(l.on_hand, 0)
            ) as available
       from products p
       join sellers s on s.id = p.seller_id and s.status = 'approved'
       join categories c on c.id = p.category_id
       join product_variants v on v.product_id = p.id and v.is_active
       left join inventory_levels l on l.variant_id = v.id
      where p.status = 'live'
        and ($1::text is null or s.slug = $1)
      order by p.title, v.sku`,
    [sellerSlug],
  );

  const products = new Map();
  for (const row of res.rows) {
    if (!products.has(row.product_id)) {
      products.set(row.product_id, {
        id: row.product_id,
        title: row.title,
        brand: row.brand,
        description: row.description,
        bullets: row.bullets,
        tier: row.catalog_tier,
        imageUrl: row.primary_image_url,
        seller: { slug: row.seller_slug, name: row.seller },
        category: { slug: row.category_slug, name: row.category },
        variants: [],
      });
    }
    products.get(row.product_id).variants.push({
      id: row.variant_id,
      sku: row.sku,
      options: row.option_values,
      priceMinor: Number(row.price_minor),
      listPriceMinor: row.list_price_minor === null ? null : Number(row.list_price_minor),
      parcelClass: row.parcel_class,
      inStock: Number(row.available) > 0,
    });
  }

  return { products: [...products.values()] };
}

/**
 * Realised margin per delivered order: what Afrikart kept against what the goods
 * cost. This is the number B1 could not compute and the one the weekly review
 * should be reading.
 */
export async function marginByOrder(db, { limit = 50 } = {}) {
  const res = await db.query(
    `with kept as (
       select t.ref_id as order_id, sum(e.credit_minor - e.debit_minor) as kept_minor
         from ledger_entries e
         join ledger_transactions t on t.id = e.transaction_id
        where e.account_code in ('4000','4010','4020','4030')
          and t.ref_type = 'order' and t.ref_id is not null
        group by t.ref_id
     ),
     cogs as (
       select t.ref_id as order_id, sum(e.debit_minor - e.credit_minor) as cogs_minor
         from ledger_entries e
         join ledger_transactions t on t.id = e.transaction_id
        where e.account_code = '5000'
          and t.ref_type = 'order' and t.ref_id is not null
        group by t.ref_id
     )
     select o.order_number,
            d.delivered_at,
            o.total_minor,
            coalesce(k.kept_minor, 0) as kept_minor,
            coalesce(c.cogs_minor, 0) as cogs_minor,
            coalesce(k.kept_minor, 0) - coalesce(c.cogs_minor, 0) as margin_minor,
            (u.n is null) as costed
       from orders o
       left join deliveries d on d.order_id = o.id
       left join kept k on k.order_id = o.id
       left join cogs c on c.order_id = o.id
       left join (
         select entity_id, count(*) as n from audit_log
          where action = 'cogs.unresolved' group by entity_id
       ) u on u.entity_id = o.id
      where o.status = 'delivered'
      order by d.delivered_at desc nulls last, o.order_number desc
      limit $1`,
    [limit],
  );

  const rows = res.rows.map((r) => ({
    orderNumber: r.order_number,
    deliveredAt: r.delivered_at,
    totalMinor: Number(r.total_minor),
    keptMinor: Number(r.kept_minor),
    cogsMinor: Number(r.cogs_minor),
    marginMinor: Number(r.margin_minor),
    costed: r.costed,
  }));

  return {
    rows,
    summary: {
      orders: rows.length,
      uncosted: rows.filter((r) => !r.costed).map((r) => r.orderNumber),
      keptMinor: rows.reduce((a, r) => a + r.keptMinor, 0),
      cogsMinor: rows.reduce((a, r) => a + r.cogsMinor, 0),
      marginMinor: rows.reduce((a, r) => a + r.marginMinor, 0),
    },
  };
}
