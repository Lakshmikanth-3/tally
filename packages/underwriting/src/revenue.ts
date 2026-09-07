import type { RawTransaction, RevenueSnapshot } from './types';

const SECONDS_PER_DAY = 86_400;
const TRAILING_WINDOW_DAYS = 90;

/// Derives a RevenueSnapshot from a business's actually-submitted
/// transactions — this is the real replacement for a hardcoded fixture.
/// If a business hasn't submitted any transactions yet, this honestly
/// returns zeros rather than fabricating a plausible-looking number.
export function computeRevenueSnapshot(
  issuerId: string,
  transactions: RawTransaction[],
  nowSeconds: number
): RevenueSnapshot {
  const windowStart = nowSeconds - TRAILING_WINDOW_DAYS * SECONDS_PER_DAY;
  const inWindow = transactions.filter((tx) => tx.timestampSeconds >= windowStart && tx.timestampSeconds <= nowSeconds);

  const trailing90dTotalUSD = inWindow.reduce((sum, tx) => sum + tx.amountUSD, 0n);

  const historyDays =
    transactions.length === 0
      ? 0
      : Math.floor((nowSeconds - Math.min(...transactions.map((tx) => tx.timestampSeconds))) / SECONDS_PER_DAY);

  const volatilityScore = computeVolatilityScore(inWindow, windowStart);

  return { issuerId, trailing90dTotalUSD, volatilityScore, historyDays };
}

/// Coefficient of variation (stddev / mean) across daily revenue totals in
/// the trailing window, scaled to 0-100. Days with zero submitted
/// transactions count as $0 revenue days, so a business that only submits
/// sporadically is scored as volatile — that's real, not a bug.
function computeVolatilityScore(inWindow: RawTransaction[], windowStart: number): number {
  const dailyTotals = new Array<number>(TRAILING_WINDOW_DAYS).fill(0);
  for (const tx of inWindow) {
    const dayIndex = Math.floor((tx.timestampSeconds - windowStart) / SECONDS_PER_DAY);
    if (dayIndex >= 0 && dayIndex < TRAILING_WINDOW_DAYS) {
      // Precision loss converting bigint USD to Number is acceptable here:
      // this feeds a 0-100 heuristic score, never a monetary amount.
      dailyTotals[dayIndex] += Number(tx.amountUSD) / 1_000_000;
    }
  }

  const mean = dailyTotals.reduce((a, b) => a + b, 0) / TRAILING_WINDOW_DAYS;
  if (mean === 0) return 0; // no revenue in window — REVENUE_BELOW_THRESHOLD already catches this

  const variance = dailyTotals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / TRAILING_WINDOW_DAYS;
  const coefficientOfVariation = Math.sqrt(variance) / mean;

  return Math.max(0, Math.min(100, Math.round(coefficientOfVariation * 100)));
}
