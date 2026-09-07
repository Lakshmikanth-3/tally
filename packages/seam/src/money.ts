// Every USD amount in this codebase is a 6-decimal fixed-point STRING.
// Never a `number`. Never `parseFloat`. Compare and arithmetic as BigInt.

export const USD_DECIMALS = 6n;
export const USD_SCALE = 10n ** USD_DECIMALS;

export function toUsdString(amount: bigint): string {
  return amount.toString();
}

export function bpsOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10000n;
}
