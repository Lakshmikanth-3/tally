import {
  AccountId,
  Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  ScheduleCreateTransaction,
  Timestamp,
  TransactionResponse,
} from '@hashgraph/sdk';

// Mirrors SettlementAnchor.EventKind in contracts/src/SettlementAnchor.sol —
// keep in sync; see that file for why a single fixed enum ordering matters.
export enum EventKind {
  Issued = 0,
  Coupon = 1,
  Resale = 2,
  Redeemed = 3,
  Defaulted = 4,
}

export interface ScheduleAnchorParams {
  settlementAnchorContractId: string; // Hedera-format id, e.g. "0.0.10410671" — the REAL Hedera-deployed anchor, not the Sepolia copy used for subgraph indexing
  bondId: Uint8Array; // 32 bytes
  issuerEvmAddress: string; // 0x-prefixed, 20 bytes
  kind: EventKind;
  onTime: boolean;
  hcsTxId: string;
  executeAtSeconds: number; // unix seconds — when the Hedera network should execute this, with no keeper
  gas?: number;
}

export interface ScheduledAnchorResult {
  scheduleId: string;
  transactionId: string;
}

/// Arms a real Hedera Scheduled Transaction that calls
/// SettlementAnchor.anchor(...) at `executeAtSeconds`, with no keeper bot —
/// this is the literal mechanism behind the PRD's "coupons pay themselves"
/// claim. `waitForExpiry(true)` is what makes Hedera itself execute the
/// scheduled call once its expirationTime arrives, rather than requiring
/// every required signer to have already signed (the default
/// execute-as-soon-as-signed behavior, which would not be autonomous).
export async function scheduleAnchorCall(client: Client, params: ScheduleAnchorParams): Promise<ScheduledAnchorResult> {
  const functionParams = new ContractFunctionParameters()
    .addBytes32(params.bondId)
    .addAddress(params.issuerEvmAddress)
    .addUint8(params.kind)
    .addBool(params.onTime)
    .addString(params.hcsTxId);

  const innerTx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(params.settlementAnchorContractId))
    .setGas(params.gas ?? 200_000)
    .setFunction('anchor', functionParams);

  const scheduleTx = new ScheduleCreateTransaction()
    .setScheduledTransaction(innerTx)
    .setScheduleMemo(`tally-anchor-${EventKind[params.kind].toLowerCase()}`)
    .setExpirationTime(Timestamp.fromDate(new Date(params.executeAtSeconds * 1000)))
    .setWaitForExpiry(true);

  const response: TransactionResponse = await scheduleTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.scheduleId) {
    throw new Error(`ScheduleCreateTransaction succeeded but returned no scheduleId (txId=${response.transactionId.toString()})`);
  }

  return {
    scheduleId: receipt.scheduleId.toString(),
    transactionId: response.transactionId.toString(),
  };
}

// Re-exported so callers building `issuerEvmAddress`/contract ids don't need
// a separate @hashgraph/sdk import just for this type.
export { AccountId };
