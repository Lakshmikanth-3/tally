import path from 'node:path';
import { ethers } from 'ethers';
import { UnderwritingReasonCode } from '@tally/seam';
import { classifyDecline, computeDiscountRate } from '@tally/underwriting';
import {
  ATS_TESTNET,
  buildIsin,
  issueFixedRateBond,
  type DepositToMarketParams,
  type DepositToMarketResult,
  type IssueBondParams,
  type IssuedBond,
} from '@tally/ats-client';
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
  depositBondToMarket: (params: DepositToMarketParams) => Promise<DepositToMarketResult>;
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
  couponScheduleId: string | null;
  couponDueDateSeconds: number | null;
  couponAmountHbar: string | null;
  couponAnchoredAt: number | null;
  couponAnchorTxId: string | null;
  redeemedAt: number | null;
  redeemTransactionId: string | null;
  redeemOnTime: boolean | null;
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
///
/// evmAddress is derived from the private key (same as
/// lib/secondary-market.ts's getCustodianEvmAddress) rather than a separate
/// required env var — a second value that must always agree with the key
/// is one more way to misconfigure this than deriving it outright.
export function getCustodian() {
  const privateKeyHex = requireEnv('HEDERA_ECDSA_PRIVATE_KEY');
  return {
    accountId: requireEnv('HEDERA_ECDSA_ACCOUNT_ID'),
    evmAddress: ethers.computeAddress(`0x${privateKeyHex.replace(/^0x/, '')}`),
    privateKeyHex,
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

// Coupon-schedule fields are never set at issuance time — armCouponForBond
// fills them in afterward, as a separate real action — so a freshly
// persisted row never has them yet.
type FreshBondFields =
  | 'createdAt'
  | 'couponScheduleId'
  | 'couponDueDateSeconds'
  | 'couponAmountHbar'
  | 'couponAnchoredAt'
  | 'couponAnchorTxId'
  | 'redeemedAt'
  | 'redeemTransactionId'
  | 'redeemOnTime';

function persistBond(record: Omit<BondRecord, FreshBondFields>): BondRecord {
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
  return {
    ...record,
    createdAt,
    couponScheduleId: null,
    couponDueDateSeconds: null,
    couponAmountHbar: null,
    couponAnchoredAt: null,
    couponAnchorTxId: null,
    redeemedAt: null,
    redeemTransactionId: null,
    redeemOnTime: null,
  };
}

interface BondRow {
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
  coupon_schedule_id: string | null;
  coupon_due_date_seconds: number | null;
  coupon_amount_hbar: string | null;
  coupon_anchored_at: number | null;
  coupon_anchor_tx_id: string | null;
  redeemed_at: number | null;
  redeem_transaction_id: string | null;
  redeem_on_time: number | null;
}

function rowToBondRecord(row: BondRow): BondRecord {
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
    couponScheduleId: row.coupon_schedule_id,
    couponDueDateSeconds: row.coupon_due_date_seconds,
    couponAmountHbar: row.coupon_amount_hbar,
    couponAnchoredAt: row.coupon_anchored_at,
    couponAnchorTxId: row.coupon_anchor_tx_id,
    redeemedAt: row.redeemed_at,
    redeemTransactionId: row.redeem_transaction_id,
    redeemOnTime: row.redeem_on_time === null ? null : Boolean(row.redeem_on_time),
  };
}

export function getLatestBond(issuerId: string): BondRecord | null {
  const row = getDb().prepare('SELECT * FROM bonds WHERE issuer_id = ? ORDER BY created_at DESC LIMIT 1').get(issuerId) as
    | BondRow
    | undefined;
  return row ? rowToBondRecord(row) : null;
}

/// Finds the real issued bond behind a given ATS diamond address — used by
/// the secondary-market fill route to go from a bid order's on-chain
/// bondToken address back to the Hedera-format bondTokenId depositBondForResale
/// needs, since the on-chain Order struct only ever carries the EVM address.
export function findBondByEvmDiamondAddress(evmDiamondAddress: string): BondRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM bonds WHERE evm_diamond_address = ? AND status = 'issued' ORDER BY created_at DESC LIMIT 1")
    .get(evmDiamondAddress) as BondRow | undefined;
  return row ? rowToBondRecord(row) : null;
}

/// Every real underwriting run for this issuer, newest first — the bonds
/// table is insert-only per run (declined/issued/failed), so this is
/// already a true history, not a derived or reconstructed one.
export function listBondsForIssuer(issuerId: string): BondRecord[] {
  const rows = getDb().prepare('SELECT * FROM bonds WHERE issuer_id = ? ORDER BY created_at DESC').all(issuerId) as BondRow[];
  return rows.map(rowToBondRecord);
}

/// Every currently-issued bond across every business — one row per
/// issuer_id (its latest issued run), since a business could in principle
/// have more than one 'issued' row across its real history and only the
/// most recent one is the live instrument. Used by the lifecycle poller to
/// find real work (coupons to arm/anchor, redemptions due) without an
/// issuer id supplied ahead of time.
export function listAllIssuedBonds(): BondRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT b.* FROM bonds b
       WHERE b.status = 'issued'
       AND b.created_at = (SELECT MAX(b2.created_at) FROM bonds b2 WHERE b2.issuer_id = b.issuer_id AND b2.status = 'issued')`,
    )
    .all() as BondRow[];
  return rows.map(rowToBondRecord);
}

/// Records that a coupon's Coupon lifecycle event was anchored — called
/// only after settleCouponAndAnchor's own real mirror-node check confirms
/// the scheduled payment actually executed.
export function markCouponAnchored(issuerId: string, createdAt: number, anchorTxId: string): void {
  getDb()
    .prepare('UPDATE bonds SET coupon_anchored_at = ?, coupon_anchor_tx_id = ? WHERE issuer_id = ? AND created_at = ?')
    .run(Math.floor(Date.now() / 1000), anchorTxId, issuerId, createdAt);
}

/// Records a real, already-succeeded redemption — never called
/// speculatively ahead of Bond.fullRedeemAtMaturity actually succeeding.
export function markBondRedeemed(issuerId: string, createdAt: number, transactionId: string, onTime: boolean): void {
  getDb()
    .prepare('UPDATE bonds SET redeemed_at = ?, redeem_transaction_id = ?, redeem_on_time = ? WHERE issuer_id = ? AND created_at = ?')
    .run(Math.floor(Date.now() / 1000), transactionId, onTime ? 1 : 0, issuerId, createdAt);
}

/// Runs the real underwriting verdict against this business's real revenue
/// snapshot and, if approved, issues a real fixed-rate bond through the
/// real ATS Factory contract on Hedera testnet — via the real headless-
/// browser signer (see packages/ats-client/browser-runner). This is a real,
/// multi-transaction on-chain flow; it takes on the order of 15-30 seconds,
/// not a simulated or instant result.
const UNDERWRITING_COOLDOWN_SECONDS = 24 * 3600;

export async function issueBondForBusiness(issuerId: string): Promise<BondRecord> {
  const business = getBusiness(issuerId);
  if (!business) throw new Error(`business ${issuerId} not found`);

  // A real policy, not just UI throttling: a business's revenue snapshot
  // doesn't meaningfully change within a day, so re-running produces a
  // near-identical verdict — this blocks that, while a real 'failed' run
  // (e.g. a transient network error) can still be retried immediately, and
  // an 'issued' bond is never re-underwritten at all.
  const latest = getLatestBond(issuerId);
  if (latest?.status === 'issued') {
    throw new Error(`business ${issuerId} already has an issued bond — underwriting doesn't re-run on top of one`);
  }
  if (latest?.status === 'declined') {
    const secondsSince = Math.floor(Date.now() / 1000) - latest.createdAt;
    if (secondsSince < UNDERWRITING_COOLDOWN_SECONDS) {
      const hoursRemaining = Math.ceil((UNDERWRITING_COOLDOWN_SECONDS - secondsSince) / 3600);
      throw new Error(`underwriting already ran for this business ${Math.floor(secondsSince / 3600)}h ago — try again in ~${hoursRemaining}h`);
    }
  }

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
    issuerPrivateKeyHex: custodian.privateKeyHex,
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

const SECONDARY_MARKET_EVM_ADDRESS = '0x4C8Ae85686229f6b8CA55B79a7261842ADD46C5f'; // same deployed contract as lib/secondary-market.ts

/// Moves the custodian's real held bond unit into the SecondaryMarket
/// contract's own balance — the real escrow step a listed order needs
/// before any fill against it can ever succeed (see ats-client's
/// deposit.ts for why: SecondaryMarket.sol's fillOrder pays out of its own
/// balance, and nothing moved tokens into that balance until now). Same
/// real headless-browser signer session issuance already uses — this is a
/// state-changing ATS call, not something a raw RPC call can make on its
/// own behalf.
export async function depositBondForResale(bondTokenId: string): Promise<DepositToMarketResult> {
  const custodian = getCustodian();

  const session = await startBrowserSignerSession({
    privateKeyHex: custodian.privateKeyHex,
    rpcUrl: ATS_TESTNET.rpcNodeUrl,
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

    const depositParams: DepositToMarketParams = {
      securityId: bondTokenId,
      sourcePrivateKeyHex: custodian.privateKeyHex,
      sourceEvmAddress: custodian.evmAddress,
      marketEvmAddress: SECONDARY_MARKET_EVM_ADDRESS,
      amount: '0.000001', // one raw unit at this security's 6 decimals — see ats-client's issue.ts for why '1' overflows maxSupply
    };

    const depositResult = await session.page.evaluate(async (params) => {
      try {
        const res = await (window as unknown as { __tally: TallyWindowBridge }).__tally.depositBondToMarket(params);
        return { ok: true as const, res };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    }, depositParams);
    if (!depositResult.ok) throw new Error(`depositing bond to market failed: ${depositResult.error}`);

    return depositResult.res;
  } finally {
    await session.close();
  }
}
