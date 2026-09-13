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

  // [UNRESOLVED — see the note below this function] Redemption still
  // reverts on-chain after all of the above succeeds. Granting the account's
  // long-zero EVM form the control-list entry and the redeemer role as well
  // was tried and did not change the outcome, so it isn't kept here.
  const result = await Bond.fullRedeemAtMaturity(
    new FullRedeemAtMaturityRequest({
      securityId: params.securityId,
      // [VERIFIED via a real failed redemption, then decoded on-chain] This
      // must be the account's ECDSA *alias* address, not its `0.0.x` Hedera
      // id. The SDK resolves a Hedera id to that account's long-zero EVM
      // address (0x...007ad8d1 for 0.0.8050897), which is a different
      // address from the alias (0xcfFc...5777) that everything above — the
      // control-list entry, the KYC grant — was applied to, and which is
      // also the address actually holding the minted units. Passing the id
      // made fullRedeemAtMaturity revert with the real custom error
      // AccountIsBlocked(0x...007ad8d1) against a whitelist the long-zero
      // form was never added to; simulating the identical call with the
      // alias as holder succeeds.
      sourceId: params.sourceEvmAddress,
    }),
  );

  return { success: result.payload, transactionId: result.transactionId };
}

/// KNOWN UNRESOLVED: fullRedeemAtMaturity reverts on a genuinely matured bond
///
/// Verified live against a real 25-minute bond (0.0.10519251) that reached
/// maturity, with real units minted and held. Every documented precondition
/// on the contract's own modifier list was confirmed satisfied:
///
///   - onlyMaturityReached  — getMaturityDate() was in the past
///   - onlyRole(MATURITY_REDEEMER) — hasRole(alias) == true, read on-chain
///   - onlyValidKycStatus(GRANTED)  — getKycStatusFor(alias) == 1
///   - onlyListedAllowed    — alias added to the whitelist
///   - the alias held the units (balanceOf(alias) == 1, totalSupply == 1)
///
/// The transaction still fails with CONTRACT_REVERT_EXECUTED and *empty*
/// revert data (error_message "0x"), consuming 234,093 of a 239,030 gas
/// limit — so it is not out of gas, and no custom error is surfaced to
/// decode. An eth_call simulation of the identical calldata succeeds, which
/// is what makes this hard to pin down: it only fails as a real transaction.
///
/// What was ruled out along the way:
///   - Gas exhaustion: gas_used < gas_limit on every attempt.
///   - Wrong holder address: passing the `0.0.x` id made the SDK resolve to
///     the account's long-zero form and revert with AccountIsBlocked(
///     0x...007ad8d1). Fixed above by passing the alias, which is both
///     whitelisted and the actual holder — the revert data changed, proving
///     the fix took effect, but a different empty revert remains.
///   - Missing grants on the long-zero form: giving it the control-list
///     entry and redeemer role too changed nothing. Its KYC cannot be
///     granted at all, since kyc.ts issues a real ECDSA credential and a
///     long-zero address has no key to hold one.
///
/// Everything else in the bond lifecycle is verified working end to end
/// (issuance, minting, escrowed resale, and real self-executing coupon
/// payments). This one call is the remaining gap; resolving it likely needs
/// ATS-side insight into which check reverts without emitting an error.
