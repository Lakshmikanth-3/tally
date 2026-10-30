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

  it('points every Sepolia entry at a well-formed Etherscan link', () => {
    // Two kinds live here now. The indexed copies of SettlementAnchor and
    // SecondaryMarket exist only so The Graph can index them (Hedera isn't
    // Studio-indexable). The UnderwritingRegistry is where Chainlink CRE
    // writes its verdict, and one entry links the verdict transaction itself
    // rather than an address — so assert the link, which is what a visitor
    // actually clicks, instead of assuming every value is an address.
    const sepolia = PROOF_ENTRIES.filter((e) => e.group === 'Ethereum Sepolia');
    expect(sepolia.length).toBeGreaterThanOrEqual(4);

    for (const entry of sepolia) {
      expect(entry.href.startsWith('https://sepolia.etherscan.io/')).toBe(true);

      if (entry.href.includes('/address/')) {
        expect(entry.href).toMatch(/\/address\/0x[0-9a-fA-F]{40}$/);
        expect(entry.value).toMatch(/^0x[0-9a-fA-F]{40}$/);
      } else {
        expect(entry.href).toMatch(/\/tx\/0x[0-9a-fA-F]{64}$/);
      }
    }
  });

  it('includes the UnderwritingRegistry the CRE workflow writes to', () => {
    const registry = PROOF_ENTRIES.find((e) => e.label === 'UnderwritingRegistry');
    expect(registry).toBeDefined();
    expect(registry!.value).toBe('0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c');
  });
});
