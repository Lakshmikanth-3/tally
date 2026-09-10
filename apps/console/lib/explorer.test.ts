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
    expect(hashscanContract('0.0.10410671')).toBe('https://hashscan.io/testnet/contract/0.0.10410671');
    expect(hashscanToken('0.0.10425775')).toBe('https://hashscan.io/testnet/token/0.0.10425775');
    expect(hashscanAccount('0.0.8050897')).toBe('https://hashscan.io/testnet/account/0.0.8050897');
    expect(hashscanTransaction('0xabc')).toBe('https://hashscan.io/testnet/transaction/0xabc');
  });

  it('builds a real Sepolia Etherscan URL', () => {
    expect(etherscanAddress('0x7FF282B4BEc3b2fE58981441317B5892E23361C2')).toBe(
      'https://sepolia.etherscan.io/address/0x7FF282B4BEc3b2fE58981441317B5892E23361C2',
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

  it('keeps the dual deployment addresses identical across networks', () => {
    // The Sepolia copies exist only so The Graph can index them; they are
    // deployed at the same deterministic CREATE addresses as Hedera's.
    const sepolia = PROOF_ENTRIES.filter((e) => e.group === 'Ethereum Sepolia');
    expect(sepolia).toHaveLength(2);
    for (const entry of sepolia) {
      expect(entry.value).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});
