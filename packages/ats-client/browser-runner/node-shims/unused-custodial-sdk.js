// Stub for the DFNS/Fireblocks/AWS-KMS custodial wallet SDKs
// (@dfns/sdk-keysigner, @dfns/sdk, fireblocks-sdk, jsonwebtoken, asn1-ts,
// and the various @aws-sdk/* packages AWSKMSTransactionAdapter pulls in,
// all funneled through @hashgraph/hedera-custodians-integration).
//
// The ATS SDK's Injectable.ts unconditionally instantiates
// DFNSTransactionAdapter/FireblocksTransactionAdapter/AWSKMSTransactionAdapter
// regardless of which wallet type is actually used (see
// registerTransactionAdapterInstances) — so their heavy, Node-only
// dependency trees (crypto/os/node:buffer-based signing and cert-parsing
// libraries) get pulled into ANY bundle of this SDK, browser or not.
// Tally only ever uses SupportedWallets.METAMASK (our own custodian key
// backing the "browser wallet" — see runner.ts), so these adapters are
// genuinely dead code for us: stubbing their dependencies out is safe as
// long as nothing calls DFNSTransactionAdapter/FireblocksTransactionAdapter/
// AWSKMSTransactionAdapter's actual methods (this module never does).
function throwIfUsed(name) {
  const handler = {
    get: () => new Proxy(function () {}, handler),
    apply() {
      throw new Error(`unused-custodial-sdk stub "${name}" was actually called — a real DFNS/Fireblocks/AWS-KMS code path was reached, which Tally does not support in the browser signer`);
    },
    construct() {
      throw new Error(`unused-custodial-sdk stub "${name}" was actually constructed — a real DFNS/Fireblocks/AWS-KMS code path was reached, which Tally does not support in the browser signer`);
    },
  };
  return new Proxy(function () {}, handler);
}

// Named exports the custodial adapter modules import at the top level
// (types/classes only referenced in type positions or unused constructors
// in our real code path — see doc comment above).
export const SignatureRequest = throwIfUsed('SignatureRequest');
export const CustodialWalletService = throwIfUsed('CustodialWalletService');
export const DFNSConfig = throwIfUsed('DFNSConfig');
export const FireblocksConfig = throwIfUsed('FireblocksConfig');
export const AWSKMSConfig = throwIfUsed('AWSKMSConfig');
export const verifyVc = throwIfUsed('verifyVc');

export default throwIfUsed('default');
