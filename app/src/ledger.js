/**
 * The ledger.
 *
 * One rule: every transaction debits and credits the same total. The database
 * enforces it with a deferred constraint trigger, so an unbalanced posting
 * cannot be committed even by a hand-run UPDATE — but we check it here first,
 * because a clear application error beats a constraint violation at COMMIT
 * time when the real problem is a bug in our own arithmetic.
 *
 * Nothing in this codebase writes a "balance" column. Balances are derived:
 * `seller_balances`, `route_weekly_pnl`, `cash_cycle`. A stored balance drifts;
 * a derived one cannot.
 */
import { AppError } from './errors.js';

export const ACCOUNTS = {
  CASH_ON_HAND: '1000',
  BANK: '1010',
  PSP_RECEIVABLE: '1020',
  INVENTORY: '1100',
  PACKAGING_STOCK: '1110',
  PACKAGING_ACCRUAL: '2030',
  // The box, the filler and the label. Long unused; packaging cost is not a
  // rounding error when the fulfilment fee is 4%.
  PACKAGING: '5030',
  CUSTOMER_PREPAYMENTS: '2000',
  SELLER_PAYABLE: '2010',
  VAT_PAYABLE: '2020',
  COMMISSION_REVENUE: '4000',
  FULFILMENT_REVENUE: '4010',
  DELIVERY_REVENUE: '4020',
  COD_REVENUE: '4030',
  COGS: '5000',
  LAST_MILE: '5010',
  PSP_FEES: '5020',
  REFUNDS: '5040',
  // Stock that left the building without a sale: theft, damage, miscount.
  // Its own account, because burying it in cost of goods hides the trend.
  SHRINKAGE: '5080',
};

/**
 * @param {{query: Function}} tx
 * @param {{
 *   kind: string,
 *   refType?: string,
 *   refId?: string,
 *   memo?: string,
 *   createdBy?: string,
 *   entries: Array<{accountCode: string, debit?: number, credit?: number, sellerId?: string}>
 * }} posting
 */
export async function post(tx, posting) {
  const { kind, refType = null, refId = null, memo = null, createdBy = null, entries } = posting;

  if (!Array.isArray(entries) || entries.length < 2) {
    throw new AppError(500, 'LEDGER_INVALID', 'A ledger transaction needs at least two entries.');
  }

  let debits = 0;
  let credits = 0;
  for (const entry of entries) {
    const debit = entry.debit ?? 0;
    const credit = entry.credit ?? 0;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
      throw new AppError(500, 'LEDGER_INVALID', `Entry for ${entry.accountCode} is not an integer amount.`);
    }
    if (debit < 0 || credit < 0) {
      throw new AppError(500, 'LEDGER_INVALID', `Entry for ${entry.accountCode} is negative.`);
    }
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw new AppError(
        500,
        'LEDGER_INVALID',
        `Entry for ${entry.accountCode} must have exactly one non-zero side.`,
      );
    }
    debits += debit;
    credits += credit;
  }

  if (debits !== credits) {
    throw new AppError(
      500,
      'LEDGER_UNBALANCED',
      `Refusing to post an unbalanced transaction: debits ${debits}, credits ${credits}.`,
    );
  }

  const txn = await tx.query(
    `insert into ledger_transactions (kind, ref_type, ref_id, memo, created_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [kind, refType, refId, memo, createdBy],
  );
  const transactionId = txn.rows[0].id;

  for (const entry of entries) {
    await tx.query(
      `insert into ledger_entries (transaction_id, account_code, seller_id, debit_minor, credit_minor)
       values ($1, $2, $3, $4, $5)`,
      [transactionId, entry.accountCode, entry.sellerId ?? null, entry.debit ?? 0, entry.credit ?? 0],
    );
  }

  return transactionId;
}

/** Derived balance for one account (and optionally one seller). Debits minus credits. */
export async function balance(db, accountCode, { sellerId = null } = {}) {
  const res = await db.query(
    `select coalesce(sum(debit_minor - credit_minor), 0) as balance
       from ledger_entries
      where account_code = $1
        and ($2::uuid is null or seller_id = $2)`,
    [accountCode, sellerId],
  );
  return Number(res.rows[0].balance);
}

/** Every account, both sides, with the invariant checked. Used by the weekly review. */
export async function trialBalance(db) {
  const res = await db.query(
    `select a.code, a.name, a.type,
            coalesce(sum(e.debit_minor), 0)  as debit_minor,
            coalesce(sum(e.credit_minor), 0) as credit_minor
       from chart_of_accounts a
       left join ledger_entries e on e.account_code = a.code
      group by a.code, a.name, a.type
      order by a.code`,
  );
  const rows = res.rows.map((r) => ({
    ...r,
    debit_minor: Number(r.debit_minor),
    credit_minor: Number(r.credit_minor),
  }));
  const debit = rows.reduce((a, r) => a + r.debit_minor, 0);
  const credit = rows.reduce((a, r) => a + r.credit_minor, 0);
  return { rows, debit, credit, balanced: debit === credit };
}
