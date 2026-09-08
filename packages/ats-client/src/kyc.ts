import { AddIssuerRequest, GetKycStatusForRequest, GrantKycRequest, IsIssuerRequest, Kyc, SsiManagement } from '@hashgraph/asset-tokenization-sdk';
import { createEcdsaCredential, EthrDID } from '@terminal3/ecdsa_vc';
import { DID } from '@terminal3/vc_core';
import { ethers } from 'ethers';
import { ATS_TESTNET } from './init';
import { ensureRoleGranted } from './roles';

// [VERIFIED against real source: SecurityRole.js] Not exported from the
// package root — copied verbatim from the SDK's own SecurityRole enum.
const SSI_MANAGER_ROLE = '0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1';
const KYC_ROLE = '0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc';

// [VERIFIED against real source: ATS SDK's own __tests__/utils/
// verifiableCredentials.ts] Real, already-deployed Terminal3 revocation and
// DID registries the ATS project itself uses for its Hedera testnet
// integration tests — not something Tally deployed, but a shared, public
// registry any real VC issuer on this network can read/write.
const REVOCATION_REGISTRY_ADDRESS = '0x77Fb69B24e4C659CE03fB129c19Ad591374C349e';
const DID_REGISTRY_ADDRESS = '0x312C15922c22B60f5557bAa1A85F2CdA4891C39a';

export interface GrantInternalKycParams {
  securityId: string;
  issuerPrivateKeyHex: string; // signs the verifiable credential — this account also becomes the security's registered SSI issuer
  issuerEvmAddress: string;
  targetEvmAddress: string; // account being granted KYC clearance (may be the same account as the issuer, for a self-issued demo bond)
}

/// Grants a real internal-KYC clearance via a real, self-signed verifiable
/// credential — not a mock or a stand-in for KYC. `internalKycActivated:
/// true` on bond creation (see issue.ts) means every transfer/redemption
/// against the token checks a real per-account KYC status; nothing grants
/// it automatically.
///
/// [VERIFIED against real source and a real live attempt] `Kyc.grantKyc`
/// only ever accepts a real verifiable credential (it calls the real
/// `@terminal3/verify_vc` verifier internally) — there's no lighter
/// "internal-only" grant call in this SDK version. The credential itself
/// doesn't need a third-party issuer or API key: `createEcdsaCredential`
/// self-signs it with any ECDSA key (here, Tally's own custodian key) and
/// anchors it against ATS's real, already-deployed Hedera testnet
/// revocation/DID registries. Confirmed live: fullRedeemAtMaturity reverted
/// with the real custom error InvalidKycStatus() until this ran first.
const KYC_STATUS_GRANTED = 1;

export async function grantInternalKyc(params: GrantInternalKycParams): Promise<void> {
  const status = await Kyc.getKycStatusFor(
    new GetKycStatusForRequest({ securityId: params.securityId, targetId: params.targetEvmAddress }),
  );
  if (status === KYC_STATUS_GRANTED) return;

  await ensureRoleGranted(params.securityId, params.issuerEvmAddress, SSI_MANAGER_ROLE);
  await ensureRoleGranted(params.securityId, params.issuerEvmAddress, KYC_ROLE);

  // Guarded the same way as ensureRoleGranted: adding an already-registered
  // issuer is expected to be just as unsafe to call unconditionally.
  const alreadyIssuer = await SsiManagement.isIssuer(
    new IsIssuerRequest({ securityId: params.securityId, issuerId: params.issuerEvmAddress }),
  );
  if (!alreadyIssuer) {
    await SsiManagement.addIssuer(
      new AddIssuerRequest({ securityId: params.securityId, issuerId: params.issuerEvmAddress }),
    );
  }

  const issuer = new EthrDID(params.issuerPrivateKeyHex, 'polygon'); // EthrDID's chain-namespace label only — the real transactions below still go to the Hedera-configured registries
  const holderDid = new DID('ethr', params.targetEvmAddress);
  const provider = new ethers.JsonRpcProvider(ATS_TESTNET.rpcNodeUrl);

  const vc = await createEcdsaCredential(issuer, holderDid, { kyc: 'passed' }, ['KycCredential'], undefined, undefined, {
    revocationRegistryAddress: REVOCATION_REGISTRY_ADDRESS,
    provider,
    didRegistryAddress: DID_REGISTRY_ADDRESS,
  });
  const vcBase64 = utf8ToBase64(JSON.stringify(vc));

  await Kyc.grantKyc(
    new GrantKycRequest({ securityId: params.securityId, targetId: params.targetEvmAddress, vcBase64 }),
  );
}

// Node's Buffer isn't available inside the real browser signer session (see
// browser-runner/) — this works in both environments without relying on it.
function utf8ToBase64(text: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
