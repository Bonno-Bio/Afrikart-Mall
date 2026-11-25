/**
 * Pricing. Everything the customer sees is computed here, on the server, from
 * the database — never from the client's cart, never from a cached page.
 *
 * The rules come from docs/spec/delivery.md §2 and docs/002 §2.1:
 *   express   P30, free over P400, our own rider, next day   (Gaborone zone only)
 *   standard  P20, 2 working days                             (nationwide)
 *   pickup    P10, tomorrow after 14:00
 *   cod       +P15, modifier, Gaborone/Tlokweng/Mogoditshane only
 *
 * And two rules from the last-run audit that most quote engines get wrong:
 *   - an address we cannot route (007 H1) does not get Express, it gets an
 *     honest estimate plus a phone call;
 *   - a route that is full (007 H2) does not accept the order, it offers the
 *     next day.
 */
import { AppError } from './errors.js';
import { applyBps, vatFromInclusive, VAT_RATE_BPS } from './money.js';

export const DELIVERY_SERVICES = {
  express: { label: 'Afrikart Express', feeMinor: 3000, freeOverMinor: 40000, express: true },
  standard: { label: 'Standard courier', feeMinor: 2000, freeOverMinor: null, express: false },
  pickup: { label: 'Collect at a pickup point', feeMinor: 1000, freeOverMinor: null, express: false },
};

export const COD_FEE_MINOR = 1500;
export const COD_ZONE = ['Gaborone', 'Tlokweng', 'Mogoditshane'];

const EXPRESS_GRADES = new Set(['verified', 'pin_and_landmark', 'pin_only']);

/**
 * Resolve the cart against the database: price, seller rates, stock, and the
 * VAT split per line. Nothing the client sent is trusted beyond variant id and
 * quantity.
 */
export async function priceLines(db, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'CART_EMPTY', 'Your cart is empty.', { field: 'items' });
  }
  if (items.length > 40) {
    throw new AppError(400, 'CART_TOO_LARGE', 'That is more than one route can carry.', { field: 'items' });
  }

  const lines = [];
  for (const [index, item] of items.entries()) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
      throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a whole number from 1 to 50.', {
        field: `items[${index}].quantity`,
      });
    }

    const res = await db.query(
      `select v.id as variant_id, v.sku, v.price_minor, v.weight_grams, v.volume_ml, v.parcel_class,
              v.is_active,
              p.id as product_id, p.title, p.catalog_tier, p.status as product_status,
              s.id as seller_id, s.trading_name, s.commission_bps, s.fulfilment_bps,
              s.status as seller_status, s.can_list_express,
              il.on_hand, il.reserved
         from product_variants v
         join products p on p.id = v.product_id
         join sellers  s on s.id = p.seller_id
         left join inventory_levels il on il.variant_id = v.id
        where v.id = $1`,
      [item.variantId],
    );

    const row = res.rows[0];
    if (!row) {
      throw new AppError(404, 'VARIANT_NOT_FOUND', 'That item is no longer listed.', {
        field: `items[${index}].variantId`,
      });
    }
    if (!row.is_active || row.product_status !== 'live') {
      throw new AppError(409, 'ITEM_UNAVAILABLE', `"${row.title}" is not available right now.`, {
        field: `items[${index}].variantId`,
      });
    }
    if (row.seller_status !== 'approved') {
      throw new AppError(409, 'SELLER_UNAVAILABLE', `"${row.title}" cannot be sold right now.`, {
        field: `items[${index}].variantId`,
      });
    }

    const available = Number(row.on_hand ?? 0) - Number(row.reserved ?? 0);
    if (available < item.quantity) {
      throw new AppError(
        409,
        'INSUFFICIENT_STOCK',
        available === 0
          ? `"${row.title}" just sold out.`
          : `Only ${available} of "${row.title}" left.`,
        { field: `items[${index}].quantity` },
      );
    }

    const unitPriceMinor = Number(row.price_minor);
    const lineSubtotalMinor = unitPriceMinor * item.quantity;
    const { netMinor, vatMinor } = vatFromInclusive(lineSubtotalMinor);
    const commissionBps = Number(row.commission_bps);
    const fulfilmentBps = Number(row.fulfilment_bps);
    const commissionMinor = applyBps(netMinor, commissionBps);
    const fulfilmentMinor = applyBps(netMinor, fulfilmentBps);

    lines.push({
      variantId: row.variant_id,
      productId: row.product_id,
      sellerId: row.seller_id,
      sellerName: row.trading_name,
      title: row.title,
      sku: row.sku,
      quantity: item.quantity,
      unitPriceMinor,
      lineSubtotalMinor,
      vatRateBps: VAT_RATE_BPS,
      vatMinor,
      netMinor,
      commissionBps,
      fulfilmentBps,
      commissionMinor,
      fulfilmentMinor,
      sellerPayableMinor: netMinor - commissionMinor - fulfilmentMinor,
      catalogTier: row.catalog_tier,
      weightGrams: Number(row.weight_grams ?? 0) * item.quantity,
      volumeMl: Number(row.volume_ml ?? 0) * item.quantity,
      parcelClass: row.parcel_class,
    });
  }

  return lines;
}

export function priceDelivery({ lines, method, city, subtotalMinor, paymentMethod }) {
  const service = DELIVERY_SERVICES[method];
  if (!service) {
    throw new AppError(400, 'INVALID_DELIVERY_METHOD', `Unknown delivery method "${method}".`, {
      field: 'deliveryMethod',
    });
  }

  let feeMinor = service.feeMinor;
  if (service.freeOverMinor !== null && subtotalMinor >= service.freeOverMinor) feeMinor = 0;

  let codFeeMinor = 0;
  if (paymentMethod === 'cod') {
    if (!COD_ZONE.includes(city)) {
      throw new AppError(422, 'COD_NOT_AVAILABLE', 'Cash on delivery is not available outside Gaborone yet.', {
        field: 'paymentMethod',
      });
    }
    codFeeMinor = COD_FEE_MINOR;
  }

  return { ...service, feeMinor, codFeeMinor };
}

export function totalsFor({ lines, deliveryFeeMinor, codFeeMinor }) {
  const subtotalMinor = lines.reduce((a, l) => a + l.lineSubtotalMinor, 0);
  const lineVatMinor = lines.reduce((a, l) => a + l.vatMinor, 0);
  const deliveryVatMinor = vatFromInclusive(deliveryFeeMinor).vatMinor;
  const codVatMinor = vatFromInclusive(codFeeMinor).vatMinor;
  const vatMinor = lineVatMinor + deliveryVatMinor + codVatMinor;
  const totalMinor = subtotalMinor + deliveryFeeMinor + codFeeMinor;

  return {
    subtotalMinor,
    deliveryMinor: deliveryFeeMinor,
    codFeeMinor,
    discountMinor: 0,
    vatMinor,
    totalMinor,
    // Kept separately: the invoice needs the fee nets, and the ledger needs
    // them to balance against the revenue accounts.
    deliveryNetMinor: deliveryFeeMinor - deliveryVatMinor,
    deliveryVatMinor,
    codNetMinor: codFeeMinor - codVatMinor,
    codVatMinor,
    lineVatMinor,
  };
}

export const addressCanExpress = (confidence) => EXPRESS_GRADES.has(confidence);
