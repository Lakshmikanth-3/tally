import { Security, ControlListRequest, TransferRequest } from '@hashgraph/asset-tokenization-sdk';
import { grantInternalKyc } from './kyc';
import { ensureRoleGranted } from './roles';

// Same real role hashes issue.ts already established for the treasury —
// the SecondaryMarket contract's address needs the identical whitelist/KYC
// treatment as any other real holder under this SDK's isWhiteList/
// internalKycActivated settings; there's no special-cased "contract
// address" exemption.
const CONTROLLIST_ROLE = '0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d';

export interface DepositToMarketParams {
  securityId: string; // bond diamond id (Hedera id or EVM address — same forms issue.ts already uses)
  sourcePrivateKeyHex: string; // custodian's key — self-signs the market contract's internal-KYC credential
  sourceEvmAddress: string; // custodian's EVM address — already holds _CONTROLLIST_ROLE from issuance
  marketEvmAddress: string; // SecondaryMarket contract's EVM address, the transfer's real target
  amount: string; // whole-unit decimal string at this security's decimals, e.g. '0.000001' for one raw unit
}

export interface DepositToMarketResult {
  transactionId: string;
}

/// Moves a real held bond unit from the custodian (treasury) into the
/// SecondaryMarket contract's own balance — the real escrow step
/// `fillOrder` has always needed (see SecondaryMarket.sol: its low-level
/// `bondToken.call(transfer(...))` runs with the contract itself as
/// caller, so it can only ever pay out of a balance the contract actually
/// holds). Before this ran, no order's fill could ever succeed regardless
/// of the taker's real compliance status — every fill failed on an empty
/// contract balance, not a real compliance decision.
///
/// The market contract is a plain Solidity address, not an ATS-aware
/// account, so it needs the exact same real gates any other holder does
/// under isWhiteList/internalKycActivated: control-list membership and a
/// real self-signed internal-KYC credential — granted here, idempotently,
/// the same way issue.ts grants them for the treasury itself.
export async function depositBondToMarket(params: DepositToMarketParams): Promise<DepositToMarketResult> {
  await ensureRoleGranted(params.securityId, params.sourceEvmAddress, CONTROLLIST_ROLE);

  const alreadyListed = await Security.isAccountInControlList(
    new ControlListRequest({ securityId: params.securityId, targetId: params.marketEvmAddress }),
  );
  if (!alreadyListed) {
    await Security.addToControlList(
      new ControlListRequest({ securityId: params.securityId, targetId: params.marketEvmAddress }),
    );
  }

  await grantInternalKyc({
    securityId: params.securityId,
    issuerPrivateKeyHex: params.sourcePrivateKeyHex,
    issuerEvmAddress: params.sourceEvmAddress,
    targetEvmAddress: params.marketEvmAddress,
  });

  const result = await Security.transfer(
    new TransferRequest({ securityId: params.securityId, targetId: params.marketEvmAddress, amount: params.amount }),
  );

  return { transactionId: result.transactionId };
}
