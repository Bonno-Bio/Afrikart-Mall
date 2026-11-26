/**
 * Seed data.
 *
 * Deliberately tiny and deliberately real: one approved seller, one category,
 * one route with a vehicle that can actually carry the parcels, two addresses
 * at different levels of routability, and three products whose weights and
 * volumes are the real ones for this market.
 *
 * This seed is what the tests run against, so if the seed is unrealistic the
 * tests pass on a business that cannot exist.
 */

export const IDS = {
  customer: '11111111-1111-4111-8111-111111111111',
  sellerUser: '22222222-2222-4222-8222-222222222222',
  admin: '33333333-3333-4333-8333-333333333333',
  seller: '44444444-4444-4444-8444-444444444444',
  category: '55555555-5555-4555-8555-555555555555',
  routeWest: '66666666-6666-4666-8666-666666666666',
  addressVerified: '77777777-7777-4777-8777-777777777771',
  addressLandmark: '77777777-7777-4777-8777-777777777772',
  addressNoRoute: '77777777-7777-4777-8777-777777777773',
  productFormula: '88888888-8888-4888-8888-888888888881',
  productNappies: '88888888-8888-4888-8888-888888888882',
  productLotion: '88888888-8888-4888-8888-888888888883',
  variantFormula: '99999999-9999-4999-8999-999999999991',
  variantNappies: '99999999-9999-4999-8999-999999999992',
  variantLotion: '99999999-9999-4999-8999-999999999993',
  supplier: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  purchaseOrder: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
};

import { receivePurchaseOrder } from '../src/catalogue.js';
import { post, ACCOUNTS } from '../src/ledger.js';

export async function seed(db) {
  await db.query(
    `insert into users (id, email, phone, full_name, role) values
       ($1, 'amantle@example.com', '+26771000001', 'Amantle Sekgoma', 'customer'),
       ($2, 'naledi@naledibeauty.co.bw', '+26771000002', 'Naledi Kgosi', 'seller'),
       ($3, 'ops@afrikart.co.bw', '+26771000003', 'Afrikart Ops', 'admin')`,
    [IDS.customer, IDS.sellerUser, IDS.admin],
  );

  await db.query(
    `insert into sellers (id, owner_user_id, legal_name, trading_name, slug, city,
                          fulfilment_mode, can_list_express, commission_bps, fulfilment_bps, status, approved_at)
     values ($1, $2, 'Naledi Beauty Supply (Pty) Ltd', 'Naledi Beauty Supply', 'naledi-beauty',
             'Gaborone', 'afrikart', true, 1200, 600, 'approved', now())`,
    [IDS.seller, IDS.sellerUser],
  );

  await db.query(
    // 8% + 4%, not 12% + 6%: at one rate for the whole shop, all three opening
    // SKUs lost the seller money. Baby staples cannot carry an 18% take.
    `insert into categories (id, slug, name, licence_required, licence_authority, restricted_ingredients,
                             commission_bps, fulfilment_bps)
     values ($1, 'baby-mother', 'Baby & Mother', true, 'BOBS', '{}', 800, 400)`,
    [IDS.category],
  );

  const product = (id, title, tier = 'express') => [
    id,
    IDS.seller,
    IDS.category,
    title,
    'live',
    tier,
    'https://cdn.afrikart.co.bw/p/demo.jpg',
    'verified',
  ];

  await db.query(
    `insert into products
       (id, seller_id, category_id, title, status, catalog_tier, primary_image_url, compliance_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8), ($9,$10,$11,$12,$13,$14,$15,$16), ($17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      ...product(IDS.productFormula, 'Nan Optipro 3 Growing-Up Formula 400g'),
      ...product(IDS.productNappies, 'Pampers Baby-Dry Pants Medium 46s'),
      ...product(IDS.productLotion, 'Nivea Baby Gentle Lotion 200ml'),
    ],
  );

  // Real-world weights: a 400 g tin and its packaging, a case of nappies that
  // is mostly air, a bottle. The nappies are why a drops-only capacity model
  // fails (007 H2).
  await db.query(
    `insert into product_variants (id, product_id, sku, price_minor, weight_grams, volume_ml, parcel_class)
     values
       ($1, $2, 'NAN-OP3-400', 18900, 620, 1400, 'small'),
       ($3, $4, 'PAM-BDP-M46', 21500, 1450, 12000, 'bulky'),
       ($5, $6, 'NIV-BGL-200', 9800, 260, 700, 'small')`,
    [
      IDS.variantFormula,
      IDS.productFormula,
      IDS.variantNappies,
      IDS.productNappies,
      IDS.variantLotion,
      IDS.productLotion,
    ],
  );

  // Opening capital. A business with stock and no equity in its books cannot
  // tell you whether it is solvent, so the float goes in before the stock does.
  // Inside one transaction on purpose: the balance trigger is deferred to COMMIT,
  // so posting a two-sided entry outside a transaction is refused after the first
  // side lands. That is the constraint doing its job.
  await db.transaction(async (tx) =>
    post(tx, {
      kind: 'opening_capital',
      memo: 'founder float, pilot',
      entries: [
        { accountCode: ACCOUNTS.BANK, debit: 5000000 },
        { accountCode: '3000', credit: 5000000 },
      ],
    }),
  );

  // The shelf arrives the way it really will: a seller consigns stock to us at a
  // known cost, and a receipt moves the quantity. The stock is NOT our asset —
  // we hold it for someone else — so the receipt does not touch our ledger. B1
  // seeded stock as a bare number; this is the gap B2 closes.
  await db.query(
    `insert into suppliers (id, name, country, payment_terms_days, lead_time_days, min_order_minor, contact_name)
     values ($1, 'Naledi Beauty Supply — consignment', 'BW', 0, 5, 0, 'Naledi Kgosi')`,
    [IDS.supplier],
  );

  await db.query(
    `insert into purchase_orders (id, po_number, supplier_id, status, ordered_at, currency, total_minor, inventory_owner)
     values ($1, 'PO-2026-0001', $2, 'ordered', now() - interval '3 days', 'BWP', 0, 'seller')`,
    [IDS.purchaseOrder, IDS.supplier],
  );

  // Real buy prices against the real shelf prices: formula 189.00 sells for
  // 140.00, nappies 215.00 for 165.00, lotion 98.00 for 70.00. Freight is the
  // trip that actually happens, P450 for the load.
  for (const [variant, qty, unitCost] of [
    [IDS.variantFormula, 40, 14000],
    [IDS.variantNappies, 30, 16500],
    [IDS.variantLotion, 60, 7000],
  ]) {
    await db.query(
      `insert into purchase_order_lines (purchase_order_id, variant_id, quantity, unit_cost_minor)
       values ($1, $2, $3, $4)`,
      [IDS.purchaseOrder, variant, qty, unitCost],
    );
  }

  await db.query(`update purchase_orders set freight_minor = 45000, total_minor = 1475000 + 45000 where id = $1`, [
    IDS.purchaseOrder,
  ]);

  await receivePurchaseOrder(db, { poNumber: 'PO-2026-0001', note: 'opening stock' });

  // Bin locations are a warehouse fact, not an accounting one.
  for (const [variant, bin, seq] of [
    [IDS.variantFormula, 'B1-01', 1],
    [IDS.variantNappies, 'B1-02', 2],
    [IDS.variantLotion, 'B1-03', 3],
  ]) {
    await db.query(`update inventory_levels set bin_code = $2, pick_sequence = $3 where variant_id = $1`, [
      variant,
      bin,
      seq,
    ]);
  }

  // Packaging, bought once for the pilot and counted from then on. The recipe is
  // pilot packing practice: what actually goes into a parcel of each class.
  await db.query(
    `insert into packaging_materials (code, name, kind, unit_cost_minor, on_hand) values
       ('MAILER-S','Poly mailer, small','mailer',120,200),
       ('BOX-M','Carton, medium','box',450,120),
       ('FILLER-PK','Void fill, per parcel','filler',110,150),
       ('WRAP-BB','Bubble wrap sheet','wrap',240,100),
       ('LABEL-A4','Waybill label','label',35,2000),
       ('BAG-COLD','Insulated bag','cold',1800,20),
       ('GEL-ICE','Gel ice pack','cold',600,40)`,
  );

  await db.query(
    `insert into packaging_recipe (parcel_class, material_code, quantity) values
       ('small','MAILER-S',1), ('small','LABEL-A4',1),
       ('bulky','BOX-M',1), ('bulky','FILLER-PK',1), ('bulky','LABEL-A4',1),
       ('fragile','BOX-M',1), ('fragile','WRAP-BB',1), ('fragile','LABEL-A4',1),
       ('cold','BAG-COLD',1), ('cold','GEL-ICE',1), ('cold','LABEL-A4',1)`,
  );

  // The opening buy is a real purchase: stock in, cash out. P2,485 of cardboard
  // and labels, which is the most unglamorous line in the business and the one
  // that decides whether a 4% fulfilment fee is a margin.
  const openingPackaging = 200 * 120 + 120 * 450 + 150 * 110 + 100 * 240 + 2000 * 35 + 20 * 1800 + 40 * 600;
  await db.query(
    `insert into packaging_purchases (material_code, quantity, unit_cost_minor, total_minor, note)
     values ('MAILER-S', 200, 120, 24000, 'opening packaging buy'),
            ('BOX-M', 120, 450, 54000, 'opening packaging buy'),
            ('FILLER-PK', 150, 110, 16500, 'opening packaging buy'),
            ('WRAP-BB', 100, 240, 24000, 'opening packaging buy'),
            ('LABEL-A4', 2000, 35, 70000, 'opening packaging buy'),
            ('BAG-COLD', 20, 1800, 36000, 'opening packaging buy'),
            ('GEL-ICE', 40, 600, 24000, 'opening packaging buy')`,
  );
  await db.transaction(async (tx) =>
    post(tx, {
      kind: 'packaging_purchase',
      memo: 'opening packaging buy',
      entries: [
        { accountCode: ACCOUNTS.PACKAGING_STOCK, debit: openingPackaging },
        { accountCode: ACCOUNTS.BANK, credit: openingPackaging },
      ],
    }),
  );

  await db.query(
    `insert into routes (id, name, city, suburbs, daily_capacity, vehicle_class, max_weight_grams, max_volume_ml)
     values ($1, 'Gaborone West 1', 'Gaborone', array['Extension 12','Broadhurst'], 22, 'scooter', 40000, 80000)`,
    [IDS.routeWest],
  );

  await db.query(
    `insert into addresses (id, user_id, label, recipient, line1, suburb, city, phone, landmark,
                            address_confidence, is_default)
     values
       ($1, $4, 'Home', 'Amantle Sekgoma', 'Plot 1234', 'Extension 12', 'Gaborone', '+26771000001',
        'Opposite Extension 12 clinic', 'pin_and_landmark', true),
       ($2, $4, 'Work', 'Amantle Sekgoma', 'Plot 44', 'Broadhurst', 'Gaborone', '+26771000001',
        'Behind the Total filling station', 'landmark_only', false),
       ($3, $4, 'Mother', 'Mma Sekgoma', 'Plot 9', 'Molepolole', 'Molepolole', '+26771000004',
        'Next to the Kgotla', 'pin_and_landmark', false)`,
    [IDS.addressVerified, IDS.addressLandmark, IDS.addressNoRoute, IDS.customer],
  );

  return IDS;
}
