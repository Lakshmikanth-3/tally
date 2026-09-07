import { Client } from '@hashgraph/sdk';
import { redeemBondAtMaturity, type RedeemBondParams } from '@tally/ats-client';
import { anchorNow, EventKind, type AnchorNowResult } from './coupon';

export interface ExecuteRedemptionParams {
  settlementAnchorContractId: string;
  bondId: Uint8Array;
  issuerEvmAddress: string;
  hcsTxId: string;
  redeem: RedeemBondParams;
}

export interface ExecuteRedemptionResult {
  redemption: { success: boolean; transactionId: string };
  anchor: AnchorNowResult;
}

/// The real, honest redemption flow: calls ATS's actual
/// Bond.fullRedeemAtMaturity first, and only anchors the Redeemed lifecycle
/// event immediately after it genuinely succeeds — never pre-scheduled,
/// since (unlike a coupon) redemption isn't something Hedera can be told in
/// advance to execute autonomously (see redeem.ts's doc comment for why).
/// Call this from a real maturity-day job; it is not itself a no-keeper
/// mechanism, only the anchor write inside it is trivially cheap once
/// redemption has happened.
export async function executeRedemptionAtMaturity(client: Client, params: ExecuteRedemptionParams): Promise<ExecuteRedemptionResult> {
  const redemption = await redeemBondAtMaturity(params.redeem);

  if (!redemption.success) {
    throw new Error(`Bond.fullRedeemAtMaturity reported failure (txId=${redemption.transactionId}) — not anchoring a Redeemed event for something that didn't happen`);
  }

  const anchor = await anchorNow(client, {
    settlementAnchorContractId: params.settlementAnchorContractId,
    bondId: params.bondId,
    issuerEvmAddress: params.issuerEvmAddress,
    kind: EventKind.Redeemed,
    onTime: true, // this function is only ever called once redemption has actually succeeded
    hcsTxId: params.hcsTxId,
  });

  return { redemption, anchor };
}
