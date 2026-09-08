import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.join(process.cwd(), 'tally.db');

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) return db;

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
      stripe_charge_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_issuer ON transactions(issuer_id);
  `);

  addColumnIfMissing(db, 'businesses', 'stripe_account_id', 'TEXT');
  addColumnIfMissing(db, 'businesses', 'stripe_access_token', 'TEXT');
  addColumnIfMissing(db, 'businesses', 'stripe_connected_at', 'INTEGER');
  addColumnIfMissing(db, 'businesses', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'transactions', 'source', "TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing(db, 'transactions', 'stripe_charge_id', 'TEXT');

  // SQLite unique indexes treat NULL as distinct from every other value, so
  // manual transactions (stripe_charge_id IS NULL) are unaffected — this
  // only prevents the same real Stripe charge from being upserted twice.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_charge_id ON transactions(stripe_charge_id)');

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
