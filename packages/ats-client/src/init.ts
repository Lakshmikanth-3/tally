import { ConnectRequest, InitializationRequest, Network, SupportedWallets } from '@hashgraph/asset-tokenization-sdk';

type ImplicitNetworkConfig = ConstructorParameters<typeof InitializationRequest>[0];

// MirrorNode/JsonRpcRelay/Factories/Resolvers/MirrorNodes/JsonRpcRelays are
// all plain value classes (no `.validate()`, unlike the ValidatedRequest
// classes below) but aren't exported from the package root — a
// structurally-matching plain object works identically at runtime.
function mirrorNode(baseUrl: string): ImplicitNetworkConfig['mirrorNode'] {
  return { baseUrl } as ImplicitNetworkConfig['mirrorNode'];
}
function rpcNode(baseUrl: string): ImplicitNetworkConfig['rpcNode'] {
  return { baseUrl } as ImplicitNetworkConfig['rpcNode'];
}

/// [VERIFIED via a real failed attempt] The real MetaMask pairing flow
/// (MetamaskService.setMetamaskNetwork, run during Network.connect) looks up
/// the per-environment mirror/rpc/factory/resolver config supplied here by
/// matching the wallet's real chainId (296 for testnet) against
/// HederaNetworks — NOT the flat single-environment `configuration` field
/// below, which only matters before a wallet is paired. Omitting these
/// multi-environment arrays doesn't leave the old config in place; pairing
/// actively RESETS the mirror node adapter's URL to an empty string,
/// breaking every mirror lookup that follows (confirmed live: "account
/// could not be retrieved from mirror error: Value \"\" does not have the
/// correct format").
function multiEnvironmentConfig(): Pick<ImplicitNetworkConfig, 'mirrorNodes' | 'jsonRpcRelays' | 'factories' | 'resolvers'> {
  return {
    mirrorNodes: {
      nodes: [{ mirrorNode: mirrorNode(ATS_TESTNET.mirrorNodeUrl), environment: ATS_TESTNET.network }],
    } as ImplicitNetworkConfig['mirrorNodes'],
    jsonRpcRelays: {
      nodes: [{ jsonRpcRelay: rpcNode(ATS_TESTNET.rpcNodeUrl), environment: ATS_TESTNET.network }],
    } as ImplicitNetworkConfig['jsonRpcRelays'],
    factories: {
      factories: [{ factory: ATS_TESTNET.factoryAddress, environment: ATS_TESTNET.network }],
    } as ImplicitNetworkConfig['factories'],
    resolvers: {
      resolvers: [{ resolver: ATS_TESTNET.resolverAddress, environment: ATS_TESTNET.network }],
    } as ImplicitNetworkConfig['resolvers'],
  };
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
      ...multiEnvironmentConfig(),
    }),
  );
  initialized = true;
}

/// Connects to the SDK inside the real browser session (see
/// packages/ats-client/browser-runner/ — this only ever runs inside a real
/// Chromium tab with a real EIP-1193 `window.ethereum` injected there).
///
/// [VERIFIED via a real failed attempt] `debug: true` is NOT used here,
/// deliberately: it skips MetamaskService.connectMetamask() entirely,
/// which is the only place `signerOrProvider` actually gets set to a real
/// ethers Signer (via `new BrowserProvider(ethereum).getSigner()`). With
/// `debug: true`, every later contract call fails with "contract runner
/// does not support sending transactions" because the adapter only has a
/// read-only Provider, never a Signer. `debug: true` only makes sense when
/// there is no real `window.ethereum` to pair with at all (e.g. ATS's own
/// test suite, run under a DOM-like test environment) — since our browser
/// session provides a real, if custom, EIP-1193 provider, the ordinary
/// pairing path is the correct one, not a bypass.
export async function connectAtsBackend(creds: AtsCredentials) {
  await ensureInitialized();

  return Network.connect(
    new ConnectRequest({
      network: ATS_TESTNET.network,
      mirrorNode: mirrorNode(ATS_TESTNET.mirrorNodeUrl),
      rpcNode: rpcNode(ATS_TESTNET.rpcNodeUrl),
      wallet: SupportedWallets.METAMASK,
      account: {
        accountId: creds.accountId,
        evmAddress: creds.evmAddress,
        privateKey: { key: creds.privateKeyHex, type: 'ECDSA' },
      },
    }),
  );
}
