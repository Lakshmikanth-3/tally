import { ConnectRequest, InitializationRequest, Network, SupportedWallets } from '@hashgraph/asset-tokenization-sdk';

type ImplicitNetworkConfig = ConstructorParameters<typeof InitializationRequest>[0];

// MirrorNode/JsonRpcRelay are plain value classes (no `.validate()`, unlike
// the ValidatedRequest classes below) but aren't exported from the package
// root — a structurally-matching plain object works identically at runtime.
function mirrorNode(baseUrl: string): ImplicitNetworkConfig['mirrorNode'] {
  return { baseUrl } as ImplicitNetworkConfig['mirrorNode'];
}
function rpcNode(baseUrl: string): ImplicitNetworkConfig['rpcNode'] {
  return { baseUrl } as ImplicitNetworkConfig['rpcNode'];
}

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

  await Network.init(
    new InitializationRequest({
      network: ATS_TESTNET.network,
      mirrorNode: mirrorNode(ATS_TESTNET.mirrorNodeUrl),
      rpcNode: rpcNode(ATS_TESTNET.rpcNodeUrl),
      configuration: {
        factoryAddress: ATS_TESTNET.factoryAddress,
        resolverAddress: ATS_TESTNET.resolverAddress,
      },
    }),
  );
  initialized = true;
}

/// Connects a backend (non-browser) account to the SDK, using the same
/// `debug: true` + embedded-private-key `Account` pattern ATS's own
/// integration test suite uses to sign without a MetaMask browser session
/// (see packages/ats/sdk/__tests__/config.ts and MetamaskService.register
/// in the upstream repo — `debug: true` skips the window.ethereum check).
export async function connectAtsBackend(creds: AtsCredentials) {
  await ensureInitialized();

  return Network.connect(
    new ConnectRequest({
      network: ATS_TESTNET.network,
      mirrorNode: mirrorNode(ATS_TESTNET.mirrorNodeUrl),
      rpcNode: rpcNode(ATS_TESTNET.rpcNodeUrl),
      wallet: SupportedWallets.METAMASK,
      debug: true,
      account: {
        accountId: creds.accountId,
        evmAddress: creds.evmAddress,
        privateKey: { key: creds.privateKeyHex, type: 'ECDSA' },
      },
    }),
  );
}
