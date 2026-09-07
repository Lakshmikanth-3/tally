import { describe, expect, it } from 'vitest';
import { bpsOf, toUsdString, USD_SCALE } from './money';

describe('bpsOf', () => {
  it('computes basis points as integer BigInt arithmetic', () => {
    expect(bpsOf(10_000n, 620)).toBe(620n);
    expect(bpsOf(1_000_000n, 100)).toBe(10_000n);
  });

  it('round-trips correctly at 0 bps', () => {
    expect(bpsOf(123_456_789n, 0)).toBe(0n);
  });

  it('round-trips correctly at 10000 bps (100%)', () => {
    expect(bpsOf(123_456_789n, 10_000)).toBe(123_456_789n);
  });

  it('never produces a float — result type is always bigint', () => {
    const result = bpsOf(3n, 333);
    expect(typeof result).toBe('bigint');
  });
});

describe('toUsdString', () => {
  it('formats a scaled bigint as a plain integer string', () => {
    expect(toUsdString(18_400n * USD_SCALE)).toBe((18_400n * USD_SCALE).toString());
  });
});
