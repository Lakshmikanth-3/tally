import { Client } from '@hashgraph/sdk';
import { EventKind, scheduleAnchorCall, type ScheduledAnchorResult } from './coupon';

export interface ScheduleRedemptionParams {
  settlementAnchorContractId: string;
  bondId: Uint8Array;
  issuerEvmAddress: string;
  onTime: boolean;
  hcsTxId: string;
  maturitySeconds: number;
}

/// Arms the Redeemed anchor event to fire at maturity, no keeper — same
/// mechanism as scheduleAnchorCall in coupon.ts, kept as a separate named
/// entry point since redemption and coupon scheduling are called from
/// different points in the bond lifecycle.
///
/// [SCOPE NOTE]: this only schedules our own public-record anchor. It does
/// NOT yet schedule the real ATS-side `Bond.fullRedeemAtMaturity` call that
/// actually moves principal — that goes through the ATS SDK's own
/// transaction-signing flow (see packages/ats-client), not a plain
/// ContractExecuteTransaction, and hasn't been wired up here. Anchoring
/// without the real redemption call would misrepresent redemption as having
/// happened when it hasn't — don't call this in place of the real
/// redemption until that's connected.
export async function scheduleRedemptionAnchor(client: Client, params: ScheduleRedemptionParams): Promise<ScheduledAnchorResult> {
  return scheduleAnchorCall(client, {
    settlementAnchorContractId: params.settlementAnchorContractId,
    bondId: params.bondId,
    issuerEvmAddress: params.issuerEvmAddress,
    kind: EventKind.Redeemed,
    onTime: params.onTime,
    hcsTxId: params.hcsTxId,
    executeAtSeconds: params.maturitySeconds,
  });
}
