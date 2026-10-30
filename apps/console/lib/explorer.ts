/// Every real, already-deployed piece of Tally's on-chain infrastructure,
/// with a public explorer link for each. These are real testnet
/// deployments — a judge can open any link and independently verify the
/// contract, account, or transaction exists without trusting this UI.

export const HASHSCAN_TESTNET = 'https://hashscan.io/testnet';
export const ETHERSCAN_SEPOLIA = 'https://sepolia.etherscan.io';

export const SUBGRAPH_STUDIO_URL = 'https://thegraph.com/studio/subgraph/tally-register';
export const SUBGRAPH_QUERY_URL = 'https://api.studio.thegraph.com/query/1758893/tally-register/v0.0.2';

export function hashscanContract(hederaId: string): string {
  return `${HASHSCAN_TESTNET}/contract/${hederaId}`;
}

/// Bond tokens are ATS diamond contracts (deployed via a constructor call
/// that CREATEs a new contract entity), not native HTS token entities —
/// HashScan's /token/ page 404s on one, verified live. /contract/ is the
/// correct page for the same Hedera id.
export function hashscanToken(hederaId: string): string {
  return hashscanContract(hederaId);
}

export function hashscanAccount(hederaId: string): string {
  return `${HASHSCAN_TESTNET}/account/${hederaId}`;
}

export function hashscanTransaction(txId: string): string {
  return `${HASHSCAN_TESTNET}/transaction/${txId}`;
}

export function etherscanAddress(address: string): string {
  return `${ETHERSCAN_SEPOLIA}/address/${address}`;
}

export function etherscanTransaction(txHash: string): string {
  return `${ETHERSCAN_SEPOLIA}/tx/${txHash}`;
}

export interface ProofEntry {
  group: 'Hedera testnet' | 'Ethereum Sepolia' | 'The Graph';
  label: string;
  value: string;
  href: string;
  note: string;
}

/// The full verification list. Grouped by network so the dual deployment
/// (Hedera for the real product, Sepolia purely so The Graph can index it)
/// reads as the deliberate decision it is, not a mistake.
export const PROOF_ENTRIES: ProofEntry[] = [
  {
    group: 'Hedera testnet',
    label: 'SettlementAnchor',
    value: '0.0.10501789',
    href: hashscanContract('0.0.10501789'),
    note: 'Emits one standardized lifecycle event per bond, whoever the issuer is.',
  },
  {
    group: 'Hedera testnet',
    label: 'SecondaryMarket',
    value: '0.0.10501801',
    href: hashscanContract('0.0.10501801'),
    note: 'Resale venue — compliance is enforced by the ATS token itself reverting.',
  },
  {
    group: 'Hedera testnet',
    label: 'ATS Factory',
    value: '0.0.9213391',
    href: hashscanContract('0.0.9213391'),
    note: "Hedera's own Asset Tokenization Studio factory — every bond is deployed through it.",
  },
  {
    group: 'Hedera testnet',
    label: 'Tally custodian account',
    value: '0.0.8050897',
    href: hashscanAccount('0.0.8050897'),
    note: 'Signs on behalf of registered businesses, so a shop never touches a wallet.',
  },
  {
    group: 'Ethereum Sepolia',
    label: 'SettlementAnchor (indexed copy)',
    value: '0xFa5FE1d656B9d2D382D9Fc717Bd22c1f79Add9f4',
    href: etherscanAddress('0xFa5FE1d656B9d2D382D9Fc717Bd22c1f79Add9f4'),
    note: 'Deployed from the same custodian account as the Hedera copy — Subgraph Studio cannot index Hedera.',
  },
  {
    group: 'Ethereum Sepolia',
    label: 'UnderwritingRegistry',
    value: '0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c',
    href: etherscanAddress('0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c'),
    note: 'Where the Chainlink CRE workflow writes its verdict. Only the Keystone forwarder may call onReport; read latestVerdict(issuerId) to check any decision yourself.',
  },
  {
    group: 'Ethereum Sepolia',
    label: 'CRE verdict transaction',
    value: '0xa58ea689…f4e085',
    href: etherscanTransaction('0xa58ea689f0b8f3f4cfbcb1f71ca5ccb241a80f0da734d880a1a09fcf94f4e085'),
    note: 'A real verdict delivered on-chain by the workflow: approved=false, 760 bps, reason 3 (volatility too high).',
  },
  {
    group: 'Ethereum Sepolia',
    label: 'SecondaryMarket (indexed copy)',
    value: '0x3d56CC4eEFe9c51957F2B34096e29Ef0B4fc84d4',
    href: etherscanAddress('0x3d56CC4eEFe9c51957F2B34096e29Ef0B4fc84d4'),
    note: 'The mirrored deployment the subgraph reads from.',
  },
  {
    group: 'The Graph',
    label: 'Subgraph (Studio)',
    value: 'tally-register',
    href: SUBGRAPH_STUDIO_URL,
    note: 'Public issuer performance register — one query shape across every issuer.',
  },
  {
    group: 'The Graph',
    label: 'Query endpoint',
    value: SUBGRAPH_QUERY_URL,
    href: SUBGRAPH_QUERY_URL,
    note: 'Live GraphQL endpoint serving indexed lifecycle events.',
  },
];
