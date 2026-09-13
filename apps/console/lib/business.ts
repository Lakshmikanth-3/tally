import { randomBytes } from 'node:crypto';
import { computeRevenueSnapshot, type RawTransaction, type RevenueSnapshot } from '@tally/underwriting';
import { db, withTransaction } from './db';
import { createTestModeRevenueHistory, listStripeCharges, listStripeTestModeInvoices } from './stripe';

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

export async function registerBusiness(name: string): Promise<Business> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('business name is required');

  const issuerId = `issuer-${slugify(trimmed)}-${randomBytes(3).toString('hex')}`;
  const createdAt = Math.floor(Date.now() / 1000);

  await db.run('INSERT INTO businesses (issuer_id, name, created_at) VALUES (?, ?, ?)', issuerId, trimmed, createdAt);

  return { issuerId, name: trimmed, createdAt, isDemo: false };
}

export async function getBusiness(issuerId: string): Promise<Business | undefined> {
  const row = await db.get<{ issuer_id: string; name: string; created_at: number; is_demo: number }>(
    'SELECT issuer_id, name, created_at, is_demo FROM businesses WHERE issuer_id = ?',
    issuerId,
  );
  if (!row) return undefined;
  return { issuerId: row.issuer_id, name: row.name, createdAt: row.created_at, isDemo: Boolean(row.is_demo) };
}

export interface BusinessSummary extends Business {
  stripeConnected: boolean;
  bondStatus: 'none' | 'declined' | 'issued' | 'failed';
  couponBps: number | null;
  bondTokenId: string | null;
}

/// All registered businesses, newest first, each with its real Stripe
/// connection state and latest real bond attempt (if any) — for the
/// dashboard. One real query per call, no cached/derived fixture.
export async function listAllBusinesses(): Promise<BusinessSummary[]> {
  const rows = await db.all<{
    issuer_id: string;
    name: string;
    created_at: number;
    is_demo: number;
    stripe_account_id: string | null;
    bond_status: string | null;
    coupon_bps: number | null;
    bond_token_id: string | null;
  }>(
    `SELECT
       b.issuer_id, b.name, b.created_at, b.is_demo, b.stripe_account_id,
       latest.status as bond_status, latest.coupon_bps, latest.bond_token_id
     FROM businesses b
     LEFT JOIN (
       SELECT bonds.*
       FROM bonds
       INNER JOIN (
         SELECT issuer_id, MAX(created_at) as max_created_at
         FROM bonds
         GROUP BY issuer_id
       ) latest_per_issuer
       ON bonds.issuer_id = latest_per_issuer.issuer_id AND bonds.created_at = latest_per_issuer.max_created_at
     ) latest
     ON latest.issuer_id = b.issuer_id
     ORDER BY b.created_at DESC`,
  );

  return rows.map((r) => ({
    issuerId: r.issuer_id,
    name: r.name,
    createdAt: r.created_at,
    isDemo: Boolean(r.is_demo),
    stripeConnected: Boolean(r.stripe_account_id),
    bondStatus: (r.bond_status as BusinessSummary['bondStatus']) ?? 'none',
    couponBps: r.coupon_bps,
    bondTokenId: r.bond_token_id,
  }));
}

export interface PlatformStats {
  totalBusinesses: number;
  bondsIssued: number;
  totalFaceValueUsdMicros: string;
  totalTransactions: number;
}

/// Real, aggregate platform stats for the landing page / dashboard — every
/// number a direct COUNT/SUM over real tables, never a hardcoded figure.
/// One round trip rather than four, since it renders on the landing page.
export async function getPlatformStats(): Promise<PlatformStats> {
  const row = await db.get<{ businesses: number; bonds: number; face: number; txs: number }>(
    `SELECT
       (SELECT COUNT(*) FROM businesses) AS businesses,
       (SELECT COUNT(*) FROM bonds WHERE status = 'issued') AS bonds,
       (SELECT COALESCE(SUM(CAST(face_value_usd AS BIGINT)), 0) FROM bonds WHERE status = 'issued') AS face,
       (SELECT COUNT(*) FROM transactions) AS txs`,
  );

  return {
    totalBusinesses: row?.businesses ?? 0,
    bondsIssued: row?.bonds ?? 0,
    totalFaceValueUsdMicros: (BigInt(row?.face ?? 0) * 1_000_000n).toString(),
    totalTransactions: row?.txs ?? 0,
  };
}

/// Marks a business as using clearly-disclosed synthetic/demo revenue data
/// rather than a real business's real numbers — see seedDemoTransactions.
/// Never set on a business with a connected payment processor or real
/// manually-submitted history; this is for a small number of explicitly
/// created demo businesses only, surfaced honestly in the UI wherever their
/// revenue is shown.
export async function markBusinessAsDemo(issuerId: string): Promise<void> {
  await db.run('UPDATE businesses SET is_demo = 1 WHERE issuer_id = ?', issuerId);
}

/// Seeds clearly-labeled synthetic transactions (source='synthetic-demo')
/// for a demo business — bypasses submitTransaction's normal "now" default
/// so callers can supply real historical-looking dates for a coherent
/// multi-month synthetic history. Only ever call this for a business also
/// marked via markBusinessAsDemo, so the UI disclosure and the data stay in
/// sync — see scripts/seed-demo-business.ts for the one real caller.
export async function seedDemoTransactions(
  issuerId: string,
  transactions: { amountUSD: bigint; timestampSeconds: number }[],
): Promise<void> {
  await withTransaction(async (tx) => {
    for (const t of transactions) {
      await tx.run(
        "INSERT INTO transactions (issuer_id, amount_usd, timestamp_seconds, source) VALUES (?, ?, ?, 'synthetic-demo')",
        issuerId,
        t.amountUSD.toString(),
        t.timestampSeconds,
      );
    }
  });
}

/// Thrown when a business with a connected payment processor attempts
/// manual transaction submission — once a real authoritative source exists,
/// a shop typing in a number is no longer an acceptable substitute for it.
export class ProcessorConnectedError extends Error {}

export async function getStripeAccountId(issuerId: string): Promise<string | null> {
  const row = await db.get<{ stripe_account_id: string | null }>('SELECT stripe_account_id FROM businesses WHERE issuer_id = ?', issuerId);
  return row?.stripe_account_id ?? null;
}

/// Persists the real connected-account id returned by Stripe's OAuth token
/// exchange (see lib/stripe.ts's exchangeStripeOAuthCode) — never a value
/// the business or Tally invents.
export async function setStripeConnection(issuerId: string, stripeAccountId: string, accessToken: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.run(
    'UPDATE businesses SET stripe_account_id = ?, stripe_access_token = ?, stripe_connected_at = ? WHERE issuer_id = ?',
    stripeAccountId,
    accessToken,
    now,
    issuerId,
  );
}

/// Records a real submitted transaction. amountUSD must already be a
/// 6-decimal fixed-point bigint (see @tally/seam money discipline) — never
/// a float, never fabricated. Rejected once a real processor is connected —
/// see ProcessorConnectedError.
export async function submitTransaction(issuerId: string, amountUSD: bigint, timestampSeconds: number): Promise<void> {
  if (amountUSD <= 0n) throw new Error('amountUSD must be positive');
  if (await getStripeAccountId(issuerId)) {
    throw new ProcessorConnectedError(`business ${issuerId} has a connected payment processor — manual transaction submission is disabled`);
  }
  await db.run(
    'INSERT INTO transactions (issuer_id, amount_usd, timestamp_seconds) VALUES (?, ?, ?)',
    issuerId,
    amountUSD.toString(),
    timestampSeconds,
  );
}

async function listTransactions(issuerId: string): Promise<RawTransaction[]> {
  const rows = await db.all<{ amount_usd: string; timestamp_seconds: number }>(
    'SELECT amount_usd, timestamp_seconds FROM transactions WHERE issuer_id = ?',
    issuerId,
  );
  return rows.map((r) => ({ amountUSD: BigInt(r.amount_usd), timestampSeconds: r.timestamp_seconds }));
}

async function lastSyncedTimestamp(issuerId: string, source: 'stripe' | 'stripe-test-mode'): Promise<number | undefined> {
  const row = await db.get<{ max_ts: number | null }>(
    'SELECT MAX(timestamp_seconds) AS max_ts FROM transactions WHERE issuer_id = ? AND source = ?',
    issuerId,
    source,
  );
  return row?.max_ts ?? undefined;
}

/// Pulls real settled charges from the business's connected Stripe account
/// (the single authoritative source once connected) and upserts them.
/// Idempotent via the transactions table's stripe_charge_id unique
/// constraint, so calling this on every revenue read is safe and cheap once
/// caught up. No-ops honestly for businesses that haven't connected a
/// processor yet.
export async function syncStripeTransactions(issuerId: string): Promise<void> {
  const stripeAccountId = await getStripeAccountId(issuerId);
  if (!stripeAccountId) return;

  const charges = await listStripeCharges(stripeAccountId, await lastSyncedTimestamp(issuerId, 'stripe'));

  for (const charge of charges) {
    await db.run(
      "INSERT INTO transactions (issuer_id, amount_usd, timestamp_seconds, source, stripe_charge_id) VALUES (?, ?, ?, 'stripe', ?) ON CONFLICT DO NOTHING",
      issuerId,
      charge.amountMicrosUSD.toString(),
      charge.createdSeconds,
      charge.id,
    );
  }
}

/// Pulls the real, Stripe-test-clock-backdated paid invoices generated by
/// generateStripeTestModeHistory and upserts them — the test-mode twin of
/// syncStripeTransactions, reading real Stripe API data (never a fixture)
/// through the exact same connected-account read path. Idempotent via
/// stripe_invoice_id's unique constraint.
export async function syncStripeTestModeTransactions(issuerId: string): Promise<void> {
  const stripeAccountId = await getStripeAccountId(issuerId);
  if (!stripeAccountId) return;

  const invoices = await listStripeTestModeInvoices(stripeAccountId, await lastSyncedTimestamp(issuerId, 'stripe-test-mode'));

  for (const invoice of invoices) {
    await db.run(
      "INSERT INTO transactions (issuer_id, amount_usd, timestamp_seconds, source, stripe_invoice_id) VALUES (?, ?, ?, 'stripe-test-mode', ?) ON CONFLICT DO NOTHING",
      issuerId,
      invoice.amountMicrosUSD.toString(),
      invoice.createdSeconds,
      invoice.id,
    );
  }
}

/// Computes the real revenue snapshot from whatever this business has
/// actually submitted — zeros out honestly if nothing has been submitted.
/// Syncs from a connected Stripe account first (both real charges and, if
/// any exist, Stripe-test-clock-backdated test-mode invoices), so this
/// always reflects a live pull from the processor of record rather than a
/// stale local cache.
export async function getRevenueSnapshot(issuerId: string, nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<RevenueSnapshot> {
  await syncStripeTransactions(issuerId);
  await syncStripeTestModeTransactions(issuerId);
  return computeRevenueSnapshot(issuerId, await listTransactions(issuerId), nowSeconds);
}

/// Generates a real Stripe TEST MODE revenue history for a connected
/// business — real Stripe Test Clocks + Invoices (see stripe.ts), not rows
/// inserted directly into this database. Immediately syncs afterward so a
/// caller can read the updated revenue snapshot right away.
export async function generateStripeTestModeHistory(issuerId: string, days: number): Promise<{ daysGenerated: number }> {
  const stripeAccountId = await getStripeAccountId(issuerId);
  if (!stripeAccountId) {
    throw new Error(`business ${issuerId} has no connected Stripe account — connect one first via the real OAuth flow`);
  }
  const result = await createTestModeRevenueHistory(stripeAccountId, days);
  await syncStripeTestModeTransactions(issuerId);
  return { daysGenerated: result.daysGenerated };
}

export interface TransactionRow {
  amountUSD: string;
  timestampSeconds: number;
  source: string;
  stripeId: string | null;
}

/// All of a business's real recorded transactions, newest first — for the
/// "View Stripe Transactions" table. Every row traces to a real source: a
/// real Stripe charge id, a real (test-mode) Stripe invoice id, or a real
/// manually-submitted entry.
export async function listBusinessTransactions(issuerId: string): Promise<TransactionRow[]> {
  const rows = await db.all<{
    amount_usd: string;
    timestamp_seconds: number;
    source: string;
    stripe_charge_id: string | null;
    stripe_invoice_id: string | null;
  }>(
    'SELECT amount_usd, timestamp_seconds, source, stripe_charge_id, stripe_invoice_id FROM transactions WHERE issuer_id = ? ORDER BY timestamp_seconds DESC',
    issuerId,
  );

  return rows.map((r) => ({
    amountUSD: r.amount_usd,
    timestampSeconds: r.timestamp_seconds,
    source: r.source,
    stripeId: r.stripe_charge_id ?? r.stripe_invoice_id,
  }));
}
