import { UnderwritingReasonCode } from '@tally/seam';
import type { RevenueSnapshot } from './types';

const BASE_RATE_BPS = 400; // 4.00% base
const VOLATILITY_PREMIUM_BPS = 4; // +0.04% per volatility point above 10
const REVENUE_THRESHOLD_USD = 3_000_000_000n; // $3,000 at 6-decimal fixed point
const MAX_VOLATILITY_SCORE = 40;
const MIN_HISTORY_DAYS = 30;

export function computeDiscountRate(revenue: Pick<RevenueSnapshot, 'volatilityScore'>): number {
  const premium = Math.max(0, revenue.volatilityScore - 10) * VOLATILITY_PREMIUM_BPS;
  return BASE_RATE_BPS + premium;
}

export function classifyDecline(revenue: RevenueSnapshot): UnderwritingReasonCode {
  if (revenue.historyDays < MIN_HISTORY_DAYS) return UnderwritingReasonCode.INSUFFICIENT_HISTORY;
  if (revenue.trailing90dTotalUSD < REVENUE_THRESHOLD_USD) return UnderwritingReasonCode.REVENUE_BELOW_THRESHOLD;
  if (revenue.volatilityScore > MAX_VOLATILITY_SCORE) return UnderwritingReasonCode.VOLATILITY_TOO_HIGH;
  return UnderwritingReasonCode.APPROVED;
}

export function isApproved(revenue: RevenueSnapshot): boolean {
  return classifyDecline(revenue) === UnderwritingReasonCode.APPROVED;
}
