/**
 * Placing an order — the single most dangerous function in the company.
 *
 * It must do six things inside one database transaction, or none of them:
 *   1. take the stock (and prove it took it, under a row lock)
 *   2. write the order, its lines and its delivery
 *   3. record the address as it was, not as it will be
 *   4. create the payment intent
 *   5. emit the event other systems consume
 *   6. store the idempotent response
 *
 * Half an order is worse than no order: it charges a customer for goods another
 * customer bought, or it books a delivery for a parcel nobody picked.
 */
import { createHash } from 'node:crypto';
import { AppError } from './errors.js';
import { post, ACCOUNTS } from './ledger.js';
import { priceLines, priceDelivery, totalsFor, addressCanExpress, DELIVERY_SERVICES } from './pricing.js';

const PREPAID_METHODS = new Set(['card', 'orange_money', 'myzaka']);
const ALL_METHODS = new Set([...PREPAID_METHODS, 'cod']);

const PROVIDER_FOR = {
  card: 'psp_card',
  orange_money: 'orange_money',
  myzaka: 'myzaka',
  cod: 'cash',
};

const hashRequest = (body) => createHash('sha256').update(JSON.stringify(body)).digest('hex');

async function loadAddress(db, userId, addressId) {
  const res = await db.query(
    `select id, recipient, line1, line2, city, district, suburb, phone, lat, lng, landmark,
            access_notes, address_confidence
       from addresses
      where id = $1 and user_id = $2`,
    [addressId, userId],
  );
  const row = res.rows[0];
  if (!row) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'That delivery address is not on your account.');
  return row;
}

/**
 * Find the route that serves this suburb, and how loaded it already is.
 * Returns null when no route covers the address — which is a real answer, not
 * an internal error.
 */
async function routeFor(db, suburb, date) {
  if (!suburb) return null;
  const res = await db.query(
    `select r.id, r.name, r.vehicle_class, r.daily_capacity, r.max_weight_grams, r.max_volume_ml,
            coalesce(l.drops, 0)        as drops,
            coalesce(l.weight_grams, 0) as weight_grams,
            coalesce(l.volume_ml, 0)    as volume_ml
       from routes r
       left join route_load l
              on l.route_id = r.id and l.scheduled_date = $2::date
      where r.is_active and $1 = any(r.suburbs)
      order by r.daily_capacity desc
      limit 1`,
    [suburb, date],
  );
  return res.rows[0] ?? null;
}

function fits(route, { drops, weightGrams, volumeMl }) {
  return (
    Number(route.drops) + drops <= Number(route.daily_capacity) &&
    Number(route.weight_grams) + weightGrams <= Number(route.max_weight_grams) &&
    Number(route.volume_ml) + volumeMl <= Number(route.max_volume_ml)
  );
}

const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};

/** The first day this route can carry the parcel, starting tomorrow. */
export async function nextAvailableDate(db, suburb, parcel, { from = isoDate(new Date()) } = {}) {
  for (let offset = 1; offset <= 14; offset += 1) {
    const date = addDays(from, offset);
    const route = await routeFor(db, suburb, date);
    if (route && fits(route, parcel)) return date;
  }
  return null;
}

/**
 * Quote: exactly what the customer will be charged, and nothing they can edit.
 */
export async function quote(db, { userId, items, addressId, deliveryMethod = 'express', paymentMethod = 'card' }) {
  if (!ALL_METHODS.has(paymentMethod)) {
    throw new AppError(400, 'INVALID_PAYMENT_METHOD', `Unknown payment method "${paymentMethod}".`, {
      field: 'paymentMethod',
    });
  }
  if (!DELIVERY_SERVICES[deliveryMethod]) {
    throw new AppError(400, 'INVALID_DELIVERY_METHOD', `Unknown delivery method "${deliveryMethod}".`, {
      field: 'deliveryMethod',
    });
  }

  const lines = await priceLines(db, items);
  const subtotalMinor = lines.reduce((a, l) => a + l.lineSubtotalMinor, 0);

  const address = addressId ? await loadAddress(db, userId, addressId) : null;
  const city = address?.city ?? 'Gaborone';
  const parcel = {
    drops: 1,
    weightGrams: lines.reduce((a, l) => a + l.weightGrams, 0),
    volumeMl: lines.reduce((a, l) => a + l.volumeMl, 0),
  };

  const warnings = [];
  const tomorrow = addDays(isoDate(new Date()), 1);

  // Can we honestly promise tomorrow? Two independent answers: is there enough
  // information to find the address (007 H1), and does the route have room for
  // the parcel (007 H2).
  let expressAvailable = Boolean(address);
  let expressDate = null;
  let capacityLimited = false;

  if (address) {
    if (!addressCanExpress(address.address_confidence)) {
      expressAvailable = false;
      warnings.push({
        code: 'ADDRESS_NOT_READY_FOR_EXPRESS',
        message:
          'We cannot promise tomorrow to this address yet. Add a landmark or drop a pin and we will upgrade it.',
      });
    } else if (!address.suburb) {
      expressAvailable = false;
      warnings.push({ code: 'ADDRESS_INCOMPLETE', message: 'Add a suburb so we can put you on a route.' });
    } else {
      const route = await routeFor(db, address.suburb, tomorrow);
      if (!route) {
        expressAvailable = false;
        warnings.push({
          code: 'NO_ROUTE',
          message: `We do not have a route to ${address.suburb} yet — standard courier applies.`,
        });
      } else if (!fits(route, parcel)) {
        capacityLimited = true;
        expressDate = await nextAvailableDate(db, address.suburb, parcel);
        warnings.push({
          code: 'NEXT_DAY_OFFERED',
          message: expressDate
            ? `Tomorrow's route to ${address.suburb} is full. The next available day is ${expressDate}.`
            : `Tomorrow's route to ${address.suburb} is full and the next 14 days are booked.`,
        });
      } else {
        expressDate = tomorrow;
      }
    }
  }

  const expressPriced = priceDelivery({ lines, method: 'express', city, subtotalMinor, paymentMethod });
  const standardPriced = priceDelivery({ lines, method: 'standard', city, subtotalMinor, paymentMethod });

  const deliveryOptions = [];
  if (expressAvailable) {
    deliveryOptions.push({
      id: 'express',
      label: DELIVERY_SERVICES.express.label,
      feeMinor: expressPriced.feeMinor,
      availableDate: expressDate,
      capacity_limited: capacityLimited,
      eta: 'Tomorrow, 08:00-13:00',
    });
  }
  deliveryOptions.push({
    id: 'standard',
    label: DELIVERY_SERVICES.standard.label,
    feeMinor: standardPriced.feeMinor,
    availableDate: null,
    capacity_limited: false,
    eta: '2 working days',
  });

  const chosen = deliveryOptions.find((o) => o.id === deliveryMethod) ?? deliveryOptions[0];
  const delivery = deliveryMethod === 'express' ? expressPriced : standardPriced;
  const totals = totalsFor({ lines, deliveryFeeMinor: delivery.feeMinor, codFeeMinor: delivery.codFeeMinor });

  return {
    lines: lines.map((l) => ({
      variantId: l.variantId,
      title: l.title,
      sku: l.sku,
      unitPriceMinor: l.unitPriceMinor,
      quantity: l.quantity,
      lineSubtotalMinor: l.lineSubtotalMinor,
      vatMinor: l.vatMinor,
    })),
    subtotalMinor: totals.subtotalMinor,
    deliveryMinor: totals.deliveryMinor,
    codFeeMinor: totals.codFeeMinor,
    vatMinor: totals.vatMinor,
    totalMinor: totals.totalMinor,
    deliveryOptions,
    selectedDeliveryOption: chosen?.id ?? null,
    expressAvailable,
    codAllowed: paymentMethod === 'cod',
    freeDeliveryThresholdMinor: DELIVERY_SERVICES.express.freeOverMinor,
    warnings,
    // Internal — used by placeOrder, never returned to the browser.
    _internal: { lines, totals, delivery, address, expressAvailable, expressDate, parcel, city },
  };
}

export async function placeOrder(
  db,
  { userId, items, addressId, deliveryMethod = 'express', paymentMethod = 'card', idempotencyKey, scheduledDate },
) {
  if (!idempotencyKey) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header.', {
      field: 'Idempotency-Key',
    });
  }

  const requestBody = { userId, items, addressId, deliveryMethod, paymentMethod, scheduledDate };
  const requestHash = hashRequest(requestBody);

  return db.transaction(async (tx) => {
    // Claim the key first. A concurrent duplicate blocks on this insert and
    // then reads the finished response instead of placing a second order.
    const claimed = await tx.query(
      `insert into idempotency_keys (key, request_hash)
       values ($1, $2)
       on conflict (key) do nothing
       returning key`,
      [idempotencyKey, requestHash],
    );

    if (claimed.rows.length === 0) {
      const existing = await tx.query(
        `select request_hash, response, status_code from idempotency_keys where key = $1`,
        [idempotencyKey],
      );
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) {
        throw new AppError(409, 'IDEMPOTENCY_MISMATCH', 'That Idempotency-Key was used for a different request.');
      }
      if (row.response) {
        return { ...row.response, replayed: true };
      }
      throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'That request is still being processed.');
    }

    const result = await createOrder(tx, {
      userId,
      items,
      addressId,
      deliveryMethod,
      paymentMethod,
      scheduledDate,
    });

    await tx.query(
      `update idempotency_keys set response = $2, status_code = 201 where key = $1`,
      [idempotencyKey, JSON.stringify(result)],
    );

    return { ...result, replayed: false };
  });
}

async function createOrder(tx, { userId, items, addressId, deliveryMethod, paymentMethod, scheduledDate }) {
  const quoted = await quote(tx, { userId, items, addressId, deliveryMethod, paymentMethod });
  const { lines, totals, address, expressAvailable, expressDate, parcel } = quoted._internal;

  if (!address) throw new AppError(400, 'ADDRESS_REQUIRED', 'Choose a delivery address.', { field: 'addressId' });

  const express = deliveryMethod === 'express';
  if (express && !addressCanExpress(address.address_confidence)) {
    throw new AppError(
      422,
      'ADDRESS_NOT_ROUTABLE_FOR_EXPRESS',
      'This address has no verified pin or landmark, so we cannot promise next-day delivery to it.',
      { field: 'addressId', details: { addressConfidence: address.address_confidence, suggestedMethod: 'standard' } },
    );
  }

  let date = scheduledDate ?? null;
  let route = null;

  if (express) {
    // An explicit date that is full is a 422. No explicit date means "the next
    // day you can actually do", which is a date, not a refusal.
    const requested = date ?? expressDate ?? addDays(isoDate(new Date()), 1);
    route = await routeFor(tx, address.suburb, requested);
    if (!route) {
      throw new AppError(422, 'NO_ROUTE', `We do not yet have a route to ${address.suburb}.`, {
        field: 'addressId',
        details: { suggestedMethod: 'standard' },
      });
    }
    if (!fits(route, parcel)) {
      const next = await nextAvailableDate(tx, address.suburb, parcel);
      throw new AppError(422, 'ROUTE_FULL', `The ${address.suburb} route is full on ${requested}.`, {
        field: 'scheduledDate',
        details: { nextAvailableDate: next, capacity: Number(route.daily_capacity) },
      });
    }
    date = requested;
  }

  // Take the stock. Row lock first, then movement, then level — in that order,
  // so a concurrent order waits rather than reading a stale count.
  for (const line of lines) {
    const locked = await tx.query(
      `select on_hand, reserved from inventory_levels where variant_id = $1 for update`,
      [line.variantId],
    );
    const level = locked.rows[0];
    if (!level) throw new AppError(409, 'INVENTORY_MISSING', `No stock record for ${line.sku}.`);

    const available = Number(level.on_hand) - Number(level.reserved);
    if (available < line.quantity) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${Math.max(available, 0)} of "${line.title}" left.`, {
        field: 'items',
      });
    }

    await tx.query(
      `insert into inventory_movements (variant_id, delta, reason, ref_type, note)
       values ($1, $2, 'sold', 'order', $3)`,
      [line.variantId, -line.quantity, `sale:${line.sku}`],
    );
    await tx.query(
      `update inventory_levels set on_hand = on_hand - $2, updated_at = now() where variant_id = $1`,
      [line.variantId, line.quantity],
    );
  }

  const shippingAddress = {
    recipient: address.recipient,
    line1: address.line1,
    line2: address.line2,
    suburb: address.suburb,
    city: address.city,
    district: address.district,
    phone: address.phone,
    lat: address.lat,
    lng: address.lng,
    landmark: address.landmark,
    access_notes: address.access_notes,
    address_confidence: address.address_confidence,
  };

  const prepaid = PREPAID_METHODS.has(paymentMethod);

  const orderRes = await tx.query(
    `insert into orders
       (user_id, status, subtotal_minor, delivery_minor, cod_fee_minor, discount_minor,
        vat_minor, total_minor, shipping_address, delivery_method, placed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id, order_number, status, created_at`,
    [
      userId,
      prepaid ? 'pending_payment' : 'placed',
      totals.subtotalMinor,
      totals.deliveryMinor,
      totals.codFeeMinor,
      totals.discountMinor,
      totals.vatMinor,
      totals.totalMinor,
      JSON.stringify(shippingAddress),
      deliveryMethod,
      prepaid ? null : new Date().toISOString(),
    ],
  );
  const order = orderRes.rows[0];

  for (const line of lines) {
    await tx.query(
      `insert into order_items
         (order_id, variant_id, seller_id, title_snapshot, sku_snapshot, unit_price_minor, quantity,
          line_subtotal_minor, vat_rate_bps, vat_minor, commission_bps, fulfilment_bps,
          commission_minor, fulfilment_minor, seller_payable_minor)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        order.id,
        line.variantId,
        line.sellerId,
        line.title,
        line.sku,
        line.unitPriceMinor,
        line.quantity,
        line.lineSubtotalMinor,
        line.vatRateBps,
        line.vatMinor,
        line.commissionBps,
        line.fulfilmentBps,
        line.commissionMinor,
        line.fulfilmentMinor,
        line.sellerPayableMinor,
      ],
    );
  }

  if (express && route) {
    await tx.query(
      `insert into deliveries (order_id, route_id, status, scheduled_date)
       values ($1, $2, 'pending', $3)`,
      [order.id, route.id, date],
    );
  }

  const paymentRes = await tx.query(
    `insert into payments (order_id, provider, method, amount_minor, status)
     values ($1, $2, $3, $4, 'initiated')
     returning id, status`,
    [order.id, PROVIDER_FOR[paymentMethod], paymentMethod, totals.totalMinor],
  );

  await tx.query(
    `insert into order_events (order_id, event, detail, actor_type, actor_id)
     values ($1, $2, $3, 'customer', $4)`,
    [order.id, prepaid ? 'awaiting_payment' : 'placed', `${deliveryMethod}, ${paymentMethod}`, userId],
  );

  await tx.query(
    `insert into outbox_events (event_type, payload) values ('order.placed', $1)`,
    [JSON.stringify({ orderNumber: order.order_number, totalMinor: totals.totalMinor, paymentMethod })],
  );

  return {
    orderNumber: order.order_number,
    status: order.status,
    paymentId: paymentRes.rows[0].id,
    paymentMethod,
    deliveryMethod,
    scheduledDate: date,
    subtotalMinor: totals.subtotalMinor,
    deliveryMinor: totals.deliveryMinor,
    codFeeMinor: totals.codFeeMinor,
    vatMinor: totals.vatMinor,
    totalMinor: totals.totalMinor,
    lines: quoted.lines,
  };
}
