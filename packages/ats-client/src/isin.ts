/// Computes a real ISIN check digit (ISO 6166 / Luhn mod 10 over the
/// letters-as-numbers expansion, A=10..Z=35) and builds a full 12-character
/// ISIN from an 11-character base (2-letter country code + 9-character
/// identifier).
///
/// [VERIFIED against real on-chain behavior]: the deployed Factory contract
/// validates this checksum itself (reverts with the real custom error
/// `WrongISINChecksum(string)` otherwise) — the SDK's own client-side
/// `Security.checkISIN` only checks length/format, not the checksum, so an
/// ISIN that passes SDK validation can still be rejected on-chain. Always
/// build ISINs through this function rather than a hand-typed string.
export function buildIsin(countryCode: string, identifier: string): string {
  if (countryCode.length !== 2) throw new Error(`ISIN country code must be 2 letters, got "${countryCode}"`);
  if (identifier.length !== 9) throw new Error(`ISIN identifier must be 9 characters, got "${identifier}" (${identifier.length})`);

  const base11 = (countryCode + identifier).toUpperCase();
  return base11 + isinCheckDigit(base11);
}

function isinCheckDigit(base11: string): number {
  let digits = '';
  for (const ch of base11) {
    digits += ch >= '0' && ch <= '9' ? ch : (ch.charCodeAt(0) - 55).toString(); // A=10, B=11, ..., Z=35
  }

  let sum = 0;
  let double = true; // Luhn: start doubling from the rightmost digit
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }

  return (10 - (sum % 10)) % 10;
}
