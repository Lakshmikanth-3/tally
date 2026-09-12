import { describe, expect, it } from 'vitest';
import {
  etherscanAddress,
  hashscanAccount,
  hashscanContract,
  hashscanToken,
  hashscanTransaction,
  PROOF_ENTRIES,
  SUBGRAPH_QUERY_URL,
} from './explorer';

describe('explorer links', () => {
  it('builds real HashScan testnet URLs per entity type', () => {
    expect(hashscanContract('0.0.10501789')).toBe('https://hashscan.io/testnet/contract/0.0.10501789');
    // Bond tokens are ATS diamond contracts, not native HTS tokens — /contract/ is the real, working HashScan page.
    expect(hashscanToken('0.0.10425775')).toBe('https://hashscan.io/testnet/contract/0.0.10425775');
    expect(hashscanAccount('0.0.8050897')).toBe('https://hashscan.io/testnet/account/0.0.8050897');
    expect(hashscanTransaction('0xabc')).toBe('https://hashscan.io/testnet/transaction/0xabc');
  });

  it('builds a real Sepolia Etherscan URL', () => {
    expect(etherscanAddress('0xFa5FE1d656B9d2D382D9Fc717Bd22c1f79Add9f4')).toBe(
      'https://sepolia.etherscan.io/address/0xFa5FE1d656B9d2D382D9Fc717Bd22c1f79Add9f4',
    );
  });

  it('points the subgraph query endpoint at the deployed Studio subgraph', () => {
    expect(SUBGRAPH_QUERY_URL).toMatch(/^https:\/\/api\.studio\.thegraph\.com\/query\//);
  });
});

describe('proof entries', () => {
  it('covers all three sponsor networks', () => {
    const groups = new Set(PROOF_ENTRIES.map((e) => e.group));
    expect(groups).toEqual(new Set(['Hedera testnet', 'Ethereum Sepolia', 'The Graph']));
  });

  it('gives every entry a real https link and a note', () => {
    for (const entry of PROOF_ENTRIES) {
      expect(entry.href, entry.label).toMatch(/^https:\/\//);
      expect(entry.note.length, entry.label).toBeGreaterThan(10);
      expect(entry.value.length, entry.label).toBeGreaterThan(0);
    }
  });

  it('links Hedera ids to hashscan and EVM addresses to etherscan', () => {
    for (const entry of PROOF_ENTRIES) {
      if (/^0\.0\.\d+$/.test(entry.value)) {
        expect(entry.href, entry.label).toContain('hashscan.io/testnet');
      }
      if (/^0x[0-9a-fA-F]{40}$/.test(entry.value)) {
        expect(entry.href, entry.label).toContain('sepolia.etherscan.io');
      }
    }
  });

  it('lists a real EVM address for each Sepolia copy', () => {
    // The Sepolia copies exist only so The Graph can index them (Hedera
    // isn't Studio-indexable) — deployed from the same custodian account as
    // the Hedera originals, but not necessarily at the same CREATE address,
    // since that depends on the account's nonce at deploy time on each chain.
    const sepolia = PROOF_ENTRIES.filter((e) => e.group === 'Ethereum Sepolia');
    expect(sepolia).toHaveLength(2);
    for (const entry of sepolia) {
      expect(entry.value).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});
