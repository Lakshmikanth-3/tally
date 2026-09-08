import { Client } from '@hashgraph/sdk';
import { redeemBondAtMaturity, type RedeemBondParams } from '@tally/ats-client';
import { anchorNow, EventKind, type AnchorNowResult } from './coupon';
import { getTransactionConsensusTimestamp } from './mirror';
import { isSettlementOnTime } from './on-time';

export interface ExecuteRedemptionParams {
  settlementAnchorContractId: string;
  bondId: Uint8Array;
  issuerEvmAddress: string;
  hcsTxId: string;
  maturitySeconds: number; // BondTerms.maturitySeconds — the real due date redemption is compared against
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
/// `onTime` is never hand-set: it's derived by independently looking up the
/// redemption transaction's REAL consensus timestamp on the mirror node
/// (network-attested, not something this backend could lie about) and
/// comparing it to the bond's real maturitySeconds — "succeeded" and "on
/// time" are different facts, and a late redemption must anchor honestly as
/// onTime=false rather than always reporting true.
/// Call this from a real maturity-day job; it is not itself a no-keeper
/// mechanism, only the anchor write inside it is trivially cheap once
/// redemption has happened.
export async function executeRedemptionAtMaturity(client: Client, params: ExecuteRedemptionParams): Promise<ExecuteRedemptionResult> {
  const redemption = await redeemBondAtMaturity(params.redeem);

  if (!redemption.success) {
    throw new Error(`Bond.fullRedeemAtMaturity reported failure (txId=${redemption.transactionId}) — not anchoring a Redeemed event for something that didn't happen`);
  }

  const actualTimestampSeconds = await getTransactionConsensusTimestamp(redemption.transactionId);
  const onTime = isSettlementOnTime(actualTimestampSeconds, params.maturitySeconds);

  const anchor = await anchorNow(client, {
    settlementAnchorContractId: params.settlementAnchorContractId,
    bondId: params.bondId,
    issuerEvmAddress: params.issuerEvmAddress,
    kind: EventKind.Redeemed,
    onTime,
    hcsTxId: params.hcsTxId,
  });

  return { redemption, anchor };
}
