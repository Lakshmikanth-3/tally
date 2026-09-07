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

const DECIMAL_USD_PATTERN = /^\d+(\.\d{1,6})?$/;

/// Parses a human-entered decimal dollar string (e.g. "42.50") into a
/// 6-decimal fixed-point bigint, using only integer arithmetic — never
/// `parseFloat`, which would introduce binary floating-point error into a
/// money value. Rejects anything with more than 6 fractional digits rather
/// than silently truncating precision.
export function parseUsdToMicros(input: string): bigint {
  const trimmed = input.trim();
  if (!DECIMAL_USD_PATTERN.test(trimmed)) {
    throw new Error(`invalid USD amount: ${JSON.stringify(input)}`);
  }
  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const paddedFraction = fractionPart.padEnd(Number(USD_DECIMALS), '0');
  return BigInt(wholePart) * USD_SCALE + BigInt(paddedFraction);
}
