/**
 * Statement splitter for PostgreSQL DDL.
 *
 * We cannot split `schema.sql` on ";" because the file defines plpgsql
 * functions whose bodies contain semicolons inside $$ ... $$ blocks. A naive
 * split turns one function into four broken statements.
 *
 * This tracks three things simultaneously: dollar-quote tags ($fn$, $$),
 * single-quoted strings (with '' escapes), and line/block comments. That is
 * enough for the schema we actually ship, and it fails loudly rather than
 * silently producing half a function.
 */

export function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  const n = sql.length;
  let dollarTag = null;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }

    if (dollarTag) {
      current += ch;
      if (ch === '$' && sql.startsWith(dollarTag, i)) {
        current += dollarTag.slice(1);
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      i += 1;
      continue;
    }

    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      current += ch + next;
      i += 2;
      inLineComment = true;
      continue;
    }

    if (ch === '/' && next === '*') {
      current += ch + next;
      i += 2;
      inBlockComment = true;
      continue;
    }

    if (ch === "'") {
      current += ch;
      inSingle = true;
      i += 1;
      continue;
    }

    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === ';') {
      statements.push(current.trim());
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements.filter((s) => s.length > 0);
}

/**
 * `pgcrypto` is not bundled with PGlite. The schema asks for it only to get
 * `gen_random_uuid()`, which is core since PostgreSQL 13, so skipping this one
 * statement on the WASM engine changes nothing about the data model.
 */
export const EXTENSION_STATEMENTS = [/^create extension if not exists "?pgcrypto"?/i];
