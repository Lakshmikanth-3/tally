import { Bond, FullRedeemAtMaturityRequest } from '@hashgraph/asset-tokenization-sdk';

export interface RedeemBondParams {
  securityId: string; // ATS diamond/bond token id, from IssuedBond.bondTokenId
  sourceId: string; // account/partition to redeem principal from
}

export interface RedeemBondResult {
  success: boolean;
  transactionId: string;
}

/// Executes the REAL ATS redemption call (Bond.fullRedeemAtMaturity).
///
/// Unlike coupon/redemption *anchoring* (packages/scheduler), this is NOT a
/// no-keeper Hedera Scheduled Transaction: the ATS SDK's Bond facade builds
/// and signs its own transaction internally via Network.connect's signer,
/// and doesn't expose a raw Transaction object that ScheduleCreateTransaction
/// could wrap. Something — a maturity-day job — has to actually call this at
/// or after maturity. Only Tally's own SettlementAnchor event (see
/// packages/scheduler) is genuinely keeper-free; don't claim redemption
/// itself is, or pre-schedule its anchor in advance of this call actually
/// succeeding.
export async function redeemBondAtMaturity(params: RedeemBondParams): Promise<RedeemBondResult> {
  const result = await Bond.fullRedeemAtMaturity(
    new FullRedeemAtMaturityRequest({
      securityId: params.securityId,
      sourceId: params.sourceId,
    }),
  );

  return { success: result.payload, transactionId: result.transactionId };
}
