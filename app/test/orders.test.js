import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS, items, stockOf } from './helpers.js';
import { quote, placeOrder } from '../src/orders.js';

test('the quote is computed server-side and includes the VAT the price already contains', async () => {
  const db = await freshDb();
  try {
    const q = await quote(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 2),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
    });
    assert.equal(q.subtotalMinor, 37800); // 2 x P189.00
    assert.equal(q.deliveryMinor, 3000); // under P400, so P30
    assert.equal(q.totalMinor, 40800);
    assert.equal(q.vatMinor, 5010); // 14/114 of P408.00, rounded
    assert.equal(q.subtotalMinor + q.deliveryMinor + q.codFeeMinor, q.totalMinor);
  } finally {
    await db.close();
  }
});

test('delivery is free above P400 and the VAT follows the fee', async () => {
  const db = await freshDb();
  try {
    const q = await quote(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 3),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
    });
    assert.equal(q.subtotalMinor, 56700);
    assert.equal(q.deliveryMinor, 0);
    assert.equal(q.totalMinor, 56700);
    assert.equal(q.vatMinor, 6963);
  } finally {
    await db.close();
  }
});

test('a client cannot talk the price down: only variant id and quantity are read', async () => {
  const db = await freshDb();
  try {
    const q = await quote(db, {
      userId: IDS.customer,
      items: [{ variantId: IDS.variantFormula, quantity: 1, priceMinor: 1, unitPriceMinor: 1 }],
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
    });
    assert.equal(q.subtotalMinor, 18900);
  } finally {
    await db.close();
  }
});

test('placing an order takes the stock and writes the whole order inside one transaction', async () => {
  const db = await freshDb();
  try {
    const before = await stockOf(db, IDS.variantFormula);
    const order = await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 2),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'order-1',
    });

    assert.match(order.orderNumber, /^AK-\d+$/);
    assert.equal(order.status, 'pending_payment');
    assert.equal(await stockOf(db, IDS.variantFormula), before - 2);

    const lines = await db.query('select count(*)::int as n from order_items');
    assert.equal(lines.rows[0].n, 1);

    const delivery = await db.query(
      `select d.status, d.scheduled_date from deliveries d
        join orders o on o.id = d.order_id where o.order_number = $1`,
      [order.orderNumber],
    );
    assert.equal(delivery.rows[0].status, 'pending');
    assert.ok(delivery.rows[0].scheduled_date, 'express orders get a scheduled date');

    const movement = await db.query(
      `select delta, reason from inventory_movements where variant_id = $1 and reason = 'sold'`,
      [IDS.variantFormula],
    );
    assert.equal(movement.rows.length, 1);
    assert.equal(Number(movement.rows[0].delta), -2);

    const outbox = await db.query(`select count(*)::int as n from outbox_events where event_type = 'order.placed'`);
    assert.equal(outbox.rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('the same Idempotency-Key returns the same order and never takes stock twice', async () => {
  const db = await freshDb();
  try {
    const args = {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 2),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'same-key',
    };
    const first = await placeOrder(db, args);
    const second = await placeOrder(db, args);

    assert.equal(second.orderNumber, first.orderNumber);
    assert.equal(second.replayed, true);
    assert.equal(await stockOf(db, IDS.variantFormula), 38);

    const count = await db.query('select count(*)::int as n from orders');
    assert.equal(count.rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('reusing a key for a different cart is an error, not a silent second order', async () => {
  const db = await freshDb();
  try {
    await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'clash',
    });
    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantFormula, 5),
          addressId: IDS.addressVerified,
          deliveryMethod: 'express',
          paymentMethod: 'card',
          idempotencyKey: 'clash',
        }),
      /different request/,
    );
  } finally {
    await db.close();
  }
});

test('an order without an Idempotency-Key is refused', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantFormula, 1),
          addressId: IDS.addressVerified,
          deliveryMethod: 'express',
          paymentMethod: 'card',
        }),
      /Idempotency-Key/,
    );
  } finally {
    await db.close();
  }
});

test('you cannot sell stock you do not have, and the failed attempt writes nothing', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantFormula, 41),
          addressId: IDS.addressVerified,
          deliveryMethod: 'express',
          paymentMethod: 'card',
          idempotencyKey: 'too-many',
        }),
      /Only 40/,
    );
    assert.equal(await stockOf(db, IDS.variantFormula), 40);
    const orders = await db.query('select count(*)::int as n from orders');
    assert.equal(orders.rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test('two orders for the last unit: one wins, one is told the truth', async () => {
  const db = await freshDb();
  try {
    await db.query(`update inventory_levels set on_hand = 1 where variant_id = $1`, [IDS.variantLotion]);

    await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantLotion, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'race-a',
    });

    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantLotion, 1),
          addressId: IDS.addressVerified,
          deliveryMethod: 'express',
          paymentMethod: 'card',
          idempotencyKey: 'race-b',
        }),
      /sold out/,
    );
    assert.equal(await stockOf(db, IDS.variantLotion), 0);
  } finally {
    await db.close();
  }
});

test('an address we cannot route does not get a next-day promise', async () => {
  const db = await freshDb();
  try {
    const q = await quote(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 1),
      addressId: IDS.addressLandmark,
      deliveryMethod: 'express',
      paymentMethod: 'card',
    });
    assert.equal(q.deliveryOptions[0].id, 'standard');
    assert.equal(q.warnings[0].code, 'ADDRESS_NOT_READY_FOR_EXPRESS');

    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantFormula, 1),
          addressId: IDS.addressLandmark,
          deliveryMethod: 'express',
          paymentMethod: 'card',
          idempotencyKey: 'landmark-express',
        }),
      /cannot promise next-day/,
    );
  } finally {
    await db.close();
  }
});

test('a suburb with no route is a 422 with a suggestion, not a broken order', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantFormula, 1),
          addressId: IDS.addressNoRoute,
          deliveryMethod: 'express',
          paymentMethod: 'card',
          idempotencyKey: 'no-route',
        }),
      (err) => err.code === 'NO_ROUTE' && err.details.suggestedMethod === 'standard',
    );
  } finally {
    await db.close();
  }
});

test('a full route refuses the order and offers the next day', async () => {
  const db = await freshDb();
  try {
    await db.query(`update routes set daily_capacity = 4 where id = $1`, [IDS.routeWest]);
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    for (let i = 1; i <= 4; i += 1) {
      await placeOrder(db, {
        userId: IDS.customer,
        items: items(IDS.variantFormula, 1),
        addressId: IDS.addressVerified,
        deliveryMethod: 'express',
        paymentMethod: 'card',
        idempotencyKey: `cap-${i}`,
        scheduledDate: date,
      });
    }

    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantFormula, 1),
          addressId: IDS.addressVerified,
          deliveryMethod: 'express',
          paymentMethod: 'card',
          idempotencyKey: 'cap-5',
          scheduledDate: date,
        }),
      (err) => err.code === 'ROUTE_FULL' && typeof err.details.nextAvailableDate === 'string',
    );
  } finally {
    await db.close();
  }
});

test('a route can be full by weight while it still has drop capacity', async () => {
  const db = await freshDb();
  try {
    // 1,450 g per pack of nappies: a 2 kg scooter limit is one parcel, not 22.
    await db.query(`update routes set max_weight_grams = 2000 where id = $1`, [IDS.routeWest]);

    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantNappies, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'weight-1',
      scheduledDate: date,
    });

    await assert.rejects(
      () =>
        placeOrder(db, {
          userId: IDS.customer,
          items: items(IDS.variantNappies, 1),
          addressId: IDS.addressVerified,
          deliveryMethod: 'express',
          paymentMethod: 'card',
          idempotencyKey: 'weight-2',
          scheduledDate: date,
        }),
      (err) => err.code === 'ROUTE_FULL',
    );
  } finally {
    await db.close();
  }
});

test('without an explicit date, a full route moves the order to the next day instead of failing', async () => {
  const db = await freshDb();
  try {
    await db.query(`update routes set max_weight_grams = 2000 where id = $1`, [IDS.routeWest]);

    const first = await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantNappies, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'auto-1',
    });
    const second = await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantNappies, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'auto-2',
    });

    assert.notEqual(second.scheduledDate, first.scheduledDate);
    assert.ok(second.scheduledDate > first.scheduledDate);
  } finally {
    await db.close();
  }
});

test('cash on delivery is confined to the zone and carries its fee', async () => {
  const db = await freshDb();
  try {
    const gaborone = await quote(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'cod',
    });
    assert.equal(gaborone.codFeeMinor, 1500);
    assert.equal(gaborone.totalMinor, 18900 + 3000 + 1500);

    await assert.rejects(
      () =>
        quote(db, {
          userId: IDS.customer,
          items: items(IDS.variantFormula, 1),
          addressId: IDS.addressNoRoute,
          deliveryMethod: 'standard',
          paymentMethod: 'cod',
        }),
      (err) => err.code === 'COD_NOT_AVAILABLE',
    );
  } finally {
    await db.close();
  }
});

test('a COD order is placed immediately; a prepaid order waits for the money', async () => {
  const db = await freshDb();
  try {
    const codOrder = await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'cod',
      idempotencyKey: 'cod-1',
    });
    assert.equal(codOrder.status, 'placed');

    const cardOrder = await placeOrder(db, {
      userId: IDS.customer,
      items: items(IDS.variantFormula, 1),
      addressId: IDS.addressVerified,
      deliveryMethod: 'express',
      paymentMethod: 'card',
      idempotencyKey: 'card-1',
    });
    assert.equal(cardOrder.status, 'pending_payment');
  } finally {
    await db.close();
  }
});
