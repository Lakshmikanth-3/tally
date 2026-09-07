import { randomBytes } from 'node:crypto';
import { computeRevenueSnapshot, type RawTransaction, type RevenueSnapshot } from '@tally/underwriting';
import { getDb } from './db';

export interface Business {
  issuerId: string;
  name: string;
  createdAt: number;
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

  return { issuerId, name: trimmed, createdAt };
}

export function getBusiness(issuerId: string): Business | undefined {
  const row = getDb().prepare('SELECT issuer_id, name, created_at FROM businesses WHERE issuer_id = ?').get(issuerId) as
    | { issuer_id: string; name: string; created_at: number }
    | undefined;
  if (!row) return undefined;
  return { issuerId: row.issuer_id, name: row.name, createdAt: row.created_at };
}

/// Records a real submitted transaction. amountUSD must already be a
/// 6-decimal fixed-point bigint (see @tally/seam money discipline) — never
/// a float, never fabricated.
export function submitTransaction(issuerId: string, amountUSD: bigint, timestampSeconds: number): void {
  if (amountUSD <= 0n) throw new Error('amountUSD must be positive');
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

/// Computes the real revenue snapshot from whatever this business has
/// actually submitted — zeros out honestly if nothing has been submitted.
export function getRevenueSnapshot(issuerId: string, nowSeconds: number = Math.floor(Date.now() / 1000)): RevenueSnapshot {
  return computeRevenueSnapshot(issuerId, listTransactions(issuerId), nowSeconds);
}
