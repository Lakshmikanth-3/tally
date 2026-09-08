import path from 'node:path';
import { UnderwritingReasonCode } from '@tally/seam';
import { classifyDecline, computeDiscountRate } from '@tally/underwriting';
import { ATS_TESTNET, buildIsin, issueFixedRateBond, type IssueBondParams, type IssuedBond } from '@tally/ats-client';
import { startBrowserSignerSession } from '@tally/ats-client/browser-runner/runner';
import { getDb } from './db';
import { getBusiness, getRevenueSnapshot } from './business';

// runner.ts's page runs entry.ts's bundle, which attaches this same shape to
// `window.__tally` — but that `declare global` augmentation only applies
// within ats-client's own TS program, not here, so page.evaluate callbacks
// need this cast rather than relying on ambient global merging across the
// package boundary.
interface TallyWindowBridge {
  connectAtsBackend: (creds: { accountId: string; evmAddress: string; privateKeyHex: string }) => Promise<unknown>;
  issueFixedRateBond: (params: IssueBondParams) => Promise<IssuedBond>;
}

const USD_SCALE = 1_000_000n;
const MATURITY_SECONDS = 90 * 86_400; // 90-day bond, matching the rest of Tally's demo terms
const STARTING_DATE_BUFFER_SECONDS = 180; // headroom for the real network round-trips (connect, resolve config version) before the SDK validates startingDate >= now

export interface BondRecord {
  issuerId: string;
  status: 'declined' | 'issued' | 'failed';
  reasonCode: UnderwritingReasonCode;
  couponBps: number | null;
  faceValueUsd: string | null;
  symbol: string | null;
  isin: string | null;
  bondTokenId: string | null;
  evmDiamondAddress: string | null;
  transactionId: string | null;
  errorMessage: string | null;
  startingDateSeconds: number | null;
  maturityDateSeconds: number | null;
  createdAt: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`server misconfigured: ${name} is not set`);
  return value;
}

/// Tally's own custodian account — see packages/ats-client. The same
/// account is both the diamond owner and, for now, the only account that
/// ever needs to redeem, so it self-issues its own KYC credential (see
/// ats-client's kyc.ts) rather than needing a third-party KYC provider.
function getCustodian() {
  return {
    accountId: requireEnv('HEDERA_ECDSA_ACCOUNT_ID'),
    evmAddress: requireEnv('HEDERA_ECDSA_EVM_ADDRESS'),
    privateKeyHex: requireEnv('HEDERA_ECDSA_PRIVATE_KEY'),
  };
}

/// Deterministically derives a bond symbol and ISIN identifier from a real
/// issuer id — not random, not fabricated, just a stable alphanumeric
/// projection of an id that already exists.
function deriveBondCodes(issuerId: string): { symbol: string; isinIdentifier: string } {
  const alnum = issuerId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const symbol = alnum.slice(0, 8).padEnd(4, '0');
  const isinIdentifier = alnum.slice(0, 9).padEnd(9, '0');
  return { symbol, isinIdentifier };
}

function persistBond(record: Omit<BondRecord, 'createdAt'>): BondRecord {
  const createdAt = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO bonds (
        issuer_id, status, reason_code, coupon_bps, face_value_usd, symbol, isin,
        bond_token_id, evm_diamond_address, transaction_id, error_message,
        starting_date_seconds, maturity_date_seconds, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.issuerId,
      record.status,
      record.reasonCode,
      record.couponBps,
      record.faceValueUsd,
      record.symbol,
      record.isin,
      record.bondTokenId,
      record.evmDiamondAddress,
      record.transactionId,
      record.errorMessage,
      record.startingDateSeconds,
      record.maturityDateSeconds,
      createdAt,
    );
  return { ...record, createdAt };
}

export function getLatestBond(issuerId: string): BondRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM bonds WHERE issuer_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(issuerId) as
    | {
        issuer_id: string;
        status: BondRecord['status'];
        reason_code: number;
        coupon_bps: number | null;
        face_value_usd: string | null;
        symbol: string | null;
        isin: string | null;
        bond_token_id: string | null;
        evm_diamond_address: string | null;
        transaction_id: string | null;
        error_message: string | null;
        starting_date_seconds: number | null;
        maturity_date_seconds: number | null;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    issuerId: row.issuer_id,
    status: row.status,
    reasonCode: row.reason_code,
    couponBps: row.coupon_bps,
    faceValueUsd: row.face_value_usd,
    symbol: row.symbol,
    isin: row.isin,
    bondTokenId: row.bond_token_id,
    evmDiamondAddress: row.evm_diamond_address,
    transactionId: row.transaction_id,
    errorMessage: row.error_message,
    startingDateSeconds: row.starting_date_seconds,
    maturityDateSeconds: row.maturity_date_seconds,
    createdAt: row.created_at,
  };
}

/// Runs the real underwriting verdict against this business's real revenue
/// snapshot and, if approved, issues a real fixed-rate bond through the
/// real ATS Factory contract on Hedera testnet — via the real headless-
/// browser signer (see packages/ats-client/browser-runner). This is a real,
/// multi-transaction on-chain flow; it takes on the order of 15-30 seconds,
/// not a simulated or instant result.
export async function issueBondForBusiness(issuerId: string): Promise<BondRecord> {
  const business = getBusiness(issuerId);
  if (!business) throw new Error(`business ${issuerId} not found`);

  const revenue = await getRevenueSnapshot(issuerId);
  const reasonCode = classifyDecline(revenue);

  if (reasonCode !== UnderwritingReasonCode.APPROVED) {
    return persistBond({
      issuerId,
      status: 'declined',
      reasonCode,
      couponBps: null,
      faceValueUsd: null,
      symbol: null,
      isin: null,
      bondTokenId: null,
      evmDiamondAddress: null,
      transactionId: null,
      errorMessage: null,
      startingDateSeconds: null,
      maturityDateSeconds: null,
    });
  }

  const couponBps = computeDiscountRate(revenue);
  const faceValueUsd = (revenue.trailing90dTotalUSD / USD_SCALE).toString();
  const { symbol, isinIdentifier } = deriveBondCodes(issuerId);
  const isin = buildIsin('US', isinIdentifier);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const startingDateSeconds = nowSeconds + STARTING_DATE_BUFFER_SECONDS;
  const maturityDateSeconds = startingDateSeconds + MATURITY_SECONDS;

  const custodian = getCustodian();
  const issueParams: IssueBondParams = {
    issuerAccountId: custodian.accountId,
    issuerEvmAddress: custodian.evmAddress,
    name: `${business.name} Revenue Bond`,
    symbol,
    isin,
    faceValueUSD: faceValueUsd,
    couponBps,
    startingDateSeconds,
    maturityDateSeconds,
  };

  let issued: IssuedBond;
  const session = await startBrowserSignerSession({
    privateKeyHex: custodian.privateKeyHex,
    rpcUrl: ATS_TESTNET.rpcNodeUrl,
    // Next's webpack concatenates this call site into a single per-route
    // output chunk, so runner.ts's own __dirname-based default resolves to
    // that chunk's location, not its real source directory (see
    // CustodianKey.bundlePath's doc comment) — process.cwd() is real and
    // stable for a Next.js server process (the console app's own root),
    // unlike __dirname inside a bundled chunk.
    bundlePath: path.join(process.cwd(), '..', '..', 'packages', 'ats-client', 'browser-runner', 'dist', 'entry.js'),
  });
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

    const issueResult = await session.page.evaluate(async (params) => {
      try {
        const res = await (window as unknown as { __tally: TallyWindowBridge }).__tally.issueFixedRateBond(params);
        return { ok: true as const, res };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    }, issueParams);
    if (!issueResult.ok) throw new Error(`issuing bond failed: ${issueResult.error}`);
    issued = issueResult.res;
  } catch (err) {
    return persistBond({
      issuerId,
      status: 'failed',
      reasonCode,
      couponBps,
      faceValueUsd,
      symbol,
      isin,
      bondTokenId: null,
      evmDiamondAddress: null,
      transactionId: null,
      errorMessage: (err as Error).message,
      startingDateSeconds,
      maturityDateSeconds,
    });
  } finally {
    await session.close();
  }

  return persistBond({
    issuerId,
    status: 'issued',
    reasonCode,
    couponBps,
    faceValueUsd,
    symbol,
    isin,
    bondTokenId: issued.bondTokenId,
    evmDiamondAddress: issued.evmDiamondAddress,
    transactionId: issued.transactionId,
    errorMessage: null,
    startingDateSeconds,
    maturityDateSeconds,
  });
}
