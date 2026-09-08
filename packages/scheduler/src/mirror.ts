const MIRROR_NODE_BASE_URL = 'https://testnet.mirrornode.hedera.com/api/v1';

/// Converts an `@hashgraph/sdk` TransactionId string (e.g.
/// "0.0.1234@1699999999.123456789") into the dash-separated form the mirror
/// node REST API expects in its URL path (e.g. "0.0.1234-1699999999-123456789").
function toMirrorTransactionId(sdkTransactionId: string): string {
  const [account, timestamp] = sdkTransactionId.split('@');
  if (!account || !timestamp) {
    throw new Error(`unexpected SDK transaction id shape: ${sdkTransactionId}`);
  }
  const [seconds, nanos] = timestamp.split('.');
  return `${account}-${seconds}-${nanos}`;
}

function parseMirrorTimestamp(value: string): number {
  return Math.floor(Number.parseFloat(value));
}

interface MirrorScheduleResponse {
  executed_timestamp: string | null;
  deleted: boolean;
}

/// Real, network-attested fact: when (if ever) a Hedera Scheduled
/// Transaction actually executed. Returns null while still pending —
/// callers must not guess or assume execution happened on schedule.
export async function getScheduleExecutedTimestamp(scheduleId: string): Promise<number | null> {
  const res = await fetch(`${MIRROR_NODE_BASE_URL}/schedules/${scheduleId}`);
  if (!res.ok) {
    throw new Error(`mirror node schedule lookup failed for ${scheduleId}: HTTP ${res.status}`);
  }
  const body = (await res.json()) as MirrorScheduleResponse;
  return body.executed_timestamp === null ? null : parseMirrorTimestamp(body.executed_timestamp);
}

interface MirrorTransactionsResponse {
  transactions: { consensus_timestamp: string; result: string }[];
}

/// Real, network-attested consensus timestamp for a transaction that has
/// already succeeded. Throws if the transaction can't be found or didn't
/// succeed — callers should only call this after their own SDK call
/// reported success, to independently confirm the real settlement time.
export async function getTransactionConsensusTimestamp(sdkTransactionId: string): Promise<number> {
  const mirrorId = toMirrorTransactionId(sdkTransactionId);
  const res = await fetch(`${MIRROR_NODE_BASE_URL}/transactions/${mirrorId}`);
  if (!res.ok) {
    throw new Error(`mirror node transaction lookup failed for ${sdkTransactionId}: HTTP ${res.status}`);
  }
  const body = (await res.json()) as MirrorTransactionsResponse;
  const successful = body.transactions.find((tx) => tx.result === 'SUCCESS');
  if (!successful) {
    throw new Error(`mirror node has no SUCCESS record for transaction ${sdkTransactionId}`);
  }
  return parseMirrorTimestamp(successful.consensus_timestamp);
}
