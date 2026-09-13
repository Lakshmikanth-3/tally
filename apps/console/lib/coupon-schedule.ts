import { armCouponPayment, buildHederaClient } from '@tally/scheduler';
import { getDb } from './db';
import { getLatestBond, type BondRecord } from './bonds';

const MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com/api/v1';
const SECONDS_PER_YEAR = 365 * 86_400;

interface ExchangeRateResponse {
  current_rate: { cent_equivalent: number; hbar_equivalent: number };
}

/// Hedera's own real, live network exchange rate — not a fabricated or
/// hardcoded conversion. cent_equivalent cents == hbar_equivalent HBAR.
async function fetchHbarPerUsd(): Promise<number> {
  const res = await fetch(`${MIRROR_NODE_URL}/network/exchangerate`);
  if (!res.ok) throw new Error(`mirror node exchange rate request failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as ExchangeRateResponse;
  const { cent_equivalent: cents, hbar_equivalent: hbar } = body.current_rate;
  return (hbar / cents) * 100; // HBAR per whole USD dollar
}

/// couponBps is the real annualized rate (see @tally/underwriting's
/// pricing.ts), so a single coupon covering `periodSeconds` of the bond's
/// life is pro-rated to that period rather than assumed to be a full year.
/// A 1-coupon bond's period is its whole term (the bullet-at-maturity case);
/// an N-coupon bond's is term/N.
function computeCouponAmountUsd(faceValueUsd: string, couponBps: number, periodSeconds: number): number {
  const annualRate = couponBps / 10_000;
  return Number(faceValueUsd) * annualRate * (periodSeconds / SECONDS_PER_YEAR);
}

/// [VERIFIED via a real failed attempt] Hedera rejects a
/// ScheduleCreateTransaction expiring too far out
/// (SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE) — confirmed live: a 90-day
/// expiration failed where an otherwise-identical 60-day one succeeded. So
/// coupons can't all be armed at issuance; each is armed once its own due
/// date comes inside this window. Kept deliberately below the observed
/// ~60-day ceiling so a sweep never wastes a real transaction on one that
/// is certain to be rejected.
const SCHEDULABLE_HORIZON_SECONDS = 55 * 86_400;

export interface CouponPayment {
  couponIndex: number;
  dueDateSeconds: number;
  amountHbar: string | null;
  scheduleId: string | null;
  armedAt: number | null;
  anchoredAt: number | null;
  anchorTxId: string | null;
  anchoredOnTime: boolean | null;
}

interface CouponPaymentRow {
  coupon_index: number;
  due_date_seconds: number;
  amount_hbar: string | null;
  schedule_id: string | null;
  armed_at: number | null;
  anchored_at: number | null;
  anchor_tx_id: string | null;
  anchored_on_time: number | null;
}

function rowToCouponPayment(row: CouponPaymentRow): CouponPayment {
  return {
    couponIndex: row.coupon_index,
    dueDateSeconds: row.due_date_seconds,
    amountHbar: row.amount_hbar,
    scheduleId: row.schedule_id,
    armedAt: row.armed_at,
    anchoredAt: row.anchored_at,
    anchorTxId: row.anchor_tx_id,
    anchoredOnTime: row.anchored_on_time === null ? null : Boolean(row.anchored_on_time),
  };
}

export function listCouponPayments(issuerId: string, bondCreatedAt: number): CouponPayment[] {
  const rows = getDb()
    .prepare('SELECT * FROM coupon_payments WHERE issuer_id = ? AND bond_created_at = ? ORDER BY coupon_index ASC')
    .all(issuerId, bondCreatedAt) as CouponPaymentRow[];
  return rows.map(rowToCouponPayment);
}

/// The real due dates a bond's coupons fall on, spread evenly across its
/// term. The final coupon lands exactly on maturity rather than on an
/// accumulated multiple of a floor()'d interval, so integer rounding can
/// never push the last payment past (or short of) the real maturity date.
export function computeCouponDueDates(
  startingDateSeconds: number,
  maturityDateSeconds: number,
  numberOfCoupons: number,
  couponIntervalSeconds?: number | null,
): number[] {
  const interval = couponIntervalSeconds ?? Math.floor((maturityDateSeconds - startingDateSeconds) / numberOfCoupons);
  const dueDates: number[] = [];
  for (let index = 1; index <= numberOfCoupons; index++) {
    dueDates.push(index === numberOfCoupons ? maturityDateSeconds : startingDateSeconds + index * interval);
  }
  return dueDates;
}

/// Writes the bond's full real coupon schedule — every due date it owes
/// across its term — without arming any of them yet. Idempotent: re-running
/// leaves existing rows (and anything already armed) untouched.
export function planCouponSchedule(bond: BondRecord): CouponPayment[] {
  if (!bond.startingDateSeconds || !bond.maturityDateSeconds) {
    throw new Error(`bond for ${bond.issuerId} has no real dates to derive a coupon schedule from`);
  }
  const existing = listCouponPayments(bond.issuerId, bond.createdAt);
  if (existing.length === bond.numberOfCoupons) return existing;

  const dueDates = computeCouponDueDates(
    bond.startingDateSeconds,
    bond.maturityDateSeconds,
    bond.numberOfCoupons,
    bond.couponIntervalSeconds,
  );

  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO coupon_payments (issuer_id, bond_created_at, coupon_index, due_date_seconds)
     VALUES (?, ?, ?, ?)`,
  );
  const insertAll = getDb().transaction(() => {
    dueDates.forEach((dueDateSeconds, i) => insert.run(bond.issuerId, bond.createdAt, i + 1, dueDateSeconds));
  });
  insertAll();

  return listCouponPayments(bond.issuerId, bond.createdAt);
}

export interface ArmedCouponResult {
  scheduleId: string;
  transactionId: string;
  dueDateSeconds: number;
  amountHbar: number;
  couponIndex: number;
}

/// Arms a real Hedera Scheduled Transaction for this bond's coupon,
/// expiring (and self-executing, no keeper) at its real maturity date. The
/// bondholder is a real, distinct, independently-funded testnet account
/// (SECOND_ACCOUNT_*) — not the custodian paying itself — so the scheduled
/// transfer is a genuine payer/payee HBAR transfer between two different
/// real accounts. Falls back to the custodian as its own bondholder only
/// if that second account was never configured, so this still works
/// before it exists.
export async function armCouponForBond(issuerId: string): Promise<ArmedCouponResult[]> {
  const bond = getLatestBond(issuerId);
  if (!bond || bond.status !== 'issued' || !bond.startingDateSeconds || !bond.maturityDateSeconds || !bond.couponBps || !bond.faceValueUsd) {
    throw new Error(`business ${issuerId} has no issued bond to arm a coupon for`);
  }

  const schedule = planCouponSchedule(bond);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const armable = schedule.filter(
    (c) => c.scheduleId === null && c.dueDateSeconds > nowSeconds && c.dueDateSeconds - nowSeconds <= SCHEDULABLE_HORIZON_SECONDS,
  );

  if (armable.length === 0) {
    const pending = schedule.filter((c) => c.scheduleId === null && c.dueDateSeconds > nowSeconds);
    if (pending.length === 0) {
      throw new Error(`every coupon for this bond is already armed or past due`);
    }
    const daysAway = Math.ceil((pending[0]!.dueDateSeconds - nowSeconds) / 86_400);
    throw new Error(
      `Hedera can't schedule a transaction this far in advance yet — the next unarmed coupon is ${daysAway} day(s) out. It'll arm automatically once it's inside Hedera's ~60-day window.`,
    );
  }

  const accountId = requireEnv('HEDERA_ECDSA_ACCOUNT_ID');
  const privateKeyHex = requireEnv('HEDERA_ECDSA_PRIVATE_KEY');
  const bondholderAccountId = process.env.SECOND_ACCOUNT_ID || accountId;

  const periodSeconds = bond.couponIntervalSeconds ?? bond.maturityDateSeconds - bond.startingDateSeconds;
  const amountUsd = computeCouponAmountUsd(bond.faceValueUsd, bond.couponBps, periodSeconds);
  const hbarPerUsd = await fetchHbarPerUsd();
  // Hbar's constructor rejects any value with more than 8 decimal places
  // (tinybar is HBAR's smallest real unit) — round to it explicitly rather
  // than pass through raw floating-point multiplication noise.
  const rawAmountHbar = Math.max(amountUsd * hbarPerUsd, 0.00000001);
  const amountHbar = Math.round(rawAmountHbar * 1e8) / 1e8;

  const client = buildHederaClient({ accountId, privateKeyHex });
  const results: ArmedCouponResult[] = [];
  try {
    for (const coupon of armable) {
      const armed = await armCouponPayment(client, {
        treasuryAccountId: accountId,
        bondholderAccountId,
        amountHbar,
        dueDateSeconds: coupon.dueDateSeconds,
        memo: `tally-coupon-${issuerId}-${coupon.couponIndex}`,
      });

      getDb()
        .prepare(
          `UPDATE coupon_payments SET schedule_id = ?, amount_hbar = ?, armed_at = ?
           WHERE issuer_id = ? AND bond_created_at = ? AND coupon_index = ?`,
        )
        .run(armed.scheduleId, String(amountHbar), Math.floor(Date.now() / 1000), issuerId, bond.createdAt, coupon.couponIndex);

      results.push({
        scheduleId: armed.scheduleId,
        transactionId: armed.transactionId,
        dueDateSeconds: coupon.dueDateSeconds,
        amountHbar,
        couponIndex: coupon.couponIndex,
      });
    }
  } finally {
    client.close();
  }

  return results;
}

/// Records that one coupon's real payment executed and its Coupon lifecycle
/// event was anchored — only ever after a real mirror-node confirmation that
/// the scheduled transfer actually ran (see lib/lifecycle.ts).
export function markCouponPaymentAnchored(
  issuerId: string,
  bondCreatedAt: number,
  couponIndex: number,
  anchorTxId: string,
  onTime: boolean,
): void {
  getDb()
    .prepare(
      `UPDATE coupon_payments SET anchored_at = ?, anchor_tx_id = ?, anchored_on_time = ?
       WHERE issuer_id = ? AND bond_created_at = ? AND coupon_index = ?`,
    )
    .run(Math.floor(Date.now() / 1000), anchorTxId, onTime ? 1 : 0, issuerId, bondCreatedAt, couponIndex);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`server misconfigured: ${name} is not set`);
  return value;
}
