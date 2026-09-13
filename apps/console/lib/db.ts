import { Pool, types, type PoolClient } from 'pg';

/// True on the hosted Vercel deployment. The database is the same shared
/// Postgres instance everywhere, so this no longer means "read-only" — it
/// means "this runtime has no custodian key and no headless browser", which
/// is what gates real on-chain signing (see api-guard.ts) and the lifecycle
/// poller (a serverless function can't hold a long-lived interval anyway).
export const IS_HOSTED = process.env.TALLY_HOSTED === '1' || Boolean(process.env.VERCEL);

// Postgres returns BIGINT (int8) and NUMERIC as strings so no precision is
// silently lost. Every such column here is a unix-seconds timestamp, a row
// count, or a whole-dollar SUM — all far inside Number's exact integer range
// — and money amounts that *do* need full precision are stored as TEXT
// micros, so parsing these back to numbers keeps the row shapes identical to
// what the rest of the app has always read.
types.setTypeParser(types.builtins.INT8, (v) => Number(v));
types.setTypeParser(types.builtins.NUMERIC, (v) => Number(v));

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS businesses (
    issuer_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    stripe_account_id TEXT,
    stripe_access_token TEXT,
    stripe_connected_at BIGINT,
    is_demo INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    issuer_id TEXT NOT NULL REFERENCES businesses(issuer_id),
    amount_usd TEXT NOT NULL,
    timestamp_seconds BIGINT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    stripe_charge_id TEXT UNIQUE,
    stripe_invoice_id TEXT UNIQUE
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_issuer ON transactions(issuer_id);

  CREATE TABLE IF NOT EXISTS bonds (
    id BIGSERIAL PRIMARY KEY,
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
    starting_date_seconds BIGINT,
    maturity_date_seconds BIGINT,
    created_at BIGINT NOT NULL,
    coupon_schedule_id TEXT,
    coupon_due_date_seconds BIGINT,
    coupon_amount_hbar TEXT,
    coupon_anchored_at BIGINT,
    coupon_anchor_tx_id TEXT,
    redeemed_at BIGINT,
    redeem_transaction_id TEXT,
    redeem_on_time INTEGER,
    number_of_coupons INTEGER NOT NULL DEFAULT 1,
    coupon_interval_seconds BIGINT
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
    id BIGSERIAL PRIMARY KEY,
    issuer_id TEXT NOT NULL REFERENCES businesses(issuer_id),
    bond_created_at BIGINT NOT NULL,
    coupon_index INTEGER NOT NULL,
    due_date_seconds BIGINT NOT NULL,
    amount_hbar TEXT,
    schedule_id TEXT,
    armed_at BIGINT,
    anchored_at BIGINT,
    anchor_tx_id TEXT,
    anchored_on_time INTEGER,
    UNIQUE (issuer_id, bond_created_at, coupon_index)
  );
`;

// Survives Next's dev-server hot reloads (module re-evaluation would
// otherwise open a fresh pool on every edit and exhaust Neon's connection
// limit within minutes).
const globalForDb = globalThis as unknown as { tallyPool?: Pool; tallySchemaReady?: Promise<void> };

function getPool(): Pool {
  if (globalForDb.tallyPool) return globalForDb.tallyPool;
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('server misconfigured: DATABASE_URL is not set');
  globalForDb.tallyPool = new Pool({
    // Neon's generated URLs say sslmode=require, which pg already treats as
    // full certificate verification but now warns about on every start.
    // Spelling out verify-full keeps the same (strict) behaviour, silently.
    connectionString: connectionString.replace(/sslmode=require/, 'sslmode=verify-full'),
    // Serverless functions each hold their own pool; keep it small so many
    // concurrent cold starts can't exhaust the database's connection cap.
    max: IS_HOSTED ? 3 : 10,
  });
  return globalForDb.tallyPool;
}

function ensureSchema(): Promise<void> {
  globalForDb.tallySchemaReady ??= getPool()
    .query(SCHEMA)
    .then(() => undefined)
    .catch((err) => {
      globalForDb.tallySchemaReady = undefined; // let the next call retry rather than caching a transient failure forever
      throw err;
    });
  return globalForDb.tallySchemaReady;
}

/// Every query in this app is written with SQLite-style `?` placeholders;
/// this rewrites them to Postgres's positional `$1, $2, …`. None of the SQL
/// here ever contains a literal `?` inside a string, so a plain scan is safe.
function toPositional(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

type Queryable = Pick<PoolClient, 'query'>;

async function run<T>(target: Queryable | null, sql: string, params: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
  await ensureSchema();
  const result = await (target ?? getPool()).query(toPositional(sql), params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

function makeDb(target: Queryable | null) {
  return {
    /// All matching rows.
    all: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => (await run<T>(target, sql, params)).rows,
    /// The first matching row, or undefined.
    get: async <T>(sql: string, ...params: unknown[]): Promise<T | undefined> => (await run<T>(target, sql, params)).rows[0],
    /// A write; resolves to the number of affected rows.
    run: async (sql: string, ...params: unknown[]): Promise<number> => (await run(target, sql, params)).rowCount,
  };
}

export type Db = ReturnType<typeof makeDb>;

export const db: Db = makeDb(null);

/// Runs `fn` inside a real Postgres transaction on one dedicated connection
/// — committed if it resolves, rolled back if it throws.
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(makeDb(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
