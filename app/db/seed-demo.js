/**
 * Seed a development database you can point curl at.
 *
 * Deliberately refuses to run against a non-empty database: a seed script that
 * quietly appends to a half-used database is how demo data ends up in a pilot.
 */
import { createClient, ensureSchema } from '../src/db.js';
import { seed, IDS } from './seed.js';

const db = await createClient();
await ensureSchema(db, { log: () => {} });

const existing = await db.query('select count(*)::int as n from users');
if (Number(existing.rows[0].n) > 0) {
  console.log('database already has users — refusing to seed. Drop the volume first.');
  await db.close();
  process.exit(0);
}

await seed(db);

console.log('seeded.');
console.log(`  customer   x-user-id: ${IDS.customer}`);
console.log(`  admin      x-user-id: ${IDS.admin}`);
console.log(`  address    verified:  ${IDS.addressVerified}`);
console.log(`  address    landmark:  ${IDS.addressLandmark}`);
console.log(`  address    no route:  ${IDS.addressNoRoute}`);
console.log(`  variants   formula ${IDS.variantFormula} / nappies ${IDS.variantNappies} / lotion ${IDS.variantLotion}`);

const skus = await db.query('select sku, price_minor from product_variants order by sku');
for (const row of skus.rows) console.log(`  ${row.sku.padEnd(14)} P${(Number(row.price_minor) / 100).toFixed(2)}`);

await db.close();
