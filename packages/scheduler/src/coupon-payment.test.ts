import { describe, expect, it } from 'vitest';
import { computeCouponDueDateSeconds } from './coupon-payment';

const DAY = 86_400;

describe('computeCouponDueDateSeconds', () => {
  it('returns the issuance timestamp for coupon index 0', () => {
    expect(computeCouponDueDateSeconds(1_700_000_000, 30 * DAY, 0)).toBe(1_700_000_000);
  });

  it('adds one interval per coupon index', () => {
    const issuance = 1_700_000_000;
    const interval = 30 * DAY;
    expect(computeCouponDueDateSeconds(issuance, interval, 3)).toBe(issuance + 3 * interval);
  });
});
