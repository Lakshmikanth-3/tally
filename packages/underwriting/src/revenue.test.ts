import { describe, expect, it } from 'vitest';
import { computeRevenueSnapshot } from './revenue';
import type { RawTransaction } from './types';

const DAY = 86_400;
const NOW = 1_700_000_000;

function usd(dollars: number): bigint {
  return BigInt(dollars) * 1_000_000n;
}

describe('computeRevenueSnapshot', () => {
  it('returns zeros for a business with no submitted transactions', () => {
    const snap = computeRevenueSnapshot('issuer-empty', [], NOW);
    expect(snap.trailing90dTotalUSD).toBe(0n);
    expect(snap.historyDays).toBe(0);
    expect(snap.volatilityScore).toBe(0);
  });

  it('sums only transactions within the trailing 90-day window', () => {
    const txs: RawTransaction[] = [
      { amountUSD: usd(100), timestampSeconds: NOW - 10 * DAY }, // in window
      { amountUSD: usd(200), timestampSeconds: NOW - 200 * DAY }, // outside window
    ];
    const snap = computeRevenueSnapshot('issuer-1', txs, NOW);
    expect(snap.trailing90dTotalUSD).toBe(usd(100));
  });

  it('computes historyDays from the earliest ever submitted transaction', () => {
    const txs: RawTransaction[] = [
      { amountUSD: usd(50), timestampSeconds: NOW - 210 * DAY },
      { amountUSD: usd(50), timestampSeconds: NOW - 5 * DAY },
    ];
    const snap = computeRevenueSnapshot('issuer-1', txs, NOW);
    expect(snap.historyDays).toBe(210);
  });

  it('scores steady daily revenue as low volatility', () => {
    const txs: RawTransaction[] = Array.from({ length: 90 }, (_, i) => ({
      amountUSD: usd(200),
      timestampSeconds: NOW - i * DAY,
    }));
    const snap = computeRevenueSnapshot('issuer-steady', txs, NOW);
    expect(snap.volatilityScore).toBe(0);
    expect(snap.trailing90dTotalUSD).toBe(usd(200 * 90));
  });

  it('scores sporadic/spiky daily revenue as high volatility', () => {
    // One huge spike, otherwise silent for 90 days.
    const txs: RawTransaction[] = [{ amountUSD: usd(9000), timestampSeconds: NOW - 1 * DAY }];
    const snap = computeRevenueSnapshot('issuer-spiky', txs, NOW);
    expect(snap.volatilityScore).toBeGreaterThan(90);
  });
});
