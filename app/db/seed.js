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
};

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
    `insert into categories (id, slug, name, licence_required, licence_authority, restricted_ingredients)
     values ($1, 'baby-mother', 'Baby & Mother', true, 'BOBS', '{}')`,
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

  for (const [variant, qty] of [
    [IDS.variantFormula, 40],
    [IDS.variantNappies, 30],
    [IDS.variantLotion, 60],
  ]) {
    await db.query(
      `insert into inventory_movements (variant_id, delta, reason, note) values ($1, $2, 'received', 'opening stock')`,
      [variant, qty],
    );
    await db.query(
      `insert into inventory_levels (variant_id, on_hand, bin_code, pick_sequence) values ($1, $2, $3, $4)`,
      [variant, qty, `B1-0${qty % 9}`, qty % 9],
    );
  }

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
