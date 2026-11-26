/**
 * Bulk import and stocktake.
 *
 * Two jobs that look administrative and are actually where a shop loses money
 * quietly. Ten SKUs typed by hand is a demo; forty entered through an API at
 * eleven at night is a typo factory, and a price missing a zero is not a typo
 * you discover before a customer does. And `on_hand` is a cache — the movements
 * are the truth — so the only thing that can put it back in line with the shelf
 * is a count, deliberately recorded.
 *
 * The rules here follow from that:
 *
 *   1. **All or nothing, with line numbers.** One bad row rejects the file. A
 *      half-imported catalogue is worse than no import: nobody knows which half.
 *   2. **Import never publishes.** A spreadsheet cannot certify a photograph or
 *      a BOBS registration. Everything arrives as a draft for a human to pass.
 *   3. **A count cannot drop below what is already promised.** Counted units
 *      below `reserved` means we have sold stock we do not have, and lowering
 *      the number does not fix that — it hides it.
 *   4. **Shrinkage is recorded, and priced, or flagged.** A variance on our own
 *      stock hits the P&L at landed cost. A variance on consignment stock is not
 *      our loss — the goods were never our asset — so it is reported for the
 *      seller, not posted as our expense.
 */
import { AppError } from './errors.js';
import { landedCosts } from './catalogue.js';
import { post, ACCOUNTS } from './ledger.js';

const ROLLBACK = Symbol('dry-run');

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * RFC4180-shaped enough for a spreadsheet export: quoted fields, doubled quotes
 * inside them, commas and newlines inside quotes, CRLF, and the byte-order mark
 * Excel writes whether you want it or not.
 */
export function parseCsv(text) {
  if (typeof text !== 'string') throw new AppError(400, 'CSV_NOT_TEXT', 'The import must be CSV text.');

  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop the trailing blank line every export ends with.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

const REQUIRED_COLUMNS = ['sku', 'title', 'category_slug', 'price'];
const OPTIONAL_COLUMNS = [
  'brand', 'description', 'weight_grams', 'parcel_class', 'list_price',
  'on_hand', 'bin_code', 'reorder_point', 'seller_slug',
];

/** "149.99" → 14999, or an error. Money in a spreadsheet is a string until proven otherwise. */
export function parsePula(value, field, line) {
  const raw = String(value ?? '').trim();
  if (raw === '') {
    return { error: `${line}: ${field} is empty.` };
  }
  const cleaned = raw.replace(/^P\s*/i, '').replace(/\s+/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { error: `${line}: ${field} "${raw}" is not a price (two decimal places at most, no currency symbols beyond P).` };
  }
  const [whole, frac = ''] = cleaned.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor < 0) {
    return { error: `${line}: ${field} "${raw}" is out of range.` };
  }
  return { value: minor };
}

function parseCount(value, field, line, { allowZero = true } = {}) {
  const raw = String(value ?? '').trim();
  if (raw === '') return { error: `${line}: ${field} is empty.` };
  if (!/^\d+$/.test(raw)) return { error: `${line}: ${field} "${raw}" is not a whole number.` };
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || (!allowZero && n === 0)) {
    return { error: `${line}: ${field} "${raw}" is out of range.` };
  }
  return { value: n };
}

/**
 * Turn CSV text into validated rows. No database access: this is the part that
 * can be run against a file from a supplier before anything touches the shop.
 */
export function readCatalogueCsv(csv) {
  const table = parseCsv(csv);
  if (table.length === 0) throw new AppError(400, 'CSV_EMPTY', 'The file has no rows.');

  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new AppError(400, 'CSV_MISSING_COLUMNS', `The file is missing required column(s): ${missing.join(', ')}.`, {
      details: { missing, required: REQUIRED_COLUMNS, optional: OPTIONAL_COLUMNS },
    });
  }
  const unknown = header.filter((h) => h !== '' && !REQUIRED_COLUMNS.includes(h) && !OPTIONAL_COLUMNS.includes(h));
  if (unknown.length > 0) {
    // A misspelled optional column silently becomes "not supplied", which is how
    // a price or a weight vanishes between the spreadsheet and the shelf.
    throw new AppError(400, 'CSV_UNKNOWN_COLUMNS', `Unknown column(s): ${unknown.join(', ')}.`, { details: { unknown } });
  }

  const rows = [];
  const errors = [];
  const seen = new Map();

  for (let i = 1; i < table.length; i += 1) {
    const line = `line ${i + 1}`;
    const record = {};
    table[i].forEach((value, index) => {
      const key = header[index];
      if (key) record[key] = value;
    });

    const row = { line: i + 1 };

    for (const key of ['sku', 'title', 'category_slug']) {
      const v = String(record[key] ?? '').trim();
      if (!v) errors.push(`${line}: ${key} is required.`);
      row[key] = v;
    }

    if (row.sku) {
      row.sku = row.sku.toUpperCase();
      if (seen.has(row.sku)) {
        errors.push(`${line}: sku ${row.sku} appears twice (first on line ${seen.get(row.sku)}).`);
      } else {
        seen.set(row.sku, i + 1);
      }
    }

    const price = parsePula(record.price, 'price', line);
    if (price.error) errors.push(price.error);
    else row.priceMinor = price.value;

    if (String(record.list_price ?? '').trim() !== '') {
      const list = parsePula(record.list_price, 'list_price', line);
      if (list.error) errors.push(list.error);
      else row.listPriceMinor = list.value;
      if (!list.error && !price.error && row.listPriceMinor < row.priceMinor) {
        errors.push(`${line}: list_price is below price. A crossed-out price that is lower than the price is a lie on the shelf.`);
      }
    }

    if (String(record.weight_grams ?? '').trim() !== '') {
      const w = parseCount(record.weight_grams, 'weight_grams', line, { allowZero: false });
      if (w.error) errors.push(w.error);
      else row.weightGrams = w.value;
    }

    if (String(record.on_hand ?? '').trim() !== '') {
      const q = parseCount(record.on_hand, 'on_hand', line, { allowZero: false });
      if (q.error) errors.push(q.error);
      else row.onHand = q.value;
    }

    if (String(record.reorder_point ?? '').trim() !== '') {
      const r = parseCount(record.reorder_point, 'reorder_point', line);
      if (r.error) errors.push(r.error);
      else row.reorderPoint = r.value;
    }

    const parcel = String(record.parcel_class ?? '').trim().toLowerCase();
    if (parcel && !['small', 'bulky', 'fragile', 'cold'].includes(parcel)) {
      errors.push(`${line}: parcel_class "${parcel}" must be small, bulky, fragile or cold.`);
    }
    row.parcelClass = parcel || 'small';

    row.brand = String(record.brand ?? '').trim() || null;
    row.description = String(record.description ?? '').trim() || null;
    row.binCode = String(record.bin_code ?? '').trim() || null;
    row.sellerSlug = String(record.seller_slug ?? '').trim().toLowerCase() || null;

    rows.push(row);
  }

  return { header, rows, errors };
}

// ---------------------------------------------------------------------------
// Catalogue import
// ---------------------------------------------------------------------------

/**
 * Import a catalogue CSV as drafts.
 *
 * `sellerSlug` applies to the whole file unless a row names its own
 * `seller_slug`. An existing SKU is updated only within its own seller: silently
 * moving a SKU between sellers would move the sales history, the payable and the
 * returns liability with it.
 */
export async function importCatalogue(db, { csv, sellerSlug = null, actorId = null, dryRun = false } = {}) {
  const { rows, errors } = readCatalogueCsv(csv);
  if (rows.length === 0 && errors.length === 0) {
    throw new AppError(400, 'CSV_NO_ROWS', 'The file has a header and nothing else.');
  }
  if (errors.length > 0) {
    throw new AppError(422, 'IMPORT_INVALID', `${errors.length} problem(s) in the file; nothing was imported.`, { details: { errors } });
  }

  const report = { total: rows.length, created: 0, updated: 0, untouchedProducts: 0, lines: [], warnings: [] };

  try {
    await db.transaction(async (tx) => {
      const categories = new Map();
      const sellers = new Map();

      const categoryRes = await tx.query(`select id, slug from categories`);
      for (const c of categoryRes.rows) categories.set(String(c.slug).toLowerCase(), c.id);
      const sellerRes = await tx.query(`select id, slug from sellers`);
      for (const s of sellerRes.rows) sellers.set(String(s.slug).toLowerCase(), s.id);

      const rowErrors = [];
      for (const row of rows) {
        const slug = row.sellerSlug ?? (sellerSlug ? String(sellerSlug).toLowerCase() : null);
        if (!slug) {
          rowErrors.push(`line ${row.line}: no seller. Pass a seller_slug column or name one for the file.`);
          continue;
        }
        if (!sellers.has(slug)) {
          rowErrors.push(`line ${row.line}: no seller with slug "${slug}".`);
          continue;
        }
        if (!categories.has(row.category_slug.toLowerCase())) {
          rowErrors.push(`line ${row.line}: no category with slug "${row.category_slug}".`);
          continue;
        }
      }
      if (rowErrors.length > 0) {
        throw new AppError(422, 'IMPORT_INVALID', `${rowErrors.length} problem(s) in the file; nothing was imported.`, {
          details: { errors: rowErrors },
        });
      }

      for (const row of rows) {
        const slug = row.sellerSlug ?? String(sellerSlug).toLowerCase();
        const sellerId = sellers.get(slug);
        const categoryId = categories.get(row.category_slug.toLowerCase());

        const existing = await tx.query(
          `select v.id as variant_id, v.product_id, p.seller_id, p.title
             from product_variants v join products p on p.id = v.product_id
            where v.sku = $1`,
          [row.sku],
        );

        if (existing.rows.length > 0) {
          const found = existing.rows[0];
          if (found.seller_id !== sellerId) {
            throw new AppError(409, 'SKU_OTHER_SELLER', `line ${row.line}: ${row.sku} already belongs to another seller.`, {
              details: { sku: row.sku },
            });
          }

          await tx.query(
            `update product_variants
                set price_minor = $2,
                    list_price_minor = $3,
                    weight_grams = coalesce($4, weight_grams),
                    parcel_class = $5,
                    is_active = true
              where id = $1`,
            [found.variant_id, row.priceMinor, row.listPriceMinor ?? null, row.weightGrams ?? null, row.parcelClass],
          );

          await tx.query(
            `update products set title = $2, brand = coalesce($3, brand), description = coalesce($4, description)
              where id = $1`,
            [found.product_id, row.title, row.brand, row.description],
          );

          if (row.onHand !== undefined) {
            // Stock does not arrive through a price list. Silently overwriting
            // on-hand here is how a shop sells units it does not have.
            report.warnings.push(
              `line ${row.line}: on_hand ignored for existing SKU ${row.sku}; record stock through a stocktake or a goods receipt.`,
            );
          }

          report.updated += 1;
          report.lines.push({ line: row.line, sku: row.sku, action: 'updated', priceMinor: row.priceMinor });
          continue;
        }

        const productRes = await tx.query(
          `insert into products (seller_id, category_id, title, brand, description, status, catalog_tier)
           values ($1, $2, $3, $4, $5, 'draft', 'marketplace')
           returning id`,
          [sellerId, categoryId, row.title, row.brand, row.description],
        );
        const productId = productRes.rows[0].id;

        const variantRes = await tx.query(
          `insert into product_variants (product_id, sku, price_minor, list_price_minor, weight_grams, parcel_class)
           values ($1, $2, $3, $4, $5, $6)
           returning id`,
          [productId, row.sku, row.priceMinor, row.listPriceMinor ?? null, row.weightGrams ?? null, row.parcelClass],
        );
        const variantId = variantRes.rows[0].id;

        if (row.onHand !== undefined || row.binCode) {
          await tx.query(
            `insert into inventory_levels (variant_id, on_hand, bin_code, reorder_point)
             values ($1, $2, $3, coalesce($4, 12))`,
            [variantId, row.onHand ?? 0, row.binCode, row.reorderPoint ?? null],
          );
        }
        if (row.onHand !== undefined) {
          await tx.query(
            `insert into inventory_movements (variant_id, delta, reason, ref_type, note, created_by)
             values ($1, $2, 'received', 'import', $3, $4)`,
            [variantId, row.onHand, `opening stock from import`, actorId],
          );
        }

        report.created += 1;
        report.lines.push({ line: row.line, sku: row.sku, action: 'created', priceMinor: row.priceMinor });
      }

      if (dryRun) throw ROLLBACK;

      await tx.query(
        `insert into outbox_events (event_type, payload) values ('catalogue.imported', $1)`,
        [JSON.stringify({ created: report.created, updated: report.updated, sellerSlug: sellerSlug ?? 'mixed' })],
      );
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }

  return {
    ...report,
    dryRun,
    note: 'Imported products are drafts. A draft goes live only through publish, which requires a photograph and, in a regulated category, registration on file.',
  };
}

// ---------------------------------------------------------------------------
// Stocktake
// ---------------------------------------------------------------------------

/**
 * Recount stock and record the difference.
 *
 * `counts` is `[{ sku, counted }]` — what a person actually saw on the shelf.
 * Every variance becomes an `inventory_movements` row, because the cache is
 * repaired by evidence, not by an update statement.
 */
export async function runStocktake(db, { counts, note = null, actorId = null, dryRun = false } = {}) {
  if (!Array.isArray(counts) || counts.length === 0) {
    throw new AppError(400, 'STOCKTAKE_EMPTY', 'A stocktake needs at least one counted SKU.', { field: 'counts' });
  }

  const normalised = counts.map((entry, index) => {
    const sku = String(entry?.sku ?? '').trim().toUpperCase();
    const counted = Number(entry?.counted);
    if (!sku) throw new AppError(422, 'STOCKTAKE_INVALID', `counts[${index}]: sku is required.`);
    if (!Number.isSafeInteger(counted) || counted < 0) {
      throw new AppError(422, 'STOCKTAKE_INVALID', `counts[${index}]: counted must be a whole number, 0 or more.`);
    }
    return { sku, counted };
  });

  if (new Set(normalised.map((n) => n.sku)).size !== normalised.length) {
    throw new AppError(422, 'STOCKTAKE_INVALID', 'The same SKU is counted twice; one count per SKU, please.');
  }

  const landed = await landedCosts(db);

  const report = { counted: normalised.length, unchanged: 0, adjusted: 0, variances: [], dryRun };
  let shrinkageMinor = 0;

  try {
    await db.transaction(async (tx) => {
      for (const entry of normalised) {
        const found = await tx.query(
          `select v.id as variant_id, v.sku, v.ownership, v.price_minor,
                  coalesce(l.on_hand, 0) as on_hand, coalesce(l.reserved, 0) as reserved
             from product_variants v
             left join inventory_levels l on l.variant_id = v.id
            where v.sku = $1
            for update of v`,
          [entry.sku],
        );
        if (found.rows.length === 0) {
          throw new AppError(404, 'SKU_NOT_FOUND', `No SKU ${entry.sku}.`, { details: { sku: entry.sku } });
        }

        const row = found.rows[0];
        const onHand = Number(row.on_hand);
        const reserved = Number(row.reserved);

        if (entry.counted < reserved) {
          // Counting away promised units does not create them. It only removes
          // the warning that would have made somebody look.
          throw new AppError(
            409,
            'COUNT_BELOW_RESERVED',
            `${entry.sku}: ${reserved} unit(s) are reserved for orders but only ${entry.counted} were counted. ` +
              'Find the units or cancel the order; the count cannot be lowered below what is already owed.',
            { details: { sku: entry.sku, reserved, counted: entry.counted } },
          );
        }

        const delta = entry.counted - onHand;
        if (delta === 0) {
          report.unchanged += 1;
          continue;
        }

        await tx.query(
          `insert into inventory_movements (variant_id, delta, reason, ref_type, note, created_by)
           values ($1, $2, 'adjusted', 'stocktake', $3, $4)`,
          [row.variant_id, delta, note ?? `counted ${entry.counted}, system said ${onHand}`, actorId],
        );

        await tx.query(
          `insert into inventory_levels (variant_id, on_hand) values ($1, $2)
           on conflict (variant_id) do update set on_hand = excluded.on_hand, updated_at = now()`,
          [row.variant_id, entry.counted],
        );

        const cost = landed.get(row.variant_id)?.unitCostMinor ?? null;
        const owned = row.ownership === 'afrikart';
        const varianceValueMinor = cost === null ? null : Math.abs(delta) * cost;

        if (owned) {
          if (cost === null) {
            report.warnings = report.warnings ?? [];
            report.warnings.push(
              `${entry.sku}: owned stock adjusted with no landed cost on file; ${Math.abs(delta)} unit(s) unvalued.`,
            );
          } else {
            const value = varianceValueMinor;
            if (delta < 0) {
              shrinkageMinor += value;
              await post(tx, {
                kind: 'stock_shrinkage',
                refType: 'stocktake',
                refId: null,
                memo: `shrinkage ${entry.sku} x${Math.abs(delta)}`,
                createdBy: actorId,
                entries: [
                  { accountCode: ACCOUNTS.SHRINKAGE, debit: value },
                  { accountCode: ACCOUNTS.INVENTORY, credit: value },
                ],
              });
            } else {
              await post(tx, {
                kind: 'stock_gain',
                refType: 'stocktake',
                refId: null,
                memo: `found ${entry.sku} x${delta}`,
                createdBy: actorId,
                entries: [
                  { accountCode: ACCOUNTS.INVENTORY, debit: value },
                  { accountCode: ACCOUNTS.SHRINKAGE, credit: value },
                ],
              });
            }
          }
        }

        report.adjusted += 1;
        report.variances.push({
          sku: entry.sku,
          system: onHand,
          counted: entry.counted,
          delta,
          ownership: row.ownership,
          // Consignment variance is the seller's loss, not ours: the goods were
          // never our asset, so posting it to our P&L would be a fiction.
          postedMinor: owned ? varianceValueMinor ?? 0 : 0,
          sellerNotified: owned ? null : 'report to seller statement',
        });
      }

      if (dryRun) throw ROLLBACK;

      await tx.query(
        `insert into outbox_events (event_type, payload) values ('stocktake.completed', $1)`,
        [JSON.stringify({ adjusted: report.adjusted, variances: report.variances.length, shrinkageMinor })],
      );
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }

  return { ...report, shrinkageMinor, note: note ?? null };
}
