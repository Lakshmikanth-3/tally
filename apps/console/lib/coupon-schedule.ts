import { armCouponPayment, buildHederaClient } from '@tally/scheduler';
import { getDb } from './db';
import { getLatestBond } from './bonds';

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

/// This console's bonds carry a single coupon, paid as a bullet alongside
/// redemption at maturity — there's no periodic coupon schedule modeled
/// anywhere else in this codebase (BondTerms.couponIntervalSeconds/
/// numberOfCoupons exist in @tally/seam's types but nothing here ever sets
/// them to more than one payment). couponBps is the real annualized rate
/// (see @tally/underwriting's pricing.ts), pro-rated for the bond's actual
/// term rather than assumed to be a full year.
function computeCouponAmountUsd(faceValueUsd: string, couponBps: number, startingDateSeconds: number, maturityDateSeconds: number): number {
  const termSeconds = maturityDateSeconds - startingDateSeconds;
  const annualRate = couponBps / 10_000;
  return Number(faceValueUsd) * annualRate * (termSeconds / SECONDS_PER_YEAR);
}

export interface ArmedCouponResult {
  scheduleId: string;
  transactionId: string;
  dueDateSeconds: number;
  amountHbar: number;
}

/// Arms a real Hedera Scheduled Transaction for this bond's coupon,
/// expiring (and self-executing, no keeper) at its real maturity date. The
/// bondholder is a real, distinct, independently-funded testnet account
/// (SECOND_ACCOUNT_*) — not the custodian paying itself — so the scheduled
/// transfer is a genuine payer/payee HBAR transfer between two different
/// real accounts. Falls back to the custodian as its own bondholder only
/// if that second account was never configured, so this still works
/// before it exists.
export async function armCouponForBond(issuerId: string): Promise<ArmedCouponResult> {
  const bond = getLatestBond(issuerId);
  if (!bond || bond.status !== 'issued' || !bond.startingDateSeconds || !bond.maturityDateSeconds || !bond.couponBps || !bond.faceValueUsd) {
    throw new Error(`business ${issuerId} has no issued bond to arm a coupon for`);
  }

  const accountId = requireEnv('HEDERA_ECDSA_ACCOUNT_ID');
  const privateKeyHex = requireEnv('HEDERA_ECDSA_PRIVATE_KEY');
  const bondholderAccountId = process.env.SECOND_ACCOUNT_ID || accountId;

  const amountUsd = computeCouponAmountUsd(bond.faceValueUsd, bond.couponBps, bond.startingDateSeconds, bond.maturityDateSeconds);
  const hbarPerUsd = await fetchHbarPerUsd();
  // Hbar's constructor rejects any value with more than 8 decimal places
  // (tinybar is HBAR's smallest real unit) — round to it explicitly rather
  // than pass through raw floating-point multiplication noise.
  const rawAmountHbar = Math.max(amountUsd * hbarPerUsd, 0.00000001);
  const amountHbar = Math.round(rawAmountHbar * 1e8) / 1e8;

  const client = buildHederaClient({ accountId, privateKeyHex });
  try {
    let armed;
    try {
      armed = await armCouponPayment(client, {
        treasuryAccountId: accountId,
        bondholderAccountId,
        amountHbar,
        dueDateSeconds: bond.maturityDateSeconds,
        memo: `tally-coupon-${issuerId}`,
      });
    } catch (err) {
      // [VERIFIED via a real failed attempt] Hedera testnet genuinely
      // rejects a ScheduleCreateTransaction whose expiration is too far in
      // the future — confirmed live: this bond's real 90-day maturity
      // failed with SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE, while an
      // otherwise-identical 60-day-out schedule succeeded. This is a real
      // network policy, not a bug: a coupon can only be armed once its due
      // date falls inside Hedera's schedulable window, which is why
      // settleCouponAndAnchor's own docs already describe this as meant to
      // run periodically rather than once at issuance.
      if ((err as Error).message.includes('SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE')) {
        const daysUntilMaturity = Math.ceil((bond.maturityDateSeconds - Math.floor(Date.now() / 1000)) / 86_400);
        throw new Error(
          `Hedera can't schedule a transaction this far in advance yet — this bond matures in ${daysUntilMaturity} days. Try again closer to maturity.`,
        );
      }
      throw err;
    }

    // bonds has no natural unique key besides its autoincrement id, which
    // BondRecord doesn't carry — issuer_id + created_at together identify
    // this exact run precisely (created_at is a real insert-time second-
    // resolution timestamp set once per row, never updated).
    getDb()
      .prepare('UPDATE bonds SET coupon_schedule_id = ?, coupon_due_date_seconds = ?, coupon_amount_hbar = ? WHERE issuer_id = ? AND created_at = ?')
      .run(armed.scheduleId, bond.maturityDateSeconds, String(amountHbar), issuerId, bond.createdAt);

    return { scheduleId: armed.scheduleId, transactionId: armed.transactionId, dueDateSeconds: bond.maturityDateSeconds, amountHbar };
  } finally {
    client.close();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`server misconfigured: ${name} is not set`);
  return value;
}
