export interface RawTransaction {
  amountUSD: bigint; // 6-decimal fixed point, matches @tally/seam money discipline
  timestampSeconds: number;
}

export interface RevenueSnapshot {
  issuerId: string;
  trailing90dTotalUSD: bigint;
  volatilityScore: number; // 0-100, higher = more volatile
  historyDays: number;
}
