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
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issuer_id TEXT NOT NULL REFERENCES businesses(issuer_id),
      amount_usd TEXT NOT NULL,
      timestamp_seconds INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_issuer ON transactions(issuer_id);
  `);

  return db;
}
