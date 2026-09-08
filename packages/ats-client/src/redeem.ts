import { Bond, ControlListRequest, FullRedeemAtMaturityRequest, Security } from '@hashgraph/asset-tokenization-sdk';
import { grantInternalKyc } from './kyc';
import { ensureRoleGranted } from './roles';

// [VERIFIED against real source: SecurityRole.js, same pattern as
// issue.ts's INTEREST_RATE_MANAGER_ROLE] Not exported from the package
// root — copied verbatim from the SDK's own SecurityRole enum.
const MATURITY_REDEEMER_ROLE = '0x433f48f8aca23480f6ab07666cbc9131d32a0b4672033453f65e18f4dd390523';
const CONTROLLIST_ROLE = '0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d';

export interface RedeemBondParams {
  securityId: string; // ATS diamond/bond token id, from IssuedBond.bondTokenId
  sourceId: string; // account/partition to redeem principal from
  sourceEvmAddress: string; // same account's EVM address — Role.grantRole targets accounts by EVM address, not Hedera id
  sourcePrivateKeyHex: string; // same account's raw ECDSA key — self-signs the internal-KYC verifiable credential (see kyc.ts)
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
  // [VERIFIED via a real failed attempt] addToControlList itself is
  // access-controlled by _CONTROLLIST_ROLE — the diamond owner's default
  // admin role doesn't imply it, same gap as _INTEREST_RATE_MANAGER_ROLE
  // and _MATURITY_REDEEMER_ROLE below. Confirmed live: reverted with the
  // real custom error AccountHasNoRole(address,bytes32) until granted here.
  await ensureRoleGranted(params.securityId, params.sourceEvmAddress, CONTROLLIST_ROLE);

  // [VERIFIED via a real failed attempt] CreateBondRequest's isWhiteList:
  // true puts the token's ControlList in whitelist mode (see
  // ControlListStorageWrapper.sol) — an account not explicitly added is
  // "blocked" for every operation gated by it, redemption included, even
  // the diamond owner itself. Confirmed live: fullRedeemAtMaturity reverted
  // with the real custom error AccountIsBlocked(address) until the source
  // account was added here first. Guarded by isAccountInControlList since
  // adding an already-listed account reverts (real, confirmed on retry).
  const alreadyListed = await Security.isAccountInControlList(
    new ControlListRequest({ securityId: params.securityId, targetId: params.sourceEvmAddress }),
  );
  if (!alreadyListed) {
    await Security.addToControlList(
      new ControlListRequest({
        securityId: params.securityId,
        targetId: params.sourceEvmAddress,
      }),
    );
  }

  // Same real gap as issuance's coupon-rate setting (see issue.ts):
  // Bond.create's diamondOwnerAccount only grants the default admin role,
  // not the separate _MATURITY_REDEEMER_ROLE this call needs.
  await ensureRoleGranted(params.securityId, params.sourceEvmAddress, MATURITY_REDEEMER_ROLE);

  // [VERIFIED via a real failed attempt] internalKycActivated: true (see
  // issue.ts) means fullRedeemAtMaturity itself checks the source account's
  // KYC status — confirmed live: reverted with the real custom error
  // InvalidKycStatus() until this ran first. Tally is the custodian for
  // both the issuer and (for now) the only redeeming account, so it
  // self-issues its own KYC credential rather than needing a third-party
  // KYC provider.
  await grantInternalKyc({
    securityId: params.securityId,
    issuerPrivateKeyHex: params.sourcePrivateKeyHex,
    issuerEvmAddress: params.sourceEvmAddress,
    targetEvmAddress: params.sourceEvmAddress,
  });

  const result = await Bond.fullRedeemAtMaturity(
    new FullRedeemAtMaturityRequest({
      securityId: params.securityId,
      sourceId: params.sourceId,
    }),
  );

  return { success: result.payload, transactionId: result.transactionId };
}
