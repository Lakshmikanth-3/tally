import { Bond, CreateBondRequest, FixedRate, SetRateRequest } from '@hashgraph/asset-tokenization-sdk';
import { ATS_TESTNET } from './init';
import { resolveLatestBondConfigVersion } from './config-version';
import { ensureRoleGranted } from './roles';

const USD_CURRENCY_BYTES3 = '0x555344'; // hex of ASCII "USD", per FormatValidation.checkBytes3Format

// [VERIFIED against real source: SecurityRole.js] `SecurityRole` itself
// isn't exported from the package root (only the `Role`/`RoleRequest`
// port-in classes are) — this is the real on-chain role hash for
// `_INTEREST_RATE_MANAGER_ROLE`, copied verbatim from the SDK's own
// internal domain/context/security/SecurityRole.ts enum.
const INTEREST_RATE_MANAGER_ROLE = '0xfa80c71f8de1628faf2c0e9bd02c2f4a3da1f16823b75e61e84b90164a07b4a4';

export interface IssueBondParams {
  issuerAccountId: string; // diamondOwnerAccount — Hedera id of the issuing business
  issuerEvmAddress: string; // same account's EVM address — Role.grantRole targets accounts by EVM address, not Hedera id
  name: string; // e.g. "Corrado's Deli Revenue Bond"
  symbol: string; // e.g. "CORRADO1"
  isin: string; // demo/testnet ISIN — max 12 chars, the SDK's real validated length
  faceValueUSD: string; // whole-dollar string, e.g. "18400" — see @tally/seam money.ts for the 6-decimal convention this is derived from
  couponBps: number; // frozen at issuance from the CRE verdict — see @tally/seam UnderwritingVerdict
  startingDateSeconds: number;
  maturityDateSeconds: number;
}

export interface IssuedBond {
  bondTokenId: string; // Hedera id of the deployed diamond contract
  evmDiamondAddress: string;
  transactionId: string; // the deployment transaction id (the rate-setting call has its own, separate id)
}

const RATE_DECIMALS = 2;

/// Issues a real Bond via ATS's Factory contract, then sets its fixed
/// coupon rate as a real, separate follow-up call.
///
/// [VERIFIED against real source and a real live attempt] The single-call
/// `Bond.createFixedRate` path is broken in this SDK version (8.0.0): it
/// invokes `factoryInstance["deployBondFixedRate"]`, but the real deployed
/// Factory contract only exposes `deployBond` (confirmed via
/// @hashgraph/asset-tokenization-contracts' own TypeChain types — there is
/// no `deployBondFixedRate` function on-chain) — every real call throws
/// `TypeError: factoryInstance[deployMethod] is not a function`. The real,
/// working path — confirmed by the SDK's own real exports — is `Bond.create`
/// (which does call the real `deployBond`) followed by a separate
/// `FixedRate.setRate` call against the newly deployed diamond.
///
/// The compliance gate (isWhiteList + internalKycActivated) is real — an
/// unverified counterparty's transfer attempt against the resulting token
/// genuinely reverts on-chain, which is what the demo's rejected-transfer
/// moment (Part F.8 / SecondaryMarket.t.sol) actually proves against.
export async function issueFixedRateBond(params: IssueBondParams): Promise<IssuedBond> {
  const configVersion = await resolveLatestBondConfigVersion();

  const createResult = await Bond.create(
    new CreateBondRequest({
      name: params.name,
      symbol: params.symbol,
      isin: params.isin,
      decimals: 6,
      isWhiteList: true,
      erc20VotesActivated: false,
      isControllable: true,
      arePartitionsProtected: false,
      isMultiPartition: false,
      clearingActive: false,
      internalKycActivated: true,
      diamondOwnerAccount: params.issuerAccountId,
      currency: USD_CURRENCY_BYTES3,
      numberOfUnits: '1',
      nominalValue: params.faceValueUSD,
      nominalValueDecimals: 6,
      startingDate: String(params.startingDateSeconds),
      maturityDate: String(params.maturityDateSeconds),
      // [VERIFIED against real source] RegulationType.NONE (0) has no valid
      // subtype combination in the SDK's own CheckRegulations.typeAndSubtype
      // — every subtype fails validation for type 0, regardless of value.
      // REG_S (1) + subtype NONE (0) is the real combination that validates;
      // this isn't a securities-law determination for this testnet demo
      // bond, just the one enum combination the SDK actually accepts.
      regulationType: 1,
      regulationSubType: 0,
      isCountryControlListWhiteList: true,
      countries: '',
      configId: ATS_TESTNET.bondConfigId,
      configVersion,
    }),
  );

  if (!createResult.security.diamondAddress || !createResult.security.evmDiamondAddress) {
    throw new Error(`Bond.create succeeded but returned no diamond address (txId=${createResult.transactionId})`);
  }

  // [VERIFIED against real source] Bond.create's diamondOwnerAccount only
  // grants the default admin role — setting a coupon rate needs the
  // separate _INTEREST_RATE_MANAGER_ROLE, which nothing grants
  // automatically. Confirmed live: FixedRate.setRate reverted with "doesn't
  // have the needed role (0xfa80c71f...)", which is this exact role hash.
  await ensureRoleGranted(createResult.security.diamondAddress, params.issuerEvmAddress, INTEREST_RATE_MANAGER_ROLE);

  await FixedRate.setRate(
    new SetRateRequest({
      securityId: createResult.security.diamondAddress,
      rate: String(params.couponBps),
      rateDecimals: RATE_DECIMALS,
    }),
  );

  return {
    bondTokenId: idToString(createResult.security.diamondAddress),
    evmDiamondAddress: idToString(createResult.security.evmDiamondAddress),
    transactionId: createResult.transactionId,
  };
}

// [VERIFIED via a real live attempt] SecurityViewModel.d.ts declares
// diamondAddress/evmDiamondAddress as `string`, but Bond.create's real
// runtime response is a HederaId-shaped object ({ value: string }) for
// both — confirmed live: the raw values came back as
// {"value":"0.0.10425260"} and {"value":"0x622282..."}, not plain strings.
// The SDK's own internal calls (Role.grantRole, FixedRate.setRate above)
// tolerate either shape, but IssuedBond's declared `string` type should be
// honest for every other caller.
function idToString(id: string | { value: string }): string {
  return typeof id === 'string' ? id : id.value;
}
