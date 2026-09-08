import { AccountId, Client, Hbar, ScheduleCreateTransaction, Timestamp, TransactionResponse, TransferTransaction } from '@hashgraph/sdk';
import { anchorNow, EventKind, type AnchorNowResult } from './coupon';
import { getScheduleExecutedTimestamp } from './mirror';
import { isSettlementOnTime } from './on-time';

/// Coupon N's real due date — issuance timestamp plus N interval hops.
/// Pure function so it's trivially testable without any network calls.
export function computeCouponDueDateSeconds(issuanceTimestampSeconds: number, couponIntervalSeconds: number, couponIndex: number): number {
  return issuanceTimestampSeconds + couponIndex * couponIntervalSeconds;
}

export interface ArmCouponPaymentParams {
  treasuryAccountId: string; // pays the coupon (the issuer/custodian account)
  bondholderAccountId: string; // receives the coupon
  amountHbar: number; // real testnet HBAR amount for this coupon
  dueDateSeconds: number;
  memo?: string;
}

export interface ArmedCouponPayment {
  scheduleId: string;
  transactionId: string;
}

/// Arms the REAL coupon payment itself (an HBAR transfer) as a no-keeper
/// Hedera Scheduled Transaction expiring at the coupon's real due date —
/// the money-movement that was previously entirely missing from this repo;
/// only the lifecycle *event* was ever anchored, never a real payment
/// behind it. Same setWaitForExpiry(true) no-keeper pattern already proven
/// for SettlementAnchor.anchor() calls in ./coupon.ts.
export async function armCouponPayment(client: Client, params: ArmCouponPaymentParams): Promise<ArmedCouponPayment> {
  const transfer = new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(params.treasuryAccountId), new Hbar(-params.amountHbar))
    .addHbarTransfer(AccountId.fromString(params.bondholderAccountId), new Hbar(params.amountHbar));

  const scheduleTx = new ScheduleCreateTransaction()
    .setScheduledTransaction(transfer)
    .setScheduleMemo(params.memo ?? 'tally-coupon-payment')
    .setExpirationTime(Timestamp.fromDate(new Date(params.dueDateSeconds * 1000)))
    .setWaitForExpiry(true);

  const response: TransactionResponse = await scheduleTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.scheduleId) {
    throw new Error(`ScheduleCreateTransaction for coupon payment succeeded but returned no scheduleId (txId=${response.transactionId.toString()})`);
  }

  return { scheduleId: receipt.scheduleId.toString(), transactionId: response.transactionId.toString() };
}

export interface SettleCouponParams {
  settlementAnchorContractId: string;
  scheduleId: string; // from armCouponPayment
  dueDateSeconds: number;
  bondId: Uint8Array;
  issuerEvmAddress: string;
  hcsTxId: string;
}

export type CouponSettlementOutcome = { status: 'anchored'; onTime: boolean; anchor: AnchorNowResult } | { status: 'not_yet_executed' };

/// Meant to run any time after a coupon's due date has passed. Looks up the
/// REAL execution timestamp of the scheduled payment on the mirror node —
/// network-attested, never assumed just because it was armed that way. If
/// Hedera hasn't executed it yet (e.g. the treasury was underfunded at
/// expiration and the network let the schedule lapse without paying), this
/// anchors nothing: a Coupon lifecycle event is only ever recorded after a
/// real, confirmed transfer, never speculatively. Call this again later,
/// after a real late payment has actually gone through (its own
/// armCouponPayment/schedule, same dueDateSeconds), to anchor honestly as
/// onTime=false — never a hand-set boolean.
export async function settleCouponAndAnchor(client: Client, params: SettleCouponParams): Promise<CouponSettlementOutcome> {
  const executedTimestampSeconds = await getScheduleExecutedTimestamp(params.scheduleId);
  if (executedTimestampSeconds === null) {
    return { status: 'not_yet_executed' };
  }

  const onTime = isSettlementOnTime(executedTimestampSeconds, params.dueDateSeconds);

  const anchor = await anchorNow(client, {
    settlementAnchorContractId: params.settlementAnchorContractId,
    bondId: params.bondId,
    issuerEvmAddress: params.issuerEvmAddress,
    kind: EventKind.Coupon,
    onTime,
    hcsTxId: params.hcsTxId,
  });

  return { status: 'anchored', onTime, anchor };
}
