import { randomBytes } from 'node:crypto';
import { computeRevenueSnapshot, type RawTransaction, type RevenueSnapshot } from '@tally/underwriting';
import { getDb } from './db';
import { listStripeCharges } from './stripe';

export interface Business {
  issuerId: string;
  name: string;
  createdAt: number;
  isDemo: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function registerBusiness(name: string): Business {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('business name is required');

  const issuerId = `issuer-${slugify(trimmed)}-${randomBytes(3).toString('hex')}`;
  const createdAt = Math.floor(Date.now() / 1000);

  getDb().prepare('INSERT INTO businesses (issuer_id, name, created_at) VALUES (?, ?, ?)').run(issuerId, trimmed, createdAt);

  return { issuerId, name: trimmed, createdAt, isDemo: false };
}

export function getBusiness(issuerId: string): Business | undefined {
  const row = getDb().prepare('SELECT issuer_id, name, created_at, is_demo FROM businesses WHERE issuer_id = ?').get(issuerId) as
    | { issuer_id: string; name: string; created_at: number; is_demo: number }
    | undefined;
  if (!row) return undefined;
  return { issuerId: row.issuer_id, name: row.name, createdAt: row.created_at, isDemo: Boolean(row.is_demo) };
}

/// Marks a business as using clearly-disclosed synthetic/demo revenue data
/// rather than a real business's real numbers — see seedDemoTransactions.
/// Never set on a business with a connected payment processor or real
/// manually-submitted history; this is for a small number of explicitly
/// created demo businesses only, surfaced honestly in the UI wherever their
/// revenue is shown.
export function markBusinessAsDemo(issuerId: string): void {
  getDb().prepare('UPDATE businesses SET is_demo = 1 WHERE issuer_id = ?').run(issuerId);
}

/// Seeds clearly-labeled synthetic transactions (source='synthetic-demo')
/// for a demo business — bypasses submitTransaction's normal "now" default
/// so callers can supply real historical-looking dates for a coherent
/// multi-month synthetic history. Only ever call this for a business also
/// marked via markBusinessAsDemo, so the UI disclosure and the data stay in
/// sync — see scripts/seed-demo-business.ts for the one real caller.
export function seedDemoTransactions(issuerId: string, transactions: { amountUSD: bigint; timestampSeconds: number }[]): void {
  const insert = getDb().prepare("INSERT INTO transactions (issuer_id, amount_usd, timestamp_seconds, source) VALUES (?, ?, ?, 'synthetic-demo')");
  const insertMany = getDb().transaction((rows: typeof transactions) => {
    for (const tx of rows) insert.run(issuerId, tx.amountUSD.toString(), tx.timestampSeconds);
  });
  insertMany(transactions);
}

/// Thrown when a business with a connected payment processor attempts
/// manual transaction submission — once a real authoritative source exists,
/// a shop typing in a number is no longer an acceptable substitute for it.
export class ProcessorConnectedError extends Error {}

export function getStripeAccountId(issuerId: string): string | null {
  const row = getDb().prepare('SELECT stripe_account_id FROM businesses WHERE issuer_id = ?').get(issuerId) as
    | { stripe_account_id: string | null }
    | undefined;
  return row?.stripe_account_id ?? null;
}

/// Persists the real connected-account id returned by Stripe's OAuth token
/// exchange (see lib/stripe.ts's exchangeStripeOAuthCode) — never a value
/// the business or Tally invents.
export function setStripeConnection(issuerId: string, stripeAccountId: string, accessToken: string): void {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare('UPDATE businesses SET stripe_account_id = ?, stripe_access_token = ?, stripe_connected_at = ? WHERE issuer_id = ?')
    .run(stripeAccountId, accessToken, now, issuerId);
}

/// Records a real submitted transaction. amountUSD must already be a
/// 6-decimal fixed-point bigint (see @tally/seam money discipline) — never
/// a float, never fabricated. Rejected once a real processor is connected —
/// see ProcessorConnectedError.
export function submitTransaction(issuerId: string, amountUSD: bigint, timestampSeconds: number): void {
  if (amountUSD <= 0n) throw new Error('amountUSD must be positive');
  if (getStripeAccountId(issuerId)) {
    throw new ProcessorConnectedError(`business ${issuerId} has a connected payment processor — manual transaction submission is disabled`);
  }
  getDb()
    .prepare('INSERT INTO transactions (issuer_id, amount_usd, timestamp_seconds) VALUES (?, ?, ?)')
    .run(issuerId, amountUSD.toString(), timestampSeconds);
}

function listTransactions(issuerId: string): RawTransaction[] {
  const rows = getDb()
    .prepare('SELECT amount_usd, timestamp_seconds FROM transactions WHERE issuer_id = ?')
    .all(issuerId) as { amount_usd: string; timestamp_seconds: number }[];
  return rows.map((r) => ({ amountUSD: BigInt(r.amount_usd), timestampSeconds: r.timestamp_seconds }));
}

function lastSyncedStripeChargeTimestamp(issuerId: string): number | undefined {
  const row = getDb()
    .prepare("SELECT MAX(timestamp_seconds) as maxTs FROM transactions WHERE issuer_id = ? AND source = 'stripe'")
    .get(issuerId) as { maxTs: number | null };
  return row.maxTs ?? undefined;
}

/// Pulls real settled charges from the business's connected Stripe account
/// (the single authoritative source once connected) and upserts them.
/// Idempotent via the transactions table's stripe_charge_id unique index,
/// so calling this on every revenue read is safe and cheap once caught up.
/// No-ops honestly for businesses that haven't connected a processor yet.
export async function syncStripeTransactions(issuerId: string): Promise<void> {
  const stripeAccountId = getStripeAccountId(issuerId);
  if (!stripeAccountId) return;

  const charges = await listStripeCharges(stripeAccountId, lastSyncedStripeChargeTimestamp(issuerId));

  const insert = getDb().prepare(
    "INSERT OR IGNORE INTO transactions (issuer_id, amount_usd, timestamp_seconds, source, stripe_charge_id) VALUES (?, ?, ?, 'stripe', ?)"
  );
  for (const charge of charges) {
    insert.run(issuerId, charge.amountMicrosUSD.toString(), charge.createdSeconds, charge.id);
  }
}

/// Computes the real revenue snapshot from whatever this business has
/// actually submitted — zeros out honestly if nothing has been submitted.
/// Syncs from a connected Stripe account first, so this always reflects a
/// live pull from the processor of record rather than a stale local cache.
export async function getRevenueSnapshot(issuerId: string, nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<RevenueSnapshot> {
  await syncStripeTransactions(issuerId);
  return computeRevenueSnapshot(issuerId, listTransactions(issuerId), nowSeconds);
}
