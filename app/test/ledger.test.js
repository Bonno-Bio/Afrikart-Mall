import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, IDS } from './helpers.js';
import { post, ACCOUNTS, trialBalance, balance } from '../src/ledger.js';

test('an unbalanced posting is refused before it reaches the database', async () => {
  const db = await freshDb();
  try {
    const { rows } = await db.query('select count(*)::int as n from ledger_transactions');
    const before = rows[0].n;
    await assert.rejects(
      () =>
        db.transaction((tx) =>
          post(tx, {
            kind: 'test',
            entries: [
              { accountCode: ACCOUNTS.BANK, debit: 10000 },
              { accountCode: ACCOUNTS.CUSTOMER_PREPAYMENTS, credit: 9000 },
            ],
          }),
        ),
      /unbalanced/i,
    );
    // The seed posts opening capital and a stock receipt, so "empty" is the wrong
    // assertion; "unchanged" is the real one.
    const txn = await db.query('select count(*)::int as n from ledger_transactions');
    assert.equal(txn.rows[0].n, before, 'a rejected posting must leave no rows behind');
  } finally {
    await db.close();
  }
});

test('an entry cannot be on both sides, or neither', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      () =>
        db.transaction((tx) =>
          post(tx, {
            kind: 'test',
            entries: [
              { accountCode: ACCOUNTS.BANK, debit: 100, credit: 100 },
              { accountCode: ACCOUNTS.CUSTOMER_PREPAYMENTS, credit: 0 },
            ],
          }),
        ),
      /exactly one non-zero side/,
    );
  } finally {
    await db.close();
  }
});

test('the database itself refuses an unbalanced transaction, even by hand', async () => {
  const db = await freshDb();
  try {
    const txn = await db.query(
      `insert into ledger_transactions (kind) values ('manual') returning id`,
    );
    await assert.rejects(
      () =>
        db.transaction(async (tx) => {
          await tx.query(
            `insert into ledger_entries (transaction_id, account_code, debit_minor)
             values ($1, '1010', 5000)`,
            [txn.rows[0].id],
          );
        }),
      /Unbalanced ledger transaction/,
    );
  } finally {
    await db.close();
  }
});

test('a balanced posting lands, and balances are derived rather than stored', async () => {
  const db = await freshDb();
  try {
    const bankBefore = await balance(db, ACCOUNTS.BANK);
    await db.transaction((tx) =>
      post(tx, {
        kind: 'capital',
        memo: 'founder capital',
        entries: [
          { accountCode: ACCOUNTS.BANK, debit: 25000000 },
          { accountCode: '3000', credit: 25000000 },
        ],
      }),
    );
    assert.equal((await balance(db, ACCOUNTS.BANK)) - bankBefore, 25000000);
    const tb = await trialBalance(db);
    assert.equal(tb.balanced, true);
    assert.equal(tb.debit, tb.credit);
  } finally {
    await db.close();
  }
});

test('the chart of accounts ships with the schema, so a posting cannot invent an account', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      () =>
        db.transaction((tx) =>
          post(tx, {
            kind: 'test',
            entries: [
              { accountCode: '9999', debit: 100 },
              { accountCode: ACCOUNTS.BANK, credit: 100 },
            ],
          }),
        ),
      /foreign key|violates/i,
    );
  } finally {
    await db.close();
  }
});

test('the seller dimension is what makes seller payables derivable', async () => {
  const db = await freshDb();
  try {
    await db.transaction((tx) =>
      post(tx, {
        kind: 'sale',
        entries: [
          { accountCode: ACCOUNTS.CUSTOMER_PREPAYMENTS, debit: 10000 },
          { accountCode: ACCOUNTS.SELLER_PAYABLE, credit: 10000, sellerId: IDS.seller },
        ],
      }),
    );
    const derived = await db.query(`select payable_minor from seller_balances where seller_id = $1`, [IDS.seller]);
    assert.equal(Number(derived.rows[0].payable_minor), 10000);
  } finally {
    await db.close();
  }
});
