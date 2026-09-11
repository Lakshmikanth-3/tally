import path from 'node:path';
import { ethers } from 'ethers';
import { ATS_TESTNET, type RedeemBondParams } from '@tally/ats-client';
import { startBrowserSignerSession } from '@tally/ats-client/browser-runner/runner';
import { buildHederaClient, anchorNow, EventKind, isSettlementOnTime } from '@tally/scheduler';
import { getLatestBond, getCustodian, markBondRedeemed } from './bonds';
import { computeBondId } from './secondary-market';

const SETTLEMENT_ANCHOR_HEDERA_ID = '0.0.10410671'; // real deployed anchor — see lib/explorer.ts's PROOF_ENTRIES
const MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com/api/v1';

interface TallyWindowBridge {
  connectAtsBackend: (creds: { accountId: string; evmAddress: string; privateKeyHex: string }) => Promise<unknown>;
  redeemBondAtMaturity: (params: RedeemBondParams) => Promise<{ success: boolean; transactionId: string }>;
}

interface MirrorContractResult {
  timestamp: string; // "<seconds>.<nanos>"
  result: string;
}

/// redeemBondAtMaturity's real transactionId comes back as a 0x-prefixed
/// EVM hash (the ATS SDK's browser/MetaMask signer path), not the native
/// Hedera "0.0.x@seconds.nanos" form packages/scheduler's mirror.ts already
/// handles — this looks it up the way lib/secondary-market.ts already does
/// for the same reason, via the mirror node's EVM-transaction-hash endpoint.
async function getConsensusTimestampByEvmHash(hash: string): Promise<number> {
  const res = await fetch(`${MIRROR_NODE_URL}/contracts/results/${hash}`);
  if (!res.ok) throw new Error(`mirror node contract-result lookup failed for ${hash}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as MirrorContractResult;
  return Math.floor(Number(body.timestamp));
}

export interface RedeemBondResult {
  transactionId: string;
  onTime: boolean;
  anchorTransactionId: string;
}

/// Executes the real ATS redemption call for a matured bond, then anchors
/// a real Redeemed lifecycle event immediately after — mirrors
/// packages/scheduler's executeRedemptionAtMaturity, but split across a
/// real headless-browser session (for the ATS-gated redeem call, same
/// requirement issuance has) and a plain Hedera Client (for the anchor
/// call, which doesn't need one) rather than one function, since this
/// console can't run a plain Node import of the ATS SDK's write path (see
/// packages/ats-client/src/init.ts's doc comment on Injectable.isWeb()).
export async function redeemBondForBusiness(issuerId: string): Promise<RedeemBondResult> {
  const bond = getLatestBond(issuerId);
  if (!bond || bond.status !== 'issued' || !bond.bondTokenId || !bond.evmDiamondAddress || !bond.maturityDateSeconds) {
    throw new Error(`business ${issuerId} has no issued bond to redeem`);
  }
  if (bond.redeemedAt) {
    throw new Error(`business ${issuerId}'s bond was already redeemed (tx=${bond.redeemTransactionId})`);
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds < bond.maturityDateSeconds) {
    const daysRemaining = Math.ceil((bond.maturityDateSeconds - nowSeconds) / 86_400);
    throw new Error(`this bond hasn't matured yet — ${daysRemaining} day(s) remaining`);
  }

  const custodian = getCustodian();

  const session = await startBrowserSignerSession({
    privateKeyHex: custodian.privateKeyHex,
    rpcUrl: ATS_TESTNET.rpcNodeUrl,
    bundlePath: path.join(process.cwd(), '..', '..', 'packages', 'ats-client', 'browser-runner', 'dist', 'entry.js'),
  });

  let redeemTransactionId: string;
  try {
    const connectResult = await session.page.evaluate(async (creds) => {
      try {
        await (window as unknown as { __tally: TallyWindowBridge }).__tally.connectAtsBackend(creds);
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    }, custodian);
    if (!connectResult.ok) throw new Error(`connecting to ATS backend failed: ${connectResult.error}`);

    const redeemParams: RedeemBondParams = {
      securityId: bond.bondTokenId,
      sourceId: custodian.accountId,
      sourceEvmAddress: custodian.evmAddress,
      sourcePrivateKeyHex: custodian.privateKeyHex,
    };

    const redeemResult = await session.page.evaluate(async (params) => {
      try {
        const res = await (window as unknown as { __tally: TallyWindowBridge }).__tally.redeemBondAtMaturity(params);
        return { ok: true as const, res };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    }, redeemParams);
    if (!redeemResult.ok) throw new Error(`redeeming bond failed: ${redeemResult.error}`);
    if (!redeemResult.res.success) throw new Error(`Bond.fullRedeemAtMaturity reported failure (tx=${redeemResult.res.transactionId})`);

    redeemTransactionId = redeemResult.res.transactionId;
  } finally {
    await session.close();
  }

  // Redemption genuinely succeeded — now independently confirm its real
  // consensus timestamp and anchor a Redeemed event, never speculatively.
  const actualTimestampSeconds = await getConsensusTimestampByEvmHash(redeemTransactionId);
  const onTime = isSettlementOnTime(actualTimestampSeconds, bond.maturityDateSeconds);

  const client = buildHederaClient({ accountId: custodian.accountId, privateKeyHex: custodian.privateKeyHex });
  let anchorTransactionId: string;
  try {
    const bondIdHex = computeBondId(bond.evmDiamondAddress, bond.bondTokenId);
    const anchor = await anchorNow(client, {
      settlementAnchorContractId: SETTLEMENT_ANCHOR_HEDERA_ID,
      bondId: ethers.getBytes(bondIdHex),
      issuerEvmAddress: custodian.evmAddress,
      kind: EventKind.Redeemed,
      onTime,
      hcsTxId: redeemTransactionId,
    });
    anchorTransactionId = anchor.transactionId;
  } finally {
    client.close();
  }

  markBondRedeemed(issuerId, bond.createdAt, redeemTransactionId, onTime);

  return { transactionId: redeemTransactionId, onTime, anchorTransactionId };
}
