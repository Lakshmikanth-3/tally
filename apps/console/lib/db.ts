import Database from 'better-sqlite3';
import path from 'node:path';

/// The hosted showcase runs against a committed, credential-scrubbed
/// snapshot (`showcase.db`) on a read-only filesystem, where WAL mode and
/// the schema migrations below would all fail — every one of them writes.
/// Locally nothing changes: the real `tally.db` is opened read-write as
/// before.
export const IS_READ_ONLY = process.env.TALLY_READ_ONLY === '1' || Boolean(process.env.VERCEL);

const DB_PATH = path.join(process.cwd(), IS_READ_ONLY ? 'showcase.db' : 'tally.db');

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) return db;

  if (IS_READ_ONLY) {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    return db;
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      issuer_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      stripe_account_id TEXT,
      stripe_access_token TEXT,
      stripe_connected_at INTEGER,
      is_demo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issuer_id TEXT NOT NULL REFERENCES businesses(issuer_id),
      amount_usd TEXT NOT NULL,
      timestamp_seconds INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      stripe_charge_id TEXT,
      stripe_invoice_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_issuer ON transactions(issuer_id);

    CREATE TABLE IF NOT EXISTS bonds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issuer_id TEXT NOT NULL REFERENCES businesses(issuer_id),
      status TEXT NOT NULL, -- 'declined' | 'issued' | 'failed'
      reason_code INTEGER,
      coupon_bps INTEGER,
      face_value_usd TEXT,
      symbol TEXT,
      isin TEXT,
      bond_token_id TEXT,
      evm_diamond_address TEXT,
      transaction_id TEXT,
      error_message TEXT,
      starting_date_seconds INTEGER,
      maturity_date_seconds INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bonds_issuer ON bonds(issuer_id);

    -- One row per individual coupon payment a bond owes. A bond's coupons
    -- can't all be armed up front: Hedera refuses a ScheduleCreateTransaction
    -- expiring more than ~60 days out, so this table records the full real
    -- schedule at issuance and each coupon is armed later, once its own due
    -- date comes inside that window (see lib/coupon-schedule.ts).
    -- bond_created_at identifies which bond row this belongs to — the bonds
    -- table is insert-only per underwriting run and (issuer_id, created_at)
    -- is unique within it.
    CREATE TABLE IF NOT EXISTS coupon_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issuer_id TEXT NOT NULL REFERENCES businesses(issuer_id),
      bond_created_at INTEGER NOT NULL,
      coupon_index INTEGER NOT NULL,
      due_date_seconds INTEGER NOT NULL,
      amount_hbar TEXT,
      schedule_id TEXT,
      armed_at INTEGER,
      anchored_at INTEGER,
      anchor_tx_id TEXT,
      anchored_on_time INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_payments_unique
      ON coupon_payments(issuer_id, bond_created_at, coupon_index);
  `);

  addColumnIfMissing(db, 'businesses', 'stripe_account_id', 'TEXT');
  addColumnIfMissing(db, 'businesses', 'stripe_access_token', 'TEXT');
  addColumnIfMissing(db, 'businesses', 'stripe_connected_at', 'INTEGER');
  addColumnIfMissing(db, 'businesses', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'transactions', 'source', "TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing(db, 'transactions', 'stripe_charge_id', 'TEXT');
  addColumnIfMissing(db, 'transactions', 'stripe_invoice_id', 'TEXT');
  addColumnIfMissing(db, 'bonds', 'coupon_schedule_id', 'TEXT');
  addColumnIfMissing(db, 'bonds', 'coupon_due_date_seconds', 'INTEGER');
  addColumnIfMissing(db, 'bonds', 'coupon_amount_hbar', 'TEXT');
  addColumnIfMissing(db, 'bonds', 'coupon_anchored_at', 'INTEGER');
  addColumnIfMissing(db, 'bonds', 'coupon_anchor_tx_id', 'TEXT');
  addColumnIfMissing(db, 'bonds', 'redeemed_at', 'INTEGER');
  addColumnIfMissing(db, 'bonds', 'redeem_transaction_id', 'TEXT');
  addColumnIfMissing(db, 'bonds', 'redeem_on_time', 'INTEGER');
  // Bond terms: how many coupons this bond pays and how far apart. Existing
  // rows predate multi-coupon support and are all single-bullet bonds, so
  // they default to 1 coupon; the interval is nullable because it's only
  // meaningful once the bond's real starting/maturity dates exist.
  addColumnIfMissing(db, 'bonds', 'number_of_coupons', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'bonds', 'coupon_interval_seconds', 'INTEGER');

  // SQLite unique indexes treat NULL as distinct from every other value, so
  // manual transactions (stripe_charge_id IS NULL) are unaffected — this
  // only prevents the same real Stripe charge from being upserted twice.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_charge_id ON transactions(stripe_charge_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_invoice_id ON transactions(stripe_invoice_id)');

  return db;
}

/// tally.db already exists from earlier development (real business/transaction
/// data, not a fixture) — CREATE TABLE IF NOT EXISTS won't add columns to an
/// existing table, so new columns must be migrated in explicitly rather than
/// silently missing on anyone's already-initialized database.
function addColumnIfMissing(database: Database.Database, table: string, column: string, type: string): void {
  const existing = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!existing.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
