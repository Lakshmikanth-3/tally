// One-off migration — NOT a product feature. Copies every row from the
// original local SQLite database (tally.db) into the shared Postgres
// database (DATABASE_URL), preserving ids and every column exactly. Safe to
// re-run: rows that already exist are skipped, never duplicated or altered.
//
//   npx tsx --env-file=.env.local scripts/migrate-sqlite-to-postgres.ts [path/to/tally.db]
import path from 'node:path';
import Database from 'better-sqlite3';
import { db, withTransaction } from '../lib/db';

const TABLES = ['businesses', 'transactions', 'bonds', 'coupon_payments'] as const; // parent tables first, for the foreign keys
const SERIAL_TABLES = ['transactions', 'bonds', 'coupon_payments'] as const;

async function main() {
  const sqlitePath = path.resolve(process.argv[2] ?? 'tally.db');
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });

  // Touch the schema before opening the transaction below, so CREATE TABLE
  // runs once on its own rather than inside the copy.
  await db.get('SELECT 1');

  await withTransaction(async (tx) => {
    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      let inserted = 0;
      for (const row of rows) {
        const columns = Object.keys(row);
        inserted += await tx.run(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`,
          ...columns.map((c) => row[c]),
        );
      }
      console.log(`${table}: ${inserted} inserted, ${rows.length - inserted} already present (${rows.length} in SQLite)`);
    }

    // Ids were copied explicitly, so each BIGSERIAL sequence is still at 1 —
    // move it past the highest copied id or the next real insert collides.
    for (const table of SERIAL_TABLES) {
      await tx.get(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1))`);
    }
  });

  sqlite.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
