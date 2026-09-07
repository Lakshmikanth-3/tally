// Mirrors packages/underwriting/src/pricing.ts and packages/seam's
// UnderwritingReasonCode exactly. Duplicated here — not imported — because
// this CRE workflow is bundled by a separate bun/WASM toolchain outside the
// pnpm workspace graph; a relative `file:` dependency across that boundary
// does not resolve. Keep both copies in sync if the policy changes.

export enum UnderwritingReasonCode {
	APPROVED = 0,
	REVENUE_BELOW_THRESHOLD = 1,
	INSUFFICIENT_HISTORY = 2,
	VOLATILITY_TOO_HIGH = 3,
	ISSUER_HAS_OPEN_DEFAULT = 4,
}

export interface RevenueSnapshot {
	issuerId: string
	trailing90dTotalUSD: bigint
	volatilityScore: number
	historyDays: number
}

const BASE_RATE_BPS = 400 // 4.00% base
const VOLATILITY_PREMIUM_BPS = 4 // +0.04% per volatility point above 10
const REVENUE_THRESHOLD_USD = 3_000_000_000n // $3,000 at 6-decimal fixed point
const MAX_VOLATILITY_SCORE = 40
const MIN_HISTORY_DAYS = 30

export function computeDiscountRate(revenue: Pick<RevenueSnapshot, 'volatilityScore'>): number {
	const premium = Math.max(0, revenue.volatilityScore - 10) * VOLATILITY_PREMIUM_BPS
	return BASE_RATE_BPS + premium
}

export function classifyDecline(revenue: RevenueSnapshot): UnderwritingReasonCode {
	if (revenue.historyDays < MIN_HISTORY_DAYS) return UnderwritingReasonCode.INSUFFICIENT_HISTORY
	if (revenue.trailing90dTotalUSD < REVENUE_THRESHOLD_USD) return UnderwritingReasonCode.REVENUE_BELOW_THRESHOLD
	if (revenue.volatilityScore > MAX_VOLATILITY_SCORE) return UnderwritingReasonCode.VOLATILITY_TOO_HIGH
	return UnderwritingReasonCode.APPROVED
}
