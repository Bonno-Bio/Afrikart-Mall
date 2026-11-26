import { createClient, applySchema } from '../src/db.js';
import { seed, IDS } from '../db/seed.js';

/** A clean database with the real schema and the real seed, per test. */
export async function freshDb() {
  // Always in memory, whatever PGLITE_DATA_DIR says: tests must never touch a
  // developer's working database.
  const db = await createClient({ memory: true });
  await applySchema(db);
  await seed(db);
  return db;
} // noqa

export { IDS };

export const items = (variantId, quantity) => [{ variantId, quantity }];

export async function stockOf(db, variantId) {
  const res = await db.query('select on_hand from inventory_levels where variant_id = $1', [variantId]);
  return Number(res.rows[0].on_hand);
}
