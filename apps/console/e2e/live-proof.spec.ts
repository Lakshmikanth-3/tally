import { expect, test } from '@playwright/test';

/// Checks every on-chain claim the demo video and DEMO.md make, straight
/// against public infrastructure — the Hedera mirror node, Hedera's JSON-RPC
/// relay, a Sepolia RPC and The Graph. Nothing here goes through Tally's own
/// app or database, so a pass means the claims are independently true right
/// now, not just that the UI says so.
///
/// Run this right before recording: `pnpm test:proof`.

const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';
const HASHIO = 'https://testnet.hashio.io/api';
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const SUBGRAPH = 'https://api.studio.thegraph.com/query/1758893/tally-register/v0.0.2';

const SETTLEMENT_ANCHOR_HEDERA = '0.0.10501789';
const SECONDARY_MARKET_HEDERA = '0.0.10501801';
const SETTLEMENT_ANCHOR_SEPOLIA = '0xFa5FE1d656B9d2D382D9Fc717Bd22c1f79Add9f4';
const SECONDARY_MARKET_SEPOLIA = '0x3d56CC4eEFe9c51957F2B34096e29Ef0B4fc84d4';

const DEMO_BOND = { tokenId: '0.0.10519251', evm: '0x184e71e97f46c75950e8ec12d08e53da4b31ad3c' };
const COUPON_SCHEDULES = ['0.0.10519300', '0.0.10519301', '0.0.10519302'];
const BONDHOLDER = '0.0.10481844';
const COUPON_HBAR_TINYBARS = 12_809_615; // 0.12809615 ℏ

// Public endpoints can be slow; these are network calls, not app latency.
test.setTimeout(60_000);

async function rpc(request: import('@playwright/test').APIRequestContext, url: string, method: string, params: unknown[]) {
  const res = await request.post(url, { data: { jsonrpc: '2.0', id: 1, method, params } });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.error, JSON.stringify(body.error)).toBeUndefined();
  return body.result as string;
}

test.describe('Hedera: the bond is real', () => {
  test('the bond token is a deployed ATS diamond contract', async ({ request }) => {
    const res = await request.get(`${MIRROR}/contracts/${DEMO_BOND.tokenId}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).evm_address).toBe(DEMO_BOND.evm);
  });

  test('units were actually minted (totalSupply = 1)', async ({ request }) => {
    const totalSupply = await rpc(request, HASHIO, 'eth_call', [{ to: DEMO_BOND.evm, data: '0x18160ddd' }, 'latest']);
    expect(BigInt(totalSupply)).toBe(1n);
  });
});

test.describe('Hedera: coupons paid themselves', () => {
  for (const scheduleId of COUPON_SCHEDULES) {
    test(`schedule ${scheduleId} executed on its own`, async ({ request }) => {
      const res = await request.get(`${MIRROR}/schedules/${scheduleId}`);
      expect(res.status()).toBe(200);
      const schedule = await res.json();
      expect(schedule.executed_timestamp).toMatch(/^\d+\.\d+$/);
      expect(schedule.deleted).toBe(false);
      // waitForExpiry: the network ran it at its expiry, not when signed.
      expect(schedule.wait_for_expiry).toBe(true);
      const drift = Math.abs(Number(schedule.executed_timestamp) - Number(schedule.expiration_time));
      expect(drift).toBeLessThan(5);
    });
  }

  test('real HBAR reached the separate bondholder account', async ({ request }) => {
    const res = await request.get(`${MIRROR}/transactions?account.id=${BONDHOLDER}&transactiontype=CRYPTOTRANSFER&order=desc&limit=25`);
    expect(res.status()).toBe(200);
    const { transactions } = await res.json();
    const couponReceipts = transactions.filter(
      (tx: { scheduled: boolean; result: string; transfers: { account: string; amount: number }[] }) =>
        tx.scheduled &&
        tx.result === 'SUCCESS' &&
        tx.transfers.some((t) => t.account === BONDHOLDER && t.amount === COUPON_HBAR_TINYBARS),
    );
    expect(couponReceipts.length).toBeGreaterThanOrEqual(3);
  });

  test('settlement events were anchored on the Hedera SettlementAnchor', async ({ request }) => {
    const res = await request.get(`${MIRROR}/contracts/${SETTLEMENT_ANCHOR_HEDERA}/results/logs?limit=25`);
    expect(res.status()).toBe(200);
    expect((await res.json()).logs.length).toBeGreaterThanOrEqual(4); // issuance + 3 coupons
  });
});

test.describe('Hedera: the secondary market is live', () => {
  test('the SecondaryMarket contract has real order events', async ({ request }) => {
    const res = await request.get(`${MIRROR}/contracts/${SECONDARY_MARKET_HEDERA}/results/logs?limit=25`);
    expect(res.status()).toBe(200);
    expect((await res.json()).logs.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Sepolia: mirror deployment for The Graph', () => {
  for (const [name, address] of [
    ['SettlementAnchor', SETTLEMENT_ANCHOR_SEPOLIA],
    ['SecondaryMarket', SECONDARY_MARKET_SEPOLIA],
  ] as const) {
    test(`${name} has deployed bytecode`, async ({ request }) => {
      const code = await rpc(request, SEPOLIA_RPC, 'eth_getCode', [address, 'latest']);
      expect(code.length).toBeGreaterThan(2); // '0x' means no contract
    });
  }
});

test.describe('The Graph: public repayment register', () => {
  async function query(request: import('@playwright/test').APIRequestContext, q: string) {
    const res = await request.post(SUBGRAPH, { data: { query: q } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data;
  }

  test('the subgraph is deployed, synced and has no indexing errors', async ({ request }) => {
    const data = await query(request, '{ _meta { hasIndexingErrors block { number } } }');
    expect(data._meta.hasIndexingErrors).toBe(false);
    expect(data._meta.block.number).toBeGreaterThan(0);
  });

  // Anchors are written to the Hedera SettlementAnchor; Subgraph Studio can
  // only index the Sepolia copy. Until lifecycle events are also anchored on
  // Sepolia, this fails — and the demo must not show the register as full.
  test('the register contains indexed lifecycle events', async ({ request }) => {
    const data = await query(request, '{ lifecycleEvents(first: 10) { kind onTime } issuerStandings { id bondsIssued } }');
    expect(data.lifecycleEvents.length, 'no lifecycle events indexed on Sepolia yet').toBeGreaterThan(0);
  });
});
