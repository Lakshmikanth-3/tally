import { describe, expect, it } from 'vitest';
import { computeCouponDueDates } from './coupon-schedule';

const START = 1_800_000_000;
const NINETY_DAYS = 90 * 86_400;

describe('computeCouponDueDates', () => {
  it('puts a single coupon exactly on maturity (the bullet-bond case)', () => {
    const maturity = START + NINETY_DAYS;
    expect(computeCouponDueDates(START, maturity, 1)).toEqual([maturity]);
  });

  it('spreads multiple coupons evenly across the real term', () => {
    const maturity = START + NINETY_DAYS;
    const dates = computeCouponDueDates(START, maturity, 3);
    expect(dates).toHaveLength(3);
    expect(dates[0]! - START).toBe(30 * 86_400);
    expect(dates[1]! - START).toBe(60 * 86_400);
    expect(dates[2]).toBe(maturity);
  });

  it('always lands the final coupon exactly on maturity, even when the term does not divide evenly', () => {
    // 100 seconds over 3 coupons floors to a 33s interval; naively
    // accumulating that would put the last coupon at +99, a second short of
    // the real maturity date.
    const maturity = START + 100;
    const dates = computeCouponDueDates(START, maturity, 3);
    expect(dates[2]).toBe(maturity);
  });

  it('never schedules a coupon past maturity', () => {
    const maturity = START + NINETY_DAYS;
    for (const count of [1, 2, 3, 6, 12]) {
      for (const due of computeCouponDueDates(START, maturity, count)) {
        expect(due).toBeLessThanOrEqual(maturity);
        expect(due).toBeGreaterThan(START);
      }
    }
  });

  it('honours a stored interval rather than re-deriving it', () => {
    const maturity = START + NINETY_DAYS;
    const dates = computeCouponDueDates(START, maturity, 3, 10 * 86_400);
    expect(dates[0]! - START).toBe(10 * 86_400);
    expect(dates[1]! - START).toBe(20 * 86_400);
    expect(dates[2]).toBe(maturity); // last one still pinned to maturity
  });
});
