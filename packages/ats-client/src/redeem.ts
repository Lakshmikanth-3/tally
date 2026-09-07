import { Bond } from '@hashgraph/asset-tokenization-sdk';

export interface RedeemBondParams {
  securityId: string; // ATS diamond/bond token id
  sourceId: string; // account/partition source to redeem from
}

export interface RedeemBondResult {
  success: boolean;
  transactionId: string;
}

/// Executes the REAL ATS redemption call. Unlike coupon/redemption anchoring
/// (packages/scheduler), this is NOT a no-keeper Hedera Scheduled
/// Transaction -- the ATS SDK's Bond facade builds and signs its own
/// transaction internally and doesn't expose a raw Transaction object we
/// could wrap in ScheduleCreateTransaction. Something (a maturity-day job)
/// must actually call this at/after maturity.
export async function redeemBondAtMaturity(params: RedeemBondParams): Promise<RedeemBondResult> {
  const result = await Bond.fullRedeemAtMaturity({
    securityId: params.securityId,
    sourceId: params.sourceId,
  } as Parameters<typeof Bond.fullRedeemAtMaturity>[0]);

  return { success: result.payload, transactionId: result.transactionId };
}
