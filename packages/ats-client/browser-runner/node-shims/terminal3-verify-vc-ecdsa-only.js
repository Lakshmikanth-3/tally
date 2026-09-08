// Real re-implementation of @terminal3/verify_vc's public API, minus the
// BbsPlusSignature2020 / bbs-2023 branches.
//
// [VERIFIED against real source: @terminal3/verify_vc's dist/verifyVC.js]
// The real package eagerly requires @terminal3/bbs_vc at module load
// regardless of which proof type a given credential actually uses. That
// package's real BBS+ implementation goes through
// @mattrglobal/node-bbs-signatures, a native Node addon — genuinely
// unbundlable for a browser target (not a missing-polyfill situation;
// there's no browser build of the native code). Tally only ever produces
// EcdsaSecp256k1Signature2019 credentials (see kyc.ts, which calls the real
// @terminal3/ecdsa_vc's createEcdsaCredential) and never sees a BBS+ one on
// either side, so this delegates verifyVc's real ECDSA branch to the real
// @terminal3/ecdsa_vc package and only stubs the BBS+ branches, which are
// genuinely dead code for Tally's actual usage.
const { verifyEcdsaVc } = require('@terminal3/ecdsa_vc');

async function verifyVc(vc, options) {
  if (!vc.proof) throw new Error('Proof not found in VC');
  if (!vc.proof.type) throw new Error('Proof type not found in VC');

  switch (vc.proof.type) {
    case 'EcdsaSecp256k1Signature2019':
      return verifyEcdsaVc(vc, options);
    case 'BbsPlusSignature2020':
    case 'DataIntegrityProof':
      throw new Error(
        `Unsupported proof type in the browser signer bundle: ${vc.proof.type} (Tally only issues EcdsaSecp256k1Signature2019 credentials — see packages/ats-client/src/kyc.ts)`,
      );
    default:
      throw new Error('Unsupported proof type: ' + vc.proof.type);
  }
}

module.exports = { verifyVc };
