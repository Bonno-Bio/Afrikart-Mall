/**
 * Apply db/schema.sql to whatever DATABASE_URL points at.
 *
 * There are no "migrations" yet, and that is deliberate: we have one schema and
 * one environment, and a migration framework before the first customer is a way
 * of feeling productive. The day there is a second environment, this file is
 * replaced by numbered migrations — not extended.
 */
import { createClient, applySchema, SCHEMA_PATH } from '../src/db.js';

const db = await createClient();
console.log(`migrating ${db.engine} from ${SCHEMA_PATH}`);

try {
  const { applied, skipped } = await applySchema(db, { log: (...a) => console.log(' ', ...a) });
  console.log(`done: ${applied} statements applied, ${skipped.length} skipped`);

  const check = await db.query(`
    select
      (select count(*) from information_schema.tables where table_schema = 'public') as tables,
      (select count(*) from chart_of_accounts) as accounts,
      (select count(*) from information_schema.views where table_schema = 'public') as views
  `);
  const row = check.rows[0];
  console.log(`  tables ${row.tables}, views ${row.views}, accounts ${row.accounts}`);
} catch (err) {
  console.error('\nmigration failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
