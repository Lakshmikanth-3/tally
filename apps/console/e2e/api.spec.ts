import { expect, test } from '@playwright/test';
import { E2E_NAME_PREFIX, IS_REMOTE_TARGET, purgeE2EBusinesses } from './support';

/// Contract tests for the real API routes — status codes, validation, auth
/// and the signing guard — hit over real HTTP against the real app and the
/// real database. No request interception, no stubbed handlers.
///
/// Safety: nothing here can sign or move value. Every call to a signing
/// route uses an issuer/order id that doesn't exist, so even if the guard
/// under test ever failed open, the route would stop at "not found" long
/// before reaching a custodian key.

const UNKNOWN_ISSUER = 'issuer-does-not-exist-000000';
const DEMO_ISSUER = 'issuer-corrados-deli-f5bb20'; // disclosed synthetic-revenue demo business

test.afterAll(async () => {
  await purgeE2EBusinesses();
});

async function registerTestBusiness(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/business/register', { data: { name: `${E2E_NAME_PREFIX}api ${Date.now()}` } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { issuerId: string; name: string; createdAt: number; isDemo: boolean };
}

test.describe('business registration', () => {
  test('rejects a missing name', async ({ request }) => {
    const res = await request.post('/api/business/register', { data: {} });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/name is required/);
  });

  test('rejects a blank name', async ({ request }) => {
    const res = await request.post('/api/business/register', { data: { name: '   ' } });
    expect(res.status()).toBe(400);
  });

  test('creates a real business with a derived issuer id', async ({ request }) => {
    const business = await registerTestBusiness(request);
    expect(business.issuerId).toMatch(/^issuer-e2e-test-shop-api-\d+-[0-9a-f]{6}$/);
    expect(business.isDemo).toBe(false);
    expect(Math.abs(business.createdAt - Date.now() / 1000)).toBeLessThan(300);

    // It is really persisted: the bond endpoint finds it, with no bond yet.
    const bond = await request.get(`/api/business/${business.issuerId}/bond`);
    expect(bond.status()).toBe(200);
    expect(await bond.json()).toEqual({ bond: null });
  });
});

test.describe('manual transactions', () => {
  test('validates the amount and records a real transaction', async ({ request }) => {
    const { issuerId } = await registerTestBusiness(request);

    const missing = await request.post(`/api/business/${issuerId}/transactions`, { data: {} });
    expect(missing.status()).toBe(400);

    const negative = await request.post(`/api/business/${issuerId}/transactions`, { data: { amountUSD: '-5.00' } });
    expect(negative.status()).toBe(400);

    const created = await request.post(`/api/business/${issuerId}/transactions`, { data: { amountUSD: '42.50' } });
    expect(created.status()).toBe(201);
    // Money is 6-decimal fixed point end to end — never a float.
    expect((await created.json()).amountUSD).toBe('42500000');

    const list = await request.get(`/api/business/${issuerId}/transactions`);
    expect(list.status()).toBe(200);
    const { transactions } = await list.json();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ amountUSD: '42500000', source: 'manual', stripeId: null });
  });

  test('returns 404 for an unknown business', async ({ request }) => {
    const res = await request.post(`/api/business/${UNKNOWN_ISSUER}/transactions`, { data: { amountUSD: '1.00' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('revenue endpoint (read by Chainlink CRE)', () => {
  test('refuses a request with no bearer token', async ({ request }) => {
    const res = await request.get(`/api/business/${DEMO_ISSUER}/revenue`);
    // 500 means the server itself has no token configured — also a refusal,
    // and never a leak of revenue data.
    expect([401, 500]).toContain(res.status());
    expect(await res.text()).not.toContain('trailing90dTotalUSD');
  });

  test('refuses a wrong bearer token', async ({ request }) => {
    const res = await request.get(`/api/business/${DEMO_ISSUER}/revenue`, { headers: { Authorization: 'Bearer not-the-real-token' } });
    expect([401, 500]).toContain(res.status());
    expect(await res.text()).not.toContain('trailing90dTotalUSD');
  });

  test('returns only aggregate revenue facts to the real token', async ({ request }) => {
    const token = process.env.REVENUE_API_TOKEN;
    test.skip(!token, 'REVENUE_API_TOKEN not available to the test runner');

    const res = await request.get(`/api/business/${DEMO_ISSUER}/revenue`, { headers: { Authorization: `Bearer ${token}` } });
    test.skip(res.status() === 500, 'the target server has no REVENUE_API_TOKEN configured');
    expect(res.status()).toBe(200);

    const body = await res.json();
    // Exactly the snapshot CRE needs — no per-transaction rows, no Stripe ids.
    expect(Object.keys(body).sort()).toEqual(['historyDays', 'issuerId', 'trailing90dTotalUSD', 'volatilityScore']);
    expect(body.issuerId).toBe(DEMO_ISSUER);
    expect(body.trailing90dTotalUSD).toMatch(/^\d+$/);
    expect(body.historyDays).toBeGreaterThanOrEqual(90); // enough history to be underwritten
  });

  test('returns 404 for an unknown business', async ({ request }) => {
    const token = process.env.REVENUE_API_TOKEN;
    test.skip(!token, 'REVENUE_API_TOKEN not available to the test runner');
    const res = await request.get(`/api/business/${UNKNOWN_ISSUER}/revenue`, { headers: { Authorization: `Bearer ${token}` } });
    test.skip(res.status() === 500, 'the target server has no REVENUE_API_TOKEN configured');
    expect(res.status()).toBe(404);
  });
});

test.describe('read endpoints', () => {
  test('bond lookup returns 404 for an unknown business', async ({ request }) => {
    const res = await request.get(`/api/business/${UNKNOWN_ISSUER}/bond`);
    expect(res.status()).toBe(404);
  });

  test('the issued demo bond carries real Hedera identifiers', async ({ request }) => {
    const res = await request.get('/api/business/issuer-lifecycle-demo-co-c89705/bond');
    expect(res.status()).toBe(200);
    const { bond } = await res.json();
    expect(bond).toMatchObject({ status: 'issued', bondTokenId: '0.0.10519251', numberOfCoupons: 3 });
    expect(bond.evmDiamondAddress).toMatch(/^0x[0-9a-f]{40}$/i);
    expect(bond.couponBps).toBeGreaterThan(0);
  });

  test('the coupon schedule is persisted and every coupon was anchored on time', async ({ request }) => {
    const res = await request.get('/api/business/issuer-lifecycle-demo-co-c89705/bond/coupon');
    expect(res.status()).toBe(200);
    const { payments } = await res.json();
    expect(payments).toHaveLength(3);
    for (const [i, p] of payments.entries()) {
      expect(p.couponIndex).toBe(i + 1);
      expect(p.scheduleId).toMatch(/^0\.0\.\d+$/);
      expect(p.anchoredOnTime).toBe(true);
    }
    // Due dates strictly increase — coupons are spread across the term.
    expect(payments[1].dueDateSeconds).toBeGreaterThan(payments[0].dueDateSeconds);
    expect(payments[2].dueDateSeconds).toBeGreaterThan(payments[1].dueDateSeconds);
  });

  test('the market order book is served from on-chain logs', async ({ request }) => {
    const res = await request.get('/api/market/orders');
    expect(res.status()).toBe(200);
    const { orders } = await res.json();
    expect(Array.isArray(orders)).toBe(true);
  });
});

test.describe('signing guard', () => {
  // Hosted: signing is unavailable there at all (501). Local: a request that
  // looks like it came through a tunnel is refused (403).
  const expectedStatus = IS_REMOTE_TARGET ? 501 : 403;
  const forwardedFromInternet = { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-host': 'example.ngrok.app' };

  const signingRoutes = [
    `/api/business/${UNKNOWN_ISSUER}/bond/issue`,
    `/api/business/${UNKNOWN_ISSUER}/bond/coupon`,
    `/api/business/${UNKNOWN_ISSUER}/bond/redeem`,
    `/api/business/${UNKNOWN_ISSUER}/market`,
    '/api/market/orders',
    '/api/market/orders/999999999/fill',
  ];

  for (const route of signingRoutes) {
    test(`refuses ${route} from outside`, async ({ request }) => {
      const res = await request.post(route, { headers: forwardedFromInternet, data: {} });
      expect(res.status()).toBe(expectedStatus);
      expect((await res.json()).error).toMatch(IS_REMOTE_TARGET ? /not available on the hosted deployment/ : /refused/);
    });
  }

  test('a forged admin token does not bypass the guard', async ({ request }) => {
    const res = await request.post(`/api/business/${UNKNOWN_ISSUER}/bond/issue`, {
      headers: { ...forwardedFromInternet, Authorization: 'Bearer definitely-not-the-admin-token' },
      data: {},
    });
    expect(res.status()).toBe(expectedStatus);
  });
});
