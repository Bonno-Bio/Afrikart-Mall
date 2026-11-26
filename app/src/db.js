/**
 * A single client surface over two engines:
 *
 *   - PGlite  — real PostgreSQL 16 compiled to WebAssembly. Used for local
 *               development and for the test suite, so tests run against the
 *               actual schema, the actual constraints, the actual triggers.
 *   - node-pg — a real Postgres server (Supabase in production).
 *
 * Both expose query(text, params) and transaction(fn). Nothing above this file
 * knows which engine it is talking to, and no application code contains SQL
 * dialect workarounds.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(here, '../../db/schema.sql');

/**
 * @param {{url?: string, memory?: boolean}} [opts]
 */
export async function createClient(opts = {}) {
  const url = opts.url ?? process.env.DATABASE_URL;

  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return {
      engine: 'postgres',
      async query(text, params) {
        const res = await pool.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount };
      },
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tx = {
            query: async (text, params) => {
              const res = await client.query(text, params);
              return { rows: res.rows, rowCount: res.rowCount };
            },
          };
          const out = await fn(tx);
          await client.query('COMMIT');
          return out;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');

  // With a data directory the database survives restarts (local development).
  // Without one it is in memory and disappears with the process (tests).
  const dataDir = opts.memory ? undefined : opts.dataDir ?? process.env.PGLITE_DATA_DIR ?? undefined;
  // PGlite's constructor is overloaded: a string first argument is a data
  // directory, an object is the options. Passing `undefined` as the directory
  // silently drops the extensions, which is how a working schema fails with
  // "type citext does not exist" for no obvious reason.
  const db = dataDir ? new PGlite(dataDir, { extensions: { citext } }) : new PGlite({ extensions: { citext } });

  return {
    engine: 'pglite',
    raw: db,
    async query(text, params) {
      const res = await db.query(text, params);
      return { rows: res.rows ?? [], rowCount: res.affectedRows ?? (res.rows ?? []).length };
    },
    async transaction(fn) {
      return db.transaction(async (tx) => {
        const wrapped = {
          query: async (text, params) => {
            const res = await tx.query(text, params);
            return { rows: res.rows ?? [], rowCount: res.affectedRows ?? (res.rows ?? []).length };
          },
        };
        return fn(wrapped);
      });
    },
    async close() {
      await db.close();
    },
  };
}

/**
 * Apply `db/schema.sql` to a client.
 *
 * `pgcrypto` is not bundled with PGlite. It is requested by the schema only for
 * `gen_random_uuid()`, which is core PostgreSQL since 13 — so on PGlite we skip
 * that one statement and say so, rather than shipping a different schema. On a
 * real server the statement runs and the extension is installed.
 */
export async function applySchema(client, { sql, log = () => {} } = {}) {
  const { splitStatements, EXTENSION_STATEMENTS } = await import('../db/split.js');
  const text = sql ?? (await readFile(SCHEMA_PATH, 'utf8'));
  const statements = splitStatements(text);

  let applied = 0;
  const skipped = [];

  for (const statement of statements) {
    const bare = statement
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*--.*$/gm, '')
      .trim();
    const isPgcrypto = EXTENSION_STATEMENTS.some((re) => re.test(bare));
    if (isPgcrypto && client.engine === 'pglite') {
      skipped.push(statement);
      continue;
    }
    try {
      await client.query(statement);
      applied += 1;
    } catch (err) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 120);
      const e = new Error(`Migration failed at statement ${applied + 1}: ${preview}\n${err.message}`);
      e.cause = err;
      throw e;
    }
  }

  log(`schema applied: ${applied} statements, ${skipped.length} skipped (pglite extensions)`);
  return { applied, skipped };
}

/**
 * Apply the schema only if the database is empty of it. The difference between
 * "migrate" (a deliberate act) and "make sure the tables are there" (a boot
 * step) matters once a volume persists between restarts.
 */
export async function ensureSchema(client, opts = {}) {
  const existing = await client.query(`select to_regclass('public.users') as t`);
  if (existing.rows[0]?.t) return { applied: 0, skipped: [], alreadyPresent: true };
  const result = await applySchema(client, opts);
  return { ...result, alreadyPresent: false };
}
