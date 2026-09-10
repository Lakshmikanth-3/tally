import Database from 'better-sqlite3';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const E2E_NAME_PREFIX = 'E2E Test Shop ';

/// Registration writes to the same real SQLite database the app uses —
/// there is no separate test database, by design (this repo doesn't mock
/// its own storage). So the suite removes exactly the rows it created and
/// nothing else, rather than leaving test businesses in the dashboard.
function purgeE2EBusinesses(): number {
  const db = new Database(path.join(process.cwd(), 'tally.db'));
  try {
    const ids = db
      .prepare('SELECT issuer_id FROM businesses WHERE name LIKE ?')
      .all(`${E2E_NAME_PREFIX}%`) as { issuer_id: string }[];
    const purge = db.transaction((rows: { issuer_id: string }[]) => {
      for (const row of rows) {
        db.prepare('DELETE FROM bonds WHERE issuer_id = ?').run(row.issuer_id);
        db.prepare('DELETE FROM transactions WHERE issuer_id = ?').run(row.issuer_id);
        db.prepare('DELETE FROM businesses WHERE issuer_id = ?').run(row.issuer_id);
      }
    });
    purge(ids);
    return ids.length;
  } finally {
    db.close();
  }
}

test.afterAll(() => {
  const removed = purgeE2EBusinesses();
  if (removed > 0) console.log(`cleaned up ${removed} e2e test business(es)`);
});

/// End-to-end coverage of the real console UI against a running dev server.
/// These drive the actual pages and the actual API routes — no request
/// interception, no stubbed responses. A business registered here is a real
/// row in the real database, and the underwriting decline it receives is
/// the real policy's real verdict.

test.describe('landing page', () => {
  test('renders the hero, the coin video, and live platform stats', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('short bond');

    // The rotating coin background must actually be present and looping.
    const video = page.locator('.video-bg video');
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute('loop', '');
    await expect(video).toHaveAttribute('muted', ''); // autoplay is blocked without this
    await expect(video).toHaveJSProperty('paused', false);

    // Stats are real counts, so assert they are numeric rather than a value.
    const stats = page.locator('.stat-card .stat');
    await expect(stats).toHaveCount(4);
    for (const text of await stats.allInnerTexts()) {
      expect(text.replace(/[$,]/g, '')).toMatch(/^\d+$/);
    }

    await expect(page.locator('.pipeline-node')).toHaveCount(7);
    await expect(page.locator('.feature-card')).toHaveCount(4);
  });

  test('navigates to the dashboard from the hero CTA', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'View the dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});

test.describe('verification page', () => {
  test('lists explorer links for every sponsor network', async ({ page }) => {
    await page.goto('/proof');

    await expect(page.getByRole('heading', { name: 'Verify on-chain' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hedera testnet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ethereum Sepolia' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The Graph' })).toBeVisible();

    const rows = page.locator('.proof-row');
    await expect(rows).toHaveCount(8);

    // Every proof row must be a real outbound explorer link.
    for (const href of await rows.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
      expect(href).toMatch(/^https:\/\/(hashscan\.io|sepolia\.etherscan\.io|thegraph\.com|api\.studio\.thegraph\.com)/);
    }
  });
});

test.describe('secondary market', () => {
  test('shows the real on-chain order book', async ({ page }) => {
    await page.goto('/market');
    await expect(page.getByRole('heading', { name: 'Secondary market' })).toBeVisible();

    // Real data or an honest empty state — never a fabricated placeholder row.
    const hasRows = (await page.locator('.data-table tbody tr').count()) > 0;
    const hasEmptyState = await page.locator('.empty-state').isVisible().catch(() => false);
    expect(hasRows || hasEmptyState).toBe(true);
  });
});

test.describe('repayment register', () => {
  test('reads the live subgraph', async ({ page }) => {
    await page.goto('/register-lookup');
    await expect(page.getByRole('heading', { name: 'Issuer repayment register' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lifecycle events' })).toBeVisible();
  });
});

test.describe('registration and underwriting', () => {
  // The issuance route imports the whole ATS/Playwright signer chain, so
  // its first compile in a dev server can take well over a minute. That's
  // build cost, not app latency — give it room rather than flaking.
  test.setTimeout(300_000);

  test('registers a real business and declines it for insufficient history', async ({ page }) => {
    const name = `E2E Test Shop ${Date.now()}`;

    await page.goto('/register');
    await page.getByLabel('Business name').fill(name);
    await page.getByRole('button', { name: /Register/ }).click();

    // Registration redirects to the new business's own real page.
    await expect(page).toHaveURL(/\/business\/issuer-e2e-test-shop-/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name })).toBeVisible();

    // A brand new business has no revenue — it must say so honestly.
    await expect(page.getByText('No payment processor connected yet.')).toBeVisible();
    await expect(page.getByText('$0.00')).toBeVisible();

    // Run the real underwriting policy. With no revenue it must decline
    // for insufficient history — never approve, never fabricate revenue.
    await page.getByRole('button', { name: /Run underwriting/ }).click();

    await expect(page.getByText(/Declined: Fewer than 30 days/)).toBeVisible({ timeout: 240000 });
    await expect(page.locator('.verdict-line.declined')).toContainText('DECLINED');

    // A declined run must never present Hedera issuance as having happened.
    await expect(page.getByText('not reached (declined)')).toBeVisible();

    // The raw revenue figure must never be presented as a Chainlink output.
    await expect(page.locator('.run-note')).toContainText('never returned by this call');
  });
});

test.describe('an issued bond', () => {
  // BondPanel fetches /api/business/:id/bond, which pulls in the ATS
  // client chain — first compile in a dev server is slow. Build cost, not
  // app latency.
  test.setTimeout(300_000);

  test('shows real HashScan links for a business that has one', async ({ page }) => {
    await page.goto('/dashboard');

    const issued = page.locator('.biz-card', { hasText: 'Bond issued' }).first();
    const hasIssuedBond = (await issued.count()) > 0;
    test.skip(!hasIssuedBond, 'no issued bond in this database yet');

    await issued.click();
    await expect(page.locator('.badge-success')).toContainText('Issued on Hedera testnet', { timeout: 240_000 });

    const tokenLink = page.locator('a[href*="hashscan.io/testnet/token/"]');
    await expect(tokenLink).toHaveCount(1);
    const txLink = page.locator('a[href*="hashscan.io/testnet/transaction/"]');
    await expect(txLink).toHaveCount(1);
  });
});
