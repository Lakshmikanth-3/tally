import { describe, expect, it } from 'vitest';
import { isSettlementOnTime } from './on-time';

describe('isSettlementOnTime', () => {
  it('is true when settlement lands exactly on the due date', () => {
    expect(isSettlementOnTime(1_700_000_000, 1_700_000_000)).toBe(true);
  });

  it('is true when settlement lands before the due date', () => {
    expect(isSettlementOnTime(1_699_999_999, 1_700_000_000)).toBe(true);
  });

  it('is false when settlement lands after the due date', () => {
    expect(isSettlementOnTime(1_700_000_001, 1_700_000_000)).toBe(false);
  });
});
