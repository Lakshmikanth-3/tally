export type EvmAddress = `0x${string}`;
export type HederaId = `0.0.${number}`;
export type Hash32 = `0x${string}`;

// ---- Underwriting (Chainlink CRE) ----

export enum UnderwritingReasonCode {
  APPROVED = 0,
  REVENUE_BELOW_THRESHOLD = 1,
  INSUFFICIENT_HISTORY = 2,
  VOLATILITY_TOO_HIGH = 3,
  ISSUER_HAS_OPEN_DEFAULT = 4,
}

export interface UnderwritingVerdict {
  bondId: Hash32;
  approved: boolean;
  recommendedCouponBps: number; // integer basis points, e.g. 620 = 6.20%
  reasonCode: UnderwritingReasonCode;
  attestationRef: string; // CRE workflow execution/report reference
  computedAt: number; // unix seconds, from the workflow's deterministic clock
}

// ---- Bond terms (Hedera / ATS) ----

export interface BondTerms {
  issuer: HederaId;
  faceValueUSD: string; // 6-decimal fixed point, ALWAYS a string — see money.ts
  couponBps: number; // copied from UnderwritingVerdict.recommendedCouponBps at issuance, then frozen
  couponIntervalSeconds: number;
  numberOfCoupons: number;
  maturitySeconds: number;
  bondTokenId?: HederaId; // populated post-deployment
  bondId?: Hash32; // keccak256(issuer, faceValueUSD, maturitySeconds, nonce)
}

// ---- Lifecycle events (indexed by subgraph, anchored to HCS) ----

export type LifecycleEventKind = 'issued' | 'coupon' | 'resale' | 'redeemed' | 'defaulted';

export interface LifecycleEvent {
  bondId: Hash32;
  kind: LifecycleEventKind;
  timestamp: number;
  onTime: boolean | null; // null for non-payment events (issued/resale)
  txId: string; // Hedera transaction id, for the HashScan link
}

// ---- Secondary market ----

export interface MarketOrder {
  bondId: Hash32;
  side: 'bid' | 'ask';
  priceUSD: string; // 6-decimal fixed point string
  quantity: string;
  maker: EvmAddress | HederaId;
}
