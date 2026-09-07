import { describe, expect, it } from 'vitest';
import { UnderwritingReasonCode } from '@tally/seam';
import { classifyDecline, computeDiscountRate, isApproved } from './pricing';
import type { RevenueSnapshot } from './types';

function snapshot(overrides: Partial<RevenueSnapshot>): RevenueSnapshot {
  return {
    issuerId: 'issuer-test',
    trailing90dTotalUSD: 18_400_000_000n, // $18,400
    volatilityScore: 12,
    historyDays: 210,
    ...overrides,
  };
}

describe('classifyDecline / isApproved — the three demo outcomes', () => {
  it('approves a healthy, established, low-volatility business', () => {
    const snap = snapshot({});
    expect(classifyDecline(snap)).toBe(UnderwritingReasonCode.APPROVED);
    expect(isApproved(snap)).toBe(true);
  });

  it('declines a business with too little trading history', () => {
    const snap = snapshot({ historyDays: 10 });
    expect(classifyDecline(snap)).toBe(UnderwritingReasonCode.INSUFFICIENT_HISTORY);
  });

  it('declines a business below the revenue threshold', () => {
    const snap = snapshot({ trailing90dTotalUSD: 500_000_000n }); // $500
    expect(classifyDecline(snap)).toBe(UnderwritingReasonCode.REVENUE_BELOW_THRESHOLD);
  });

  it('declines a business whose revenue is too volatile (borderline case)', () => {
    const snap = snapshot({ volatilityScore: 85 });
    expect(classifyDecline(snap)).toBe(UnderwritingReasonCode.VOLATILITY_TOO_HIGH);
  });
});

describe('computeDiscountRate', () => {
  it('charges the base rate with no volatility premium below the free tier', () => {
    expect(computeDiscountRate({ volatilityScore: 5 })).toBe(400);
  });

  it('adds a premium per volatility point above 10', () => {
    expect(computeDiscountRate({ volatilityScore: 12 })).toBe(400 + 2 * 4);
  });
});
