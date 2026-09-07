import { Network } from '@hashgraph/asset-tokenization-sdk';
import type { SupportedWallets as SupportedWalletsType } from '@hashgraph/asset-tokenization-sdk';

// Real, live Hedera testnet deployment of Asset Tokenization Studio's
// Factory + BusinessLogicResolver, as published in the ATS repo's own web
// app .env.example (apps/ats/web/.env.example) and independently confirmed
// live and non-deleted via the Hedera testnet mirror node REST API.
export const ATS_TESTNET = {
  network: 'testnet' as const,
  mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com/api/v1/',
  rpcNodeUrl: 'https://testnet.hashio.io/api',
  factoryAddress: '0.0.9213391',
  resolverAddress: '0.0.9212226',
  bondConfigId: '0x0000000000000000000000000000000000000000000000000000000000000002',
};

export interface AtsCredentials {
  accountId: string; // Hedera account id, e.g. "0.0.xxxxx"
  evmAddress: string; // 0x-prefixed EVM address for the same account
  privateKeyHex: string; // raw ECDSA private key hex (not DER-encoded)
}

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await Network.init({
    network: ATS_TESTNET.network,
    mirrorNode: { baseUrl: ATS_TESTNET.mirrorNodeUrl },
    rpcNode: { baseUrl: ATS_TESTNET.rpcNodeUrl },
    configuration: {
      factoryAddress: ATS_TESTNET.factoryAddress,
      resolverAddress: ATS_TESTNET.resolverAddress,
    },
  } as Parameters<typeof Network.init>[0]);
  initialized = true;
}

/// Connects a backend (non-browser) account to the SDK, using the same
/// `debug: true` + embedded-private-key `Account` pattern ATS's own
/// integration test suite uses to sign without a MetaMask browser session
/// (see packages/ats/sdk/__tests__/config.ts and MetamaskService.register
/// in the upstream repo — `debug: true` skips the window.ethereum check).
///
/// [VERIFY ON FIRST REAL CALL]: this exact signing path has not yet been
/// exercised end-to-end against a live Hedera testnet transaction in this
/// codebase — confirm a real Bond.create call succeeds before relying on it
/// for the demo, and adjust if the live SDK behaves differently than the
/// source read here suggests.
export async function connectAtsBackend(creds: AtsCredentials) {
  await ensureInitialized();

  return Network.connect({
    network: ATS_TESTNET.network,
    mirrorNode: { baseUrl: ATS_TESTNET.mirrorNodeUrl },
    rpcNode: { baseUrl: ATS_TESTNET.rpcNodeUrl },
    wallet: 'METAMASK' as unknown as SupportedWalletsType,
    debug: true,
    account: {
      id: creds.accountId,
      evmAddress: creds.evmAddress,
      privateKey: { key: creds.privateKeyHex, type: 'ECDSA' },
    },
  } as unknown as Parameters<typeof Network.connect>[0]);
}
