import { Bond, CreateBondFixedRateRequest } from '@hashgraph/asset-tokenization-sdk';
import { ATS_TESTNET } from './init';

const USD_CURRENCY_BYTES3 = '0x555344'; // hex of ASCII "USD", per FormatValidation.checkBytes3Format

export interface IssueBondParams {
  issuerAccountId: string; // diamondOwnerAccount — Hedera id of the issuing business
  name: string; // e.g. "Corrado's Deli Revenue Bond"
  symbol: string; // e.g. "CORRADO1"
  isin: string; // demo/testnet ISIN — see note below
  faceValueUSD: string; // whole-dollar string, e.g. "18400" — see @tally/seam money.ts for the 6-decimal convention this is derived from
  couponBps: number; // frozen at issuance from the CRE verdict — see @tally/seam UnderwritingVerdict
  startingDateSeconds: number;
  maturityDateSeconds: number;
}

export interface IssuedBond {
  bondTokenId: string; // Hedera id of the deployed diamond contract
  evmDiamondAddress: string;
  transactionId: string;
}

/// Issues a real fixed-rate Bond via ATS's Factory contract. The compliance
/// gate (isWhiteList + internalKycActivated) is real — an unverified
/// counterparty's transfer attempt against the resulting token genuinely
/// reverts on-chain, which is what the demo's rejected-transfer moment
/// (Part F.8 / SecondaryMarket.t.sol) actually proves against.
///
/// [VERIFY ON FIRST REAL CALL]: `configVersion` below is a placeholder (1) —
/// confirm the actual latest registered Bond business-logic config version
/// on the resolver at ATS_TESTNET.resolverAddress before relying on this;
/// an outdated version will fail validation rather than silently succeed.
export async function issueFixedRateBond(params: IssueBondParams): Promise<IssuedBond> {
  const rateDecimals = 2;

  const result = await Bond.createFixedRate(
    new CreateBondFixedRateRequest({
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
      regulationType: 0, // no regulation — honest for a testnet demo bond, not a real securities offering
      regulationSubType: 0,
      isCountryControlListWhiteList: true,
      countries: '',
      configId: ATS_TESTNET.bondConfigId,
      configVersion: 1,
      rate: params.couponBps,
      rateDecimals,
    }),
  );

  if (!result.security.diamondAddress || !result.security.evmDiamondAddress) {
    throw new Error(`Bond.createFixedRate succeeded but returned no diamond address (txId=${result.transactionId})`);
  }

  return {
    bondTokenId: result.security.diamondAddress,
    evmDiamondAddress: result.security.evmDiamondAddress,
    transactionId: result.transactionId,
  };
}
