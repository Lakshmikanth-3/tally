/// Every real, already-deployed piece of Tally's on-chain infrastructure,
/// with a public explorer link for each. These are real testnet
/// deployments — a judge can open any link and independently verify the
/// contract, account, or transaction exists without trusting this UI.

export const HASHSCAN_TESTNET = 'https://hashscan.io/testnet';
export const ETHERSCAN_SEPOLIA = 'https://sepolia.etherscan.io';

export const SUBGRAPH_STUDIO_URL = 'https://thegraph.com/studio/subgraph/tally-register';
export const SUBGRAPH_QUERY_URL = 'https://api.studio.thegraph.com/query/1758893/tally-register/v0.0.1';

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
    value: '0.0.10410671',
    href: hashscanContract('0.0.10410671'),
    note: 'Emits one standardized lifecycle event per bond, whoever the issuer is.',
  },
  {
    group: 'Hedera testnet',
    label: 'SecondaryMarket',
    value: '0.0.10410672',
    href: hashscanContract('0.0.10410672'),
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
    value: '0x7FF282B4BEc3b2fE58981441317B5892E23361C2',
    href: etherscanAddress('0x7FF282B4BEc3b2fE58981441317B5892E23361C2'),
    note: 'Same deterministic address as the Hedera deployment — Subgraph Studio cannot index Hedera.',
  },
  {
    group: 'Ethereum Sepolia',
    label: 'SecondaryMarket (indexed copy)',
    value: '0xa626c9F7B0FfB8cE22162b50033C602d6fb388c1',
    href: etherscanAddress('0xa626c9F7B0FfB8cE22162b50033C602d6fb388c1'),
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
